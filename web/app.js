import { STYLES, CATEGORIES, COMPONENTS, byId } from "./catalog.js";
import { icon, hydrateIcons } from "./icons.js";
import { explainLocal } from "./explain.js";
import { localSuggestions, CODE_CONCEPTS, MUSIC_CONCEPTS, retoFor } from "./suggest.js";
import { QUESTIONS, reactLocal, buildLocalPlan } from "./wizard.js";
import { FLAVORS, flavorIdea } from "./flavors.js";
import { steps as builderSteps, defaultsFor, compose, SLOTS, STRUCTURE_EXPLAIN, EFFECTS } from "./builder.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_TRACKS = 12;
const STORE_KEY = "tidal-studio-session-v2";
const KIND_COLOR = { percusion: "var(--k-percusion)", bajo: "var(--k-bajo)", armonia: "var(--k-armonia)", melodia: "var(--k-melodia)",
  textura: "var(--k-textura)", efecto: "var(--k-fx)", estructura: "var(--ink)" };

// ------------------------------------------------------------------ estado
let state = {
  bpm: 120,
  tracks: [],           // {id, name, kind, code, muted, explain?}
  selected: null,
  style: "",
  step: "estilo",
  chat: [],             // {role, content, explicacion?, reto?, changes?}
  options: [],
  ideas: [],            // sugerencias de la IA (si no hay, se usan las locales)
  projectId: null,
  name: "",
  trying: null,         // {index, snapshot}
  learnedMusic: [],
  lastError: "",
  offline: false,
};
let server = { llm: false, engine: {} };
let busy = false;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && Array.isArray(s.tracks)) state = { ...state, ...s, trying: null };
  } catch { /* sesión corrupta: empezamos de cero */ }
}
function save() {
  try {
    if (!state.projectId) state.projectId = "p" + Date.now();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    // También en «Mis proyectos» (solo si tiene algo)
    if (state.tracks.length || state.name) {
      const list = listProjects().filter((p) => p.id !== state.projectId);
      list.unshift({ id: state.projectId, name: state.name || "Proyecto sin título", updated: Date.now(),
        data: { ...state, trying: null } });
      localStorage.setItem(PROJ_KEY, JSON.stringify(list.slice(0, 30)));
    }
  } catch { /* sin almacenamiento */ }
}
const PROJ_KEY = "tidal-studio-projects-v1";
function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJ_KEY) || "[]"); } catch { return []; }
}

// ------------------------------------------------------------------ API
async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

// ------------------------------------------------------------------ código Tidal
const cps = (bpm) => `setcps (${bpm}/60/4)`;

