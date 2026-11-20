import { L, LANG, setLang } from "./i18n.js";
import { STYLES, CATEGORIES, COMPONENTS, byId } from "./catalog.js";
import { compIcon } from "./comp-icons.js";
import { startTour, stopTour, tourFlag, tourSeen } from "./tour.js";
import { INSTRUMENTS, instById, instThumb, instArt, photoCredit, DRUM_PIECES, drumKitSVG, drumCode, melodyCode, keyboardHTML, noteName, beep, stopBeeps } from "./instruments.js";
import { icon, hydrateIcons } from "./icons.js";
import { attachHighlight, refreshHighlights, syncSounds } from "./code-hl.js";
import { explainLocal } from "./explain.js";
import { localSuggestions, CODE_CONCEPTS, MUSIC_CONCEPTS, retoFor } from "./suggest.js";
import { QUESTIONS, reactLocal, buildLocalPlan } from "./wizard.js";
import { FLAVORS, flavorIdea } from "./flavors.js";
import { diagnose, fixLocal, WISHES, wishLabel } from "./doctor.js";
import { songBlocksHTML, blockInfo } from "./blocks.js";
import { applyEdit, partOf, WRAPS, ADD_PARAMS, paramRange } from "./edit.js";
import { mixerHTML, mixCodeHTML, mixSuffix, mixLine, parseMixLine, audible, setMix, mixOf, dbText } from "./mixer.js";
import { cardCode, cardFromPos } from "./card.js";
import { initHistory, record, flushPending, undo as histUndo, redo as histRedo, go as histGo, entries as histEntries, canUndo, canRedo, resetHistory } from "./history.js";
import { arrangeHTML, barsOf, setMask, PRESETS as AR_PRESETS } from "./arrange.js";
import { controlsFor, controlsHTML, normalizeControls, setParam, getParam, fmt, fromPos, gridFrom, gridToCode, PARAMS as CTL_PARAMS, extApply, extState } from "./controls.js";
import { TYPES as SAMPLE_TYPES, BUILTIN, typeName, typeKind, starterCode, swapSound, PACKS, DIRT_INDEX, guessType, safeName } from "./samples.js";
import { GROUPS, BLOCKS, LEVELS, blockName, blockDesc, groupName, applyBlock } from "./palette.js";
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
      list.unshift({ id: state.projectId, name: state.name || L("Proyecto sin título", "Untitled project"), updated: Date.now(),
        data: { ...state, trying: null } });
      localStorage.setItem(PROJ_KEY, JSON.stringify(list.slice(0, 30)));
    }
  } catch { /* sin almacenamiento */ }
  record(state, renderHistoryButtons);
  renderHistoryButtons();
}
const PROJ_KEY = "tidal-studio-projects-v1";
function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJ_KEY) || "[]"); } catch { return []; }
}

