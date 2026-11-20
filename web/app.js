import { STYLES, CATEGORIES, COMPONENTS, byId } from "./catalog.js";
import { icon, hydrateIcons } from "./icons.js";
import { explainLocal } from "./explain.js";
import { localSuggestions, CODE_CONCEPTS, MUSIC_CONCEPTS, retoFor } from "./suggest.js";

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
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
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
function currentIdeas() {
  return state.ideas && state.ideas.length ? state.ideas : localSuggestions(state, 2);
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
        : `<button data-a="try" ${state.trying ? "disabled" : ""}>${icon("play", 12)} Probar</button>`}</div>`;
    el.querySelector(".t").textContent = idea.titulo;
    el.querySelector(".p").textContent = idea.porque;
    if (idea.concepto) el.querySelector(".tag").textContent = idea.concepto;
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
  const snapshot = JSON.stringify({ bpm: state.bpm, tracks: state.tracks });
  state.trying = { index: i, ideas, snapshot };
  const note = applyChanges(ideas[i].cambios);
  renderIdeas();
  sysMsg(`Probando: «${ideas[i].titulo}». Escucha unos compases… ¿te gusta? ${note ? "(" + note.replace("Cambios: ", "") + ")" : ""}`);
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
  say("¡Hola! Soy Maestro. Aquí vas a aprender música y a programarla con TidalCycles mientras creas tu propia canción.\n\nIremos paso a paso: estilo, ritmo, velocidad, bajo, acordes, melodía, efectos y cuándo cambia cada cosa. En cada paso te explico el código y te propongo ideas, como haría un productor a tu lado. No hace falta saber nada.\n\n¿Qué estilo te apetece?",
    [...Object.values(STYLES).map((s) => s.nombre), "Sorpréndeme"]);
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
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
    const summary = applyChanges(r.cambios || {});
    if (r.sugerencias && r.sugerencias.length) state.ideas = r.sugerencias;
    say(r.mensaje || "…", r.opciones || [], { explicacion: r.explicacion, reto: r.reto, changes: summary });
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
    state.ideas = []; localSuggestions(state, 2, true); renderIdeas();
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