function buildCode() {
  const lines = [`-- Tidal Studio · ${state.bpm} BPM${state.style ? " · " + STYLES[state.style].nombre : ""}`,
                 cps(state.bpm), ""];
  for (const t of state.tracks) {
    const body = `${t.id} $ ${t.code}`;
    if (t.muted) {
      lines.push(`-- [silenciada] ${t.name} · ${t.kind}`);
      lines.push(body.split("\n").map((l) => "-- " + l).join("\n"));
    } else {
      lines.push(`-- ${t.name} · ${t.kind}`);
      lines.push(body);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function parseCode(text) {
  const out = { bpm: state.bpm, tracks: [] };
  const m = text.match(/setcps\s*\(\s*([\d.]+)\s*\/\s*60\s*\/\s*4\s*\)/);
  if (m) out.bpm = Math.round(parseFloat(m[1]));
  for (const block of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    let name = "", kind = "fx", muted = false; const codeLines = [];
    for (const l of lines) {
      const header = l.match(/^--\s*(\[silenciada\]\s*)?(.+?)\s*·\s*(\w+)\s*$/);
      if (header && !codeLines.length && !/^--\s*d\d+\s*\$/.test(l)) { muted = !!header[1]; name = header[2]; kind = header[3]; continue; }
      if (/^--\s*Tidal Studio/.test(l) || /setcps/.test(l)) continue;
      if (muted && l.startsWith("-- ")) codeLines.push(l.slice(3));
      else if (!l.trim().startsWith("--")) codeLines.push(l);
    }
    const tm = codeLines.join("\n").match(/^\s*(d\d+)\s*\$\s*([\s\S]+)$/);
    if (tm) out.tracks.push({ id: tm[1], name: name || tm[1], kind, code: tm[2].trim(), muted });
  }
  return out;
}

// ------------------------------------------------------------------ sonido
async function evalCode(code, track) {
  try {
    const r = await api("/api/eval", { code });
    const errs = r.errors && r.errors.length ? r.errors : [];
    if (track) track.error = errs.join("\n");
    state.lastError = errs.slice(0, 6).join(" ");
    if (!r.ok && !track) toast("Tidal dio un error. Mira la pestaña Registro o pregunta a Maestro.");
    return r;
  } catch (e) {
    toast("No se pudo enviar el código: " + e.message);
  } finally {
    renderTracks();
  }
}
const trackLine = (t) => (t.muted ? `${t.id} silence` : `${t.id} $ ${t.code}`);
const playTrack = (t) => evalCode(trackLine(t), t);
const silenceId = (id) => evalCode(`${id} silence`);
const playAll = () => evalCode([cps(state.bpm), ...state.tracks.map(trackLine)].join("\n\n"));
const live = () => $("#autoplay").checked;

// ------------------------------------------------------------------ pistas
function freeId() {
  for (let i = 1; i <= MAX_TRACKS; i++) if (!state.tracks.find((t) => t.id === "d" + i)) return "d" + i;
  return null;
}
function selectedTrack() {
  return state.tracks.find((t) => t.id === state.selected) || state.tracks[state.tracks.length - 1];
}
function addTrack(name, kind, code) {
  const id = freeId();
  if (!id) { toast("Máximo 12 pistas. Borra alguna primero."); return null; }
  const t = { id, name, kind, code, muted: false };
  state.tracks.push(t);
  state.selected = id;
  changed();
  if (live()) playTrack(t);
  return t;
}
function applyModifier(comp, target) {
  const t = target || selectedTrack();
  if (!t) { toast("Primero añade una pista para aplicarle esto."); return null; }
  if (comp.sufijo) {
    // Si la pista ya tenía ese parámetro con un valor simple, lo sustituimos en vez de repetirlo
    let code = t.code;
    for (const m of comp.sufijo.matchAll(/#\s*(\w+)\s/g)) {
      code = code.replace(new RegExp(`\\s*#\\s*${m[1]}\\s+-?[\\d.]+(?![\\w(])`, "g"), "");
    }
    t.code = code + comp.sufijo;
  } else t.code = comp.envoltura + t.code;
  t.explain = null;
  changed();
  if (live()) playTrack(t);
  return t;
}
function addComponent(comp) {
  if (comp.cat === "efecto" || comp.cat === "estructura") return applyModifier(comp);
  return addTrack(comp.nombre, comp.cat, comp.codigo);
}
function removeTrack(id) {
  state.tracks = state.tracks.filter((t) => t.id !== id);
  if (state.selected === id) state.selected = null;
  silenceId(id);
  changed();
}

function changed() {
  save();
  renderTracks();
  renderProgress();
  if (!state.trying) renderIdeas();
  if (!$("#tab-code").classList.contains("active")) $("#code").value = buildCode();
}

function explainHTML(ex, onClose) {
  const parts = (ex.partes || []).map((p) => `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("");
  return `${onClose ? `<button class="close" title="Cerrar">${icon("close", 16)}</button>` : ""}
    ${ex.resumen ? `<p class="sum">${esc(ex.resumen)}</p>` : ""}
    ${parts ? `<ul class="parts">${parts}</ul>` : ""}
    ${ex.reto ? `<div class="reto"><b>Reto.</b> ${esc(ex.reto.replace(/^Reto:\s*/i, ""))}</div>` : ""}
    ${ex.idea ? `<div class="idea-note"><b>Idea de Maestro.</b> ${esc(ex.idea)}</div>` : ""}`;
}

function renderTracks() {
  const box = $("#tracks");
  box.innerHTML = "";
  $("#empty").style.display = state.tracks.length ? "none" : "block";
  for (const t of state.tracks) {
    const el = document.createElement("div");
    el.className = "track" + (t.id === state.selected ? " selected" : "") + (t.muted ? " muted" : "");
    el.dataset.kind = t.kind;
    el.innerHTML = `
      <div class="head">
        <span class="kico">${icon(CATEGORIES.find((c) => c.id === t.kind) ? t.kind : "fx", 20)}</span>
        <span class="id">${t.id}</span>
        <input class="tname">
        <span class="actions">
          <button data-a="explain" class="explain" title="¿Qué hace este código?">${icon("explain", 15)} Explícame</button>
          <button data-a="play" title="Hacer sonar esta pista">${icon("play", 14)}</button>
          <button data-a="mute" title="${t.muted ? "Activar" : "Silenciar"}">${icon(t.muted ? "unmute" : "mute", 16)}</button>
          <button data-a="del" title="Borrar pista">${icon("trash", 16)}</button>
        </span>
      </div>
      <textarea rows="${Math.min(6, t.code.split("\n").length + 1)}" spellcheck="false" title="Ctrl+Enter para escuchar"></textarea>
      ${t.error ? `<div class="err"></div>` : ""}
      ${t.explain ? `<div class="explain-box">${t.explain.loading ? '<span class="typing">Maestro está leyendo el código…</span>' : explainHTML(t.explain, true)}</div>` : ""}`;
    el.querySelector(".tname").value = t.name;
    el.querySelector("textarea").value = t.code;
    if (t.error) el.querySelector(".err").textContent = t.error;
    el.addEventListener("click", (e) => {
      if (state.selected !== t.id) {
        state.selected = t.id; save();
        document.querySelectorAll(".track").forEach((x) => x.classList.toggle("selected", x === el));
      }
      const btn = e.target.closest("button");
      const a = btn && btn.dataset.a;
      if (btn && btn.classList.contains("close")) { t.explain = null; save(); renderTracks(); }
      if (a === "explain") explainTrack(t);
      if (a === "play") playTrack(t);
      if (a === "mute") { t.muted = !t.muted; changed(); playTrack(t); }
      if (a === "del") removeTrack(t.id);
    });
    el.querySelector(".tname").addEventListener("change", (e) => { t.name = e.target.value; changed(); });
    const ta = el.querySelector("textarea");
    const commit = () => { if (ta.value !== t.code) { t.code = ta.value; t.explain = null; t.edited = true; changed(); } };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); playTrack(t); }
    });
    ta.addEventListener("change", () => { commit(); if (live()) playTrack(t); });
    box.appendChild(el);
  }
}

// ------------------------------------------------------------------ explicaciones
async function explain(code, name) {
  if (server.llm && !state.offline) {
    try { return await api("/api/explain", { code, name }); } catch { /* si falla, explicación local */ }
  }
  return explainLocal(code);
}
async function explainTrack(t) {
  if (t.explain && !t.explain.loading) { t.explain = null; renderTracks(); return; }
  t.explain = { loading: true }; renderTracks();
  t.explain = await explain(t.code, t.name);
  save(); renderTracks();
}

// ------------------------------------------------------------------ progreso
function renderProgress() {
  const all = state.tracks.map((t) => t.code).join("\n");
  const codeDone = CODE_CONCEPTS.filter((c) => c.re.test(all) || (c.id === "s" && false));
  const autoMusic = new Set(state.learnedMusic);
  if (state.tracks.some((t) => t.kind === "percusion")) autoMusic.add("Pulso");
  if (/\b(cp|sn)\b/.test(all)) autoMusic.add("Backbeat");
  if (state.tracks.some((t) => t.kind === "bajo")) autoMusic.add("Graves y groove");
  if (state.tracks.some((t) => t.kind === "armonia")) autoMusic.add("Armonía");
  if (state.tracks.some((t) => t.kind === "melodia")) autoMusic.add("Melodía");
  if (/whenmod/.test(all)) autoMusic.add("Contraste y estructura");
  const musicDone = MUSIC_CONCEPTS.filter((c) => autoMusic.has(c));
  $("#bar-code").style.width = `${(100 * codeDone.length) / CODE_CONCEPTS.length}%`;
  $("#bar-music").style.width = `${(100 * musicDone.length) / MUSIC_CONCEPTS.length}%`;
  $("#num-code").textContent = `${codeDone.length}/${CODE_CONCEPTS.length}`;
  $("#num-music").textContent = `${musicDone.length}/${MUSIC_CONCEPTS.length}`;
  $("#concepts").innerHTML =
    CODE_CONCEPTS.map((c) => `<span class="concept ${codeDone.includes(c) ? "done" : ""}">${esc(c.nombre)}</span>`).join("") +
    MUSIC_CONCEPTS.map((c) => `<span class="concept music ${musicDone.includes(c) ? "done" : ""}">${esc(c)}</span>`).join("");
}

// ------------------------------------------------------------------ ideas (sugerencias)
let flavorTurn = 0;
function currentIdeas() {
  if (state.ideas && state.ideas.length) return state.ideas;
  const ideas = localSuggestions(state, 1);
  if (state.tracks.length >= 2) {
    const keys = Object.keys(FLAVORS).filter((k) => k !== state.style);
    const f = flavorIdea(keys[flavorTurn % keys.length], state.tracks);
    if (f) ideas.push(f);
  }
  return ideas;
}
// Pre-escucha: suena unos compases y vuelve sola a como estaba (sin tocar tu proyecto)
let preview = null;
function preHear(cambios, onEnd) {
  if (preview) stopPreHear();
  const bpm = cambios.bpm ? Math.round(cambios.bpm) : state.bpm;
  const lines = [cps(bpm), ...(cambios.pistas || []).map((p) => `${p.id} $ ${p.codigo}`)];
  const revert = [cps(state.bpm), ...(cambios.pistas || []).map((p) => {
    const t = state.tracks.find((x) => x.id === p.id);
    return t ? trackLine(t) : `${p.id} silence`;
  })];
  const secs = Math.max(6, Math.min(14, (4 * 4 * 60) / bpm)); // unos 4 compases
  api("/api/eval", { code: lines.join("\n\n") }).catch(() => {});
  preview = { revert, onEnd, timer: setTimeout(stopPreHear, secs * 1000), until: Date.now() + secs * 1000 };
  return secs;
}
function stopPreHear() {
  if (!preview) return;
  clearTimeout(preview.timer);
  const { revert, onEnd } = preview;
  preview = null;
  api("/api/eval", { code: revert.join("\n\n") }).catch(() => {});
  if (onEnd) onEnd();
}
function wirePreHear(btn, cambios) {
  btn.onclick = (e) => {
    e.stopPropagation();
    if (btn.classList.contains("playing")) { stopPreHear(); return; }
    document.querySelectorAll(".prehear.playing").forEach((b) => { b.classList.remove("playing"); b.innerHTML = icon("speaker", 13) + " Escuchar"; });
    const secs = preHear(cambios, () => { btn.classList.remove("playing"); btn.innerHTML = icon("speaker", 13) + " Escuchar"; });
    btn.classList.add("playing");
    btn.innerHTML = icon("stop", 12) + ` Escuchando… ${Math.round(secs)} s`;
  };
}

function renderIdeas() {
  const list = $("#idea-list");
  const ideas = state.trying ? state.trying.ideas : currentIdeas();
  $("#ideas").style.display = ideas.length ? "block" : "none";
  list.innerHTML = "";
  ideas.forEach((idea, i) => {
    const trying = state.trying && state.trying.index === i;
    const el = document.createElement("div");
    el.className = "idea" + (trying ? " trying" : "");
    el.innerHTML = `<div class="t"></div><div class="p"></div>
      ${idea.concepto ? `<span class="tag"></span>` : ""}
      <div class="row">${trying
        ? `<button data-a="keep" class="primary">Me gusta, me lo quedo</button><button data-a="undo">Deshacer</button>`
        : `<button class="prehear" title="Escúchala unos compases sin cambiar tu proyecto" ${state.trying ? "disabled" : ""}>${icon("speaker", 13)} Escuchar</button><button data-a="try" ${state.trying ? "disabled" : ""}>${icon("play", 12)} Probar y ver el código</button>`}</div>`;
    el.querySelector(".t").textContent = idea.titulo;
    el.querySelector(".p").textContent = idea.porque;
    if (idea.concepto) el.querySelector(".tag").textContent = idea.concepto;
    const ph = el.querySelector(".prehear");
    if (ph) wirePreHear(ph, idea.cambios);
    el.querySelector(".row").onclick = (e) => {
      const a = e.target.closest("button")?.dataset.a;
      if (a === "try") tryIdea(ideas, i);
      if (a === "keep") keepIdea();
      if (a === "undo") undoIdea();
    };
    list.appendChild(el);
  });
}
function tryIdea(ideas, i) {
  if (preview) { preview.onEnd = null; clearTimeout(preview.timer); preview = null; }
  const snapshot = JSON.stringify({ bpm: state.bpm, tracks: state.tracks });
  const before = JSON.parse(snapshot);
  state.trying = { index: i, ideas, snapshot };
  applyChanges(ideas[i].cambios);
  renderIdeas();
  const idea = ideas[i];
  say(`Probando: «${idea.titulo}»\n${idea.porque}\n\nEscucha unos compases y decide abajo si te lo quedas. Así lo he hecho:`,
    state.options, { diff: diffFor(before, idea.cambios, idea.pasos) });
}

// "Cómo lo he hecho": antes y después de cada pista, con el trozo nuevo resaltado y explicado
function diffFor(before, cambios, pasos = {}) {
  const out = [];
  if (cambios.bpm && Math.round(cambios.bpm) !== before.bpm)
    out.push({ id: "tempo", nombre: "Velocidad", antes: cps(before.bpm), despues: cps(Math.round(cambios.bpm)),
      explicacion: `De ${before.bpm} a ${Math.round(cambios.bpm)} BPM: el tempo típico de este estilo.` });
  for (const p of cambios.pistas || []) {
    const old = before.tracks.find((t) => t.id === p.id);
    const antes = old ? old.code : "";
    const despues = p.codigo;
    if (antes === despues) continue;
    let pre = 0; while (pre < antes.length && antes[pre] === despues[pre]) pre++;
    let suf = 0; while (suf < antes.length - pre && suf < despues.length - pre && antes[antes.length - 1 - suf] === despues[despues.length - 1 - suf]) suf++;
    const nuevo = despues.slice(pre, despues.length - suf);
    let explicacion = pasos[p.id];
    if (!explicacion) {
      const ex = explainLocal(antes ? nuevo : despues);
      explicacion = ex.partes.slice(0, 3).map((x) => `«${x.fragmento}»: ${x.explicacion}`).join(" ") || "";
    }
    out.push({ id: p.id, nombre: p.nombre || (old && old.name) || p.id, antes, despues, pre, suf, explicacion });
  }
  return out;
}
// Diferencia palabra a palabra (LCS): resalta solo los trozos nuevos
function markNew(antes, despues) {
  const a = antes.split(/(\s+)/), b = despues.split(/(\s+)/);
  const n = a.length, m = b.length;
  if (!antes || n * m > 40000) return antes ? esc(despues) : esc(despues);
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, out = "", buf = "";
  const flush = () => { if (buf) { out += buf.trim() ? `<mark>${esc(buf)}</mark>` : esc(buf); buf = ""; } };
  while (j < m) {
    if (i < n && a[i] === b[j]) { flush(); out += esc(b[j]); i++; j++; }
    else if (i < n && L[i + 1][j] >= L[i][j + 1]) i++;
    else { buf += b[j]; j++; }
  }
  flush();
  return out;
}
function diffHTML(diff) {
  return `<div class="diff">${diff.map((d) => {
    const after = d.antes ? markNew(d.antes, d.despues) : esc(d.despues);
    const idLabel = d.id === "tempo" ? "" : `${esc(d.id)} $ `;
    return `<div class="diff-item"><div class="diff-h">${esc(d.id === "tempo" ? "" : d.id + " · ")}${esc(d.nombre)}${d.antes ? "" : " <span class='new'>nueva</span>"}</div>
      ${d.antes ? `<div class="diff-row"><span>Antes</span><code class="before">${idLabel}${esc(d.antes)}</code></div>` : ""}
      <div class="diff-row"><span>Después</span><code class="after">${idLabel}${after}</code></div>
      ${d.explicacion ? `<p>${esc(d.explicacion)}</p>` : ""}</div>`;
  }).join("")}</div>`;
}
function keepIdea() {
  const idea = state.trying.ideas[state.trying.index];
  if (idea.concepto && !state.learnedMusic.includes(idea.concepto)) state.learnedMusic.push(idea.concepto);
  state.trying = null;
  state.ideas = state.ideas.filter((x) => x !== idea);
  say(`¡Bien! Te lo quedas. Has practicado: ${idea.concepto || "una idea nueva"}.\n${idea.porque}`, state.options);
  changed();
}
function undoIdea() {
  const before = JSON.parse(state.trying.snapshot);
  const keep = new Set(before.tracks.map((t) => t.id));
  const removed = state.tracks.filter((t) => !keep.has(t.id)).map((t) => t.id);
  state.bpm = before.bpm; $("#bpm").value = state.bpm; state.tracks = before.tracks;
  state.trying = null;
  removed.forEach(silenceId);
  if (live()) playAll();
  sysMsg("Deshecho. Todo vuelve a como estaba. Está bien que no te guste: tu oído decide.");
  changed();
}

// ------------------------------------------------------------------ catálogo
function renderCatalog() {
  const sel = $("#style-filter");
  if (sel.options.length === 1)
    for (const [k, s] of Object.entries(STYLES)) sel.add(new Option(`${s.nombre} · ${s.bpm} BPM`, k));
  sel.value = state.style || "";
  const style = sel.value;
  const box = $("#catalog");
  box.innerHTML = "";
  for (const cat of CATEGORIES) {
    let items = COMPONENTS.filter((c) => c.cat === cat.id);
    if (style && items[0] && items[0].estilos) {
      items = [...items].sort((a, b) => (b.estilos.includes(style) ? 1 : 0) - (a.estilos.includes(style) ? 1 : 0));
    }
    const d = document.createElement("details");
    d.className = "cat";
    d.open = ["percusion", "bajo"].includes(cat.id) || !!style;
    d.innerHTML = `<summary><span class="cat-ico" style="background:${KIND_COLOR[cat.id]}">${icon(cat.id, 16)}</span>${esc(cat.nombre)}</summary><p class="help">${esc(cat.ayuda)}</p>`;
    for (const c of items) {
      const fits = style && c.estilos && c.estilos.includes(style);
      const row = document.createElement("div");
      row.className = "comp";
      row.innerHTML = `<div class="txt"><div class="name"></div><div class="desc"></div></div>
        <button title="${c.cat === "efecto" || c.cat === "estructura" ? "Aplicar a la pista seleccionada" : "Añadir pista"}">${icon("plus", 16)}</button>`;
      row.querySelector(".name").textContent = c.nombre;
      if (fits) row.querySelector(".name").insertAdjacentHTML("beforeend", `<span class="fit">encaja</span>`);
      row.querySelector(".desc").textContent = c.desc;
      row.querySelector("button").onclick = () => {
        const t = addComponent(c);
        if (t) teachAbout(c, t);
      };
      d.appendChild(row);
    }
    box.appendChild(d);
  }
}

// Cuando añades algo, Maestro explica el código nuevo
function teachAbout(comp, t) {
  const isMod = comp.sufijo || comp.envoltura;
  const fragment = isMod ? (comp.sufijo || comp.envoltura).trim().replace(/\s*\$$/, "") : comp.codigo;
  const ex = explainLocal(fragment);
  const what = isMod ? `He aplicado «${comp.nombre}» a ${t.id} (${t.name}).` : `He añadido «${comp.nombre}» en la pista ${t.id}.`;
  state.chat.push({ role: "assistant", content: `${what} ${comp.desc}`, explicacion: ex.partes, reto: retoFor(comp) });
  save(); renderChat();
}

// ------------------------------------------------------------------ chat
function renderChat() {
  const box = $("#chat");
  box.innerHTML = "";
  for (const m of state.chat) {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    el.textContent = m.content;
    if (m.explicacion && m.explicacion.length) {
      el.insertAdjacentHTML("beforeend", `<ul class="parts">${m.explicacion.map((p) =>
        `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("")}</ul>`);
    }
    if (m.diff && m.diff.length) el.insertAdjacentHTML("beforeend", diffHTML(m.diff));
    if (m.reto) el.insertAdjacentHTML("beforeend", `<div class="reto"><b>Reto.</b> ${esc(m.reto.replace(/^Reto:\s*/i, ""))}</div>`);
    if (m.changes) el.insertAdjacentHTML("beforeend", `<div class="changes">${esc(m.changes)}</div>`);
    box.appendChild(el);
  }
  if (busy) box.insertAdjacentHTML("beforeend", `<div class="msg assistant typing">Maestro está pensando…</div>`);
  box.scrollTop = box.scrollHeight;
  const chips = $("#chips");
  chips.innerHTML = "";
  for (const o of state.options || []) {
    const b = document.createElement("button");
    b.textContent = o;
    b.onclick = () => send(o);
    chips.appendChild(b);
  }
}
function say(content, options = [], extra = {}) {
  state.chat.push({ role: "assistant", content, ...extra });
  state.options = options;
  save(); renderChat();
}
function sysMsg(text) { state.chat.push({ role: "system", content: text }); save(); renderChat(); }
const toast = sysMsg;

function greet() {
  state.step = "estilo";
  say("¡Hola! Soy Maestro. Aquí vas a aprender música y a programarla con TidalCycles mientras creas tu propia canción.\n\nIremos paso a paso: estilo, ritmo, velocidad, bajo, acordes, melodía, efectos y cuándo cambia cada cosa. En cada paso te explico el código y te propongo ideas, como haría un productor a tu lado. No hace falta saber nada.\n\nPara empezar rápido, usa el wizard: eliges opciones paso a paso y se crea tu proyecto base. Si prefieres hablarlo, la lluvia de ideas te hace preguntas abiertas. O dime directamente un estilo.",
    ["Crear proyecto con wizard", "Lluvia de ideas: diseñar mi canción", ...Object.values(STYLES).map((s) => s.nombre), "Sorpréndeme"]);
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  if (text.startsWith("Lluvia de ideas")) return openWizard();
  if (text.startsWith("Crear proyecto con wizard")) return openBuilder();
  if (text.startsWith("Empieza tú con un ritmo")) { const c = byId[state.style ? (state.style === "hiphop" || state.style === "lofi" ? "kickhh" : "kick4") : "kick4"]; const t = addComponent(c); if (t) teachAbout(c, t); return; }
  state.chat.push({ role: "user", content: text });
  state.options = [];
  save(); renderChat();
  if (server.llm && !state.offline) return askLLM();
  offlineGuide(text);
}

async function askLLM() {
  busy = true; renderChat();
  try {
    const history = state.chat.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const session = {
      bpm: state.bpm, step: state.step, lastError: state.lastError,
      tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: t.muted,
        ...(t.edited ? { name: t.name + " (editada a mano por el alumno)" } : {}) })),
    };
    state.tracks.forEach((t) => delete t.edited);
    const r = await api("/api/chat", { messages: history, session });
    busy = false;
    if (r.paso) state.step = r.paso;
    const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
    const summary = applyChanges(r.cambios || {});
    const diff = diffFor(before, r.cambios || {});
    if (r.sugerencias && r.sugerencias.length) state.ideas = r.sugerencias;
    say(r.mensaje || "…", r.opciones || [], { explicacion: r.explicacion, reto: r.reto, changes: summary, diff });
    renderIdeas();
  } catch (e) {
    busy = false;
    say("Uy, no he podido hablar con la IA: " + e.message + "\n\nRevisa los Ajustes. Mientras tanto te sigo guiando sin IA.", ["Seguir sin IA"]);
  }
}

function applyChanges(c) {
  const notes = [];
  if (c.bpm && Math.round(c.bpm) !== state.bpm) {
    state.bpm = Math.round(c.bpm); $("#bpm").value = state.bpm;
    notes.push(`${state.bpm} BPM`);
    if (live()) evalCode(cps(state.bpm));
  }
  for (const id of c.eliminar || []) {
    if (state.tracks.find((t) => t.id === id)) { removeTrack(id); notes.push(`borrada ${id}`); }
  }
  for (const p of c.pistas || []) {
    let t = state.tracks.find((x) => x.id === p.id);
    if (t) { t.code = p.codigo; t.name = p.nombre || t.name; t.kind = p.tipo || t.kind; t.muted = false; t.explain = null; notes.push(`cambiada ${p.id} ${t.name}`); }
    else { t = { id: p.id, name: p.nombre, kind: p.tipo, code: p.codigo, muted: false }; state.tracks.push(t); notes.push(`nueva ${p.id} ${t.name}`); }
    state.tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    state.selected = p.id;
    if (live()) playTrack(t);
  }
  changed();
  return notes.length ? "Cambios: " + notes.join(" · ") : "";
}

// ------------------------------------------------------------------ guía sin IA
const NEXT = "Siguiente paso";
const FLOW = ["estilo", "percusion", "tempo", "bajo", "armonia", "melodia", "textura", "efecto", "estructura", "libre"];
const STEP_TEXT = {
  percusion: "Empezamos por el ritmo. La percusión es el esqueleto de la canción: marca el pulso, el latido que hace mover el pie. Elige una (las primeras encajan con tu estilo). Puedes añadir varias.",
  tempo: "Hablemos de velocidad. Ahora está a {bpm} BPM (pulsaciones por minuto). Más BPM da más energía; menos, más calma. En el código es la línea setcps.",
  bajo: "Ahora el bajo: las notas graves. Une el ritmo con la armonía y es lo que da 'groove'. Un truco de productor: que el bajo suene entre los bombos, no encima.",
  armonia: "Turno de los acordes: varias notas a la vez. Deciden la emoción: los menores suenan melancólicos, los mayores alegres.",
  melodia: "Ahora una melodía, la parte que se tararea. Si usa notas de los acordes, siempre encaja.",
  textura: "¿Añadimos una textura de fondo? Son detalles que crean atmósfera: se sienten más que se oyen.",
  efecto: "Hora de los efectos. Cambian el carácter de un sonido: espacio, eco, brillo… Se aplican a la pista seleccionada ({track}); pulsa otra pista en el centro para cambiarla.",
  estructura: "Por último: ¿cuándo pasan las cosas? La música se organiza en frases de 4 y 8 compases; si nada cambia, aburre. Se aplica a {track}.",
  libre: "¡Ya tienes una canción completa!\n\nA partir de aquí, mira las Ideas de Maestro: pruébalas y quédate solo con lo que te guste. También puedes editar el código a mano o pedirme que te explique cualquier pista.\n\nCon una IA conectada en Ajustes puedo entender todo lo que escribas.",
};

function compsFor(cat) {
  const list = COMPONENTS.filter((c) => c.cat === cat);
  if (!state.style || !list[0] || !list[0].estilos) return list.slice(0, 6);
  const fit = list.filter((c) => c.estilos.includes(state.style));
  return (fit.length ? fit : list).slice(0, 6);
}
function goStep(step) {
  state.step = step;
  const t = selectedTrack();
  const text = (STEP_TEXT[step] || "").replace("{bpm}", state.bpm).replace("{track}", t ? `${t.id} · ${t.name}` : "ninguna");
  if (step === "tempo") return say(text, ["Más lento", "Más rápido", "Así está perfecto"]);
  if (step === "libre") return say(text, ["Explícame la canción", "Empezar otra canción"]);
  if (step === "efecto" || step === "estructura") {
    const tracks = state.tracks.slice(-4).map((x) => `Usar ${x.id} · ${x.name}`);
    return say(text, [...compsFor(step).slice(0, 5).map((c) => c.nombre), ...tracks.slice(0, 2), NEXT]);
  }
  say(text, [...compsFor(step).map((c) => c.nombre), NEXT]);
}
function nextStep() {
  const i = FLOW.indexOf(state.step);
  goStep(FLOW[Math.min(FLOW.length - 1, i + 1)]);
}

async function offlineGuide(text) {
  const low = text.toLowerCase();
  if (low.includes("empezar otra") || low.includes("reiniciar")) {
    evalCode("hush"); state.tracks = []; state.style = ""; state.ideas = []; changed(); renderCatalog(); return greet();
  }
  if (low.includes("seguir sin ia")) { state.offline = true; return goStep(state.step); }
  if (low.includes("explícame") || low.includes("explicame") || low.includes("qué hace") || low.includes("que hace")) {
    const ex = explainLocal(state.tracks.map((t) => t.code).join("\n"));
    return say("Así funciona tu canción, trozo a trozo:", state.options, { explicacion: ex.partes.slice(0, 10) });
  }
  if (low.includes("otra idea")) { state.ideas = []; localSuggestions(state, 2, true); renderIdeas();
    return say("Te he dejado ideas nuevas abajo, en «Ideas de Maestro». Pruébalas y quédate con lo que te guste.", state.options); }
  if (low.includes("qué hago") || low.includes("que hago") || low.includes("estructura")) {
    return say("Un buen ejercicio: escucha la canción y silencia pistas (botón del altavoz) para construir cada parte de la estructura. Así aprendes cómo cada capa cambia la energía. Después prueba las Ideas de Maestro o pulsa «Explícame» en una pista para entender su código.",
      ["Dame otra idea", "Explícame la canción"]); }
  if (text === NEXT || low.includes("siguiente") || low.includes("perfecto")) return nextStep();

  if (state.step === "estilo") {
    let key = Object.keys(STYLES).find((k) => low.includes(STYLES[k].nombre.toLowerCase()) || low.includes(k));
    if (!key && (low.includes("sorpr") || low.includes("no sé") || low.includes("no se"))) {
      const ks = Object.keys(STYLES); key = ks[Math.floor(Math.random() * ks.length)];
    }
    if (!key) return say("No conozco ese estilo todavía. Elige uno de estos y lo adaptamos después:", Object.values(STYLES).map((s) => s.nombre));
    const s = STYLES[key];
    state.style = key; state.bpm = s.bpm; $("#bpm").value = s.bpm; renderCatalog();
    if (live()) evalCode(cps(s.bpm));
    say(`¡${s.nombre}! ${s.desc}\nLo pongo a ${s.bpm} BPM, la velocidad típica del estilo.`, [], {
      explicacion: [{ fragmento: cps(s.bpm), explicacion: `Fija la velocidad: ${s.bpm} pulsos por minuto, divididos entre 60 segundos y entre 4 pulsos por ciclo (un ciclo = un compás).` }] });
    return goStep("percusion");
  }
  if (state.step === "tempo") {
    if (low.includes("lento")) state.bpm = Math.max(40, state.bpm - 10);
    else if (low.includes("rápido") || low.includes("rapido")) state.bpm = Math.min(220, state.bpm + 10);
    else { const n = parseInt(low.match(/\d+/)?.[0]); if (n) state.bpm = Math.max(40, Math.min(220, n)); }
    $("#bpm").value = state.bpm; evalCode(cps(state.bpm)); changed();
    return say(`Ahora a ${state.bpm} BPM. ¿Mejor así?`, ["Más lento", "Más rápido", "Así está perfecto"]);
  }
  const target = text.match(/Usar (d\d+)/);
  if (target) { state.selected = target[1]; save(); renderTracks(); return goStep(state.step); }

  const comp = COMPONENTS.find((c) => low === c.nombre.toLowerCase()) || COMPONENTS.find((c) => low.includes(c.nombre.toLowerCase()));
  if (comp) {
    const t = addComponent(comp);
    if (!t) return say("Primero necesitas alguna pista para aplicarle eso.", [NEXT]);
    teachAbout(comp, t);
    const opts = state.step === "efecto" || state.step === "estructura"
      ? [...compsFor(state.step).slice(0, 5).map((c) => c.nombre), NEXT]
      : [...compsFor(state.step).filter((c) => c.id !== comp.id).map((c) => c.nombre), NEXT];
    return say("¿Añadimos algo más aquí o pasamos al siguiente paso? Mira también las Ideas de Maestro, abajo.", opts);
  }
  say("Sin una IA conectada solo entiendo los botones. Conecta una en Ajustes para hablar con libertad.", state.options.length ? state.options : [NEXT]);
}


// ------------------------------------------------------------------ wizard de lluvia de ideas
const wz = { i: 0, answers: {}, sel: {}, comment: "", examples: {}, plan: null, loading: false };
const useLLM = () => server.llm && !state.offline;

function openWizard() {
  Object.assign(wz, { i: 0, answers: {}, sel: {}, comment: "", examples: {}, plan: null, loading: false });
  renderWizard();
  $("#wizard").showModal();
}
function wzAnswerList() {
  return QUESTIONS.filter((q) => wz.answers[q.id]).map((q) => ({ pregunta: q.pregunta, respuesta: wz.answers[q.id] }));
}
function renderWizard() {
  $("#wz-dots").innerHTML = QUESTIONS.map((q, i) =>
    `<span class="${wz.plan || i < wz.i ? "done" : i === wz.i ? "now" : ""}"></span>`).join("") + `<span class="${wz.plan ? "now" : ""}"></span>`;
  const body = $("#wz-body");
  if (wz.plan || wz.loading === "plan") return renderPlan(body);
  const q = QUESTIONS[wz.i];
  const examples = wz.examples[q.id] || q.ejemplos;
  const sel = wz.sel[q.id] || new Set();
  body.innerHTML = `
    ${wz.comment ? `<div class="wz-comment">${icon("maestro", 18)}<span></span></div>` : ""}
    <h2 class="q"></h2>
    <p class="wz-help"></p>
    <div class="wz-examples ${wz.loading ? "loading" : ""}"></div>
    <input class="wz-free" placeholder="O escribe tu propia respuesta…">
    <div class="wz-nav">
      <button data-a="back" ${wz.i === 0 ? "disabled" : ""}>${icon("back", 16)} Atrás</button>
      <div class="right">
        <button data-a="skip">Saltar</button>
        <button data-a="next" class="primary">${wz.i === QUESTIONS.length - 1 ? "Ver mi plan" : "Siguiente"} ${icon("arrow", 16)}</button>
      </div>
    </div>`;
  if (wz.comment) body.querySelector(".wz-comment span").textContent = wz.comment;
  body.querySelector(".q").textContent = q.pregunta;
  body.querySelector(".wz-help").textContent = q.ayuda + (wz.loading ? " (Maestro está pensando ejemplos para ti…)" : "");
  const ex = body.querySelector(".wz-examples");
  for (const e of examples) {
    const b = document.createElement("button");
    b.textContent = e; b.className = sel.has(e) ? "on" : "";
    b.onclick = () => {
      if (!q.multi) sel.clear();
      sel.has(e) ? sel.delete(e) : sel.add(e);
      wz.sel[q.id] = sel; renderWizard();
    };
    ex.appendChild(b);
  }
  const free = body.querySelector(".wz-free");
  free.value = wz.free?.[q.id] || "";
  free.oninput = () => { wz.free = { ...(wz.free || {}), [q.id]: free.value }; };
  free.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); wzNext(false); } };
  body.querySelector(".wz-nav").onclick = (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "back") { wz.i--; wz.comment = ""; renderWizard(); }
    if (a === "skip") wzNext(true);
    if (a === "next") wzNext(false);
  };
}
async function wzNext(skip) {
  if (wz.loading) return;
  const q = QUESTIONS[wz.i];
  const parts = [...(wz.sel[q.id] || [])];
  const free = (wz.free?.[q.id] || "").trim();
  if (free) parts.push(free);
  if (skip || !parts.length) delete wz.answers[q.id];
  else wz.answers[q.id] = parts.join(" · ");
  const last = wz.i === QUESTIONS.length - 1;
  if (last) return buildPlan();
  wz.i++;
  const nq = QUESTIONS[wz.i];
  wz.comment = wz.answers[q.id] ? reactLocal(q, wz.answers[q.id]) : "";
  if (useLLM() && wz.answers[q.id]) {
    wz.loading = true; renderWizard();
    try {
      const r = await api("/api/brainstorm", { answers: wzAnswerList(), next: nq.pregunta });
      if (r.comentario) wz.comment = r.comentario;
      if (r.ejemplos && r.ejemplos.length) wz.examples[nq.id] = [...new Set([...r.ejemplos, ...nq.ejemplos.slice(0, 2)])];
    } catch { /* seguimos con los ejemplos fijos */ }
    wz.loading = false;
  }
  renderWizard();
}
async function buildPlan() {
  wz.loading = "plan"; renderWizard();
  let plan = null;
  if (useLLM()) {
    try {
      const session = { bpm: state.bpm, tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code })) };
      plan = await api("/api/brainstorm", { answers: wzAnswerList(), next: null, session });
      if (!plan.sugerencias || !plan.sugerencias.length) plan = null;
    } catch { plan = null; }
  }
  if (!plan) plan = buildLocalPlan(wz.answers, state.tracks);
  if (!STYLES[plan.estilo]) plan.estilo = "";
  wz.plan = plan; wz.loading = false;
  renderWizard();
}
function renderPlan(body) {
  if (!wz.plan) { body.innerHTML = `<p class="typing">Maestro está diseñando el plan de tu canción…</p>`; return; }
  const p = wz.plan;
  const total = p.partes.reduce((n, x) => n + (Number(x.compases) || 8), 0) || 1;
  body.innerHTML = `<div class="plan">
    <span class="wz-kicker">Tu plan</span>
    <h2></h2><p class="resumen"></p>
    <div class="meta">${p.estilo ? `<span>${esc(STYLES[p.estilo].nombre)}</span>` : ""}${p.bpm ? `<span>${p.bpm} BPM</span>` : ""}<span>${total} compases</span></div>
    <h3>Estructura</h3>
    <div class="timeline">${p.partes.map((x) => `<div style="flex:${Math.max(3, Number(x.compases) || 8)}" title="${esc(x.que)}"><b>${esc(x.nombre)}</b><span>${esc(x.compases)} compases</span></div>`).join("")}</div>
    <p class="hint">${p.partes.map((x) => `<b>${esc(x.nombre)}:</b> ${esc(x.que)}`).join(" · ")}</p>
    <h3>Cambios para empezar a probar</h3>
    ${p.sugerencias.map((x, k) => `<div class="sug"><button class="prehear" data-k="${k}" style="float:right">${icon("speaker", 13)} Escuchar</button><div class="t">${esc(x.titulo)}${x.concepto ? `<span class="tag">${esc(x.concepto)}</span>` : ""}</div><div class="p">${esc(x.porque)}</div>${x.cambios.pistas.map((t) => `<code>${esc(t.id)} $ ${esc(t.codigo)}</code>`).join("")}</div>`).join("")}
    <div class="wz-nav">
      <button data-a="restart">${icon("back", 16)} Volver a empezar</button>
      <div class="right">
        <button data-a="ideas">Llevar las ideas a Maestro</button>
        <button data-a="all" class="primary">${icon("play", 14)} Empezar con todo</button>
      </div>
    </div></div>`;
  body.querySelector("h2").textContent = p.titulo;
  body.querySelectorAll(".sug .prehear").forEach((b) => wirePreHear(b, p.sugerencias[+b.dataset.k].cambios));
  body.querySelector(".resumen").textContent = p.resumen;
  body.querySelector(".wz-nav").onclick = (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "restart") openWizard();
    if (a === "ideas" || a === "all") adoptPlan(p, a === "all");
  };
}
function adoptPlan(p, applyAll) {
  if (preview) { preview.onEnd = null; clearTimeout(preview.timer); preview = null; }
  $("#wizard").close();
  if (p.estilo) { state.style = p.estilo; renderCatalog(); }
  if (p.bpm) { state.bpm = p.bpm; $("#bpm").value = p.bpm; if (live()) evalCode(cps(p.bpm)); }
  const estructura = p.partes.map((x) => `• ${x.nombre} (${x.compases} compases): ${x.que}`).join("\n");
  state.step = "libre";
  if (applyAll) {
    const pistas = p.sugerencias.flatMap((x) => x.cambios.pistas);
    const note = applyChanges({ pistas });
    p.sugerencias.forEach((x) => x.concepto && !state.learnedMusic.includes(x.concepto) && state.learnedMusic.push(x.concepto));
    state.ideas = [];
    say(`Plan «${p.titulo}» en marcha. ${p.resumen}\n\nLa estructura que diseñamos:\n${estructura}\n\nYa suena todo. Pulsa «Explícame» en cualquier pista para entender su código, o silencia pistas para escuchar cada parte.`,
      ["¿Qué hago ahora?", "Explícame la canción"], { changes: note });
  } else {
    state.ideas = p.sugerencias;
    say(`Plan «${p.titulo}». ${p.resumen}\n\nLa estructura que diseñamos:\n${estructura}\n\nTe he dejado ${p.sugerencias.length} ideas abajo: pruébalas una a una y quédate con las que te gusten.`,
      ["Explícame la estructura", "Dame otra idea"]);
  }
  changed(); renderIdeas();
}