// ------------------------------------------------------------------ API
async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: LANG, ...body }),
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
  const M = state.master || {};
  if (M.vol || M.low || M.mid || M.high) lines.push(L(`-- Master: ${dbText(M.vol || 0)} · EQ graves ${M.low || 0} / medios ${M.mid || 0} / agudos ${M.high || 0} dB (ya sumado en cada pista)`, `-- Master: ${dbText(M.vol || 0)} · EQ lows ${M.low || 0} / mids ${M.mid || 0} / highs ${M.high || 0} dB (already added to each track)`), "");
  for (const t of state.tracks) {
    const ml = mixLine(t, state);
    const body = `${t.id} $ ${t.code}${ml ? "\n" + ml : ""}`;
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
    let mix = null;
    const plain = codeLines.filter((l) => { const m = parseMixLine(l, state); if (m) mix = m; return !m; });
    const tm = plain.join("\n").match(/^\s*(d\d+)\s*\$\s*([\s\S]+)$/);
    if (tm) {
      const old = state.tracks.find((x) => x.id === tm[1]);
      out.tracks.push({ id: tm[1], name: name || tm[1], kind, code: tm[2].trim(), muted, mix, ...(old && old.solo ? { solo: true } : {}) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ sonido
async function evalCode(code, track) {
  try {
    const r = await api("/api/eval", { code });
    const errs = r.errors && r.errors.length ? r.errors : [];
    if (track) {
      track.error = errs.join("\n");
      if (!errs.length && r.ok && !track.muted) track.lastGood = track.code;
      // Si una pista editada da error, Maestro se ofrece a ayudar sin que lo pidas
      if (errs.length && !track.help) track.help = { open: true, auto: true };
    }
    state.lastError = errs.slice(0, 6).join(" ");
    if (!r.ok && !track) toast(L("Tidal dio un error. Mira la pestaña Registro o pregunta a Maestro.", "Tidal returned an error. Check the Log tab or ask Maestro."));
    return r;
  } catch (e) {
    toast(L("No se pudo enviar el código: ", "Couldn't send the code: ") + e.message);
  } finally {
    renderTracks();
  }
}
// La mezcla (volumen y ecualizador) se añade al final al hacer sonar la pista; silenciada o fuera del solo = silence
const trackLine = (t) => { if (!audible(t, state)) return `${t.id} silence`; const mx = mixSuffix(t, state); return `${t.id} $ ${t.code}${mx ? " " + mx : ""}`; };
const playTrack = (t) => evalCode(trackLine(t), t);
const silenceId = (id) => evalCode(`${id} silence`);
const playAll = () => evalCode([cps(state.bpm), ...state.tracks.map(trackLine)].join("\n\n"));
const live = () => $("#autoplay").checked;
// Silencio de verdad: "hush" solo para los patrones, pero las notas largas, la reverb y el eco
// seguían sonando, y una pre-escucha en marcha volvía a poner la música al acabar su tiempo.
// "panic" (BootTidal) además corta todo lo que suena en SuperDirt; y paramos el audio del navegador.
function hushAll() {
  if (preview) { clearTimeout(preview.timer); const { onEnd } = preview; preview = null; if (onEnd) onEnd(); }
  clearTimeout(ctlTimer);
  seqTimers.forEach(clearTimeout); seqTimers = [];
  smStop(); stopBeeps();
  return evalCode("panic");
}

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
  if (!id) { toast(L("Máximo 12 pistas. Borra alguna primero.", "Maximum 12 tracks. Delete one first.")); return null; }
  const t = { id, name, kind, code, muted: false };
  state.tracks.push(t);
  state.selected = id;
  changed();
  if (live()) playTrack(t);
  return t;
}
function applyModifier(comp, target) {
  const t = target || selectedTrack();
  if (!t) { toast(L("Primero añade una pista para aplicarle esto.", "Add a track first to apply this to it.")); return null; }
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
  renderPalette();
  renderBlocks();
  renderArrange();
  renderMixer();
  refreshCards();
  if (!$("#tab-code").classList.contains("active")) $("#code").value = buildCode();
}

function explainHTML(ex, onClose) {
  const parts = (ex.partes || []).map((p) => `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("");
  return `${onClose ? `<button class="close" title="${L("Cerrar", "Close")}">${icon("close", 16)}</button>` : ""}
    ${ex.resumen ? `<p class="sum">${esc(ex.resumen)}</p>` : ""}
    ${parts ? `<ul class="parts">${parts}</ul>` : ""}
    ${ex.reto ? `<div class="reto"><b>${L("Reto.", "Challenge.")}</b> ${esc(ex.reto.replace(/^Reto:\s*/i, ""))}</div>` : ""}
    ${ex.idea ? `<div class="idea-note"><b>${L("Idea de Maestro.", "Maestro's idea.")}</b> ${esc(ex.idea)}</div>` : ""}`;
}

let arN = 16;
function renderArrange() {
  if (!$("#tab-arrange").classList.contains("active")) return;
  $("#arrange").innerHTML = arrangeHTML(state, arN, { icon: (k, n) => icon(CATEGORIES.find((c) => c.id === k) ? k : "fx", n), kindColor: (k) => KIND_COLOR[k] || "var(--ink-3)" });
}
function wireArrange() {
  const box = $("#arrange");
  let paint = null;
  const setCell = (btn) => {
    const row = btn.closest(".ar-row"); const t = state.tracks.find((x) => x.id === row.dataset.id); if (!t) return;
    const bars = barsOf(t.code, arN); if (!bars) return;
    const k = +btn.dataset.k;
    if (paint === null) paint = !bars[k];
    if (bars[k] === paint) return;
    bars[k] = paint; t.code = setMask(t.code, bars); t.explain = null;
    btn.classList.toggle("on", paint);
    const mw = t.code.match(/mask "[^"]*"/);
    row.querySelector(".ar-code").textContent = mw ? mw[0] + " $" : L("(siempre suena)", "(always plays)");
  };
  const finish = () => {
    if (paint === null) return;
    paint = null; save(); renderTracks(); renderBlocks(); $("#code").value = buildCode();
    if (live()) playAll();
  };
  box.addEventListener("pointerdown", (e) => { const b = e.target.closest(".ar-cell"); if (!b) return; e.preventDefault(); paint = null; setCell(b); });
  box.addEventListener("pointerover", (e) => { if (paint === null) return; const b = e.target.closest(".ar-cell"); if (b) setCell(b); });
  window.addEventListener("pointerup", finish);
  box.addEventListener("change", (e) => { if (e.target.id === "ar-n") { arN = +e.target.value; renderArrange(); } });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const p = AR_PRESETS.find((x) => x.id === b.dataset.p);
    state.tracks.forEach((t, i) => { if (!barsOf(t.code, arN)) return; t.code = setMask(t.code, Array.from({ length: arN }, (_, k) => !!p.f(t, k, arN, i, state.tracks.length))); });
    changed(); if (live()) playAll();
    say(L(`He aplicado el arreglo «${p.es}». Mira la pestaña Código: cada pista lleva ahora su mask "<…>", un interruptor por compás.`, `I applied the «${p.en}» arrangement. Look at the Code tab: each track now has its own mask "<…>", one switch per bar.`), state.options);
  });
}
function renderBlocks() {
  if (!$("#tab-blocks").classList.contains("active")) return;
  $("#blocks").innerHTML = songBlocksHTML(state, { icon: (k, n) => icon(CATEGORIES.find((c) => c.id === k) ? k : "fx", n), uiIcon: icon,
    kindColor: (k) => KIND_COLOR[k] || "var(--ink-3)", kindName: (k) => CATEGORIES.find((c) => c.id === k)?.nombre || k });
  if (bkSel) { const el = bkFind(bkSel); if (el) { el.classList.add("on"); if (!bkSel.keep) bkOpen(el); else bkPlace(el); } else bkClose(); }
}

// ------------------------------------------------------------------ bloques: tooltip para ver y editar cada bloque
let bkSel = null;     // { id, key } del bloque seleccionado
let bkTimer = null;
const bkFind = (sel) => sel.key === "bpm" ? $("#blocks .bk-tag") : document.querySelector(`#blocks .bk-track[data-id="${sel.id}"] [data-key="${CSS.escape(sel.key)}"]`);
function bkClose() { bkSel = null; $("#bk-pop").hidden = true; document.querySelectorAll("#blocks .on").forEach((x) => x.classList.remove("on")); }
function bkPlace(el) {
  const pop = $("#bk-pop"), pane = $("#tab-blocks");
  const r = el.getBoundingClientRect(), pr = pane.getBoundingClientRect();
  const w = Math.min(360, pr.width - 16);
  pop.style.width = w + "px";
  pop.style.left = Math.max(8, Math.min(r.left - pr.left, pr.width - w - 8)) + "px";
  pop.style.top = (r.bottom - pr.top + 8) + "px";
  pop.style.setProperty("--arrow", Math.max(14, Math.min(w - 20, r.left - pr.left + Math.min(r.width, 60) / 2 - parseFloat(pop.style.left))) + "px");
}
const stepBtn = (a, label, title) => `<button data-bk="${a}" title="${esc(title)}">${label}</button>`;
function bkEditorHTML(t, part) {
  if (!part) return "";
  if (part.kind === "step") return `<div class="bk-ed"><label>${L("Paso", "Step")}<input type="text" data-bk-in="set" value="${esc(part.text)}" spellcheck="false"></label>
    <div class="bk-btns">${stepBtn("rest", "~", L("Convertir en silencio", "Turn into a rest"))}${stepBtn("x2", "×2", L("Que suene el doble de veces en su hueco", "Play twice as many times in its slot"))}${stepBtn("split", "[ ]", L("Partir en dos golpes", "Split into two hits"))}${stepBtn("maybe", "?", L("Que a veces no suene", "Sometimes skip it"))}${stepBtn("after", "+", L("Añadir un paso detrás (copia)", "Add a step after it (copy)"))}${stepBtn("del", icon("trash", 14), L("Borrar este paso", "Delete this step"))}</div></div>`;
  if (part.kind === "src" || part.kind === "raw") return `<div class="bk-ed"><label>${part.kind === "src" ? L("Mini-notación (entre comillas)", "Mini-notation (inside the quotes)") : L("Patrón", "Pattern")}<input type="text" data-bk-in="set" value="${esc(part.text)}" spellcheck="false"></label>
    <div class="bk-btns">${part.kind === "src" ? stepBtn("addstep", L("+ paso", "+ step"), L("Añadir un silencio al final", "Add a rest at the end")) : ""}
    <select data-bk-sel="addparam"><option value="">${L("+ ajuste #…", "+ setting #…")}</option>${ADD_PARAMS.filter((p) => !(part.params || []).includes(p)).map((p) => `<option value="${p}">${p} · ${esc(L(CTL_PARAMS[p].es, CTL_PARAMS[p].en))}</option>`).join("")}</select></div></div>`;
  if (part.kind === "param") {
    const r = part.range;
    const sl = r ? `<div class="ctl-row"><input type="range" data-bk-range="set" min="${r.log ? 0 : r.min}" max="${r.log ? 1000 : r.max}" step="${r.log ? 1 : r.step}" value="${r.log ? Math.round(1000 * Math.log(Math.max(part.value, r.min || 1) / (r.min || 1)) / Math.log(r.max / (r.min || 1))) : part.value}" ${r.log ? `data-log="${r.min}|${r.max}"` : ""}><output>${esc(part.text)}</output></div>` : "";
    return `<div class="bk-ed">${sl}<label>${L("Valor", "Value")}<input type="text" data-bk-in="set" value="${esc(part.text)}" spellcheck="false"></label>
      <div class="bk-btns">${stepBtn("del", icon("trash", 14) + " " + L("Quitar ajuste", "Remove setting"), L("Quitar este ajuste", "Remove this setting"))}</div></div>`;
  }
  if (part.kind === "wrap") return `<div class="bk-ed"><label>${L("Transformación", "Transformation")}<input type="text" data-bk-in="set" value="${esc(part.text)}" spellcheck="false"></label>
    ${part.nums.map((n) => `<div class="card-num"><span>${esc(n.fn)}</span><div class="ctl-row"><input type="range" data-bk-range="${esc(n.key)}" min="${n.min}" max="${n.max}" step="${n.step}" value="${n.value}"><output>${fmt(n.value)}</output></div></div>`).join("")}
    <div class="bk-btns">${stepBtn("del", icon("trash", 14) + " " + L("Quitar transformación", "Remove transformation"), L("Quitar esta transformación", "Remove this transformation"))}</div></div>`;
  if (part.kind === "root") return `<div class="bk-ed"><p class="hint">${L("Añade una transformación delante de todo (antes del $):", "Add a transformation in front of everything (before the $):")}</p>
    <div class="bk-wraps">${WRAPS.map(([w, lab]) => `<button data-bk-wrap="${esc(w)}" title="${esc(w)}"><code>${esc(w)}</code><span>${esc(lab())}</span></button>`).join("")}</div></div>`;
  return "";
}
function bkOpen(el) {
  const tr = el.closest(".bk-track");
  const pop = $("#bk-pop");
  if (bkSel && bkSel.key === "bpm") {
    pop.innerHTML = `<div class="bk-pop-head"><code>setcps (${state.bpm}/60/4)</code><button class="close" data-bk="close">${icon("close", 14)}</button></div>
      <p>${esc(blockInfo(el).text)}</p><div class="bk-ed"><label>BPM<input type="number" data-bk-in="bpm" min="40" max="220" value="${state.bpm}"></label></div>
      <div class="bk-pop-foot"><button data-bk="songcard">${icon("sliders", 14)} ${L("Tarjeta de la canción en Maestro", "Song card in Maestro")}</button></div>`;
    pop.hidden = false; return bkPlace(el);
  }
  const t = tr && state.tracks.find((x) => x.id === tr.dataset.id);
  if (!t) return;
  let part = null; try { part = partOf(t.code, bkSel.key); } catch { /* código raro */ }
  const info = el.dataset.key === "|root" ? { code: `${t.id} $ …`, text: L("La pista entera.", "The whole track.") } : blockInfo(el);
  const shown = part && part.kind === "step" ? part.text : info.code;
  pop.innerHTML = `<div class="bk-pop-head"><span class="ctl-trk">${esc(t.id)}</span><code>${esc(shown)}</code><button class="close" data-bk="close" title="${esc(L("Cerrar", "Close"))}">${icon("close", 14)}</button></div>
    <p>${esc(info.text || L("Pulsa «Explícame» en la pista para una explicación completa.", "Press «Explain» on the track for a full explanation."))}</p>
    ${bkEditorHTML(t, part)}
    <div class="bk-pop-foot"><button data-bk="card">${icon("sliders", 14)} ${L("Configurar en Maestro", "Configure in Maestro")}</button><span class="hint">${L("Los cambios suenan al momento", "Changes play right away")}</span></div>`;
  pop.hidden = false;
  bkPlace(el);
}
// Aplica un cambio desde el tooltip. rerender=false mientras se arrastra un deslizador
function bkApply(mutate, rerender = true) {
  const t = state.tracks.find((x) => x.id === bkSel.id); if (!t) return;
  let code;
  try { code = mutate(t.code); } catch { return; }
  if (!code || code === t.code) return;
  if (!t.error && !t.lastGood) t.lastGood = t.code;
  t.code = code; t.explain = null; t.edited = true;
  if (rerender) { bkSel.keep = false; changed(); }
  else { save(); const chip = $("#bk-pop .bk-pop-head code"); const part = partOf(t.code, bkSel.key); if (chip && part && part.kind === "step") chip.textContent = part.text; }
  clearTimeout(bkTimer);
  bkTimer = setTimeout(() => { if (live()) playTrack(t); if (!rerender) changedQuiet(); }, rerender ? 0 : 200);
}
// Repinta todo menos el tooltip (tras arrastrar un deslizador)
function changedQuiet() { if (bkSel) bkSel.keep = true; renderTracks(); renderBlocks(); renderMixer(); renderArrange(); refreshCards(); if (!$("#tab-code").classList.contains("active")) $("#code").value = buildCode(); }
function wireBlocks() {
  $("#blocks").addEventListener("click", (e) => {
    const tr = e.target.closest(".bk-track");
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "edit") {
      state.selected = tr.dataset.id; save(); renderTracks(); renderPalette();
      document.querySelector(".tab[data-tab=tracks]").click();
      document.querySelector(`.track.selected`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (a === "card") return openCard(tr.dataset.id);
    const el = e.target.closest(".bk-step, .bk-param, .bk-src, .bk-wrap[data-key], .bk-tag, [data-key='|root']");
    if (!el) return bkClose();
    e.stopPropagation();
    document.querySelectorAll("#blocks .on").forEach((x) => x.classList.remove("on"));
    el.classList.add("on");
    if (tr && state.selected !== tr.dataset.id) { state.selected = tr.dataset.id; save(); renderTracks(); renderPalette(); }
    bkSel = el.classList.contains("bk-tag") ? { id: null, key: "bpm" } : { id: tr.dataset.id, key: el.dataset.key };
    tourFlag("block-pick");
    bkOpen(el);
  });
  const pop = $("#bk-pop");
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("button"); if (!b || !bkSel) return;
    const k = b.dataset.bk, key = bkSel.key;
    if (k === "close") return bkClose();
    if (k === "card") return openCard(bkSel.id, key);
    if (k === "songcard") return openCard("cancion");
    if (b.dataset.bkWrap) return bkApply((c) => applyEdit(c, "|root", "addWrap", b.dataset.bkWrap));
    const tok = (partOf(state.tracks.find((x) => x.id === bkSel.id)?.code || "", key) || {}).text || "";
    if (k === "rest") return bkApply((c) => applyEdit(c, key, "set", "~"));
    if (k === "x2") return bkApply((c) => applyEdit(c, key, "set", /\*(\d+)$/.test(tok) ? tok.replace(/\*(\d+)$/, (_, n) => `*${n * 2}`) : `${tok}*2`));
    if (k === "split") return bkApply((c) => applyEdit(c, key, "set", `[${tok} ${tok}]`));
    if (k === "maybe") return bkApply((c) => applyEdit(c, key, "set", tok.endsWith("?") ? tok.slice(0, -1) : `${tok}?`));
    if (k === "after") return bkApply((c) => applyEdit(c, key, "after", tok === "~" ? "~" : tok.replace(/\?$/, "")));
    if (k === "addstep") return bkApply((c) => applyEdit(c, key, "addStep", "~"));
    if (k === "del") { const r = bkApply((c) => applyEdit(c, key, "del")); bkClose(); return r; }
  });
  pop.addEventListener("change", (e) => {
    if (!bkSel) return;
    const x = e.target;
    if (x.dataset.bkIn === "bpm") { state.bpm = Math.max(40, Math.min(220, parseInt(x.value) || 120)); $("#bpm").value = state.bpm; changed(); evalCode(cps(state.bpm)); return; }
    if (x.dataset.bkIn === "set") return bkApply((c) => applyEdit(c, bkSel.key, "set", x.value));
    if (x.dataset.bkSel === "addparam" && x.value) { const P = CTL_PARAMS[x.value]; const v = P.def ?? 0.5; return bkApply((c) => applyEdit(c, bkSel.key, "addParam", x.value, fmt(x.value === "lpf" ? 2000 : x.value === "room" ? 0.3 : x.value === "delay" ? 0.3 : v))); }
    if (x.dataset.bkRange) changedQuiet();
  });
  pop.addEventListener("input", (e) => {
    const x = e.target; if (!x.dataset.bkRange || !bkSel) return;
    let v = +x.value;
    if (x.dataset.log) { const [mn, mx] = x.dataset.log.split("|").map(Number); v = cardFromPos({ log: true, min: mn, max: mx }, v); }
    x.nextElementSibling.textContent = fmt(v);
    const txt = pop.querySelector("[data-bk-in=set]");
    if (x.dataset.bkRange === "set") { if (txt) txt.value = fmt(v); bkApply((c) => applyEdit(c, bkSel.key, "set", v), false); }
    else { bkApply((c) => applyEdit(c, x.dataset.bkRange, "num", v), false); const t = state.tracks.find((y) => y.id === bkSel.id); const p = t && partOf(t.code, bkSel.key); if (txt && p) txt.value = p.text; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bkSel) bkClose(); });
  $("#tab-blocks").addEventListener("click", (e) => { if (!e.target.closest("#bk-pop, #blocks [data-key], #blocks .bk-tag")) bkClose(); });
}

// ------------------------------------------------------------------ mesa de mezcla (pestaña Mezcla)
function renderMixer(force) {
  if (!$("#tab-mixer").classList.contains("active")) return;
  if (!force && document.activeElement && document.activeElement.closest && document.activeElement.closest("#mixer")) { $("#mx-code").innerHTML = mixCodeHTML(state); return; }
  $("#mixer").innerHTML = mixerHTML(state, { kindColor: (k) => KIND_COLOR[k] || "var(--ink-3)" });
}
let mxTimer = null;
function replayMix(t) {
  clearTimeout(mxTimer);
  mxTimer = setTimeout(() => { if (!live()) return; if (t) playTrack(t); else playAll(); }, 150);
}
function wireMixer() {
  const box = $("#mixer");
  box.addEventListener("input", (e) => {
    const x = e.target; if (!x.dataset.mx) return;
    const id = x.closest("[data-id]").dataset.id;
    const t = setMix(state, id, x.dataset.mx, +x.value);
    const out = x.dataset.mx === "vol" ? x.closest(".mx-strip").querySelector(".mx-db") : x.nextElementSibling;
    out.textContent = x.dataset.mx === "vol" ? dbText(+x.value) : `${+x.value > 0 ? "+" : ""}${+x.value}`;
    $("#mx-code").innerHTML = mixCodeHTML(state);
    save(); replayMix(t); refreshCards();
  });
  box.addEventListener("change", (e) => { if (e.target.dataset.mx) changedQuiet(); });
  box.addEventListener("dblclick", (e) => {
    const x = e.target; if (!x.dataset || !x.dataset.mx) return;
    const t = setMix(state, x.closest("[data-id]").dataset.id, x.dataset.mx, 0);
    changed(); replayMix(t);
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mxa]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const t = state.tracks.find((x) => x.id === id);
    if (b.dataset.mxa === "flat") { state.master = null; state.tracks.forEach((x) => { x.mix = null; }); changed(); return replayMix(null); }
    if (!t) return;
    if (b.dataset.mxa === "mute") { t.muted = !t.muted; changed(); return live() || t.muted ? playTrack(t) : null; }
    if (b.dataset.mxa === "solo") { t.solo = !t.solo; changed(); return replayMix(null); }
    if (b.dataset.mxa === "card") return openCard(id);
  });
}

// ------------------------------------------------------------------ deshacer / historial (rollback)
function renderHistoryButtons() {
  const u = $("#btn-undo"), r = $("#btn-redo");
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}
async function restoreSong(snap, how) {
  if (!snap) return;
  const before = new Set(state.tracks.map((t) => t.id));
  state.bpm = snap.bpm; $("#bpm").value = state.bpm;
  state.master = snap.master; state.name = snap.name || state.name; $("#proj-name").value = state.name || "";
  const old = Object.fromEntries(state.tracks.map((t) => [t.id, t]));
  state.tracks = snap.tracks.map((t) => ({ ...(old[t.id] || {}), ...t, explain: null, help: null, error: "" }));
  if (state.selected && !state.tracks.find((t) => t.id === state.selected)) state.selected = null;
  bkClose();
  changed(); renderHistoryButtons();
  if (live()) {
    for (const id of before) if (!state.tracks.find((t) => t.id === id)) await silenceId(id);
    playAll();
  }
  if (how) toastSoft(how);
}
function toastSoft(text) {
  const el = $("#toast"); if (!el) return;
  el.textContent = text; el.hidden = false;
  clearTimeout(toastSoft.t); toastSoft.t = setTimeout(() => { el.hidden = true; }, 2200);
}
const doUndo = () => restoreSong(histUndo(state), L("Deshecho", "Undone"));
const doRedo = () => restoreSong(histRedo(state), L("Rehecho", "Redone"));
function openHistory() {
  const dlg = $("#history");
  const time = (ms) => new Date(ms).toLocaleTimeString(LANG === "en" ? "en-GB" : "es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  flushPending(state); renderHistoryButtons();
  const list = histEntries().reverse();
  $("#hist-list").innerHTML = list.map((e) => `<li class="${e.current ? "current" : ""}"><button data-i="${e.i}" ${e.current ? "disabled" : ""}>
    <span class="hist-time">${time(e.at)}</span><span class="hist-label">${esc(e.label)}</span>${e.current ? `<em>${L("ahora", "now")}</em>` : `<b>${L("Volver aquí", "Go back here")}</b>`}</button></li>`).join("");
  if (!dlg.open) dlg.showModal();
}

// ------------------------------------------------------------------ tarjeta configuradora en el chat
const CARD_RE = /tarjeta|configurador|configura|configurator|configure|\bcard\b/i;
const CARD_CHIP = () => L("Tarjeta configuradora", "Configurator card");
const FOCUS_WORDS = { reverb: "room", sala: "room", eco: "delay", echo: "delay", brillo: "lpf", brightness: "lpf", filtro: "lpf", filter: "lpf", volumen: "gain", volume: "gain", panorama: "pan", velocidad: "speed" };
function cardTarget(text) {
  const low = text.toLowerCase();
  if (/canci[oó]n|\bsong\b|master|general|mezcla|\bmix/.test(low)) return { id: "cancion" };
  const byId = low.match(/\bd(\d{1,2})\b/);
  let t = byId && state.tracks.find((x) => x.id === "d" + byId[1]);
  if (!t) t = state.tracks.find((x) => x.name && low.includes(x.name.toLowerCase()));
  if (!t) t = state.tracks.find((x) => CATEGORIES.find((c) => c.id === x.kind && low.includes(c.nombre.toLowerCase().split(" ")[0])));
  if (!t) t = selectedTrack();
  const words = low.split(/[^a-záéíóúñ]+/);
  const foco = words.map((w) => FOCUS_WORDS[w] || (CTL_PARAMS[w] ? w : "")).find(Boolean) || "";
  return t ? { id: t.id, foco } : null;
}
function openCard(id, key) {
  if (id === "cancion") {
    return say(L("Aquí tienes la tarjeta de la canción: tempo, volumen general (master) con su ecualizador y el volumen de cada pista. Pulsa ⋯ en una pista para abrir su tarjeta.", "Here's the song card: tempo, overall volume (master) with its EQ and each track's volume. Press ⋯ on a track to open its card."),
      state.options, { controles: [{ tipo: "tarjeta", pista: "cancion" }] });
  }
  const t = state.tracks.find((x) => x.id === id); if (!t) return;
  let foco = "";
  if (key) { const p = partOf(t.code, key); if (p) foco = p.name || p.fn || ""; }
  say(L(`Tarjeta configuradora de ${t.id} (${t.name}). Aquí están todos sus valores: lo que suena, las transformaciones, los ajustes # y su mezcla. La línea gris es el código que suena.`,
    `Configurator card for ${t.id} (${t.name}). All its values are here: what plays, the transformations, the # settings and its mix. The grey line is the code that plays.`),
    state.options, { controles: [{ tipo: "tarjeta", pista: t.id, foco }] });
}

// ------------------------------------------------------------------ limpiar el chat
let clearedChat = null;
function clearChat() {
  if (!state.chat.length) return;
  clearedChat = { chat: state.chat, options: state.options };
  state.chat = [];
  say(L("Chat limpio. Tu canción sigue igual; solo he borrado la conversación.", "Chat cleared. Your song is unchanged; I only removed the conversation."),
    [L("Recuperar el chat", "Bring the chat back"), CARD_CHIP(), L("Dame una idea", "Give me an idea")]);
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
          <button data-a="explain" class="explain" title="${L("¿Qué hace este código?", "What does this code do?")}">${icon("explain", 15)} ${L("Explícame", "Explain")}</button>
          <button data-a="help" class="helpbtn" title="${L("¿No suena como quieres o da error? Maestro te ayuda", "Not sounding right or erroring? Maestro helps you")}">${icon("wand", 15)} ${L("Ayuda", "Help")}</button>
          <button data-a="controls" class="ctlbtn" title="${L("Ajustar esta pista con controles en el chat", "Tweak this track with controls in the chat")}">${icon("sliders", 15)}</button>
          <button data-a="card" class="ctlbtn" title="${L("Tarjeta configuradora: todos sus valores en el chat", "Configurator card: all its values in the chat")}">${icon("blocks", 15)}</button>
          <button data-a="play" title="${L("Hacer sonar esta pista", "Play this track")}">${icon("play", 14)}</button>
          <button data-a="mute" title="${t.muted ? L("Activar", "Unmute") : L("Silenciar", "Mute")}">${icon(t.muted ? "unmute" : "mute", 16)}</button>
          <button data-a="del" title="${L("Borrar pista", "Delete track")}">${icon("trash", 16)}</button>
        </span>
      </div>
      <textarea rows="${Math.min(6, t.code.split("\n").length + 1)}" spellcheck="false" title="${L("Ctrl+Enter para escuchar", "Ctrl+Enter to listen")}"></textarea>
      ${t.error ? `<div class="err"></div>` : ""}
      ${t.help && t.help.open ? `<div class="explain-box help-box">${helpHTML(t)}</div>` : ""}
      ${t.explain ? `<div class="explain-box">${t.explain.loading ? L('<span class="typing">Maestro está leyendo el código…</span>', '<span class="typing">Maestro is reading the code…</span>') : explainHTML(t.explain, true)}</div>` : ""}`;
    el.querySelector(".tname").value = t.name;
    el.querySelector("textarea").value = t.code;
    if (t.error) el.querySelector(".err").textContent = t.error;
    const hp = el.querySelector(".help-box .prehear");
    if (hp && t.help.result && t.help.result.codigo) wirePreHear(hp, { pistas: [{ id: t.id, codigo: t.help.result.codigo }] });
    const hf = el.querySelector(".help-free");
    if (hf) hf.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runHelp(t, hf.value.trim()); } });
    el.addEventListener("click", (e) => {
      if (state.selected !== t.id) {
        state.selected = t.id; save();
        document.querySelectorAll(".track").forEach((x) => x.classList.toggle("selected", x === el));
        renderPalette();
      }
      const btn = e.target.closest("button");
      const a = btn && btn.dataset.a;
      if (btn && btn.classList.contains("close")) {
        if (btn.closest(".help-box")) t.help = null; else t.explain = null;
        save(); renderTracks(); return;
      }
      if (a === "controls") return showControls(t);
      if (a === "card") return openCard(t.id);
      if (a === "help") { t.help = t.help && t.help.open ? null : { open: true }; save(); renderTracks(); }
      if (a === "wish") runHelp(t, btn.dataset.w);
      if (a === "ask") runHelp(t, el.querySelector(".help-free").value.trim());
      if (a === "fix-apply") applyFix(t);
      if (a === "help-again") { t.help = { open: true }; save(); renderTracks(); }
      if (a === "fix-revert") { t.code = t.lastGood; t.help = null; t.error = ""; changed(); playTrack(t);
        sysMsg(L(`${t.id} vuelve a la última versión que funcionaba.`, `${t.id} is back to the last version that worked.`)); }
      if (a === "explain") explainTrack(t);
      if (a === "play") playTrack(t);
      if (a === "mute") { t.muted = !t.muted; changed(); playTrack(t); }
      if (a === "del") removeTrack(t.id);
    });
    el.querySelector(".tname").addEventListener("change", (e) => { t.name = e.target.value; changed(); });
    const ta = el.querySelector("textarea");
    const commit = () => { if (ta.value !== t.code) { if (!t.error && (!t.lastGood || !t.edited)) t.lastGood = t.code; t.code = ta.value; t.explain = null; t.edited = true; changed(); } };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); playTrack(t); }
    });
    ta.addEventListener("change", () => { commit(); if (live()) playTrack(t); });
    box.appendChild(el);
    attachHighlight(el.querySelector("textarea"));
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

// ------------------------------------------------------------------ ayuda con el código editado
function helpHTML(t) {
  const h = t.help;
  const canRevert = t.lastGood && t.lastGood !== t.code;
  const revertBtn = canRevert ? `<button data-a="fix-revert">${icon("back", 14)} ${L("Volver a la versión que funcionaba", "Back to the version that worked")}</button>` : "";
  const close = `<button class="close" title="${L("Cerrar", "Close")}">${icon("close", 16)}</button>`;
  if (h.loading) return `${close}<span class="typing">${L("Maestro está revisando tu código…", "Maestro is checking your code…")}</span>`;
  if (h.result) {
    const r = h.result;
    const others = (r.problemas || []).filter((p) => !(r.diagnostico || "").includes(p.titulo));
    const diff = r.codigo && r.codigo !== t.code ? diffHTML([{ id: t.id, nombre: t.name, antes: t.code, despues: r.codigo }]) : "";
    const parts = (r.explicacion || []).map((p) => `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("");
    return `${close}<p class="sum">${icon("maestro", 16)} ${esc(r.diagnostico)}</p>
      ${others.length ? `<ul class="probs">${others.map((p) => `<li class="${p.nivel}"><b>${esc(p.titulo)}.</b> ${esc(p.explicacion)}</li>`).join("")}</ul>` : ""}
      ${diff}${parts ? `<ul class="parts">${parts}</ul>` : ""}
      ${r.reto ? `<div class="reto"><b>${L("Reto.", "Challenge.")}</b> ${esc(r.reto)}</div>` : ""}
      <div class="help-actions">
        ${diff ? `<button class="prehear">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button><button data-a="fix-apply" class="primary">${icon("play", 12)} ${L("Aplicar el arreglo", "Apply the fix")}</button>` : ""}
        ${revertBtn}<button data-a="help-again" class="link">${L("Preguntar otra cosa", "Ask something else")}</button>
      </div>`;
  }
  const intro = h.auto
    ? L("Tidal no ha podido tocar esta pista. ¿La reviso contigo?", "Tidal couldn't play this track. Shall I check it with you?")
    : L("¿No suena como querías? Dime qué querías conseguir y reviso tu código.", "Not sounding how you wanted? Tell me what you were after and I'll check your code.");
  const wishes = h.auto ? WISHES.filter((w) => w.id === "error") : WISHES;
  return `${close}<p class="sum">${icon("maestro", 16)} ${intro}</p>
    <div class="wishes">${wishes.map((w) => `<button data-a="wish" data-w="${w.id}">${esc(wishLabel(w))}</button>`).join("")}</div>
    <div class="help-ask"><input class="help-free" placeholder="${L("O cuéntamelo: «quería que el bombo sonara solo en el 1 y el 3»…", "Or tell me: «I wanted the kick only on 1 and 3»…")}"><button data-a="ask" class="primary">${L("Pedir ayuda", "Ask for help")}</button></div>
    ${revertBtn ? `<div class="help-actions">${revertBtn}</div>` : ""}`;
}
async function runHelp(t, wish) {
  const w = WISHES.find((x) => x.id === wish);
  const wishText = w ? wishLabel(w) : wish;
  t.help = { open: true, loading: true, wish };
  renderTracks();
  const local = fixLocal(t.code, wish, { error: t.error, muted: t.muted });
  let result = local;
  if (server.llm && !state.offline) {
    try {
      const r = await api("/api/fix", { code: t.code, previous: t.lastGood || "", error: t.error || "", wish: wishText,
        name: t.name, kind: t.kind, bpm: state.bpm,
        local: (local.problemas || []).map((p) => `${p.titulo}: ${p.explicacion}`).join(" | ") });
      result = { ...r, problemas: local.problemas };
    } catch { /* sin IA: nos quedamos con la revisión local */ }
  }
  t.help = { open: true, wish, result };
  save(); renderTracks();
}
function applyFix(t) {
  const r = t.help && t.help.result;
  if (!r || !r.codigo) return;
  const before = t.code;
  t.code = r.codigo; t.error = ""; t.explain = null; t.help = null;
  changed(); playTrack(t);
  state.chat.push({ role: "assistant", content: L(`He arreglado ${t.id} (${t.name}). ${r.diagnostico}\n\nAsí lo he hecho:`, `I fixed ${t.id} (${t.name}). ${r.diagnostico}\n\nHere's how:`),
    diff: [{ id: t.id, nombre: t.name, antes: before, despues: r.codigo }], explicacion: r.explicacion, reto: r.reto });
  save(); renderChat();
}

// ------------------------------------------------------------------ paleta de código
let palLevel = 0;      // 0 = todos los niveles
let palUndo = null;    // { id, before, name }
const palOpen = new Set(["ritmo", "efectos"]); // grupos abiertos (se recuerdan al volver a pintar)
const dots = (n) => `<span class="lvl" title="${esc(LEVELS[n])}">${"<i></i>".repeat(n)}${"<i class='off'></i>".repeat(3 - n)}</span>`;
function renderPalette() {
  $("#lvl-filter").innerHTML = [0, 1, 2, 3].map((n) => `<button data-l="${n}" class="${palLevel === n ? "on" : ""}">${n ? dots(n) + " " + esc(LEVELS[n]) : L("Todos", "All")}</button>`).join("");
  $("#lvl-filter").onclick = (e) => { const b = e.target.closest("button"); if (b) { palLevel = +b.dataset.l; renderPalette(); } };
  const box = $("#palette");
  const t = selectedTrack();
  box.innerHTML = (palUndo ? `<div class="pal-undo">${L("Último bloque:", "Last block:")} <b>${esc(palUndo.name)}</b> ${L("en", "on")} ${esc(palUndo.id)} <button class="link" data-undo>${icon("back", 13)} ${L("Deshacer", "Undo")}</button></div>` : "") +
    `<p class="pal-target">${t ? L(`Se aplica a <b>${esc(t.id)} · ${esc(t.name)}</b>`, `Applies to <b>${esc(t.id)} · ${esc(t.name)}</b>`) : L("Selecciona una pista en el centro para aplicar bloques.", "Select a track in the middle to apply blocks.")}</p>` +
    GROUPS.map((g, gi) => {
      const items = BLOCKS.filter((b) => b.g === g.id && (!palLevel || b.lvl === palLevel));
      if (!items.length) return "";
      return `<details class="pal-group" data-g="${g.id}" ${palOpen.has(g.id) || palLevel ? "open" : ""}><summary>${esc(groupName(g))} <span class="hint">${esc(L(...g.hint))}</span></summary>
        ${items.map((b) => `<button class="pal-block ${t && b.only && !b.only.test(t.code) ? "dim" : ""}" data-b="${b.id}">
          <span class="pb-top"><b>${esc(blockName(b))}</b>${dots(b.lvl)}</span><code>${esc(b.code)}</code><span class="pb-desc">${esc(blockDesc(b))}</span></button>`).join("")}</details>`;
    }).join("");
  box.querySelectorAll(".pal-group").forEach((d) => d.addEventListener("toggle", () => { if (d.open) palOpen.add(d.dataset.g); else palOpen.delete(d.dataset.g); }));
  box.onclick = (e) => {
    if (e.target.closest("[data-undo]")) return undoBlock();
    const btn = e.target.closest(".pal-block");
    if (btn) usePaletteBlock(BLOCKS.find((b) => b.id === btn.dataset.b));
  };
}
function usePaletteBlock(b) {
  const t = selectedTrack();
  if (!t) return toast(L("Primero selecciona (o crea) una pista.", "Select (or create) a track first."));
  const r = applyBlock(b, t.code);
  if (r.error) return toast(r.error);
  const before = t.code;
  if (!t.error) t.lastGood = before;
  t.code = r.code; t.explain = null; t.help = null;
  palUndo = { id: t.id, before, name: blockName(b) };
  changed(); if (live()) playTrack(t);
  const ex = explainLocal(b.code.replace(/…/g, "").trim());
  state.chat.push({ role: "assistant", content: L(`He aplicado «${blockName(b)}» a ${t.id}. ${blockDesc(b)}`, `I applied «${blockName(b)}» to ${t.id}. ${blockDesc(b)}`),
    diff: [{ id: t.id, nombre: t.name, antes: before, despues: t.code }], explicacion: ex.partes.filter((p) => p.fragmento !== "$" && p.fragmento !== "#").slice(0, 3) });
  save(); renderChat(); renderPalette();
}
function undoBlock() {
  const t = palUndo && state.tracks.find((x) => x.id === palUndo.id);
  if (!t) { palUndo = null; return renderPalette(); }
  t.code = palUndo.before; palUndo = null;
  changed(); if (live()) playTrack(t);
  sysMsg(L(`Deshecho: ${t.id} vuelve a como estaba.`, `Undone: ${t.id} is back as it was.`));
  renderPalette();
}

// ------------------------------------------------------------------ progreso
function renderProgress() {
  const all = state.tracks.map((t) => t.code).join("\n");
  const codeDone = CODE_CONCEPTS.filter((c) => c.re.test(all) || (c.id === "s" && false));
  const autoMusic = new Set(state.learnedMusic);
  if (state.tracks.some((t) => t.kind === "percusion")) autoMusic.add(L("Pulso", "Pulse"));
  if (/\b(cp|sn)\b/.test(all)) autoMusic.add("Backbeat");
  if (state.tracks.some((t) => t.kind === "bajo")) autoMusic.add(L("Graves y groove", "Low end and groove"));
  if (state.tracks.some((t) => t.kind === "armonia")) autoMusic.add(L("Armonía", "Harmony"));
  if (state.tracks.some((t) => t.kind === "melodia")) autoMusic.add(L("Melodía", "Melody"));
  if (/whenmod/.test(all)) autoMusic.add(L("Contraste y estructura", "Contrast and structure"));
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
    document.querySelectorAll(".prehear.playing").forEach((b) => { b.classList.remove("playing"); b.innerHTML = icon("speaker", 13) + " " + L("Escuchar", "Listen"); });
    const secs = preHear(cambios, () => { btn.classList.remove("playing"); btn.innerHTML = icon("speaker", 13) + " " + L("Escuchar", "Listen"); });
    btn.classList.add("playing");
    btn.innerHTML = icon("stop", 12) + ` ${L("Escuchando…", "Listening…")} ${Math.round(secs)} s`;
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
        ? `<button data-a="keep" class="primary">${L("Me gusta, me lo quedo", "I like it, keep it")}</button><button data-a="undo">${L("Deshacer", "Undo")}</button>`
        : `<button class="prehear" title="${L("Escúchala unos compases sin cambiar tu proyecto", "Hear it for a few bars without changing your project")}" ${state.trying ? "disabled" : ""}>${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button><button data-a="try" ${state.trying ? "disabled" : ""}>${icon("play", 12)} ${L("Probar y ver el código", "Try it and see the code")}</button>`}</div>`;
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
  say(L(`Probando: «${idea.titulo}»\n${idea.porque}\n\nEscucha unos compases y decide abajo si te lo quedas. Así lo he hecho:`, `Trying: «${idea.titulo}»\n${idea.porque}\n\nListen for a few bars and decide below whether to keep it. Here's how I did it:`),
    state.options, { diff: diffFor(before, idea.cambios, idea.pasos) });
}

// "Cómo lo he hecho": antes y después de cada pista, con el trozo nuevo resaltado y explicado
function diffFor(before, cambios, pasos = {}) {
  const out = [];
  if (cambios.bpm && Math.round(cambios.bpm) !== before.bpm)
    out.push({ id: "tempo", nombre: L("Velocidad", "Tempo"), antes: cps(before.bpm), despues: cps(Math.round(cambios.bpm)),
      explicacion: L(`De ${before.bpm} a ${Math.round(cambios.bpm)} BPM: el tempo típico de este estilo.`, `From ${before.bpm} to ${Math.round(cambios.bpm)} BPM: the typical tempo of this style.`) });
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
    return `<div class="diff-item"><div class="diff-h">${esc(d.id === "tempo" ? "" : d.id + " · ")}${esc(d.nombre)}${d.antes ? "" : L(" <span class='new'>nueva</span>", " <span class='new'>new</span>")}</div>
      ${d.antes ? `<div class="diff-row"><span>${L("Antes", "Before")}</span><code class="before">${idLabel}${esc(d.antes)}</code></div>` : ""}
      <div class="diff-row"><span>${L("Después", "After")}</span><code class="after">${idLabel}${after}</code></div>
      ${d.explicacion ? `<p>${esc(d.explicacion)}</p>` : ""}</div>`;
  }).join("")}</div>`;
}
function keepIdea() {
  const idea = state.trying.ideas[state.trying.index];
  if (idea.concepto && !state.learnedMusic.includes(idea.concepto)) state.learnedMusic.push(idea.concepto);
  state.trying = null;
  state.ideas = state.ideas.filter((x) => x !== idea);
  say(L(`¡Bien! Te lo quedas. Has practicado: ${idea.concepto || "una idea nueva"}.\n${idea.porque}`, `Nice! It's yours. You practiced: ${idea.concepto || "a new idea"}.\n${idea.porque}`), state.options);
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
  sysMsg(L("Deshecho. Todo vuelve a como estaba. Está bien que no te guste: tu oído decide.", "Undone. Everything is back as it was. It's fine not to like it: your ear decides."));
  changed();
}