// ------------------------------------------------------------------ proyectos
const FRESH = () => ({ bpm: 120, tracks: [], selected: null, style: "", step: "estilo", chat: [], options: [], ideas: [],
  trying: null, learnedMusic: state.learnedMusic || [], lastError: "", offline: state.offline, projectId: "p" + Date.now(), name: "" });

function renderAll() {
  $("#bpm").value = state.bpm; $("#proj-name").value = state.name || "";
  renderCatalog(); renderTracks(); renderProgress(); renderIdeas(); renderChat();
  $("#code").value = buildCode();
}
function openNewProject() {
  $("#np-kicker").innerHTML = icon("plus", 16) + " Nuevo proyecto";
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">¿Cómo quieres empezar?</h2>
    <p class="wz-help">Tu proyecto actual se guarda solo en «Mis proyectos».</p>
    <div class="np-choices">
      <button class="np-choice" data-m="blank">${icon("blank", 28)}<b>En blanco</b><span>Un lienzo vacío. Tú añades cada pieza desde el catálogo o pidiéndosela a Maestro.</span></button>
      <button class="np-choice rec" data-m="wizard"><em>Recomendado</em>${icon("steps", 28)}<b>Con wizard</b><span>Vas pulsando opciones paso a paso (estilo, ritmo, bajo, acordes…) y se crea tu proyecto base. Todo suena mientras eliges.</span></button>
      <button class="np-choice" data-m="ideas">${icon("wand", 28)}<b>Lluvia de ideas</b><span>Maestro te hace preguntas abiertas sobre lo que quieres sentir y diseña contigo un plan.</span></button>
    </div>`;
  body.querySelector(".np-choices").onclick = (e) => {
    const m = e.target.closest("button")?.dataset.m;
    if (!m) return;
    $("#newproj").close();
    if (m === "blank") startBlank();
    if (m === "wizard") openBuilder();
    if (m === "ideas") { startFresh(); openWizard(); }
  };
  $("#newproj").showModal();
}
function startFresh() {
  save();
  evalCode("hush");
  state = FRESH();
  renderAll();
}
function startBlank() {
  startFresh();
  state.step = "libre";
  say("Proyecto en blanco. Puedes:\n• Añadir piezas desde el catálogo de la izquierda (pulsa +).\n• Pedírmelo con tus palabras: «pon un bombo», «algo de jazz»…\n• Escribir código directamente en la pestaña Código.\n\nCada vez que añadas algo te explico su código.",
    ["Empieza tú con un ritmo", "Lluvia de ideas: diseñar mi canción", ...Object.values(STYLES).slice(0, 4).map((x) => x.nombre)]);
  state.step = "estilo";
}
function openProjects() {
  $("#np-kicker").innerHTML = icon("folder", 16) + " Mis proyectos";
  const list = listProjects();
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">Mis proyectos</h2>
    <p class="wz-help">Se guardan en este navegador. Tu progreso de aprendizaje es común a todos.</p>
    <div class="np-list">${list.length ? list.map((p) => `<div class="np-item ${p.id === state.projectId ? "current" : ""}" data-id="${esc(p.id)}">
      <span class="n">${esc(p.name)}<span class="d">${p.data.tracks.length} pistas · ${p.data.bpm} BPM · ${new Date(p.updated).toLocaleString("es-ES")}</span></span>
      ${p.id === state.projectId ? `<span class="hint">abierto</span>` : `<button data-a="open">Abrir</button>`}
      <button data-a="del" class="icon-btn" title="Borrar">${icon("trash", 16)}</button></div>`).join("") : `<p class="hint">Todavía no hay proyectos guardados.</p>`}</div>
    <div class="wz-nav"><span></span><div class="right"><button class="primary" data-a="new">${icon("plus", 14)} Nuevo proyecto</button></div></div>`;
  body.onclick = (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    const id = btn.closest(".np-item")?.dataset.id;
    if (btn.dataset.a === "new") { $("#newproj").close(); return openNewProject(); }
    if (btn.dataset.a === "open") {
      save();
      const p = listProjects().find((x) => x.id === id);
      evalCode("hush");
      state = { ...FRESH(), ...p.data, trying: null };
      $("#newproj").close(); renderAll(); if (live()) playAll();
      sysMsg(`Proyecto «${state.name}» abierto.`);
    }
    if (btn.dataset.a === "del" && confirmDelete(id)) openProjects();
  };
  $("#newproj").showModal();
}
function confirmDelete(id) {
  const list = listProjects();
  const p = list.find((x) => x.id === id);
  if (!p) return false;
  if (!window.confirm(`¿Borrar «${p.name}»? No se puede deshacer.`)) return false;
  localStorage.setItem(PROJ_KEY, JSON.stringify(list.filter((x) => x.id !== id)));
  if (id === state.projectId) { state.name = ""; state.projectId = "p" + Date.now(); }
  return true;
}

// ------------------------------------------------------------------ wizard de proyecto base
const bd = { i: 0, sel: {} };
const ALL_SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
function openBuilder() {
  bd.i = 0; bd.sel = {};
  renderBuilder();
  $("#builder").showModal();
}
function builderPreview() {
  if (!bd.sel.estilo) return;
  const c = compose(bd.sel);
  const lines = [cps(c.bpm), ...ALL_SLOTS.map((id) => { const t = c.tracks.find((x) => x.id === id); return t ? `${id} $ ${t.code}` : `${id} silence`; })];
  // las pistas del proyecto actual que no usan estos huecos se silencian mientras pruebas
  state.tracks.filter((t) => !ALL_SLOTS.includes(t.id)).forEach((t) => lines.push(`${t.id} silence`));
  api("/api/eval", { code: lines.join("\n\n") }).catch(() => {});
}
function compCode(c) {
  return [cps(c.bpm), "", ...c.tracks.map((t) => `${t.id} $ ${t.code}`)].join("\n");
}
function renderBuilder() {
  const st = builderSteps(bd.sel);
  const total = st.length + 1;
  $("#bd-dots").innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i < bd.i ? "done" : i === bd.i ? "now" : ""}"></span>`).join("");
  const body = $("#bd-body");
  if (bd.i >= st.length) return renderBuilderSummary(body);
  const step = st[bd.i];
  const cur = bd.sel[step.id];
  const isOn = (id) => (Array.isArray(cur) ? cur.includes(id) : cur === id);
  body.innerHTML = `<h2 class="q">${esc(step.titulo)}</h2>
    <p class="wz-help">${esc(step.ayuda)}${step.multi ? ` <b>Puedes elegir ${step.multi > 3 ? "varios" : "hasta " + step.multi}.</b>` : ""}${bd.sel.estilo && bd.i > 0 ? " Ya te he dejado marcadas mis recomendaciones: cámbialas a tu gusto." : ""}</p>
    <div class="opt-grid">${step.opciones.map((o) => `<button class="opt ${isOn(o.id) ? "on" : ""}" data-id="${esc(o.id)}">
      <b>${esc(o.titulo)} ${o.fit ? `<span class="fit">encaja</span>` : ""}</b><span>${esc(o.desc)}</span>${o.codigo ? `<code>${esc(o.codigo)}</code>` : ""}</button>`).join("")}</div>
    ${bd.sel.estilo ? `<details class="bd-preview"><summary>Ver el código que llevas hasta ahora</summary><pre>${esc(compCode(compose(bd.sel)))}</pre></details>` : ""}
    <div class="wz-nav">
      <button data-a="back" ${bd.i === 0 ? "disabled" : ""}>${icon("back", 16)} Atrás</button>
      <div class="right"><button data-a="next" class="primary" ${bd.sel.estilo ? "" : "disabled"}>${bd.i === st.length - 1 ? "Ver resumen" : "Siguiente"} ${icon("arrow", 16)}</button></div>
    </div>`;
  body.querySelector(".opt-grid").onclick = (e) => {
    const id = e.target.closest(".opt")?.dataset.id;
    if (!id) return;
    if (step.id === "estilo") bd.sel = defaultsFor(id);
    else if (step.multi) {
      const arr = Array.isArray(cur) ? [...cur] : [];
      const k = arr.indexOf(id);
      if (k >= 0) arr.splice(k, 1); else { arr.push(id); if (arr.length > step.multi) arr.shift(); }
      bd.sel[step.id] = arr;
    } else bd.sel[step.id] = id;
    builderPreview();
    renderBuilder();
  };
  body.querySelector(".wz-nav").onclick = (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "back") { bd.i--; renderBuilder(); }
    if (a === "next") { bd.i++; renderBuilder(); }
  };
}
function renderBuilderSummary(body) {
  const c = compose(bd.sel);
  const st = STYLES[bd.sel.estilo];
  const items = c.tracks.map((t) => `<li><code>${esc(t.id)}</code><span><b>${esc(t.name)}</b>: ${esc(byId[Object.keys(byId).find((k) => byId[k].nombre === t.name)]?.desc || "")}</span></li>`).join("");
  body.innerHTML = `<div class="bd-summary">
    <span class="wz-kicker">Resumen</span>
    <h2 class="q">Tu proyecto ${esc(st.nombre)} a ${c.bpm} BPM</h2>
    <p class="wz-help">${c.tracks.length} pistas. Así queda el código: cada línea <code>dN $ …</code> es una pista que suena a la vez que las demás.</p>
    <ul class="parts">${items}</ul>
    <div class="idea-note"><b>Estructura.</b> ${esc(STRUCTURE_EXPLAIN[bd.sel.estructura] || "")}</div>
    <details class="bd-preview" open><summary>Código completo</summary><pre>${esc(compCode(c))}</pre></details>
    <label class="hint" style="display:block;margin-top:12px">Nombre del proyecto <input id="bd-name" style="width:100%;margin-top:4px" value="${esc(st.nombre + " · " + new Date().toLocaleDateString("es-ES"))}"></label>
    <div class="wz-nav">
      <button data-a="back">${icon("back", 16)} Atrás</button>
      <div class="right"><button data-a="create" class="primary">${icon("play", 14)} Crear proyecto</button></div>
    </div></div>`;
  body.querySelector(".wz-nav").onclick = (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "back") { bd.i--; renderBuilder(); }
    if (a === "create") createFromBuilder(c, $("#bd-name").value.trim());
  };
}
function createFromBuilder(c, name) {
  bd.created = true;
  $("#builder").close();
  bd.created = false;
  startFresh();
  state.name = name || "Proyecto sin título";
  state.style = bd.sel.estilo; state.bpm = c.bpm; state.tracks = c.tracks; state.step = "libre"; state.selected = c.tracks[0]?.id || null;
  renderAll();
  playAll();
  const efectos = (bd.sel.efectos || []).map((id) => EFFECTS.find((e) => e.id === id)).filter(Boolean);
  const explicacion = [
    { fragmento: cps(c.bpm), explicacion: `La velocidad: ${c.bpm} BPM.` },
    ...c.tracks.slice(0, 7).map((t) => ({ fragmento: `${t.id} $ …`, explicacion: `${t.name}. Pulsa «Explícame» en la pista para ver cada trozo de su código.` })),
    ...efectos.map((e) => ({ fragmento: e.codigo, explicacion: e.desc })),
  ];
  say(`¡Proyecto «${state.name}» creado! Ya está sonando.\n\n${STRUCTURE_EXPLAIN[bd.sel.estructura] || ""}\n\nAsí está montado:`,
    ["¿Qué hago ahora?", "Dame otra idea", "Explícame la canción"],
    { explicacion, reto: "Silencia una pista con el botón del altavoz y escucha qué papel cumple en la canción. Luego vuelve a activarla." });
  changed();
}