// ------------------------------------------------------------------ catálogo
// Cada familia enseña sus 2 componentes más útiles (los que encajan con el estilo primero) y «Ver más»
const CAT_PREVIEW = 2;
const catMore = new Set(), catClosed = new Set();
function renderCatalog() {
  const sel = $("#style-filter");
  if (sel.options.length === 1)
    for (const [k, s] of Object.entries(STYLES)) sel.add(new Option(`${s.nombre} · ${s.bpm} BPM`, k));
  sel.value = state.style || "";
  const style = sel.value;
  const box = $("#catalog");
  box.innerHTML = `<div class="inst-strip"><div class="inst-head">${icon("speaker", 15)} ${L("Instrumentos", "Instruments")}<span>${L("pulsa uno para tocarlo", "press one to play it")}</span></div>
    <div class="inst-row">${INSTRUMENTS.map((i) => `<button class="inst-card" data-i="${i.id}" style="--k:${KIND_COLOR[i.kind]}"><span class="inst-art">${instThumb(i)}</span><span>${esc(L(i.es, i.en))}</span></button>`).join("")}</div></div>`;
  box.querySelectorAll(".inst-card").forEach((b) => b.onclick = () => openInstrument(b.dataset.i));
  for (const cat of CATEGORIES) {
    let items = COMPONENTS.filter((c) => c.cat === cat.id);
    if (style && items[0] && items[0].estilos) {
      items = [...items].sort((a, b) => (b.estilos.includes(style) ? 1 : 0) - (a.estilos.includes(style) ? 1 : 0));
    }
    const d = document.createElement("details");
    d.className = "cat";
    d.open = !catClosed.has(cat.id);
    d.dataset.cat = cat.id;
    d.style.setProperty("--k", KIND_COLOR[cat.id]);
    d.ontoggle = () => { d.open ? catClosed.delete(cat.id) : catClosed.add(cat.id); };
    d.innerHTML = `<summary title="${esc(cat.ayuda)}"><span class="cat-ico" style="background:${KIND_COLOR[cat.id]}">${icon(cat.id, 16)}</span>${esc(cat.nombre)}<span class="cat-n">${items.length}</span></summary><div class="comp-grid"></div>`;
    const grid = d.querySelector(".comp-grid");
    const full = catMore.has(cat.id), shown = full ? items : items.slice(0, CAT_PREVIEW);
    const isMod = cat.id === "efecto" || cat.id === "estructura";
    for (const c of shown) {
      const fits = style && c.estilos && c.estilos.includes(style);
      const row = document.createElement("button");
      row.className = "comp" + (fits ? " fits" : "");
      row.dataset.id = c.id;
      row.title = `${c.desc}\n${isMod ? L("Clic: aplicar a la pista seleccionada", "Click: apply to the selected track") : L("Clic: añadir como pista nueva", "Click: add as a new track")}`;
      row.innerHTML = `<span class="comp-ico">${compIcon(c.id, 24)}</span><span class="name"></span><span class="comp-add">${icon("plus", 12)}</span>${fits ? `<span class="fit">${L("encaja", "fits")}</span>` : ""}`;
      row.querySelector(".name").textContent = c.nombre;
      row.onclick = () => {
        const t = addComponent(c);
        if (t) teachAbout(c, t);
      };
      grid.appendChild(row);
    }
    if (items.length > CAT_PREVIEW) {
      const more = document.createElement("button");
      more.className = "cat-more";
      more.innerHTML = full ? `${icon("back", 14)}<span>${L("Menos", "Less")}</span>` : `<b>+${items.length - CAT_PREVIEW}</b><span>${L("ver más", "more")}</span>`;
      more.onclick = () => { full ? catMore.delete(cat.id) : catMore.add(cat.id); renderCatalog(); };
      grid.appendChild(more);
    }
    box.appendChild(d);
  }
}

// ------------------------------------------------------------------ instrumentos con fotos reales
const inst = { id: "drums", piece: "bd", steps: {}, seqs: {}, oct: {}, sound: {}, lib: null, get seq() { return this.seqs[this.id] || (this.seqs[this.id] = []); }, set seq(v) { this.seqs[this.id] = v; } };
const isSim = () => !!(server.engine && server.engine.simulation);
async function openInstrument(id) {
  inst.id = id || inst.id;
  try { inst.lib = (await api("/api/samples")).sounds || []; } catch { inst.lib = inst.lib || []; }
  renderInstrument();
  if (!$("#instrument").open) $("#instrument").showModal();
}
function instSound(ins) {
  if (inst.sound[ins.id] !== undefined) return inst.sound[ins.id];
  return ins.sound;
}
const instReady = (ins, sound) => !!sound && (!ins.pack || (inst.lib || []).some((x) => x.name === sound));
function instCode(ins) {
  if (ins.id === "drums") return drumCode(inst.piece, inst.steps[inst.piece] || DRUM_PIECES[inst.piece].steps);
  return melodyCode(ins, inst.seq, instSound(ins) || "?");
}
function renderInstrument() {
  const ins = instById[inst.id];
  const tabs = `<div class="inst-tabs">${INSTRUMENTS.map((i) => `<button data-i="${i.id}" class="${i.id === ins.id ? "active" : ""}" style="--k:${KIND_COLOR[i.kind]}"><span class="inst-art">${instThumb(i)}</span>${esc(L(i.es, i.en))}</button>`).join("")}</div>`;
  let art, side;
  if (ins.id === "drums") {
    const P = DRUM_PIECES[inst.piece], steps = inst.steps[inst.piece] || P.steps;
    art = drumKitSVG(inst.piece, true);
    side = `<div class="inst-piece"><code>${inst.piece}</code><b>${esc(L(P.es, P.en))}</b></div>
      <p class="inst-tip">${esc(L(...P.tip))}</p>
      <div class="inst-lbl">${L("¿En qué pasos suena? (8 pasos = un compás)", "Which steps does it play on? (8 steps = one bar)")}</div>
      <div class="inst-steps">${steps.map((v, i) => `<button data-st="${i}" class="${v ? "on" : ""}${i % 2 ? "" : " beat"}">${i % 2 ? "" : i / 2 + 1}</button>`).join("")}</div>`;
  } else {
    const oct = inst.oct[ins.id] ?? ins.oct, sound = instSound(ins), ready = instReady(ins, sound);
    art = `<div class="inst-big">${instArt(ins)}</div>`;
    let src = "";
    if (ins.freesound) {
      const mine = (inst.lib || []).filter((x) => x.type !== "percusion");
      src = `<div class="inst-src"><label>${L("Sonido", "Sound")} <select data-a="sound"><option value="${ins.sound}">${ins.sound} (${L("sintetizador de Tidal Studio", "Tidal Studio synth")})</option>${mine.map((x) => `<option ${x.name === sound ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        <button data-a="freesound">${icon("search", 14)} ${L(`Buscar «${ins.freesound}» en Freesound`, `Search «${ins.freesound}» on Freesound`)}</button></div>`;
    } else if (ins.pack) {
      src = ready ? `<div class="inst-src ok">${icon("check", 14)} ${L(`«${sound}» instalado en tu biblioteca`, `«${sound}» installed in your library`)}</div>`
        : `<div class="inst-src"><span>${L("Este sonido se descarga una vez del pack libre VCSL (CC0).", "This sound is downloaded once from the free VCSL pack (CC0).")}</span><button class="primary" data-a="install">${icon("download", 14)} ${L("Instalar sonido", "Install sound")}</button></div>`;
    } else {
      src = `<div class="inst-src ok"><code>s "${esc(sound)}"</code> ${ins.synth ? L("sintetizador de SuperDirt: toca cualquier nota", "SuperDirt synth: plays any note") : L("viene con Tidal (Dirt-Samples)", "comes with Tidal (Dirt-Samples)")}</div>`;
    }
    side = `<div class="inst-piece"><b>${esc(L(ins.es, ins.en))}</b></div><p class="inst-tip">${esc(L(...ins.tip))}</p>${src}
      <div class="inst-lbl">${L("Pulsa teclas para escribir tu melodía (máx. 16 notas)", "Press keys to write your melody (max. 16 notes)")}
        <span class="inst-oct"><button data-a="oct" data-d="-1" title="${L("Octava abajo", "Octave down")}">−</button>${L("octava", "octave")} ${oct}<button data-a="oct" data-d="1" title="${L("Octava arriba", "Octave up")}">+</button></span></div>
      ${keyboardHTML(oct, new Set(inst.seq.filter((m) => m != null)))}
      <div class="inst-seq">${inst.seq.length ? inst.seq.map((m) => `<span class="${m == null ? "rest" : ""}">${m == null ? "~" : noteName(m)}</span>`).join("") : `<em>${L("Aún no hay notas", "No notes yet")}</em>`}</div>
      <div class="inst-seqbtns"><button data-a="rest">~ ${L("silencio", "rest")}</button><button data-a="pop">${icon("back", 13)} ${L("borrar última", "delete last")}</button><button data-a="clear">${icon("trash", 13)} ${L("vaciar", "clear")}</button></div>`;
  }
  const code = instCode(ins);
  $("#inst-body").innerHTML = `${tabs}<div class="inst-main"><div class="inst-stage" style="--k:${KIND_COLOR[ins.kind]}">${art}${photoCredit(ins.id)}</div>
    <div class="inst-side">${side}
      <div class="inst-code"><span>${L("Código Tidal", "Tidal code")}</span><code>${esc(code)}</code></div>
      <div class="inst-actions"><button data-a="listen">${icon("play", 13)} ${L("Escuchar", "Listen")}</button>
        <button class="primary" data-a="add">${icon("plus", 14)} ${L("Añadir como pista", "Add as a track")}</button></div></div></div>`;
}
function instHear(ins, what) {
  if (ins.id === "drums") return isSim() ? hearDirt(what, 0) : evalCode(`once $ s "${what}"`);
  const sound = instSound(ins);
  if (isSim() || !instReady(ins, sound)) return beep(what, ins.voice);
  evalCode(`once $ ${melodyCode(ins, [what], sound)}`);
}
let seqTimers = [];
function instPlaySeq(ins) {
  const sound = instSound(ins);
  if (!isSim() && (ins.id === "drums" || instReady(ins, sound))) return evalCode(`once $ ${instCode(ins)}`);
  const step = 60 / (state.bpm || 120) / 2 * 1000;
  if (ins.id === "drums") {
    (inst.steps[inst.piece] || DRUM_PIECES[inst.piece].steps).forEach((v, i) => v && seqTimers.push(setTimeout(() => hearDirt(inst.piece, 0), i * step)));
    return;
  }
  inst.seq.forEach((m, i) => m != null && seqTimers.push(setTimeout(() => beep(m, ins.voice), i * step)));
}
function wireInstrument() {
  $("#inst-body").addEventListener("click", async (e) => {
    const ins = instById[inst.id];
    const tab = e.target.closest(".inst-tabs [data-i]");
    if (tab) { inst.id = tab.dataset.i; return renderInstrument(); }
    const piece = e.target.closest("[data-p]");
    if (piece && ins.id === "drums") { tourFlag("drum-piece"); inst.piece = piece.dataset.p; renderInstrument(); return instHear(ins, inst.piece); }
    const st = e.target.closest("[data-st]");
    if (st) { const arr = [...(inst.steps[inst.piece] || DRUM_PIECES[inst.piece].steps)]; arr[+st.dataset.st] = arr[+st.dataset.st] ? 0 : 1; inst.steps[inst.piece] = arr; return renderInstrument(); }
    const key = e.target.closest(".key");
    if (key) { tourFlag("inst-key"); const m = +key.dataset.m; instHear(ins, m); if (inst.seq.length < 16) inst.seq.push(m); return renderInstrument(); }
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "oct") { inst.oct[ins.id] = Math.max(1, Math.min(8, (inst.oct[ins.id] ?? ins.oct) + +b.dataset.d)); return renderInstrument(); }
    if (a === "rest") { if (inst.seq.length < 16) inst.seq.push(null); return renderInstrument(); }
    if (a === "pop") { inst.seq.pop(); return renderInstrument(); }
    if (a === "clear") { inst.seq = []; return renderInstrument(); }
    if (a === "listen") return instPlaySeq(ins);
    if (a === "freesound") { $("#instrument").close(); sm.q = ins.freesound; sm.page = 1; await openSamples("online"); return smSearch(); }
    if (a === "install") {
      b.disabled = true; b.textContent = L("Descargando…", "Downloading…");
      try {
        const P = PACKS.find((x) => x.id === ins.pack);
        const r = await api("/api/samples/pack-install", { url: P.url, sound: ins.sound, name: ins.sound, type: "melodico" });
        toast(L(`«${r.name}» instalado.`, `«${r.name}» installed.`));
      } catch (err) { toast(err.message); }
      return openInstrument(ins.id);
    }
    if (a === "add") {
      if (ins.id !== "drums" && !inst.seq.some((m) => m != null)) return toast(L("Primero pulsa algunas teclas.", "Press a few keys first."));
      if (ins.id !== "drums" && !instReady(ins, instSound(ins))) return toast(ins.freesound ? L("Elige o busca un sonido primero.", "Pick or search a sound first.") : L("Instala el sonido primero.", "Install the sound first."));
      const code = instCode(ins);
      const name = ins.id === "drums" ? L(DRUM_PIECES[inst.piece].es, DRUM_PIECES[inst.piece].en) : L(ins.es, ins.en);
      const t = addTrack(name, ins.kind, code);
      if (!t) return;
      const ex = explainLocal(code);
      state.chat.push({ role: "assistant", content: L(`He añadido ${name.toLowerCase()} en la pista ${t.id}. ${ins.id === "drums" ? L(...DRUM_PIECES[inst.piece].tip) : ""}`, `I added the ${name.toLowerCase()} on track ${t.id}. ${ins.id === "drums" ? L(...DRUM_PIECES[inst.piece].tip) : ""}`).trim(), explicacion: ex.partes });
      save(); renderChat();
      $("#instrument").close();
    }
  });
  $("#inst-body").addEventListener("change", (e) => {
    if (e.target.dataset.a === "sound") { inst.sound[inst.id] = e.target.value; renderInstrument(); instHear(instById[inst.id], 72); }
  });
}

// Cuando añades algo, Maestro explica el código nuevo
function teachAbout(comp, t) {
  const isMod = comp.sufijo || comp.envoltura;
  const fragment = isMod ? (comp.sufijo || comp.envoltura).trim().replace(/\s*\$$/, "") : comp.codigo;
  const ex = explainLocal(fragment);
  const what = isMod ? L(`He aplicado «${comp.nombre}» a ${t.id} (${t.name}).`, `I applied «${comp.nombre}» to ${t.id} (${t.name}).`) : L(`He añadido «${comp.nombre}» en la pista ${t.id}.`, `I added «${comp.nombre}» on track ${t.id}.`);
  state.chat.push({ role: "assistant", content: `${what} ${comp.desc}`, explicacion: ex.partes, reto: retoFor(comp) });
  if (!(state.options || []).includes(CTL_CHIP())) state.options = [CTL_CHIP(), ...(state.options || [])].slice(0, 6);
  save(); renderChat();
}

// ------------------------------------------------------------------ chat
function renderChat() {
  const box = $("#chat");
  box.innerHTML = "";
  state.chat.forEach((m, mi) => {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    el.textContent = m.content;
    if (m.explicacion && m.explicacion.length) {
      el.insertAdjacentHTML("beforeend", `<ul class="parts">${m.explicacion.map((p) =>
        `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("")}</ul>`);
    }
    if (m.diff && m.diff.length) el.insertAdjacentHTML("beforeend", diffHTML(m.diff));
    if (m.reto) el.insertAdjacentHTML("beforeend", `<div class="reto"><b>${L("Reto.", "Challenge.")}</b> ${esc(m.reto.replace(/^Reto:\s*/i, ""))}</div>`);
    if (m.changes) el.insertAdjacentHTML("beforeend", `<div class="changes">${esc(m.changes)}</div>`);
    if (m.links && m.links.length) el.insertAdjacentHTML("beforeend", `<div class="links">${m.links.map((a) =>
      `<a href="${esc(a.href)}" target="_blank" rel="noopener">${icon("link", 14)} ${esc(a.label)}</a>`).join("")}</div>`);
    if (m.controles && m.controles.length) el.insertAdjacentHTML("beforeend", controlsHTML(m.controles, state, mi));
    box.appendChild(el);
  });
  if (busy) box.insertAdjacentHTML("beforeend", `<div class="msg assistant typing">${L("Maestro está pensando…", "Maestro is thinking…")}</div>`);
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
  say(L("¡Hola! Soy Maestro. Aquí vas a aprender música y a programarla con TidalCycles mientras creas tu propia canción.\n\nIremos paso a paso: estilo, ritmo, velocidad, bajo, acordes, melodía, efectos y cuándo cambia cada cosa. En cada paso te explico el código y te propongo ideas, como haría un productor a tu lado. No hace falta saber nada.\n\nPara empezar rápido, usa el wizard: eliges opciones paso a paso y se crea tu proyecto base. Si prefieres hablarlo, la lluvia de ideas te hace preguntas abiertas. O dime directamente un estilo.", "Hi! I'm Maestro. Here you'll learn music and how to code it with TidalCycles while you create your own song.\n\nWe'll go step by step: style, beat, tempo, bass, chords, melody, effects and when each thing changes. At each step I explain the code and suggest ideas, like a producer by your side. You don't need to know anything.\n\nFor a quick start, use the wizard: pick options step by step and your base project is created. If you'd rather talk it through, the brainstorm asks you open questions. Or just tell me a style."),
    [L("Crear proyecto con wizard", "Create project with wizard"), L("Lluvia de ideas: diseñar mi canción", "Brainstorm: design my song"), ...Object.values(STYLES).map((s) => s.nombre), L("Sorpréndeme", "Surprise me")]);
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  if (text.startsWith(L("Lluvia de ideas", "Brainstorm"))) return openWizard();
  if (text.startsWith(L("Crear proyecto con wizard", "Create project with wizard"))) return openBuilder();
  if (text === L("Recuperar el chat", "Bring the chat back") && clearedChat) { state.chat = clearedChat.chat; state.options = clearedChat.options; clearedChat = null; save(); return renderChat(); }
  if (text.startsWith(L("Empieza tú con un ritmo", "You start with a beat"))) { const c = byId[state.style ? (state.style === "hiphop" || state.style === "lofi" ? "kickhh" : "kick4") : "kick4"]; const t = addComponent(c); if (t) teachAbout(c, t); return; }
  state.chat.push({ role: "user", content: text });
  state.options = [];
  save(); renderChat();
  if ((text === CARD_CHIP() || CARD_RE.test(text)) && state.tracks.length) {
    const tg = cardTarget(text);
    if (tg) { if (tg.id === "cancion") return openCard("cancion"); const t = state.tracks.find((x) => x.id === tg.id); return say(L(`Tarjeta configuradora de ${t.id} (${t.name}). Aquí están todos sus valores: lo que suena, las transformaciones, los ajustes # y su mezcla. La línea gris es el código que suena.`, `Configurator card for ${t.id} (${t.name}). All its values are here: what plays, the transformations, the # settings and its mix. The grey line is the code that plays.`), state.options, { controles: [{ tipo: "tarjeta", pista: t.id, foco: tg.foco }] }); }
  }
  if ((!server.llm || state.offline) && MIX_RE.test(text) && state.tracks.length) {
    return say(L("Aquí tienes la mezcla de la canción: el volumen general (master) con su ecualizador y el volumen de cada pista, en dB. Empieza bajando todo y sube primero el bombo y el bajo. La pestaña Mezcla tiene la mesa completa.", "Here's the song mix: overall volume (master) with its EQ and each track's volume, in dB. Start low and bring up the kick and bass first. The Mix tab has the full desk."), state.options, { controles: [{ tipo: "tarjeta", pista: "cancion" }] });
  }
  if (text === CTL_CHIP() || ((!server.llm || state.offline) && CTL_RE.test(text))) {
    const t = selectedTrack();
    if (!t) return say(L("Primero crea una pista; luego te doy controles para ajustarla.", "Create a track first; then I'll give you controls to tweak it."), state.options);
    return showControls(t, { bpm: /bpm|tempo|velocidad|speed/i.test(text), quiet: true });
  }
  if (server.llm && !state.offline) return askLLM();
  offlineGuide(text);
}

async function askLLM() {
  busy = true; renderChat();
  try {
    const history = state.chat.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    if (!server.samples) { try { server.samples = (await api("/api/samples")).sounds.map((x) => ({ name: x.name, type: x.type, n: x.files.length })); } catch { server.samples = []; } }
    const session = {
      bpm: state.bpm, step: state.step, lastError: state.lastError, samples: server.samples,
      master: state.master || undefined,
      tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: t.muted, ...(t.mix ? { mezcla_db: t.mix } : {}), ...(t.solo ? { solo: true } : {}),
        ...(t.edited ? { name: t.name + L(" (editada a mano por el alumno)", " (edited by hand by the student)") } : {}) })),
    };
    state.tracks.forEach((t) => delete t.edited);
    const r = await api("/api/chat", { messages: history, session });
    busy = false;
    if (r.paso) state.step = r.paso;
    const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
    const summary = applyChanges(r.cambios || {});
    const diff = diffFor(before, r.cambios || {});
    if (r.sugerencias && r.sugerencias.length) state.ideas = r.sugerencias;
    let controles = normalizeControls(r.controles, state.tracks);
    const lastUser = (state.chat.filter((m) => m.role === "user").pop() || {}).content || "";
    if (!controles.length && CTL_RE.test(lastUser) && selectedTrack()) controles = controlsFor(selectedTrack(), { bpm: /bpm|tempo|velocidad|speed/i.test(lastUser), samples: server.samples || [] });
    say(r.mensaje || "…", r.opciones || [], { explicacion: r.explicacion, reto: r.reto, changes: summary, diff, ...(controles.length ? { controles } : {}) });
    renderIdeas();
  } catch (e) {
    busy = false;
    say(L("Uy, no he podido hablar con la IA: ", "Oops, I couldn't reach the AI: ") + e.message + L("\n\nRevisa los Ajustes. Mientras tanto te sigo guiando sin IA.", "\n\nCheck Settings. Meanwhile I'll keep guiding you without AI."), [L("Seguir sin IA", "Continue without AI")]);
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
    if (state.tracks.find((t) => t.id === id)) { removeTrack(id); notes.push(L(`borrada ${id}`, `deleted ${id}`)); }
  }
  for (const p of c.pistas || []) {
    let t = state.tracks.find((x) => x.id === p.id);
    if (t) { t.code = p.codigo; t.name = p.nombre || t.name; t.kind = p.tipo || t.kind; t.muted = false; t.explain = null; notes.push(L(`cambiada ${p.id} ${t.name}`, `changed ${p.id} ${t.name}`)); }
    else { t = { id: p.id, name: p.nombre, kind: p.tipo, code: p.codigo, muted: false }; state.tracks.push(t); notes.push(L(`nueva ${p.id} ${t.name}`, `new ${p.id} ${t.name}`)); }
    state.tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    state.selected = p.id;
    if (live()) playTrack(t);
  }
  changed();
  return notes.length ? L("Cambios: ", "Changes: ") + notes.join(" · ") : "";
}