// ------------------------------------------------------------------ estado del servidor
function setPill(el, cls, iconName, text) { el.className = "pill " + cls; el.innerHTML = icon(iconName, 14) + `<span>${esc(text)}</span>`; }
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    server.llm = s.llm_configured; server.engine = s.engine;
    const e = s.engine, pe = $("#st-engine");
    if (e.tidal_running && e.superdirt_ready) setPill(pe, "ok", "speaker", "Sonido listo");
    else if (e.tidal_running || e.sc_running) setPill(pe, "warn", "speaker", "Arrancando sonido…");
    else if (!e.ghci_path || !e.sclang_path) setPill(pe, "bad", "mute", "Simulación (falta instalar)");
    else setPill(pe, "warn", "mute", "Motor parado");
    setPill($("#st-llm"), s.llm_configured ? "ok" : "warn", "brain",
      s.llm_configured ? `IA: ${s.provider === "anthropic" ? "Claude" : "OpenAI-compatible"}` : "IA sin conectar");
    $("#assistant-mode").textContent = s.llm_configured && !state.offline ? "" : "· guía sin IA";
  } catch {
    setPill($("#st-engine"), "bad", "power", "Servidor apagado");
  }
}
async function refreshLog() {
  if (!$("#tab-log").classList.contains("active")) return;
  try {
    const r = await api("/api/log"); const el = $("#log");
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.textContent = r.log.join("\n"); if (atBottom) el.scrollTop = el.scrollHeight;
  } catch { /* ignorar */ }
}

// ------------------------------------------------------------------ ajustes
async function openSettings() {
  const c = await api("/api/config");
  document.querySelector(`input[name=provider][value=${c.provider}]`).checked = true;
  $("#oa-url").value = c.openai.base_url; $("#oa-model").value = c.openai.model;
  $("#oa-key").value = c.openai.api_key; $("#an-key").value = c.anthropic.api_key; $("#an-model").value = c.anthropic.model;
  const preset = [...$("#oa-preset").options].find((o) => o.value.split("|")[0] === c.openai.base_url);
  $("#oa-preset").value = preset ? preset.value : "custom";
  toggleProvider(); $("#test-msg").textContent = "";
  $("#settings").showModal();
}
function toggleProvider() {
  const p = document.querySelector("input[name=provider]:checked").value;
  $("#fs-openai").hidden = p !== "openai"; $("#fs-anthropic").hidden = p !== "anthropic";
}
async function saveSettings() {
  await api("/api/config", {
    provider: document.querySelector("input[name=provider]:checked").value,
    openai: { base_url: $("#oa-url").value, api_key: $("#oa-key").value, model: $("#oa-model").value },
    anthropic: { api_key: $("#an-key").value, model: $("#an-model").value },
  });
  state.offline = false; save();
  await refreshStatus();
}