// ------------------------------------------------------------------ guía sin IA
const NEXT = L("Siguiente paso", "Next step");
const FLOW = ["estilo", "percusion", "tempo", "bajo", "armonia", "melodia", "textura", "efecto", "estructura", "libre"];
const STEP_TEXT = {
  percusion: L("Empezamos por el ritmo. La percusión es el esqueleto de la canción: marca el pulso, el latido que hace mover el pie. Elige una (las primeras encajan con tu estilo). Puedes añadir varias.", "Let's start with the beat. Drums are the skeleton of the song: they mark the pulse, the heartbeat that makes your foot tap. Pick one (the first ones fit your style). You can add several."),
  tempo: L("Hablemos de velocidad. Ahora está a {bpm} BPM (pulsaciones por minuto). Más BPM da más energía; menos, más calma. En el código es la línea setcps.", "Let's talk tempo. It's now at {bpm} BPM (beats per minute). More BPM gives more energy; fewer, more calm. In the code it's the setcps line."),
  bajo: L("Ahora el bajo: las notas graves. Une el ritmo con la armonía y es lo que da 'groove'. Un truco de productor: que el bajo suene entre los bombos, no encima.", "Now the bass: the low notes. It ties rhythm to harmony and brings the 'groove'. A producer's trick: put the bass between the kicks, not on top."),
  armonia: L("Turno de los acordes: varias notas a la vez. Deciden la emoción: los menores suenan melancólicos, los mayores alegres.", "Time for chords: several notes at once. They set the emotion: minor sounds melancholic, major sounds happy."),
  melodia: L("Ahora una melodía, la parte que se tararea. Si usa notas de los acordes, siempre encaja.", "Now a melody, the part you hum. If it uses notes from the chords, it always fits."),
  textura: L("¿Añadimos una textura de fondo? Son detalles que crean atmósfera: se sienten más que se oyen.", "Shall we add a background texture? They're details that create atmosphere: you feel them more than hear them."),
  efecto: L("Hora de los efectos. Cambian el carácter de un sonido: espacio, eco, brillo… Se aplican a la pista seleccionada ({track}); pulsa otra pista en el centro para cambiarla.", "Effects time. They change a sound's character: space, echo, brightness… They apply to the selected track ({track}); click another track in the middle to change it."),
  estructura: L("Por último: ¿cuándo pasan las cosas? La música se organiza en frases de 4 y 8 compases; si nada cambia, aburre. Se aplica a {track}.", "Finally: when do things happen? Music is organized in 4- and 8-bar phrases; if nothing changes, it gets boring. It applies to {track}."),
  libre: L("¡Ya tienes una canción completa!\n\nA partir de aquí, mira las Ideas de Maestro: pruébalas y quédate solo con lo que te guste. También puedes editar el código a mano o pedirme que te explique cualquier pista.\n\nCon una IA conectada en Ajustes puedo entender todo lo que escribas.", "You have a complete song!\n\nFrom here, check Maestro's Ideas: try them and keep only what you like. You can also edit the code by hand or ask me to explain any track.\n\nWith an AI connected in Settings I can understand anything you type."),
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
  const text = (STEP_TEXT[step] || "").replace("{bpm}", state.bpm).replace("{track}", t ? `${t.id} · ${t.name}` : L("ninguna", "none"));
  if (step === "tempo") return say(text, [L("Más lento", "Slower"), L("Más rápido", "Faster"), L("Así está perfecto", "That's perfect")]);
  if (step === "libre") return say(text, [L("Explícame la canción", "Explain the song"), L("Empezar otra canción", "Start another song")]);
  if (step === "efecto" || step === "estructura") {
    const tracks = state.tracks.slice(-4).map((x) => L(`Usar ${x.id} · ${x.name}`, `Use ${x.id} · ${x.name}`));
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
  if (low.includes("empezar otra") || low.includes("reiniciar") || low.includes("start another") || low.includes("restart")) {
    evalCode("hush"); state.tracks = []; state.style = ""; state.ideas = []; changed(); renderCatalog(); return greet();
  }
  if (low.includes("seguir sin ia") || low.includes("without ai")) { state.offline = true; return goStep(state.step); }
  if (low.includes("explícame") || low.includes("explicame") || low.includes("qué hace") || low.includes("que hace") || low.includes("explain") || low.includes("what does")) {
    const ex = explainLocal(state.tracks.map((t) => t.code).join("\n"));
    return say(L("Así funciona tu canción, trozo a trozo:", "This is how your song works, piece by piece:"), state.options, { explicacion: ex.partes.slice(0, 10) });
  }
  if (low.includes("otra idea") || low.includes("another idea")) { state.ideas = []; localSuggestions(state, 2, true); renderIdeas();
    return say(L("Te he dejado ideas nuevas abajo, en «Ideas de Maestro». Pruébalas y quédate con lo que te guste.", "I left you new ideas below, in «Maestro's ideas». Try them and keep what you like."), state.options); }
  if (low.includes("qué hago") || low.includes("que hago") || low.includes("estructura") || low.includes("what do i do") || low.includes("structure")) {
    return say(L("Un buen ejercicio: escucha la canción y silencia pistas (botón del altavoz) para construir cada parte de la estructura. Así aprendes cómo cada capa cambia la energía. Después prueba las Ideas de Maestro o pulsa «Explícame» en una pista para entender su código.", "A good exercise: listen to the song and mute tracks (speaker button) to build each part of the structure. That's how you learn how each layer changes the energy. Then try Maestro's Ideas or press «Explain» on a track to understand its code."),
      [L("Dame otra idea", "Give me another idea"), L("Explícame la canción", "Explain the song")]); }
  if (text === NEXT || low.includes("siguiente") || low.includes("perfecto") || low.includes("next") || low.includes("perfect")) return nextStep();

  if (state.step === "estilo") {
    let key = Object.keys(STYLES).find((k) => low.includes(STYLES[k].nombre.toLowerCase()) || low.includes(k));
    if (!key && (low.includes("sorpr") || low.includes("no sé") || low.includes("no se") || low.includes("surprise") || low.includes("don't know"))) {
      const ks = Object.keys(STYLES); key = ks[Math.floor(Math.random() * ks.length)];
    }
    if (!key) return say(L("No conozco ese estilo todavía. Elige uno de estos y lo adaptamos después:", "I don't know that style yet. Pick one of these and we'll adapt it later:"), Object.values(STYLES).map((s) => s.nombre));
    const s = STYLES[key];
    state.style = key; state.bpm = s.bpm; $("#bpm").value = s.bpm; renderCatalog();
    if (live()) evalCode(cps(s.bpm));
    say(L(`¡${s.nombre}! ${s.desc}\nLo pongo a ${s.bpm} BPM, la velocidad típica del estilo.`, `${s.nombre}! ${s.desc}\nI'll set it to ${s.bpm} BPM, the typical tempo for the style.`), [], {
      explicacion: [{ fragmento: cps(s.bpm), explicacion: L(`Fija la velocidad: ${s.bpm} pulsos por minuto, divididos entre 60 segundos y entre 4 pulsos por ciclo (un ciclo = un compás).`, `Sets the tempo: ${s.bpm} beats per minute, divided by 60 seconds and by 4 beats per cycle (one cycle = one bar).`) }] });
    return goStep("percusion");
  }
  if (state.step === "tempo") {
    if (low.includes("lento") || low.includes("slower")) state.bpm = Math.max(40, state.bpm - 10);
    else if (low.includes("rápido") || low.includes("rapido") || low.includes("faster")) state.bpm = Math.min(220, state.bpm + 10);
    else { const n = parseInt(low.match(/\d+/)?.[0]); if (n) state.bpm = Math.max(40, Math.min(220, n)); }
    $("#bpm").value = state.bpm; evalCode(cps(state.bpm)); changed();
    return say(L(`Ahora a ${state.bpm} BPM. ¿Mejor así?`, `Now at ${state.bpm} BPM. Better?`), [L("Más lento", "Slower"), L("Más rápido", "Faster"), L("Así está perfecto", "That's perfect")]);
  }
  const target = text.match(/(?:Usar|Use) (d\d+)/);
  if (target) { state.selected = target[1]; save(); renderTracks(); return goStep(state.step); }

  const comp = COMPONENTS.find((c) => low === c.nombre.toLowerCase()) || COMPONENTS.find((c) => low.includes(c.nombre.toLowerCase()));
  if (comp) {
    const t = addComponent(comp);
    if (!t) return say(L("Primero necesitas alguna pista para aplicarle eso.", "You need a track first to apply that to."), [NEXT]);
    teachAbout(comp, t);
    const opts = state.step === "efecto" || state.step === "estructura"
      ? [...compsFor(state.step).slice(0, 5).map((c) => c.nombre), NEXT]
      : [...compsFor(state.step).filter((c) => c.id !== comp.id).map((c) => c.nombre), NEXT];
    return say(L("¿Añadimos algo más aquí o pasamos al siguiente paso? Mira también las Ideas de Maestro, abajo.", "Shall we add something else here or go to the next step? Also check Maestro's Ideas below."), opts);
  }
  say(L("Sin una IA conectada solo entiendo los botones. Conecta una en Ajustes para hablar con libertad.", "Without an AI connected I only understand the buttons. Connect one in Settings to talk freely."), state.options.length ? state.options : [NEXT]);
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
    <input class="wz-free" placeholder="${L("O escribe tu propia respuesta…", "Or type your own answer…")}">
    <div class="wz-nav">
      <button data-a="back" ${wz.i === 0 ? "disabled" : ""}>${icon("back", 16)} ${L("Atrás", "Back")}</button>
      <div class="right">
        <button data-a="skip">${L("Saltar", "Skip")}</button>
        <button data-a="next" class="primary">${wz.i === QUESTIONS.length - 1 ? L("Ver mi plan", "See my plan") : L("Siguiente", "Next")} ${icon("arrow", 16)}</button>
      </div>
    </div>`;
  if (wz.comment) body.querySelector(".wz-comment span").textContent = wz.comment;
  body.querySelector(".q").textContent = q.pregunta;
  body.querySelector(".wz-help").textContent = q.ayuda + (wz.loading ? L(" (Maestro está pensando ejemplos para ti…)", " (Maestro is thinking up examples for you…)") : "");
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
  if (!wz.plan) { body.innerHTML = `<p class="typing">${L("Maestro está diseñando el plan de tu canción…", "Maestro is designing your song plan…")}</p>`; return; }
  const p = wz.plan;
  const total = p.partes.reduce((n, x) => n + (Number(x.compases) || 8), 0) || 1;
  body.innerHTML = `<div class="plan">
    <span class="wz-kicker">${L("Tu plan", "Your plan")}</span>
    <h2></h2><p class="resumen"></p>
    <div class="meta">${p.estilo ? `<span>${esc(STYLES[p.estilo].nombre)}</span>` : ""}${p.bpm ? `<span>${p.bpm} BPM</span>` : ""}<span>${total} ${L("compases", "bars")}</span></div>
    <h3>${L("Estructura", "Structure")}</h3>
    <div class="timeline">${p.partes.map((x) => `<div style="flex:${Math.max(3, Number(x.compases) || 8)}" title="${esc(x.que)}"><b>${esc(x.nombre)}</b><span>${esc(x.compases)} ${L("compases", "bars")}</span></div>`).join("")}</div>
    <p class="hint">${p.partes.map((x) => `<b>${esc(x.nombre)}:</b> ${esc(x.que)}`).join(" · ")}</p>
    <h3>${L("Cambios para empezar a probar", "Changes to start trying")}</h3>
    ${p.sugerencias.map((x, k) => `<div class="sug"><button class="prehear" data-k="${k}" style="float:right">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button><div class="t">${esc(x.titulo)}${x.concepto ? `<span class="tag">${esc(x.concepto)}</span>` : ""}</div><div class="p">${esc(x.porque)}</div>${x.cambios.pistas.map((t) => `<code>${esc(t.id)} $ ${esc(t.codigo)}</code>`).join("")}</div>`).join("")}
    <div class="wz-nav">
      <button data-a="restart">${icon("back", 16)} ${L("Volver a empezar", "Start over")}</button>
      <div class="right">
        <button data-a="ideas">${L("Llevar las ideas a Maestro", "Send the ideas to Maestro")}</button>
        <button data-a="all" class="primary">${icon("play", 14)} ${L("Empezar con todo", "Start with everything")}</button>
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
  const estructura = p.partes.map((x) => `• ${x.nombre} (${x.compases} ${L("compases", "bars")}): ${x.que}`).join("\n");
  state.step = "libre";
  if (applyAll) {
    const pistas = p.sugerencias.flatMap((x) => x.cambios.pistas);
    const note = applyChanges({ pistas });
    p.sugerencias.forEach((x) => x.concepto && !state.learnedMusic.includes(x.concepto) && state.learnedMusic.push(x.concepto));
    state.ideas = [];
    say(L(`Plan «${p.titulo}» en marcha. ${p.resumen}\n\nLa estructura que diseñamos:\n${estructura}\n\nYa suena todo. Pulsa «Explícame» en cualquier pista para entender su código, o silencia pistas para escuchar cada parte.`, `Plan «${p.titulo}» is running. ${p.resumen}\n\nThe structure we designed:\n${estructura}\n\nEverything is playing. Press «Explain» on any track to understand its code, or mute tracks to hear each part.`),
      [L("¿Qué hago ahora?", "What do I do now?"), L("Explícame la canción", "Explain the song")], { changes: note });
  } else {
    state.ideas = p.sugerencias;
    say(L(`Plan «${p.titulo}». ${p.resumen}\n\nLa estructura que diseñamos:\n${estructura}\n\nTe he dejado ${p.sugerencias.length} ideas abajo: pruébalas una a una y quédate con las que te gusten.`, `Plan «${p.titulo}». ${p.resumen}\n\nThe structure we designed:\n${estructura}\n\nI left you ${p.sugerencias.length} ideas below: try them one by one and keep the ones you like.`),
      [L("Explícame la estructura", "Explain the structure"), L("Dame otra idea", "Give me another idea")]);
  }
  changed(); renderIdeas();
}


// ------------------------------------------------------------------ proyectos
const FRESH = () => ({ lang: LANG, bpm: 120, tracks: [], selected: null, style: "", step: "estilo", chat: [], options: [], ideas: [],
  trying: null, learnedMusic: state.learnedMusic || [], lastError: "", offline: state.offline, projectId: "p" + Date.now(), name: "" });

function renderAll() {
  $("#bpm").value = state.bpm; $("#proj-name").value = state.name || "";
  renderCatalog(); renderTracks(); renderProgress(); renderIdeas(); renderChat();
  $("#code").value = buildCode();
}
function openNewProject() {
  $("#np-kicker").innerHTML = icon("plus", 16) + L(" Nuevo proyecto", " New project");
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">${L("¿Cómo quieres empezar?", "How do you want to start?")}</h2>
    <p class="wz-help">${L("Tu proyecto actual se guarda solo en «Mis proyectos».", "Your current project is saved automatically in «My projects».")}</p>
    <div class="np-choices">
      <button class="np-choice" data-m="blank">${icon("blank", 28)}<b>${L("En blanco", "Blank")}</b><span>${L("Un lienzo vacío. Tú añades cada pieza desde el catálogo o pidiéndosela a Maestro.", "An empty canvas. You add each piece from the catalog or by asking Maestro.")}</span></button>
      <button class="np-choice rec" data-m="wizard"><em>${L("Recomendado", "Recommended")}</em>${icon("steps", 28)}<b>${L("Con wizard", "With wizard")}</b><span>${L("Vas pulsando opciones paso a paso (estilo, ritmo, bajo, acordes…) y se crea tu proyecto base. Todo suena mientras eliges.", "Click options step by step (style, beat, bass, chords…) and your base project is built. Everything plays while you choose.")}</span></button>
      <button class="np-choice" data-m="ideas">${icon("wand", 28)}<b>${L("Lluvia de ideas", "Brainstorm")}</b><span>${L("Maestro te hace preguntas abiertas sobre lo que quieres sentir y diseña contigo un plan.", "Maestro asks you open questions about what you want to feel and designs a plan with you.")}</span></button>
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
  say(L("Proyecto en blanco. Puedes:\n• Añadir piezas desde el catálogo de la izquierda (pulsa +).\n• Pedírmelo con tus palabras: «pon un bombo», «algo de jazz»…\n• Escribir código directamente en la pestaña Código.\n\nCada vez que añadas algo te explico su código.", "Blank project. You can:\n• Add pieces from the catalog on the left (press +).\n• Ask me in your own words: «add a kick», «something jazzy»…\n• Write code directly in the Code tab.\n\nEvery time you add something I'll explain its code."),
    [L("Empieza tú con un ritmo", "You start with a beat"), L("Lluvia de ideas: diseñar mi canción", "Brainstorm: design my song"), ...Object.values(STYLES).slice(0, 4).map((x) => x.nombre)]);
  state.step = "estilo";
}
function openProjects(tab = "local") {
  $("#np-kicker").innerHTML = icon("folder", 16) + " " + L("Mis proyectos", "My projects");
  const list = listProjects();
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">${L("Mis proyectos", "My projects")}</h2>
    <div class="np-tabs"><button data-a="tab-local" class="${tab === "local" ? "active" : ""}">${icon("folder", 14)} ${L("En este navegador", "In this browser")}</button>
      <button data-a="tab-github" class="${tab === "github" ? "active" : ""}">${icon("cloud", 14)} GitHub</button></div>
    <div id="np-local" ${tab === "local" ? "" : "hidden"}>
    <p class="wz-help">${L("Se guardan en este navegador. Tu progreso de aprendizaje es común a todos.", "Saved in this browser. Your learning progress is shared by all of them.")}</p>
    <div class="np-list">${list.length ? list.map((p) => `<div class="np-item ${p.id === state.projectId ? "current" : ""}" data-id="${esc(p.id)}">
      <span class="n">${esc(p.name)}<span class="d">${p.data.tracks.length} ${L("pistas", "tracks")} · ${p.data.bpm} BPM · ${new Date(p.updated).toLocaleString(L("es-ES", "en-GB"))}</span></span>
      ${p.id === state.projectId ? `<span class="hint">${L("abierto", "open")}</span>` : `<button data-a="open">${L("Abrir", "Open")}</button>`}
      <button data-a="del" class="icon-btn" title="${L("Borrar", "Delete")}">${icon("trash", 16)}</button></div>`).join("") : `<p class="hint">${L("Todavía no hay proyectos guardados.", "No saved projects yet.")}</p>`}</div></div>
    <div id="np-github" ${tab === "github" ? "" : "hidden"}>
      <p class="wz-help">${L("Canciones guardadas en tu repositorio. Cada una tiene su historial de versiones (commits).", "Songs saved in your repository. Each one has its version history (commits).")}</p>
      <div class="np-list" id="gh-list"></div></div>
    <div class="wz-nav"><span></span><div class="right"><button class="primary" data-a="new">${icon("plus", 14)} ${L("Nuevo proyecto", "New project")}</button></div></div>`;
  if (tab === "github") renderGitHubList($("#gh-list"));
  body.onclick = async (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    const a = btn.dataset.a;
    const id = btn.closest(".np-item")?.dataset.id;
    const item = btn.closest(".np-item");
    if (a === "tab-local" || a === "tab-github") return openProjects(a.slice(4));
    if (a === "gh-setup") { $("#newproj").close(); return needGitHub(); }
    if (a === "gh-back") return renderGitHubList($("#gh-list"));
    if (a === "versions") return renderVersions($("#gh-list"), item.dataset.slug);
    if (a === "gh-open") {
      btn.disabled = true;
      try { await openGitHubSong(item.dataset.slug, item.dataset.ref || null); }
      catch (err) { btn.disabled = false; toast("GitHub: " + err.message); }
      return;
    }
    if (a === "new") { $("#newproj").close(); return openNewProject(); }
    if (a === "open") {
      save();
      const p = listProjects().find((x) => x.id === id);
      evalCode("hush");
      state = { ...FRESH(), ...p.data, trying: null };
      $("#newproj").close(); renderAll(); if (live()) playAll();
      sysMsg(L(`Proyecto «${state.name}» abierto.`, `Project «${state.name}» opened.`));
    }
    if (a === "del" && confirmDelete(id)) openProjects();
  };
  if (!$("#newproj").open) $("#newproj").showModal();
}
// ------------------------------------------------------------------ controles en el chat (agentic UI)
const CTL_CHIP = () => L("Ajustar con controles", "Tweak with controls");
const MIX_RE = /mezcl|\bmix|volúmenes|volumenes|levels|niveles/i;
const CTL_RE = /control|slider|deslizador|ajust|perilla|knob|tweak|secuenciador|sequencer|rejilla|grid/i;
function showControls(t, opts = {}) {
  const controles = controlsFor(t, { bpm: opts.bpm, samples: server.samples || [] });
  say(L(`Aquí tienes controles para ${t.id} (${t.name}). Muévelos y escucha: cada control escribe el código por ti, fíjate en la línea gris que cambia. Si no te convence, pulsa Restaurar.`,
    `Here are controls for ${t.id} (${t.name}). Move them and listen: each control writes the code for you, watch the grey line change. If you don't like it, press Restore.`),
    [CARD_CHIP(), L("Mesa de mezcla", "Mixing desk"), ...(state.options || []).filter((o) => !/mezcla|mixing|tarjeta|card/i.test(o))].slice(0, 6), { controles });
}
let ctlTimer = null;
const snapNow = () => ({ bpm: state.bpm, tracks: Object.fromEntries(state.tracks.map((t) => [t.id, t.code])), muted: Object.fromEntries(state.tracks.map((t) => [t.id, !!t.muted])),
  mix: Object.fromEntries(state.tracks.map((t) => [t.id, t.mix || null])), master: state.master || null });