// ------------------------------------------------------------------ arranque
function init() {
  load();
  hydrateIcons();
  $("#bpm").value = state.bpm;
  $("#proj-name").value = state.name || "";
  renderCatalog(); renderTracks(); renderProgress(); renderIdeas(); $("#code").value = buildCode();
  if (!state.chat.length) greet(); else renderChat();

  $("#bpm").addEventListener("change", (e) => {
    state.bpm = Math.max(40, Math.min(220, parseInt(e.target.value) || 120)); e.target.value = state.bpm;
    changed(); evalCode(cps(state.bpm));
  });
  $("#btn-play").onclick = playAll;
  $("#btn-hush").onclick = () => evalCode("hush");
  $("#style-filter").onchange = (e) => { state.style = e.target.value; save(); renderCatalog(); renderIdeas(); };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); const i = $("#chat-input"); send(i.value); i.value = ""; };
  $("#btn-more-ideas").onclick = () => {
    if (state.trying) return;
    if (server.llm && !state.offline) return send("Dame otra idea para mejorar la canción, y explícame qué concepto musical enseña.");
    state.ideas = []; localSuggestions(state, 2, true); flavorTurn++; renderIdeas();
  };
  $("#flavors").onclick = (e) => {
    const k = e.target.closest("button")?.dataset.f;
    if (!k || state.trying) return;
    if (!state.tracks.length) return toast("Primero crea algo de música (aunque sea un bombo) para poder transformarla.");
    const idea = flavorIdea(k, state.tracks);
    if (idea) tryIdea([idea], 0);
  };

  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "code") $("#code").value = buildCode();
    if (b.dataset.tab === "log") refreshLog();
  });
  $("#btn-apply-code").onclick = async () => {
    const parsed = parseCode($("#code").value);
    const keep = new Set(parsed.tracks.map((t) => t.id));
    const removed = state.tracks.filter((t) => !keep.has(t.id)).map((t) => t.id);
    const before = Object.fromEntries(state.tracks.map((t) => [t.id, t.code]));
    parsed.tracks.forEach((t) => { if (before[t.id] !== t.code) t.edited = true; });
    state.bpm = parsed.bpm; $("#bpm").value = state.bpm; state.tracks = parsed.tracks;
    changed();
    for (const id of removed) await silenceId(id);
    const r = await playAll();
    $("#code-msg").textContent = r && r.ok ? `Aplicado (${parsed.tracks.length} pistas)` : "Hay errores: mira el Registro";
  };
  $("#btn-explain-all").onclick = async () => {
    const code = $("#code").value;
    $("#code-msg").textContent = "Maestro está leyendo el código…";
    const ex = await explain(code, "canción completa");
    $("#code-msg").textContent = "La explicación está en el chat de Maestro.";
    say(ex.resumen || "Así funciona tu código:", state.options, { explicacion: ex.partes, reto: ex.reto });
  };
  $("#code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#btn-apply-code").click(); }
    if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
  });
  $("#btn-copy-code").onclick = () => navigator.clipboard.writeText($("#code").value).then(() => $("#code-msg").textContent = "Copiado");
  $("#btn-engine-start").onclick = async () => { await api("/api/engine/start", {}); refreshStatus(); };
  $("#btn-engine-stop").onclick = async () => { await api("/api/engine/stop", {}); refreshStatus(); };

  $("#btn-settings").onclick = openSettings;
  $("#btn-new").onclick = openNewProject;
  $("#btn-projects").onclick = openProjects;
  document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => b.closest("dialog").close());
  $("#bd-close").onclick = () => $("#builder").close();
  $("#builder").addEventListener("close", () => {
    if (!bd.created && bd.sel.estilo) { evalCode("hush"); if (live() && state.tracks.length) playAll(); }
  });
  $("#proj-name").onchange = (e) => { state.name = e.target.value.trim(); save(); };
  $("#wz-close").onclick = () => $("#wizard").close();
  $("#wizard").addEventListener("close", () => stopPreHear());
  document.querySelectorAll("input[name=provider]").forEach((r) => r.onchange = toggleProvider);
  $("#oa-preset").onchange = (e) => {
    if (e.target.value === "custom") return;
    const [url, model] = e.target.value.split("|"); $("#oa-url").value = url; $("#oa-model").value = model;
  };
  $("#btn-save").onclick = async () => { await saveSettings(); $("#settings").close(); };
  $("#btn-test").onclick = async () => {
    $("#test-msg").textContent = "Probando…";
    try { await saveSettings(); const r = await api("/api/llm/test", {}); $("#test-msg").textContent = "Conectado: " + r.reply; }
    catch (e) { $("#test-msg").textContent = "Error: " + e.message; }
  };

  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(refreshLog, 1500);
}

init();