// Los controles y tarjetas trabajan SIEMPRE sobre la versión actual de la canción.
// Restaurar solo deshace lo que cambió ese mensaje (lo demás se queda como esté ahora).
function noteSnap(m, pre) {
  const s = m.snap || (m.snap = { tracks: {}, muted: {}, mix: {} });
  if (pre.bpm !== state.bpm && s.bpm === undefined) s.bpm = pre.bpm;
  if (JSON.stringify(pre.master) !== JSON.stringify(state.master || null) && !("master" in s)) s.master = pre.master;
  for (const t of state.tracks) {
    if (pre.tracks[t.id] !== undefined && pre.tracks[t.id] !== t.code && !(t.id in s.tracks)) s.tracks[t.id] = pre.tracks[t.id];
    if (pre.muted[t.id] !== undefined && pre.muted[t.id] !== !!t.muted && !(t.id in s.muted)) s.muted[t.id] = pre.muted[t.id];
    if (JSON.stringify(pre.mix[t.id] ?? null) !== JSON.stringify(t.mix || null) && !(t.id in s.mix)) s.mix[t.id] = pre.mix[t.id] ?? null;
  }
}
// Vuelve a pintar las tarjetas del chat con los valores actuales (menos la que estás tocando)
function refreshCards(except) {
  document.querySelectorAll("#chat .ctl-panel").forEach((panel) => {
    const mi = +panel.dataset.m;
    if (mi === except || panel.contains(document.activeElement) || !state.chat[mi] || !state.chat[mi].controles) return;
    panel.outerHTML = controlsHTML(state.chat[mi].controles, state, mi);
  });
}
function ctlApply(mi, mutate) {
  const m = state.chat[mi];
  if (!m) return;
  const pre = snapNow();
  const touched = mutate();
  noteSnap(m, pre);
  refreshCards(mi);
  if (touched) touched.explain = null;
  save(); renderTracks(); renderBlocks(); renderMixer();
  if (!$("#tab-code").classList.contains("active")) $("#code").value = buildCode();
  clearTimeout(ctlTimer);
  ctlTimer = setTimeout(() => { if (!live()) return; if (touched === "all") playAll(); else if (touched) playTrack(touched); else evalCode(cps(state.bpm)); }, 180);
}
function refreshPanel(mi) {
  const old = document.querySelector(`.ctl-panel[data-m="${mi}"]`);
  if (old) old.outerHTML = controlsHTML(state.chat[mi].controles, state, mi);
}
function wireControls() {
  const box = $("#chat");
  const extVals = (ctl) => {
    const v = {};
    ctl.querySelectorAll("input[type=range][data-k]").forEach((x) => { v[x.dataset.k] = +x.value; });
    ctl.querySelectorAll("input[type=checkbox][data-k]").forEach((x) => { v[x.dataset.k] = x.checked; });
    ctl.querySelectorAll(".ctl-opts[data-k]").forEach((x) => { const on = x.querySelector("button.on"); if (on) v[x.dataset.k] = on.dataset.o; });
    return v;
  };
  const extRun = (mi, ctl, c, override, rerender) => {
    if (c.tipo === "mezcla") return;
    const t = state.tracks.find((x) => x.id === c.pista); if (!t) return;
    const vals = { ...extVals(ctl), ...override };
    ctlApply(mi, () => { t.code = extApply(c, t, vals); return t; });
    if (rerender) return refreshPanel(mi);
    ctl.querySelector(".ctl-code").textContent = extState(c, t).chip;
  };
  // --- tarjeta configuradora
  const cardOf = (el) => { const card = el.closest(".ctl.card"); if (!card) return null; const mi = +card.closest(".ctl-panel").dataset.m; return { card, mi, id: card.dataset.t }; };
  const cardRefreshCode = (k) => { const t = state.tracks.find((x) => x.id === k.id); const code = k.card.querySelector(".card-code"); if (t && code) code.textContent = cardCode(t, state); if (k.id === "song") k.card.querySelector(".ctl-code").textContent = `setcps (${state.bpm}/60/4)`; };
  box.addEventListener("input", (e) => {
    const k = cardOf(e.target); if (!k || e.target.type !== "range") return;
    const x = e.target, out = x.nextElementSibling;
    if (x.dataset.mx) {
      const id = x.dataset.id || x.closest("[data-id]").dataset.id;
      let touched = null;
      ctlApply(k.mi, () => { touched = setMix(state, id, x.dataset.mx, +x.value); return touched || "all"; });
      out.textContent = x.dataset.mx === "vol" ? dbText(+x.value) : `${+x.value > 0 ? "+" : ""}${+x.value} dB`;
    } else if (x.dataset.song === "bpm") {
      ctlApply(k.mi, () => { state.bpm = +x.value; $("#bpm").value = state.bpm; return null; });
      out.textContent = `${state.bpm} BPM`;
    } else if (x.dataset.key) {
      const t = state.tracks.find((y) => y.id === k.id); if (!t) return;
      let v = +x.value;
      if (x.dataset.log) { const [mn, mxv] = x.dataset.log.split("|").map(Number); v = cardFromPos({ log: true, min: mn, max: mxv }, v); }
      ctlApply(k.mi, () => { t.code = applyEdit(t.code, x.dataset.key, x.dataset.num ? "num" : "set", v); return t; });
      out.textContent = fmt(v);
      if (x.dataset.num) { const w = x.closest(".card-wrap")?.querySelector("input[type=text]"); const p = partOf(t.code, x.dataset.key.replace(/#\d+$/, "")); if (w && p) w.value = p.text; }
    }
    tourFlag("ctl-move");
    cardRefreshCode(k);
  });
  box.addEventListener("change", (e) => {
    const k = cardOf(e.target); if (!k) return;
    const x = e.target, t = state.tracks.find((y) => y.id === k.id);
    if (x.type === "range") return; // ya aplicado mientras se movía
    if (!t) return;
    if (x.dataset.key) ctlApply(k.mi, () => { try { t.code = applyEdit(t.code, x.dataset.key, "set", x.value); } catch { /* nada */ } return t; });
    else if (x.dataset.addwrap && x.value) ctlApply(k.mi, () => { t.code = applyEdit(t.code, "|root", "addWrap", x.value); return t; });
    else if (x.dataset.addparam && x.value) { const p = x.value; ctlApply(k.mi, () => { t.code = applyEdit(t.code, x.dataset.addparam, "addParam", p, fmt(p === "lpf" ? 2000 : p === "room" || p === "delay" ? 0.3 : CTL_PARAMS[p].def)); return t; }); }
    else return;
    refreshPanel(k.mi);
  });
  box.addEventListener("click", (e) => {
    const k = cardOf(e.target); if (!k) return;
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.open) { e.stopPropagation(); return openCard(b.dataset.open); }
    if (b.dataset.del) {
      e.stopPropagation();
      const t = state.tracks.find((y) => y.id === k.id); if (!t) return;
      ctlApply(k.mi, () => { t.code = applyEdit(t.code, b.dataset.del, "del"); return t; });
      refreshPanel(k.mi);
    }
  }, true);
  box.addEventListener("input", (e) => {
    if (e.target.closest(".ctl.card")) return;
    tourFlag("ctl-move");
    const ext = e.target.closest(".ctl.ext");
    if (ext && e.target.matches("input[type=range]")) {
      const mi = +ext.closest(".ctl-panel").dataset.m, c = state.chat[mi].controles[+ext.dataset.c];
      const r = e.target, out = r.nextElementSibling;
      if (c.tipo === "mezcla") {
        const t = state.tracks.find((x) => x.id === r.dataset.id); if (!t) return;
        ctlApply(mi, () => { t.code = setParam(t.code, "gain", +r.value); return t; });
        out.textContent = fmt(+r.value); return;
      }
      out.textContent = c.tipo === "azar" ? `${Math.round(r.value * 100)} %` : fmt(+r.value);
      return extRun(mi, ext, c, {}, false);
    }
    const r = e.target.closest(".ctl input[type=range]"); if (!r) return;
    const mi = +r.closest(".ctl-panel").dataset.m, ci = +r.closest(".ctl").dataset.c;
    const c = state.chat[mi].controles[ci];
    if (c.tipo === "bpm") {
      ctlApply(mi, () => { state.bpm = +r.value; $("#bpm").value = state.bpm; return null; });
      r.nextElementSibling.textContent = `${state.bpm} BPM`;
      r.closest(".ctl").querySelector(".ctl-code").textContent = `setcps (${state.bpm}/60/4)`;
      return;
    }
    const t = state.tracks.find((x) => x.id === c.pista); if (!t) return;
    let v = fromPos(c, r.value);
    const P = CTL_PARAMS[c.param];
    if (P.log) v = v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10;
    ctlApply(mi, () => { t.code = setParam(t.code, c.param, v); return t; });
    r.nextElementSibling.textContent = fmt(v);
    r.closest(".ctl").querySelector(".ctl-code").textContent = `# ${c.param} ${fmt(v)}`;
  });
  box.addEventListener("change", (e) => {
    if (e.target.closest(".ctl.card")) return;
    const ext = e.target.closest(".ctl.ext");
    if (!ext || !e.target.matches("input[type=checkbox]")) return;
    const mi = +ext.closest(".ctl-panel").dataset.m;
    extRun(mi, ext, state.chat[mi].controles[+ext.dataset.c], {}, true);
  });
  box.addEventListener("click", (e) => {
    const panel = e.target.closest(".ctl-panel"); if (!panel) return;
    const mi = +panel.dataset.m, m = state.chat[mi];
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "ctl-reset") {
      if (!m.snap) return;
      if (m.snap.bpm !== undefined) { state.bpm = m.snap.bpm; $("#bpm").value = state.bpm; }
      state.tracks.forEach((t) => { if (m.snap.tracks[t.id] !== undefined) t.code = m.snap.tracks[t.id]; if (m.snap.muted && m.snap.muted[t.id] !== undefined) t.muted = m.snap.muted[t.id]; if (m.snap.mix && m.snap.mix[t.id] !== undefined) t.mix = m.snap.mix[t.id]; });
      if ("master" in m.snap) state.master = m.snap.master;
      m.snap = null; save(); changed(); if (live()) playAll(); return refreshPanel(mi);
    }
    const ctl = b.closest(".ctl"); if (!ctl || ctl.classList.contains("card")) return;
    const c = m.controles[+ctl.dataset.c];
    if (ctl.classList.contains("ext")) {
      if (c.tipo === "mezcla" && b.dataset.k === "mute") {
        const t = state.tracks.find((x) => x.id === b.dataset.o); if (!t) return;
        const pre = snapNow();
        t.muted = !t.muted; noteSnap(m, pre); changed(); if (live()) (t.muted ? silenceId(t.id) : playTrack(t));
        return refreshPanel(mi);
      }
      const grp = b.closest(".ctl-opts[data-k]");
      if (grp) return extRun(mi, ctl, c, { [grp.dataset.k]: b.dataset.o }, true);
      return;
    }
    const t = state.tracks.find((x) => x.id === c.pista); if (!t) return;
    if (c.tipo === "selector" && b.dataset.o) {
      const o = b.dataset.o;
      ctlApply(mi, () => {
        if (c.que === "sonido") { const [nm, vv] = o.split(":"); const cur = ctl.querySelector(".ctl-opts button.on")?.dataset.o?.split(":")[0]; const code = swapSound(t.code, nm, vv ? +vv : null, cur); if (code) t.code = code; }
        else t.code = setParam(t.code, c.param, isNaN(+o) ? o : +o);
        return t;
      });
      return refreshPanel(mi);
    }
    if (c.tipo === "pasos" && b.classList.contains("seq-cell")) {
      const g = gridFrom(t.code, c.pasos); if (!g || g.complex) return;
      const i = +b.dataset.i, r = b.dataset.r;
      g.cells[i] = g.cells[i] === r ? null : r;
      ctlApply(mi, () => { t.code = gridToCode(t.code, g.cells); return t; });
      return refreshPanel(mi);
    }
  });
}

// ------------------------------------------------------------------ biblioteca de samples
const sm = { pack: null, packIdx: null, packQ: "", packGroup: "", installed: {}, dirt: null, tab: "builtin", type: "", mine: null, results: null, q: "", license: "libre", oneshot: true, page: 1, keySet: false, variant: {} };
let smAudio = null;
function smStop() { if (smAudio) { smAudio.pause(); smAudio = null; } }
async function openSamples(tab) {
  if (tab) sm.tab = tab;
  try { sm.keySet = !!(await api("/api/config")).samples?.freesound_key_set; } catch { /* sin servidor */ }
  await renderSamples();
  if (!$("#samples").open) $("#samples").showModal();
}
function smTypeChips(counts) {
  const types = SAMPLE_TYPES.filter((t) => !counts || counts[t.id]);
  return `<div class="sm-types"><button data-type="" class="${sm.type ? "" : "active"}">${L("Todos", "All")}</button>${types.map((t) =>
    `<button data-type="${t.id}" class="${sm.type === t.id ? "active" : ""}" style="--k:${KIND_COLOR[t.kind]}">${esc(L(t.es, t.en))}${counts ? ` <span>${counts[t.id]}</span>` : ""}</button>`).join("")}</div>`;
}
function useButtons(name, type) {
  const t = selectedTrack();
  const canSwap = t && /\b(s|sound)\s+"/.test(t.code) && type !== "synth";
  return `<div class="sm-use">
    <button class="primary" data-a="use-new" data-name="${esc(name)}" data-type="${esc(type)}">${icon("plus", 13)} ${L("Nueva pista", "New track")}</button>
    ${canSwap ? `<button data-a="use-swap" data-name="${esc(name)}" data-type="${esc(type)}" title="${esc(L("Mismo ritmo, otro sonido", "Same rhythm, another sound"))}">${L(`Poner en ${t.id}`, `Use on ${t.id}`)}</button>` : ""}</div>`;
}
async function renderSamples() {
  const body = $("#sm-body");
  const tabs = [["builtin", "wave", L("Incluidos", "Built-in")], ["mine", "folder", L("Mis samples", "My samples")],
    ["online", "search", L("Buscar online", "Search online")], ["packs", "library", L("Packs", "Packs")]];
  let html = `<div class="np-tabs">${tabs.map(([id, ic, n]) => `<button data-tab="${id}" class="${sm.tab === id ? "active" : ""}">${icon(ic, 14)} ${n}</button>`).join("")}</div>`;
  if (sm.tab === "builtin") {
    const counts = {}; BUILTIN.forEach((b) => { counts[b.type] = (counts[b.type] || 0) + 1; });
    const list = BUILTIN.filter((b) => !sm.type || b.type === sm.type);
    html += `<p class="wz-help">${L("Vienen instalados con SuperDirt. Cada nombre es una carpeta con variantes: <code>bd:0</code>, <code>bd:1</code>… Escúchalos y úsalos en una pista nueva o en la seleccionada (mismo ritmo, otro sonido).", "They come installed with SuperDirt. Each name is a folder with variants: <code>bd:0</code>, <code>bd:1</code>… Listen and use them on a new track or on the selected one (same rhythm, another sound).")}</p>
      ${smTypeChips(counts)}
      <div class="sm-list">${list.map((b) => { const v = sm.variant[b.name] || 0; return `<div class="sm-item" style="--k:${KIND_COLOR[typeKind(b.type)]}">
        <button class="icon-btn sm-play" data-a="hear-engine" data-name="${esc(b.name)}" data-type="${b.type}" title="${esc(L("Escuchar (suena por el motor)", "Listen (plays through the engine)"))}">${icon("play", 14)}</button>
        <span class="n"><code>${esc(b.name)}${b.type === "synth" ? "" : `:${v}`}</code><span class="d">${esc(b.desc)} · ${esc(typeName(b.type))}</span></span>
        ${b.type === "synth" ? "" : `<span class="sm-var"><button data-a="var" data-d="-1" data-name="${esc(b.name)}">−</button><button data-a="var" data-d="1" data-name="${esc(b.name)}">+</button></span>`}
        ${useButtons(b.type === "synth" || !v ? b.name : `${b.name}:${v}`, b.type)}</div>`; }).join("")}</div>`;
  }
  if (sm.tab === "mine") {
    if (!sm.mine) { try { sm.mine = await api("/api/samples"); } catch (e) { sm.mine = { sounds: [], error: e.message }; } }
    const counts = {}; sm.mine.sounds.forEach((x) => { counts[x.type] = (counts[x.type] || 0) + 1; });
    const list = sm.mine.sounds.filter((x) => !sm.type || x.type === sm.type);
    html += `<p class="wz-help">${L("Tus propios sonidos. Cada sonido es una carpeta dentro de <code>samples/</code>; en Tidal lo usas por su nombre: <code>s \"mi_bombo\"</code>.", "Your own sounds. Each sound is a folder inside <code>samples/</code>; in Tidal you use it by its name: <code>s \"my_kick\"</code>.")}</p>
      <form class="sm-upload" id="sm-upload">
        <label>${L("Nombre del sonido", "Sound name")}<input name="name" placeholder="${L("mi_bombo", "my_kick")}" required></label>
        <label>${L("Tipo", "Type")}<select name="type">${SAMPLE_TYPES.filter((t) => t.id !== "synth").map((t) => `<option value="${t.id}">${esc(L(t.es, t.en))}</option>`).join("")}</select></label>
        <label class="file">${icon("upload", 16)} <span>${L("Elegir archivos (WAV, AIFF, FLAC, OGG)", "Choose files (WAV, AIFF, FLAC, OGG)")}</span><input type="file" name="files" accept=".wav,.aif,.aiff,.flac,.ogg" multiple></label>
        <button class="primary" type="submit">${L("Añadir", "Add")}</button>
      </form>
      ${sm.mine.error ? `<p class="hint">Error: ${esc(sm.mine.error)}</p>` : ""}
      ${smTypeChips(counts)}
      <div class="sm-list">${list.length ? list.map((x) => `<div class="sm-item mine" style="--k:${KIND_COLOR[typeKind(x.type)]}">
        <span class="n"><code>${esc(x.name)}</code><span class="d">${x.files.length} ${x.files.length === 1 ? L("archivo", "file") : L("archivos", "files")} · ${x.source === "freesound" ? "Freesound" : L("subido por ti", "uploaded by you")}</span>
          <span class="sm-files">${x.files.map((f) => `<span class="sm-file"><button class="icon-btn" data-a="hear-file" data-name="${esc(x.name)}" data-i="${f.index}" title="${esc(f.file)}">${icon("play", 12)}</button><code>${esc(x.name)}:${f.index}</code><button class="icon-btn" data-a="wave" data-name="${esc(x.name)}" data-i="${f.index}" title="${esc(L("Ver la onda y recortar", "See the waveform and trim"))}">${icon("wave", 12)}</button>${f.license_name ? `<span class="lic" title="${esc((f.title || "") + " · " + (f.author || ""))}">${esc(f.license_name)}</span>` : ""}<button class="icon-btn" data-a="del-file" data-name="${esc(x.name)}" data-i="${f.index}" title="${esc(L("Borrar este archivo", "Delete this file"))}">${icon("close", 12)}</button></span>`).join("")}</span></span>
        <select data-a="set-type" data-name="${esc(x.name)}">${SAMPLE_TYPES.filter((t) => t.id !== "synth").map((t) => `<option value="${t.id}" ${t.id === x.type ? "selected" : ""}>${esc(L(t.es, t.en))}</option>`).join("")}</select>
        ${useButtons(x.name, x.type)}
        <button class="icon-btn" data-a="del-sound" data-name="${esc(x.name)}" title="${esc(L("Borrar el sonido", "Delete the sound"))}">${icon("trash", 15)}</button>
        ${sm.wave && sm.wave.name === x.name ? trimHTML(x) : ""}</div>`).join("")
        : `<p class="hint">${L("Aún no tienes samples propios. Sube archivos arriba o búscalos en «Buscar online».", "You don't have your own samples yet. Upload files above or find some in «Search online».")}</p>`}</div>`;
  }
  if (sm.tab === "online") {
    html += `<p class="wz-help">${L("Busca en <b>Freesound</b>, la mayor biblioteca libre de sonidos (más de 600.000, con licencias Creative Commons). Lo que añadas se descarga a tu biblioteca y queda listo para Tidal.", "Search <b>Freesound</b>, the largest free sound library (over 600,000, under Creative Commons licenses). Whatever you add is downloaded to your library, ready for Tidal.")}</p>`;
    if (!sm.keySet) {
      html += `<div class="sm-key"><p>${L("Necesitas una <b>clave API gratuita</b>: crea una cuenta en Freesound y pide la clave en", "You need a <b>free API key</b>: create a Freesound account and request the key at")} <a href="https://freesound.org/apiv2/apply" target="_blank" rel="noopener">freesound.org/apiv2/apply</a>. ${L("Se guarda solo en tu <code>config.json</code>.", "It's stored only in your <code>config.json</code>.")}</p>
        <form id="sm-key" class="row"><input name="key" type="password" placeholder="${L("Pega aquí tu clave", "Paste your key here")}" required style="flex:1"><button class="primary" type="submit">${L("Guardar clave", "Save key")}</button></form></div>`;
    } else {
      html += `<form id="sm-search" class="sm-search">
        <input name="q" value="${esc(sm.q)}" placeholder="${L("p. ej. kick 909, vinyl crackle, rhodes chord…", "e.g. kick 909, vinyl crackle, rhodes chord…")}" required>
        <select name="license"><option value="cc0" ${sm.license === "cc0" ? "selected" : ""}>${L("Solo CC0 (sin condiciones)", "CC0 only (no conditions)")}</option>
          <option value="libre" ${sm.license === "libre" ? "selected" : ""}>${L("CC0 y atribución", "CC0 and attribution")}</option>
          <option value="todas" ${sm.license === "todas" ? "selected" : ""}>${L("Todas (ojo: algunas no comerciales)", "All (careful: some non-commercial)")}</option></select>
        <label class="toggle"><input type="checkbox" name="oneshot" ${sm.oneshot ? "checked" : ""}> ${L("Golpes cortos", "Short hits")}</label>
        <button class="primary" type="submit">${icon("search", 14)} ${L("Buscar", "Search")}</button></form>
        <div class="sm-quick">${["kick", "snare", "clap", "hihat", "808 bass", "vinyl", "rhodes", "vocal chop", "field recording"].map((q) => `<button data-a="quick" data-q="${q}">${q}</button>`).join("")}</div>`;
      if (sm.results) {
        html += sm.results.error ? `<p class="hint">Error: ${esc(sm.results.error)}</p>` : `<p class="hint">${sm.results.count} ${L("resultados", "results")}</p>
          <div class="sm-list">${sm.results.results.map((r, i) => `<div class="sm-item">
            <button class="icon-btn sm-play" data-a="hear-url" data-i="${i}">${icon("play", 14)}</button>
            <span class="n">${esc(r.name)}<span class="d">${esc(r.author)} · ${r.duration}s · <span class="lic">${esc(r.license_name)}</span> · <a href="${esc(r.url)}" target="_blank" rel="noopener">freesound</a></span></span>
            <input class="sm-name" data-i="${i}" value="${esc(suggestName(r))}" title="${esc(L("Nombre en Tidal", "Name in Tidal"))}">
            <button data-a="fs-add" data-i="${i}">${icon("plus", 13)} ${L("A mi biblioteca", "To my library")}</button></div>`).join("")}</div>
          <div class="row">${sm.page > 1 ? `<button data-a="page" data-d="-1">${icon("back", 13)} ${L("Anteriores", "Previous")}</button>` : ""}${sm.results.next ? `<button data-a="page" data-d="1">${L("Más resultados", "More results")} ${icon("arrow", 13)}</button>` : ""}</div>`;
      }
      html += `<p class="hint">${L("Las licencias CC BY piden citar al autor: Tidal Studio lo apunta solo en <code>samples/CREDITS.md</code>.", "CC BY licenses ask you to credit the author: Tidal Studio records it for you in <code>samples/CREDITS.md</code>.")}</p>`;
    }
  }
  if (sm.tab === "packs") {
    if (!sm.pack) {
      html += `<p class="wz-help">${L("Packs de la comunidad de Tidal y Strudel publicados en GitHub. Explora uno, escucha cada sonido y pulsa <b>Instalar</b>: se descarga a tu biblioteca y ya lo puedes usar con <code>s \"nombre\"</code>.", "Community packs from Tidal and Strudel published on GitHub. Explore one, listen to each sound and press <b>Install</b>: it downloads to your library and you can use it with <code>s \"name\"</code>.")}</p>
        <div class="sm-packs">${PACKS.map((p) => `<div class="sm-pack"><b>${esc(p.name)}</b>${p.lic ? ` <span class="lic">${p.lic}</span>` : ""}<p>${esc(L(p.es, p.en))}</p>
          <div class="row"><button class="primary" data-a="pack-open" data-id="${p.id}">${icon("search", 13)} ${L("Explorar", "Explore")}</button><a href="${p.repo}" target="_blank" rel="noopener">${L("repositorio y licencia", "repository and license")}</a></div></div>`).join("")}</div>
        <form id="sm-pack-url" class="sm-search" style="grid-template-columns:1fr auto;margin-top:12px">
          <input name="url" placeholder="${L("Otro pack: github:usuario/repo o URL de un strudel.json", "Another pack: github:user/repo or a strudel.json URL")}" required>
          <button type="submit">${L("Abrir pack", "Open pack")}</button></form>
        <p class="hint">${L("Más opciones: <b>tidal-drum-machines</b> completo con <code>git clone https://github.com/geikha/tidal-drum-machines samples/packs/tidal-drum-machines</code> (se carga solo al arrancar), o descargas manuales como 99Sounds en «Mis samples».", "More options: the full <b>tidal-drum-machines</b> with <code>git clone https://github.com/geikha/tidal-drum-machines samples/packs/tidal-drum-machines</code> (loaded automatically on start), or manual downloads like 99Sounds in «My samples».")}</p>`;
    } else {
      const P = sm.pack;
      html += `<div class="row"><button data-a="pack-back">${icon("back", 13)} ${L("Todos los packs", "All packs")}</button><b>${esc(P.name)}</b>${P.lic ? `<span class="lic">${P.lic}</span>` : ""}<a href="${esc(P.repo || P.url)}" target="_blank" rel="noopener">${L("licencia", "license")}</a></div>`;
      if (!sm.packIdx) html += `<p class="hint">${L("Cargando el índice del pack…", "Loading the pack index…")}</p>`;
      else if (sm.packIdx.error) html += `<p class="hint">Error: ${esc(sm.packIdx.error)}</p>`;
      else {
        const groups = P.grouped ? [...new Set(sm.packIdx.sounds.map((x) => x.name.split("_")[0]))] : [];
        const q = sm.packQ.toLowerCase();
        const all = sm.packIdx.sounds.filter((x) => (!sm.packGroup || x.name.split("_")[0] === sm.packGroup) && (!q || x.name.toLowerCase().includes(q)));
        const list = all.slice(0, 60);
        html += `<div class="sm-search" style="grid-template-columns:${groups.length ? "1fr 1fr" : "1fr"};margin-top:8px">
          <input id="sm-pack-q" value="${esc(sm.packQ)}" placeholder="${L("Filtrar: bd, snare, conga…", "Filter: bd, snare, conga…")}">
          ${groups.length ? `<select id="sm-pack-group"><option value="">${L(`Todas las máquinas (${groups.length})`, `All machines (${groups.length})`)}</option>${groups.map((g) => `<option ${g === sm.packGroup ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>` : ""}</div>
          ${sm.packGroup && P.id !== "dirt" ? `<button data-a="pack-install-all" class="primary">${icon("plus", 13)} ${L(`Instalar toda la ${esc(sm.packGroup)} (${all.length} sonidos)`, `Install the whole ${esc(sm.packGroup)} (${all.length} sounds)`)}</button>` : ""}
          <p class="hint">${all.length} ${L("sonidos", "sounds")}${all.length > list.length ? L(` (se muestran ${list.length}; filtra para ver más)`, ` (showing ${list.length}; filter to see more)`) : ""}</p>
          <div class="sm-list">${list.map((x) => { const inst = sm.installed[P.url + "|" + x.name]; const type = guessType(x.name); return `<div class="sm-item" style="--k:${KIND_COLOR[typeKind(type)]}" data-sound="${esc(x.name)}">
            <button class="icon-btn sm-play" data-a="hear-pack" data-sound="${esc(x.name)}">${icon("play", 14)}</button>
            <span class="n"><code>${esc(x.name)}</code><span class="d">${x.files.length} ${x.files.length === 1 ? L("archivo", "file") : L("variantes", "variants")} · ${esc(typeName(type))}</span></span>
            ${inst ? useButtons(inst, type) : `${P.id === "dirt" ? `<span class="hint">${L("ya instalado", "already installed")}</span>${useButtons(x.name, type)}` : `<input class="sm-name" value="${esc(safeName(x.name))}" title="${esc(L("Nombre en Tidal", "Name in Tidal"))}">
            <button data-a="pack-install" data-sound="${esc(x.name)}" data-type="${type}">${icon("plus", 13)} ${L("Instalar", "Install")}</button>`}`}</div>`; }).join("")}</div>`;
      }
    }
  }
  body.innerHTML = html;
  if (sm.wave && sm.tab === "mine") paintWave();
}
function suggestName(r) {
  const base = (r.name || "").replace(/\.[a-z0-9]+$/i, "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const n = base.split("_").filter((w) => w.length > 1 && !/^\d+$/.test(w)).slice(0, 3).join("_").slice(0, 30) || "fs";
  return /^\d/.test(n) ? "s" + n : n;
}
function useSample(name, type, mode) {
  if (mode === "swap") {
    const t = selectedTrack();
    const [nm, v] = name.split(":");
    const code = t && swapSound(t.code, nm, v ? +v : null);
    if (!code) return toast(L("La pista seleccionada no tiene un s \"…\" que cambiar.", "The selected track has no s \"…\" to change."));
    t.code = code; t.explain = null; changed(); if (live()) playTrack(t);
    $("#samples").close();
    return say(L(`He cambiado el sonido de ${t.id} a «${name}» sin tocar el ritmo. Fíjate: solo cambian las palabras dentro de s "…"; los ~, * y [ ] siguen igual. Así pruebas sonidos sin reescribir nada.`, `I changed ${t.id}'s sound to «${name}» without touching the rhythm. Notice: only the words inside s "…" change; the ~, * and [ ] stay the same. That way you try sounds without rewriting anything.`), state.options);
  }
  const t = addTrack(name, typeKind(type), starterCode(name, type));
  if (!t) return;
  $("#samples").close();
  if (!(state.options || []).includes(CTL_CHIP())) state.options = [CTL_CHIP(), ...(state.options || [])].slice(0, 6);
  say(L(`Nueva pista ${t.id} con «${name}». En Tidal un sample se elige por su nombre de carpeta, y «:n» elige la variante (${name.split(":")[0]}:0, ${name.split(":")[0]}:1…).`, `New track ${t.id} with «${name}». In Tidal a sample is picked by its folder name, and «:n» picks the variant (${name.split(":")[0]}:0, ${name.split(":")[0]}:1…).`), state.options, { explicacion: explainLocal(t.code).partes });
}
function wireSamples() {
  const body = $("#sm-body");
  $("#samples").addEventListener("close", smStop);
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { smStop(); sm.tab = b.dataset.tab; sm.type = ""; return renderSamples(); }
    if (b.dataset.type !== undefined && b.closest(".sm-types")) { sm.type = b.dataset.type; return renderSamples(); }
    const a = b.dataset.a;
    if (a === "var") { const n = b.dataset.name; sm.variant[n] = Math.max(0, (sm.variant[n] || 0) + +b.dataset.d); renderSamples(); return server.engine && server.engine.simulation ? hearDirt(n, sm.variant[n]) : evalCode(`once $ s "${n}:${sm.variant[n]}"`); }
    if (a === "hear-engine") {
      const n = b.dataset.name;
      if (server.engine && server.engine.simulation && b.dataset.type !== "synth") return hearDirt(n, sm.variant[n] || 0);
      return evalCode(b.dataset.type === "synth" ? `once $ n "0 4 7" # s "${n}"` : `once $ s "${n}:${sm.variant[n] || 0}"`);
    }
    if (a === "wave") { sm.wave = sm.wave && sm.wave.name === b.dataset.name && sm.wave.i === +b.dataset.i ? null : { name: b.dataset.name, i: +b.dataset.i, begin: 0, end: 1 }; await renderSamples(); return drawWave(); }
    if (a === "trim-hear") return playTrim();
    if (a === "trim-new" || a === "trim-apply") return useTrim(a === "trim-new");
    if (a === "hear-file") { smStop(); smAudio = new Audio(`/api/samples/file?name=${encodeURIComponent(b.dataset.name)}&i=${b.dataset.i}`); return smAudio.play().catch(() => {}); }
    if (a === "hear-url") { smStop(); const r = sm.results.results[+b.dataset.i]; smAudio = new Audio(r.preview || r.preview_ogg); return smAudio.play().catch(() => {}); }
    if (a === "use-new" || a === "use-swap") return useSample(b.dataset.name, b.dataset.type, a === "use-new" ? "new" : "swap");
    if (a === "del-sound" || a === "del-file") {
      if (a === "del-sound" && !window.confirm(L(`¿Borrar el sonido «${b.dataset.name}» y todos sus archivos?`, `Delete the sound «${b.dataset.name}» and all its files?`))) return;
      try { sm.mine = await api("/api/samples/delete", { name: b.dataset.name, index: a === "del-file" ? +b.dataset.i : null }); } catch (err) { toast(err.message); }
      return renderSamples();
    }
    if (a === "quick") { sm.q = b.dataset.q; sm.page = 1; return smSearch(); }
    if (a === "pack-open") return openPack(PACKS.find((p) => p.id === b.dataset.id));
    if (a === "pack-back") { sm.pack = null; sm.packIdx = null; return renderSamples(); }
    if (a === "hear-pack") {
      const x = sm.packIdx.sounds.find((y) => y.name === b.dataset.sound);
      sm.packVar = sm.packVar || {}; const i = (sm.packVar[x.name] || 0) % x.files.length; sm.packVar[x.name] = i + 1;
      return playRemote(x.files[i]);
    }
    if (a === "pack-install-all") {
      const list = sm.packIdx.sounds.filter((x) => x.name.split("_")[0] === sm.packGroup && !sm.installed[sm.pack.url + "|" + x.name]);
      b.disabled = true; const names = [];
      for (const [k, x] of list.entries()) {
        b.textContent = L(`Descargando ${k + 1}/${list.length}…`, `Downloading ${k + 1}/${list.length}…`);
        try { const r = await api("/api/samples/pack-install", { url: sm.pack.url, sound: x.name, name: safeName(x.name), type: guessType(x.name) }); sm.installed[sm.pack.url + "|" + x.name] = r.name; names.push(r.name); }
        catch (err) { toast(`${x.name}: ${err.message}`); }
      }
      sm.mine = null; server.samples = null; renderSamples();
      if (names.length) say(L(`Instalada la ${sm.packGroup}: ${names.join(", ")}. Prueba a cambiar los sonidos de tu batería por estos con «Poner en…» o con los controles.`, `Installed the ${sm.packGroup}: ${names.join(", ")}. Try swapping your drum sounds for these with «Use on…» or with the controls.`), state.options);
      return;
    }
    if (a === "pack-install") {
      const row = b.closest(".sm-item"), name = row.querySelector(".sm-name").value;
      b.disabled = true; b.textContent = L("Descargando…", "Downloading…");
      try {
        const r = await api("/api/samples/pack-install", { url: sm.pack.url, sound: b.dataset.sound, name, type: b.dataset.type });
        sm.installed[sm.pack.url + "|" + b.dataset.sound] = r.name; sm.mine = null; server.samples = null; renderSamples();
        say(L(`Instalado «${r.name}» (${r.files} ${r.files === 1 ? "archivo" : "variantes"}) desde ${sm.pack.name}. Pruébalo con s "${r.name}" y cambia de variante con s "${r.name}:1", s "${r.name}:2"…`, `Installed «${r.name}» (${r.files} ${r.files === 1 ? "file" : "variants"}) from ${sm.pack.name}. Try it with s "${r.name}" and switch variants with s "${r.name}:1", s "${r.name}:2"…`), state.options);
      } catch (err) { b.disabled = false; b.textContent = "Error"; toast(err.message); }
      return;
    }
    if (a === "page") { sm.page += +b.dataset.d; return smSearch(); }
    if (a === "fs-add") {
      const i = +b.dataset.i, r = sm.results.results[i];
      const name = body.querySelector(`.sm-name[data-i="${i}"]`).value;
      b.disabled = true; b.textContent = L("Descargando…", "Downloading…");
      try {
        const res = await api("/api/samples/add", { item: r, name, type: guessTypeFrom(sm.q + " " + r.name) });
        sm.mine = null; server.samples = null;
        b.textContent = L(`Añadido: ${res.name}`, `Added: ${res.name}`);
        say(L(`«${r.name}» de ${r.author} ya está en tu biblioteca como «${res.name}» (${r.license_name}). Úsalo con s "${res.name}".${res.loaded ? "" : " Se cargará la próxima vez que arranque el sonido."}`, `«${r.name}» by ${r.author} is now in your library as «${res.name}» (${r.license_name}). Use it with s "${res.name}".${res.loaded ? "" : " It will load the next time the sound engine starts."}`), state.options);
      } catch (err) { b.disabled = false; b.textContent = "Error"; toast(err.message); }
    }
  });
  body.addEventListener("input", (e) => {
    if (e.target.dataset.trim) {
      sm.wave[e.target.dataset.trim] = +e.target.value;
      if (sm.wave.end <= sm.wave.begin + 0.01) { if (e.target.dataset.trim === "begin") sm.wave.end = Math.min(1, sm.wave.begin + 0.01); else sm.wave.begin = Math.max(0, sm.wave.end - 0.01); }
      paintWave(); return;
    }
    if (e.target.id === "sm-pack-q") { sm.packQ = e.target.value; clearTimeout(sm.qT); sm.qT = setTimeout(() => { renderSamples(); const i = $("#sm-pack-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
  });
  body.addEventListener("change", async (e) => {
    if (e.target.id === "sm-pack-group") { sm.packGroup = e.target.value; return renderSamples(); }
    const sel = e.target.closest("select[data-a=set-type]");
    if (sel) { sm.mine = await api("/api/samples/type", { name: sel.dataset.name, type: sel.value }); renderSamples(); }
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "sm-key") {
      await api("/api/config", { samples: { freesound_key: f.key.value } }); sm.keySet = true; return renderSamples();
    }
    if (f.id === "sm-pack-url") return openPack({ id: "custom", name: f.url.value, url: f.url.value });
    if (f.id === "sm-search") { sm.q = f.q.value; sm.license = f.license.value; sm.oneshot = f.oneshot.checked; sm.page = 1; return smSearch(); }
    if (f.id === "sm-upload") {
      const files = [...f.files.files];
      if (!files.length) return toast(L("Elige al menos un archivo de audio.", "Choose at least one audio file."));
      let last;
      for (const file of files) {
        const r = await fetch(`/api/samples/upload?name=${encodeURIComponent(f.name.value)}&type=${f.type.value}&filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
        last = await r.json().catch(() => ({}));
        if (!r.ok) return toast(last.error || "Error");
      }
      sm.mine = null; server.samples = null; await renderSamples();
      say(L(`Subido: «${last.name}» con ${files.length} archivo(s). Pruébalo con s "${last.name}" o s "${last.name}:1" para la segunda variante.`, `Uploaded: «${last.name}» with ${files.length} file(s). Try it with s "${last.name}" or s "${last.name}:1" for the second variant.`), state.options);
    }
  });
}
function guessTypeFrom(t) {
  t = t.toLowerCase();
  const rules = [["bombo", /kick|bd\b|bassdrum/], ["caja", /snare|clap|rim/], ["platos", /hat|cymbal|crash|ride/], ["bajo", /bass|808/], ["voz", /vocal|voice|vox/],
    ["pad", /pad|drone|ambien|field/], ["loop", /loop|break/], ["percusion", /perc|tom|conga|bongo|shaker/], ["melodico", /piano|rhodes|chord|synth|guitar|pluck|key/], ["fx", /fx|noise|vinyl|glitch|riser/]];
  return (rules.find(([, re]) => re.test(t)) || ["otro"])[0];
}
// --- forma de onda y recorte con # begin / # end (Tidal recorta al tocar; el archivo no cambia)
function trimHTML(x) {
  const w = sm.wave;
  return `<div class="sm-trim"><canvas id="sm-wave" width="800" height="90"></canvas>
    <div class="ctl-two"><span>begin</span><div class="ctl-row"><input type="range" data-trim="begin" min="0" max="1" step="0.005" value="${w.begin}"><output id="tb">${fmt(w.begin)}</output></div>
    <span>end</span><div class="ctl-row"><input type="range" data-trim="end" min="0" max="1" step="0.005" value="${w.end}"><output id="te">${fmt(w.end)}</output></div></div>
    <code class="ctl-code" id="trim-code"></code>
    <div class="row"><button data-a="trim-hear">${icon("play", 13)} ${L("Escuchar el recorte", "Hear the cut")}</button>
      <button class="primary" data-a="trim-new">${icon("plus", 13)} ${L("Nueva pista con el recorte", "New track with the cut")}</button>
      ${selectedTrack() ? `<button data-a="trim-apply">${L(`Aplicar a ${selectedTrack().id}`, `Apply to ${selectedTrack().id}`)}</button>` : ""}</div>
    <p class="ctl-ex">${L("begin y end eligen qué trozo del sample suena (0 = principio, 1 = final). Tidal lo recorta al tocar: el archivo no cambia.", "begin and end pick which part of the sample plays (0 = start, 1 = end). Tidal trims it while playing: the file doesn't change.")}</p></div>`;
}
async function drawWave() {
  if (!sm.wave) return;
  try {
    const buf = await (await fetch(`/api/samples/file?name=${encodeURIComponent(sm.wave.name)}&i=${sm.wave.i}`)).arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    sm.wave.audio = await ac.decodeAudioData(buf); sm.wave.ac = ac;
  } catch { sm.wave.audio = null; }
  paintWave();
}
function paintWave() {
  const cv = $("#sm-wave"); if (!cv || !sm.wave) return;
  const w = sm.wave, g = cv.getContext("2d"), W = cv.width, H = cv.height;
  const css = getComputedStyle(document.documentElement);
  g.clearRect(0, 0, W, H);
  g.fillStyle = css.getPropertyValue("--sunk"); g.fillRect(0, 0, W, H);
  if (w.audio) {
    const d = w.audio.getChannelData(0), step = Math.max(1, Math.floor(d.length / W));
    for (let x = 0; x < W; x++) {
      let mn = 1, mx = -1; for (let j = x * step; j < Math.min(d.length, (x + 1) * step); j++) { const v = d[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const inside = x / W >= w.begin && x / W <= w.end;
      g.fillStyle = inside ? css.getPropertyValue("--accent") : css.getPropertyValue("--rule-strong");
      g.fillRect(x, (1 - mx) * H / 2, 1, Math.max(1, (mx - mn) * H / 2));
    }
  } else { g.fillStyle = css.getPropertyValue("--ink-3"); g.font = "14px sans-serif"; g.fillText(L("No se pudo leer el audio en el navegador", "Couldn't read the audio in the browser"), 12, H / 2); }
  g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, 0, w.begin * W, H); g.fillRect(w.end * W, 0, W - w.end * W, H);
  $("#tb").textContent = fmt(w.begin); $("#te").textContent = fmt(w.end);
  $("#trim-code").textContent = trimCode();
}
const trimCode = () => `s "${sm.wave.name}${sm.wave.i ? ":" + sm.wave.i : ""}"${sm.wave.begin > 0 ? ` # begin ${fmt(sm.wave.begin)}` : ""}${sm.wave.end < 1 ? ` # end ${fmt(sm.wave.end)}` : ""}`;
function playTrim() {
  const w = sm.wave; if (!w || !w.audio) return;
  const src = w.ac.createBufferSource(); src.buffer = w.audio; src.connect(w.ac.destination);
  const d = w.audio.duration; src.start(0, w.begin * d, Math.max(0.01, (w.end - w.begin) * d));
}
function useTrim(asNew) {
  const w = sm.wave; if (!w) return;
  if (asNew) {
    const x = (sm.mine?.sounds || []).find((y) => y.name === w.name);
    const t = addTrack(w.name, typeKind(x?.type || "otro"), trimCode()); if (!t) return;
  } else {
    const t = selectedTrack(); if (!t) return;
    let code = swapSound(t.code, w.name, w.i || null) || trimCode();
    code = w.begin > 0 ? setParam(code, "begin", w.begin) : code.replace(/\s*#\s*begin\s+[\d.]+/, "");
    code = w.end < 1 ? setParam(code, "end", w.end) : code.replace(/\s*#\s*end\s+[\d.]+/, "");
    t.code = code; changed(); if (live()) playTrack(t);
  }
  $("#samples").close();
  say(L(`Listo: ${trimCode()}. # begin y # end son parámetros de Tidal: el mismo sample puede sonar entero o solo un trozo, en cada pista distinto.`, `Done: ${trimCode()}. # begin and # end are Tidal parameters: the same sample can play whole or just a slice, differently on each track.`), state.options);
}
async function openPack(p) {
  sm.pack = p; sm.packIdx = null; sm.packQ = ""; sm.packGroup = ""; renderSamples();
  try { sm.packIdx = await api("/api/samples/pack", { url: p.url }); if (p.id === "custom") sm.pack = { ...p, url: sm.packIdx.url }; }
  catch (e) { sm.packIdx = { error: e.message }; }
  renderSamples();
}
function playRemote(url) {
  smStop(); smAudio = new Audio("/api/samples/remote?url=" + encodeURIComponent(url));
  smAudio.play().catch(() => toast(L("No se pudo reproducir este archivo en el navegador.", "Couldn't play this file in the browser.")));
}
// Sin motor de sonido, los sonidos incluidos se escuchan desde el repositorio Dirt-Samples
async function hearDirt(name, v) {
  try {
    if (!sm.dirt) sm.dirt = await api("/api/samples/pack", { url: DIRT_INDEX });
    const x = sm.dirt.sounds.find((y) => y.name === name);
    if (!x) return toast(L(`«${name}» no está en Dirt-Samples: es un sintetizador o necesita el motor.`, `«${name}» isn't in Dirt-Samples: it's a synth or needs the engine.`));
    playRemote(x.files[v % x.files.length]);
  } catch (e) { toast(e.message); }
}
async function smSearch() {
  sm.results = { count: 0, results: [] };
  $("#sm-body").querySelector(".sm-list")?.replaceChildren();
  try { sm.results = await api("/api/samples/search", { query: sm.q, license: sm.license, oneshot: sm.oneshot, page: sm.page }); }
  catch (e) { sm.results = { error: e.message }; }
  renderSamples();
}

// ------------------------------------------------------------------ GitHub
function projectPayload() {
  return { name: state.name || L("Canción sin título", "Untitled song"), bpm: state.bpm, style: state.style,
    projectId: state.projectId, tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted })) };
}
function needGitHub() {
  if (server.github) return false;
  openSettings().then(() => { $("#gh-section").open = true; $("#gh-msg").textContent = L("Configura GitHub para guardar versiones.", "Set up GitHub to save versions."); });
  return true;
}
function openGitHubSave() {
  if (needGitHub()) return;
  if (!state.tracks.length) return toast(L("Aún no hay nada que guardar: añade alguna pista primero.", "Nothing to save yet: add a track first."));
  const p = projectPayload();
  const first = !state.github?.slug;
  const def = first ? L(`Primera versión de «${p.name}»`, `First version of «${p.name}»`)
    : L(`«${p.name}»: ${p.tracks.length} pistas, ${p.bpm} BPM`, `«${p.name}»: ${p.tracks.length} tracks, ${p.bpm} BPM`);
  $("#np-kicker").innerHTML = icon("cloud", 16) + " GitHub";
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">${L("Guardar una versión", "Save a version")}</h2>
    <p class="wz-help">${L("Cada guardado es un <b>commit</b>: una foto de tu canción que queda en el historial. Escribe qué has cambiado, así luego sabrás a qué versión volver.", "Each save is a <b>commit</b>: a snapshot of your song kept in the history. Write what you changed, so later you'll know which version to go back to.")}</p>
    <label>${L("¿Qué has cambiado?", "What did you change?")}<input id="gh-commit" class="gh-msg-input" value="${esc(def)}"></label>
    <div class="gh-files">${esc(`${state.github?.slug || slugify(p.name)}/`)}<br>&nbsp;&nbsp;song.tidal &nbsp;${L("código para cualquier editor de Tidal", "code for any Tidal editor")}<br>&nbsp;&nbsp;song.json &nbsp;&nbsp;${L("el proyecto para abrirlo aquí", "the project, to open it here")}<br>&nbsp;&nbsp;README.md &nbsp;&nbsp;${L("ficha de la canción", "song sheet")}</div>
    <p id="gh-save-msg" class="hint"></p>
    <div class="wz-nav"><button data-a="hist">${icon("history", 14)} ${L("Ver versiones", "See versions")}</button>
      <div class="right"><button class="primary" data-a="save">${icon("cloud", 14)} ${L("Guardar en GitHub", "Save to GitHub")}</button></div></div>`;
  body.onclick = async (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    if (btn.dataset.a === "hist") return openProjects("github");
    if (btn.dataset.a !== "save") return;
    btn.disabled = true; $("#gh-save-msg").textContent = L("Guardando…", "Saving…");
    try {
      const r = await api("/api/github/save", { project: projectPayload(), message: $("#gh-commit").value, slug: state.github?.slug });
      state.github = { slug: r.slug, ref: null }; save();
      $("#newproj").close();
      if (r.unchanged) return say(L("No había cambios desde la última versión, así que no he creado un commit nuevo.", "Nothing changed since the last version, so I didn't create a new commit."), state.options, { links: [{ href: r.html_url, label: L("Ver en GitHub", "View on GitHub") }] });
      say(first
        ? L("Guardada la primera versión en GitHub. A partir de ahora cada guardado es un commit nuevo: puedes compararlos en GitHub o volver a cualquiera desde Mis proyectos → GitHub. Truco de productor: guarda antes de un cambio grande, así experimentas sin miedo.", "First version saved to GitHub. From now on every save is a new commit: you can compare them on GitHub or go back to any of them from My projects → GitHub. Producer tip: save before a big change, so you can experiment without fear.")
        : L("Nueva versión guardada en GitHub.", "New version saved to GitHub."),
        state.options, { links: [{ href: r.html_url, label: L("Carpeta de la canción", "Song folder") }, { href: r.commit_url, label: L("Este commit", "This commit") }] });
    } catch (err) { btn.disabled = false; $("#gh-save-msg").textContent = "Error: " + err.message; }
  };
  if (!$("#newproj").open) $("#newproj").showModal();
  setTimeout(() => $("#gh-commit")?.select(), 30);
}
function slugify(n) {
  return (n || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "cancion";
}
async function renderGitHubList(box) {
  if (!server.github) {
    box.innerHTML = `<p class="hint">${L("GitHub no está configurado.", "GitHub isn't set up.")}</p><button data-a="gh-setup">${icon("settings", 14)} ${L("Configurar GitHub", "Set up GitHub")}</button>`;
    return;
  }
  box.innerHTML = `<p class="hint">${L("Cargando canciones de GitHub…", "Loading songs from GitHub…")}</p>`;
  try {
    const r = await api("/api/github/list", {});
    box.innerHTML = r.songs.length ? r.songs.map((s) => `<div class="np-item ${s.slug === state.github?.slug ? "current" : ""}" data-slug="${esc(s.slug)}">
      <span class="n">${esc(s.slug)}</span>
      <button data-a="versions">${icon("history", 14)} ${L("Versiones", "Versions")}</button>
      <button data-a="gh-open">${L("Abrir", "Open")}</button></div>`).join("")
      : `<p class="hint">${L("Todavía no hay canciones en el repositorio. Guarda una con el botón de la nube.", "No songs in the repository yet. Save one with the cloud button.")}</p>`;
  } catch (e) { box.innerHTML = `<p class="hint">Error: ${esc(e.message)}</p>`; }
}
async function renderVersions(box, slug) {
  box.innerHTML = `<p class="hint">${L("Cargando versiones…", "Loading versions…")}</p>`;
  try {
    const r = await api("/api/github/history", { slug });
    box.innerHTML = `<button data-a="gh-back">${icon("back", 14)} ${L("Todas las canciones", "All songs")}</button>
      <p class="wz-help" style="margin:8px 0">${L(`Versiones de «${esc(slug)}», de la más nueva a la más antigua:`, `Versions of «${esc(slug)}», newest first:`)}</p>` +
      r.commits.map((c, i) => `<div class="np-item" data-slug="${esc(slug)}" data-ref="${esc(c.sha)}">
        <span class="n">${esc(c.message.split("\n")[0])}<span class="d"><span class="sha">${esc(c.sha.slice(0, 7))}</span> · ${c.date ? new Date(c.date).toLocaleString(L("es-ES", "en-GB")) : ""}${i === 0 ? " · " + L("la última", "latest") : ""}</span></span>
        <a href="${esc(c.html_url)}" target="_blank" rel="noopener" class="icon-btn" title="GitHub">${icon("link", 16)}</a>
        <button data-a="gh-open">${L("Abrir esta versión", "Open this version")}</button></div>`).join("");
  } catch (e) { box.innerHTML = `<p class="hint">Error: ${esc(e.message)}</p>`; }
}
async function openGitHubSong(slug, ref) {
  const data = await api("/api/github/load", { slug, ref });
  save(); evalCode("hush");
  const local = listProjects().find((x) => x.id === data.projectId);
  state = { ...FRESH(), ...(local ? local.data : {}), name: data.name || slug, bpm: data.bpm || 120, style: data.style || "",
    tracks: (data.tracks || []).map((t) => ({ ...t })), projectId: data.projectId || "p" + Date.now(),
    github: { slug, ref: ref || null }, trying: null };
  // Una versión antigua se abre como copia para no pisar la actual
  if (ref) { state.projectId = "p" + Date.now(); state.name = `${state.name} (${ref.slice(0, 7)})`; }
  $("#newproj").close(); renderAll(); if (live()) playAll();
  sysMsg(ref ? L(`Abierta la versión ${ref.slice(0, 7)} de «${slug}». Si la guardas en GitHub, pasará a ser la versión más nueva.`, `Opened version ${ref.slice(0, 7)} of «${slug}». If you save it to GitHub, it becomes the newest version.`)
    : L(`Abierta «${slug}» desde GitHub.`, `Opened «${slug}» from GitHub.`));
}
function confirmDelete(id) {
  const list = listProjects();
  const p = list.find((x) => x.id === id);
  if (!p) return false;
  if (!window.confirm(L(`¿Borrar «${p.name}»? No se puede deshacer.`, `Delete «${p.name}»? This can't be undone.`))) return false;
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
    <p class="wz-help">${esc(step.ayuda)}${step.multi ? L(` <b>Puedes elegir ${step.multi > 3 ? "varios" : "hasta " + step.multi}.</b>`, ` <b>You can choose ${step.multi > 3 ? "several" : "up to " + step.multi}.</b>`) : ""}${bd.sel.estilo && bd.i > 0 ? L(" Ya te he dejado marcadas mis recomendaciones: cámbialas a tu gusto.", " I've already marked my recommendations: change them as you like.") : ""}</p>
    <div class="opt-grid">${step.opciones.map((o) => `<button class="opt ${isOn(o.id) ? "on" : ""}" data-id="${esc(o.id)}">
      <b>${esc(o.titulo)} ${o.fit ? `<span class="fit">${L("encaja", "fits")}</span>` : ""}</b><span>${esc(o.desc)}</span>${o.codigo ? `<code>${esc(o.codigo)}</code>` : ""}</button>`).join("")}</div>
    ${bd.sel.estilo ? `<details class="bd-preview"><summary>${L("Ver el código que llevas hasta ahora", "See the code so far")}</summary><pre>${esc(compCode(compose(bd.sel)))}</pre></details>` : ""}
    <div class="wz-nav">
      <button data-a="back" ${bd.i === 0 ? "disabled" : ""}>${icon("back", 16)} ${L("Atrás", "Back")}</button>
      <div class="right"><button data-a="next" class="primary" ${bd.sel.estilo ? "" : "disabled"}>${bd.i === st.length - 1 ? L("Ver resumen", "See summary") : L("Siguiente", "Next")} ${icon("arrow", 16)}</button></div>
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
    <span class="wz-kicker">${L("Resumen", "Summary")}</span>
    <h2 class="q">${L(`Tu proyecto ${esc(st.nombre)} a ${c.bpm} BPM`, `Your ${esc(st.nombre)} project at ${c.bpm} BPM`)}</h2>
    <p class="wz-help">${L(`${c.tracks.length} pistas. Así queda el código: cada línea <code>dN $ …</code> es una pista que suena a la vez que las demás.`, `${c.tracks.length} tracks. Here's the code: each <code>dN $ …</code> line is a track that plays at the same time as the others.`)}</p>
    <ul class="parts">${items}</ul>
    <div class="idea-note"><b>${L("Estructura.", "Structure.")}</b> ${esc(STRUCTURE_EXPLAIN[bd.sel.estructura] || "")}</div>
    <details class="bd-preview" open><summary>${L("Código completo", "Full code")}</summary><pre>${esc(compCode(c))}</pre></details>
    <label class="hint" style="display:block;margin-top:12px">${L("Nombre del proyecto", "Project name")} <input id="bd-name" style="width:100%;margin-top:4px" value="${esc(st.nombre + " · " + new Date().toLocaleDateString(L("es-ES", "en-GB")))}"></label>
    <div class="wz-nav">
      <button data-a="back">${icon("back", 16)} ${L("Atrás", "Back")}</button>
      <div class="right"><button data-a="create" class="primary">${icon("play", 14)} ${L("Crear proyecto", "Create project")}</button></div>
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
  state.name = name || L("Proyecto sin título", "Untitled project");
  state.style = bd.sel.estilo; state.bpm = c.bpm; state.tracks = c.tracks; state.step = "libre"; state.selected = c.tracks[0]?.id || null;
  renderAll();
  playAll();
  const efectos = (bd.sel.efectos || []).map((id) => EFFECTS.find((e) => e.id === id)).filter(Boolean);
  const explicacion = [
    { fragmento: cps(c.bpm), explicacion: L(`La velocidad: ${c.bpm} BPM.`, `The tempo: ${c.bpm} BPM.`) },
    ...c.tracks.slice(0, 7).map((t) => ({ fragmento: `${t.id} $ …`, explicacion: L(`${t.name}. Pulsa «Explícame» en la pista para ver cada trozo de su código.`, `${t.name}. Press «Explain» on the track to see each piece of its code.`) })),
    ...efectos.map((e) => ({ fragmento: e.codigo, explicacion: e.desc })),
  ];
  say(L(`¡Proyecto «${state.name}» creado! Ya está sonando.\n\n${STRUCTURE_EXPLAIN[bd.sel.estructura] || ""}\n\nAsí está montado:`, `Project «${state.name}» created! It's playing.\n\n${STRUCTURE_EXPLAIN[bd.sel.estructura] || ""}\n\nThis is how it's built:`),
    [L("¿Qué hago ahora?", "What do I do now?"), L("Dame otra idea", "Give me another idea"), L("Explícame la canción", "Explain the song")],
    { explicacion, reto: L("Silencia una pista con el botón del altavoz y escucha qué papel cumple en la canción. Luego vuelve a activarla.", "Mute a track with the speaker button and hear what role it plays in the song. Then turn it back on.") });
  changed();
}

// ------------------------------------------------------------------ estado del servidor
function setPill(el, cls, iconName, text) { el.className = "pill " + cls; el.innerHTML = icon(iconName, 14) + `<span>${esc(text)}</span>`; }
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    server.llm = s.llm_configured; server.engine = s.engine; server.github = s.github_configured;
    syncSounds(s.engine && s.engine.sounds_rev, api);
    refreshHighlights();
    const e = s.engine, pe = $("#st-engine");
    if (e.tidal_running && e.superdirt_ready) setPill(pe, "ok", "speaker", L("Sonido listo", "Sound ready"));
    else if (e.tidal_running || e.sc_running) setPill(pe, "warn", "speaker", L("Arrancando sonido…", "Starting sound…"));
    else if (!e.ghci_path || !e.sclang_path) setPill(pe, "bad", "mute", L("Simulación (falta instalar)", "Simulation (not installed)"));
    else setPill(pe, "warn", "mute", L("Motor parado", "Engine stopped"));
    setPill($("#st-llm"), s.llm_configured ? "ok" : "warn", "brain",
      s.llm_configured ? L(`IA: ${s.provider === "anthropic" ? "Claude" : s.provider === "claudecode" ? "Claude (suscripción)" : "OpenAI-compatible"}`, `AI: ${s.provider === "anthropic" ? "Claude" : s.provider === "claudecode" ? "Claude (subscription)" : "OpenAI-compatible"}`) : L("IA sin conectar", "AI not connected"));
    $("#assistant-mode").textContent = s.llm_configured && !state.offline ? "" : L("· guía sin IA", "· guide without AI");
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
  $("#cc-path").value = c.claudecode?.path || ""; $("#cc-model").value = c.claudecode?.model || "";
  const preset = [...$("#oa-preset").options].find((o) => o.value.split("|")[0] === c.openai.base_url);
  $("#oa-preset").value = preset ? preset.value : "custom";
  const g = c.github || {};
  $("#gh-token").value = g.token || ""; $("#gh-repo").value = g.repo || "";
  $("#gh-branch").value = g.branch || "main"; $("#gh-folder").value = g.folder || "songs";
  $("#gh-msg").textContent = ""; $("#btn-gh-create").hidden = true;
  toggleProvider(); $("#test-msg").textContent = "";
  $("#settings").showModal();
}
function toggleProvider() {
  const p = document.querySelector("input[name=provider]:checked").value;
  $("#fs-openai").hidden = p !== "openai"; $("#fs-anthropic").hidden = p !== "anthropic"; $("#fs-claudecode").hidden = p !== "claudecode";
}
async function saveSettings() {
  await api("/api/config", {
    provider: document.querySelector("input[name=provider]:checked").value,
    openai: { base_url: $("#oa-url").value, api_key: $("#oa-key").value, model: $("#oa-model").value },
    anthropic: { api_key: $("#an-key").value, model: $("#an-model").value },
    claudecode: { path: $("#cc-path").value, model: $("#cc-model").value },
    github: { token: $("#gh-token").value, repo: $("#gh-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""),
      branch: $("#gh-branch").value, folder: $("#gh-folder").value },
  });
  state.offline = false; save();
  await refreshStatus();
}

// ------------------------------------------------------------------ arranque
function translateStatic() {
  document.querySelectorAll("[data-t]").forEach((el) => { if (LANG === "en") el.textContent = el.dataset.t; });
  document.querySelectorAll("[data-th]").forEach((el) => { if (LANG === "en") el.innerHTML = el.dataset.th; });
  document.querySelectorAll("[data-tt]").forEach((el) => { if (LANG === "en") el.title = el.dataset.tt; });
  document.querySelectorAll("[data-tp]").forEach((el) => { if (LANG === "en") el.placeholder = el.dataset.tp; });
  const b = $("#btn-lang");
  b.textContent = LANG === "en" ? "ES" : "EN";
  b.title = LANG === "en" ? "Cambiar a español" : "Switch to English";
  b.onclick = () => { save(); setLang(LANG === "en" ? "es" : "en"); };
}

// ------------------------------------------------------------------ compartir y grabar
function b64url(str) { return btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); }
function encodeSong() {
  return b64url(JSON.stringify({ v: 1, name: state.name, bpm: state.bpm, style: state.style, tracks: state.tracks.map((t) => [t.id, t.name, t.kind, t.code, t.muted ? 1 : 0]) }));
}
function importSharedSong() {
  const m = location.hash.match(/^#song=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname);
  try {
    const d = JSON.parse(unb64url(m[1]));
    const tracks = (d.tracks || []).filter((t) => Array.isArray(t) && /^d([1-9]|1[0-2])$/.test(t[0])).map(([id, name, kind, code, muted]) => ({ id, name: String(name || id).slice(0, 60), kind: String(kind || "textura"), code: String(code || "").slice(0, 2000), muted: !!muted }));
    if (!tracks.length) return;
    save();
    state = { ...FRESH(), name: String(d.name || L("Canción compartida", "Shared song")).slice(0, 80), bpm: Math.max(40, Math.min(220, +d.bpm || 120)), style: STYLES[d.style] ? d.style : "", tracks, step: "libre" };
    state.chat = [{ role: "assistant", content: L(`Has abierto «${state.name}», una canción compartida (${tracks.length} pistas, ${state.bpm} BPM). Se ha guardado como proyecto nuevo; tu proyecto anterior sigue en Mis proyectos. Pulsa Tocar todo para escucharla, o pídeme que te explique cómo está hecha.`, `You opened «${state.name}», a shared song (${tracks.length} tracks, ${state.bpm} BPM). It's saved as a new project; your previous one is still in My projects. Press Play all to hear it, or ask me how it's made.`) }];
    state.options = [L("Explícame cómo está hecha", "Explain how it's made"), CTL_CHIP()];
    save();
  } catch { /* enlace roto: seguimos con lo que había */ }
}
let recTimer = null, recStart = 0;
async function toggleRecord() {
  const b = $("#btn-rec");
  if (!recTimer) {
    try {
      const r = await api("/api/record/start", { name: state.name || "cancion" });
      if (live() && state.tracks.length) playAll();
      recStart = Date.now(); b.classList.add("on"); b.dataset.file = r.name;
      recTimer = setInterval(() => { const s = Math.floor((Date.now() - recStart) / 1000); $("#rec-label").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 500);
      toast(L("Grabando… pulsa otra vez para parar.", "Recording… press again to stop."));
    } catch (e) { toast(e.message); }
    return;
  }
  clearInterval(recTimer); recTimer = null; b.classList.remove("on"); $("#rec-label").textContent = L("Grabar", "Record");
  await api("/api/record/stop", {}).catch(() => {});
  const name = b.dataset.file;
  setTimeout(() => say(L(`Grabación lista: ${name} (carpeta recordings/). Es un WAV de lo que sonaba por la salida de SuperCollider.`, `Recording ready: ${name} (recordings/ folder). It's a WAV of whatever came out of SuperCollider.`), state.options,
    { links: [{ href: `/api/recordings/file?name=${encodeURIComponent(name)}`, label: L("Descargar WAV", "Download WAV") }] }), 600);
}

// ------------------------------------------------------------------ tutorial
function runTour() {
  startTour({
    state: () => state,
    closeDialogs: () => document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
    openInstrument,
    tab: (n) => document.querySelector(`.tab[data-tab="${n}"]`)?.click(),
    pane: (n) => document.querySelector(`.ltab[data-pane="${n}"]`)?.click(),
  });
}

function init() {
  load();
  importSharedSong();
  // Si cambió el idioma, Maestro vuelve a saludar en el nuevo idioma (las pistas se mantienen)
  if (state.lang !== LANG) { state.chat = []; state.options = []; state.ideas = []; state.lang = LANG; }
  translateStatic();
  hydrateIcons();
  $("#bpm").value = state.bpm;
  $("#proj-name").value = state.name || "";
  renderCatalog(); renderPalette(); renderTracks(); renderProgress(); renderIdeas(); $("#code").value = buildCode(); attachHighlight($("#code"));
  if (!state.chat.length) greet(); else renderChat();
  // Primera visita: el tutorial arranca solo (se puede cerrar en el primer paso)
  if (!tourSeen() && !state.tracks.length && !location.hash) setTimeout(runTour, 900);

  $("#bpm").addEventListener("change", (e) => {
    state.bpm = Math.max(40, Math.min(220, parseInt(e.target.value) || 120)); e.target.value = state.bpm;
    changed(); evalCode(cps(state.bpm));
  });
  $("#btn-play").onclick = playAll;
  $("#btn-hush").onclick = hushAll;
  $("#style-filter").onchange = (e) => { state.style = e.target.value; save(); renderCatalog(); renderIdeas(); };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); const i = $("#chat-input"); send(i.value); i.value = ""; };
  $("#btn-more-ideas").onclick = () => {
    if (state.trying) return;
    if (server.llm && !state.offline) return send(L("Dame otra idea para mejorar la canción, y explícame qué concepto musical enseña.", "Give me another idea to improve the song, and explain what musical concept it teaches."));
    state.ideas = []; localSuggestions(state, 2, true); flavorTurn++; renderIdeas();
  };
  $("#flavors").onclick = (e) => {
    const k = e.target.closest("button")?.dataset.f;
    if (!k || state.trying) return;
    if (!state.tracks.length) return toast(L("Primero crea algo de música (aunque sea un bombo) para poder transformarla.", "First make some music (even just a kick) so it can be transformed."));
    const idea = flavorIdea(k, state.tracks);
    if (idea) tryIdea([idea], 0);
  };

  document.querySelectorAll(".ltab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".ltab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".lpane").forEach((x) => x.classList.toggle("active", x.id === "pane-" + b.dataset.pane));
  });
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "code") { $("#code").value = buildCode(); refreshHighlights(); }
    if (b.dataset.tab === "log") refreshLog();
    if (b.dataset.tab === "blocks") renderBlocks();
    if (b.dataset.tab === "arrange") renderArrange();
    if (b.dataset.tab === "mixer") renderMixer(true);
    if (b.dataset.tab !== "blocks") bkClose();
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
    $("#code-msg").textContent = L("Maestro está leyendo el código…", "Maestro is reading the code…");
    const ex = await explain(code, L("canción completa", "whole song"));
    $("#code-msg").textContent = L("La explicación está en el chat de Maestro.", "The explanation is in Maestro's chat.");
    say(ex.resumen || L("Así funciona tu código:", "This is how your code works:"), state.options, { explicacion: ex.partes, reto: ex.reto });
  };
  $("#code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#btn-apply-code").click(); }
    if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
  });
  $("#btn-download-code").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buildCode()], { type: "text/plain" }));
    a.download = `${slugify(state.name || "cancion")}.tidal`; a.click(); URL.revokeObjectURL(a.href);
    $("#code-msg").textContent = L("Descargado: ábrelo en cualquier editor de TidalCycles (Pulsar, VS Code, Vim…).", "Downloaded: open it in any TidalCycles editor (Pulsar, VS Code, Vim…).");
  };
  $("#btn-share").onclick = async () => {
    const url = `${location.origin}${location.pathname}#song=${encodeSong()}`;
    try { await navigator.clipboard.writeText(url); } catch { /* sin portapapeles */ }
    $("#code-msg").textContent = L("Enlace copiado. Quien lo abra con Tidal Studio instalado verá tu canción (todo va dentro del enlace).", "Link copied. Anyone opening it with Tidal Studio installed will see your song (everything is inside the link).");
    say(L("Te he copiado un enlace con tu canción dentro (código, BPM y nombres de pista). Pégalo a quien quieras: al abrirlo en su Tidal Studio se carga como proyecto nuevo.", "I copied a link with your song inside (code, BPM and track names). Share it: opening it in Tidal Studio loads it as a new project."), state.options, { links: [{ href: url, label: L("Enlace de la canción", "Song link") }] });
  };
  $("#btn-rec").onclick = toggleRecord;
  $("#btn-copy-code").onclick = () => navigator.clipboard.writeText($("#code").value).then(() => $("#code-msg").textContent = L("Copiado", "Copied"));
  $("#btn-engine-start").onclick = async () => { await api("/api/engine/start", {}); refreshStatus(); };
  $("#btn-engine-stop").onclick = async () => { await api("/api/engine/stop", {}); refreshStatus(); };

  $("#btn-settings").onclick = openSettings;
  $("#btn-new").onclick = openNewProject;
  $("#btn-projects").onclick = () => openProjects();
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
  $("#btn-gh").onclick = openGitHubSave;
  $("#btn-samples").onclick = () => openSamples();
  $("#btn-tour").onclick = runTour;
  wireInstrument();
  wireSamples();
  wireControls();
  wireArrange();
  wireBlocks();
  wireMixer();
  initHistory(state); renderHistoryButtons();
  $("#btn-undo").onclick = doUndo;
  $("#btn-redo").onclick = doRedo;
  $("#btn-history").onclick = openHistory;
  $("#hist-list").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; $("#history").close(); restoreSong(histGo(+b.dataset.i), L("Has vuelto a esa versión. Puedes rehacer para volver.", "You went back to that version. Redo takes you forward again.")); };
  $("#btn-clear-chat").onclick = clearChat;
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return; // ahí manda el deshacer del navegador
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
  });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !(e.target.closest && e.target.closest("input, textarea"))) { e.preventDefault(); doRedo(); } });
  $("#btn-gh-test").onclick = async () => {
    const m = $("#gh-msg"); m.textContent = L("Probando…", "Testing…"); $("#btn-gh-create").hidden = true;
    try {
      await saveSettings();
      const r = await api("/api/github/test", {});
      if (!r.repo) m.textContent = L(`Conectado como ${r.login}. Ahora escribe el repositorio.`, `Connected as ${r.login}. Now type the repository.`);
      else if (!r.repo_exists) { m.textContent = L(`Conectado como ${r.login}, pero ${r.repo} no existe.`, `Connected as ${r.login}, but ${r.repo} doesn't exist.`); $("#btn-gh-create").hidden = false; }
      else m.textContent = L(`Listo: ${r.login} → ${r.repo}${r.private ? " (privado)" : " (público)"}`, `Ready: ${r.login} → ${r.repo}${r.private ? " (private)" : " (public)"}`)
        + (r.can_push ? "" : L(". Ojo: sin permiso de escritura.", ". Careful: no write permission."));
    } catch (e) { m.textContent = "Error: " + e.message; }
  };
  $("#btn-gh-create").onclick = async () => {
    const m = $("#gh-msg"); m.textContent = L("Creando…", "Creating…");
    try { const r = await api("/api/github/create-repo", {}); m.textContent = L(`Creado: ${r.full_name} (privado)`, `Created: ${r.full_name} (private)`); $("#btn-gh-create").hidden = true; }
    catch (e) { m.textContent = "Error: " + e.message; }
  };
  $("#btn-test").onclick = async () => {
    $("#test-msg").textContent = L("Probando…", "Testing…");
    try { await saveSettings(); const r = await api("/api/llm/test", {}); $("#test-msg").textContent = L("Conectado: ", "Connected: ") + r.reply; }
    catch (e) { $("#test-msg").textContent = "Error: " + e.message; }
  };

  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(refreshLog, 1500);
}

init();
