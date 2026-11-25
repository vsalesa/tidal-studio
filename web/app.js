import { L, LANG, setLang } from "./i18n.js";
import { STYLES, CATEGORIES, COMPONENTS, byId } from "./catalog.js";
import { compIcon } from "./comp-icons.js";
import { startTour, stopTour, tourFlag, tourSeen } from "./tour.js";
import { INSTRUMENTS, instById, instThumb, instArt, photoCredit, DRUM_PIECES, drumKitSVG, drumCode, melodyCode, keyboardHTML, noteName, beep, stopBeeps } from "./instruments.js";
import { icon, hydrateIcons } from "./icons.js";
import { attachHighlight, refreshHighlights, syncSounds, setPlayRanges } from "./code-hl.js";
import { startPlayhead, noteEval, setTempo, rangesAt, blockKeysAt, cycleOf } from "./playhead.js";
import { initTimeline, renderTimeline, paintTimeline } from "./timeline.js";
import { explainLocal } from "./explain.js";
import { localSuggestions, CODE_CONCEPTS, MUSIC_CONCEPTS, retoFor } from "./suggest.js";
import { QUESTIONS, reactLocal, buildLocalPlan } from "./wizard.js";
import { FLAVORS, flavorIdea } from "./flavors.js";
import { diagnose, fixLocal, WISHES, wishLabel } from "./doctor.js";
import { songBlocksHTML, blockInfo, fxChipHTML, fxSwitch, canBypass } from "./blocks.js";
import { applyEdit, partOf, WRAPS, ADD_PARAMS, paramRange, effectsOf, elementsOf } from "./edit.js";
import { mixerHTML, mixCodeHTML, mixBadgeHTML, mixSuffix, mixLine, parseMixLine, audible, setMix, mixOf, dbText } from "./mixer.js";
import { cardCode, cardFromPos } from "./card.js";
import { initHistory, record, flushPending, undo as histUndo, redo as histRedo, go as histGo, entries as histEntries, canUndo, canRedo, resetHistory, stashHistory, restoreHistory, setUndoSteps } from "./history.js";
import { arrangeHTML, barsOf, setMask, PRESETS as AR_PRESETS } from "./arrange.js";
import { controlsFor, controlsHTML, normalizeControls, setParam, getParam, fmt, fixNegatives, fromPos, gridFrom, gridToCode, PARAMS as CTL_PARAMS, extApply, extState } from "./controls.js";
import { TYPES as SAMPLE_TYPES, BUILTIN, typeName, typeKind, starterCode, swapSound, PACKS, DIRT_INDEX, guessType, safeName } from "./samples.js";
import { GROUPS, BLOCKS, LEVELS, blockName, blockDesc, groupName, applyBlock } from "./palette.js";
import { COURSES, courseById, courseFor, courseSounds, finalTracks, maskArr, courseProgress, markStepDone } from "./courses.js";
// El curso activo, con su variante (0.17: cumbia colombiana, sonidera, villera o chicha)
const curCourse = () => (state.course ? courseFor(state.course.id, state.course.variant) : null);
// El primer sonido de una pista: s "x" / # s "x" (sin el «:n»)
const soundOf = (code) => { const m = /(?:^|[\s(#$])(?:s|sound)\s+"\[?\s*([A-Za-z][\w.]*)/.exec(code || ""); return m ? m[1] : ""; };
import { skillsLineHTML, skillsDialogHTML, chooseHTML, countUse, decisionsHTML, traceHTML } from "./skills.js";
import { variantsHTML, variantsContext, variantsEnabled, setVariantsEnabled, LETTERS, blindStart, BLIND, recentOptions } from "./variants.js";
import { guardChanges, blockedText, lockRowHTML, toggleLock, isLocked, mixLocked } from "./locks.js";
import { initListen, recordVote, songContext } from "./listen.js";
import { initMonitor } from "./monitor.js";
import { initScore, linkPart, unlinkTrack, scoreBadgeHTML, scoreBarHTML, scoreBarAction, adoptScore } from "./score.js";
import { fetchHTML, fetchContext, fetchEnabled, setFetchEnabled } from "./fetchcard.js";
import { planHTML, planContext, planEnabled, setPlanEnabled, newPlan, nextStep as nextPlanStep, planDone, PLAN_START, PLAN_STEPWISE, PLAN_ALL, PLAN_SPLIT, PLAN_CONTINUE, PLAN_RETRY, planBarHTML } from "./plan.js";
import { maxTracks, setMaxTracks, TRACKS_MIN, TRACKS_MAX } from "./tracklimit.js";
import { renderLimits, collectLimits } from "./limits.js";
import { parseTidalFile, metaLine, readMeta, EXTRA_HEADER, baseName } from "./tidalfile.js";
import { initAppUpdate } from "./appupdate.js";
import { openImport, importedSummary, INSPIRE_PROMPT, generatedSummary, GEN_AGAIN_CHIP, GEN_SONG_CHIP, GEN_SONG_PROMPT, rememberMidi, hasLastMidi } from "./importsong.js";
import { initInstLib, openInstLib, mountInstLib, instLibData, pinnedInstruments } from "./instlib.js";
import { initMidi, toggleMidi, clockLines, midiSilence } from "./midikeys.js";
import { initAudioStatus } from "./audiostatus.js";
import { initLibrary, openLibrary, loadLibrary } from "./library.js";
import { initSoundLab } from "./soundlab.js";
import { initMemory, openMemory } from "./memory.js";
import { initStorage, openStorage } from "./storage.js";
import { initReplace, replaceSound } from "./replace.js";
import { initLoops, mountLoops, loadLoops, loadFiles, filesFromDrop, isFileDrag, stopLoop, loopCodeFor, loopKindFor } from "./loops.js";
import { steps as builderSteps, defaultsFor, compose, SLOTS, STRUCTURE_EXPLAIN, EFFECTS } from "./builder.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
let codeSynced = true; // pestaña Código: false si has escrito en el código sin pulsar Aplicar
// Pestaña Código al día: el texto se rehace si no tienes cambios sin aplicar, y sus fichas de efectos también
function syncCodeTab() {
  if (!$("#tab-code").classList.contains("active") || codeSynced) $("#code").value = buildCode();
  renderCodeFx();
}
let busy = false;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && Array.isArray(s.tracks)) state = { ...state, ...s, trying: null };
    // «# eqlow -3» daba error en Tidal (se lee como una resta): se guarda ya como «# eqlow (-3)»
    state.tracks.forEach((t) => { t.code = fixNegatives(t.code); });
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
  renderFileStatus();
  renderTabs();
  if (state.github && state.github.pending) scheduleGitHubCreate();
  scheduleSync();
}
// Copia de SOLO LECTURA de la canción para el índice de Maestro (SQLite). La canción sigue siendo del navegador.
let syncTimer = null, lastSynced = "";
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncSong, 2000); }
async function syncSong() {
  if (!state.projectId || !state.tracks.length) return;
  const song = { id: state.projectId, name: state.name || "", bpm: state.bpm, style: state.style || "", locks: { bpm: !!state.bpmLock },
    course: state.course ? state.course.id : null,
    tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted, mix: t.mix || null, lock: t.lock || null })),
    extra: state.extra || "",
    ...(state.score && state.score.parts && state.score.parts.length ? { score: state.score } : {}) };
  const key = JSON.stringify(song);
  if (key === lastSynced) return;
  try { await api("/api/songs/sync", { song }); lastSynced = key; } catch { /* sin servidor: se reintenta al guardar otra vez */ }
}
const PROJ_KEY = "tidal-studio-projects-v1";
function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJ_KEY) || "[]"); } catch { return []; }
}
// 0.25: cada canción también queda en archivo, en tu carpeta de datos (songs/<nombre>/, como en GitHub).
// Si este navegador perdió «Mis proyectos» (otro puerto, perfil nuevo, reinstalación), se recuperan de ahí.
// Devuelve {added, onDisk}. Nunca pisa un proyecto que ya tengas: solo añade los que faltan.
async function recoverLocalSongs() {
  let r;
  try { r = await api("/api/songs/local"); } catch { return { added: 0, onDisk: 0 }; }
  const songs = r.songs || [], list = listProjects(), have = new Set(list.map((p) => p.id));
  const room = Math.max(0, 30 - list.length);
  let added = 0;
  for (const s of songs.filter((x) => !have.has(x.projectId)).slice(0, room)) {
    try {
      const d = await api("/api/songs/local/load", { slug: s.slug });
      const id = d.projectId || s.projectId;
      list.push({ id, name: d.name || s.name, updated: s.updated || Date.now(),
        data: { ...FRESH(), name: d.name || s.name, bpm: d.bpm || 120, style: d.style || "", extra: d.extra || "",
          tracks: (d.tracks || []).map((t) => ({ ...t })), projectId: id, github: null, file: null, chat: [], trying: null,
          ...(d.score && d.score.parts ? { score: d.score } : {}) } });
      added++;
    } catch { /* una canción ilegible no para las demás */ }
  }
  if (added) {
    list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  }
  return { added, onDisk: songs.length };
}
// Lo que pasó con tus datos al arrancar (se avisa una vez)
let dataNoticed = false;
function noticeData(d) {
  dataNoticed = true;
  if (d.restored && d.restored.ok) toast(L("He restaurado la copia de seguridad que pediste. La anterior también se guardó por si quieres volver atrás.", "I restored the backup you asked for. The previous state was saved too, in case you want to go back."));
  else if (d.restored && !d.restored.ok) toast(L(`No pude restaurar la copia (${d.restored.error}). Tus datos siguen como estaban.`, `I couldn't restore the backup (${d.restored.error}). Your data is unchanged.`));
  else if (d.moved) toast(L(`Tus datos se han movido a su propia carpeta (${d.folder}). A partir de ahora las actualizaciones no los tocan.`, `Your data moved to its own folder (${d.folder}). From now on updates don't touch it.`));
  if (d.error) toast(L(`Aviso de tus datos: ${d.error}`, `Data notice: ${d.error}`));
}

// ------------------------------------------------------------------ API
async function api(path, body, signal) {
  if (path === "/api/eval" && body && body.code) noteEval(body.code); // para saber qué pistas suenan (y iluminarlas)
  const opts = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: LANG, ...body }),
  };
  if (signal) opts.signal = signal;
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.data = data; throw e; }
  return data;
}

// ------------------------------------------------------------------ código Tidal
const cps = (bpm) => `setcps (${bpm}/60/4)`;

function buildCode() {
  const lines = [`-- Tidal Studio · ${state.bpm} BPM${state.style ? " · " + STYLES[state.style].nombre : ""}`,
                 cps(state.bpm), ""];
  const M = state.master || {};
  if (M.vol || M.low || M.mid || M.high) lines.push(L(`-- Master: ${dbText(M.vol || 0)} · EQ graves ${M.low || 0} / medios ${M.mid || 0} / agudos ${M.high || 0} dB (ya sumado en cada pista)`, `-- Master: ${dbText(M.vol || 0)} · EQ lows ${M.low || 0} / mids ${M.mid || 0} / highs ${M.high || 0} dB (already added to each track)`), "");
  if (state.extra && state.extra.trim()) lines.push(EXTRA_HEADER(), state.extra.trim(), "");
  for (const t of state.tracks) {
    const ml = mixLine(t, state);
    const body = `${t.id} $ ${t.code}${ml ? "\n" + ml : ""}`;
    if (t.muted) {
      lines.push(`-- ${L("[silenciada]", "[muted]")} ${t.name} · ${t.kind}`);
      lines.push(body.split("\n").map((l) => "-- " + l).join("\n"));
    } else {
      lines.push(`-- ${t.name} · ${t.kind}`);
      lines.push(body);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// El archivo .tidal que se guarda: el mismo código + una línea con lo que el código no cuenta (nombre, tipos, solo, master)
function fileText() {
  const lines = buildCode().split("\n");
  lines.splice(1, 0, metaLine(state));
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

// Lee código de Tidal (pestaña Código o un archivo): pistas d1…dN / p "nombre", el resto a «código extra»
function parseCode(text, master = state.master) {
  const r = parseTidalFile(text, { parseMixLine: (l) => parseMixLine(l, { master }) });
  for (const t of r.tracks) {
    const old = state.tracks.find((x) => x.id === t.id);
    if (old && old.solo && !r.meta) t.solo = true;
    if (!t.mix) t.mix = null;
  }
  return { bpm: r.bpm ? Math.max(20, Math.min(300, Math.round(r.bpm))) : state.bpm, tracks: r.tracks, extra: r.extra, meta: r.meta, skipped: r.skipped };
}

// ------------------------------------------------------------------ sonido
// Quita el error de una pista (ya no aplica): también la ayuda que Maestro abrió solo por ese error
function clearTrackError(t) {
  if (!t) return;
  t.error = ""; delete t.errorCode;
  if (t.help && t.help.auto && !t.help.result && !t.help.loading) t.help = null;
  if (!state.tracks.some((x) => x.error)) state.lastError = "";
}
// played: pistas que iban en este código; si Tidal no da error, sus errores antiguos ya no valen
async function evalCode(code, track, played) {
  try {
    const r = await api("/api/eval", { code });
    const errs = r.errors && r.errors.length ? r.errors : [];
    if (track) {
      if (errs.length) { track.error = errs.join("\n"); track.errorCode = track.code; }
      else clearTrackError(track);
      if (!errs.length && r.ok && !track.muted) track.lastGood = track.code;
      // Si una pista editada da error, Maestro se ofrece a ayudar sin que lo pidas
      if (errs.length && !track.help) track.help = { open: true, auto: true };
    } else if (played && r.ok && !errs.length) played.forEach(clearTrackError);
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
// fromTop: vuelve al compás 1 (resetCycles) para que el arreglo (mask "<…>") empiece desde el principio
// El «código extra» de un archivo abierto (let, definiciones…) va antes de las pistas, que pueden usarlo
const extraCode = () => (state.extra && state.extra.trim() ? [state.extra.trim()] : []);
// Con «Reloj y start/stop» (teclado MIDI), el reloj va con la canción: tu teclado sigue el tempo
const playAll = (fromTop = false) => evalCode([cps(state.bpm), ...(fromTop === true ? ["resetCycles"] : []), ...extraCode(), ...state.tracks.map(trackLine), ...clockLines(true)].join("\n\n"), null, state.tracks);
const hasArrangement = () => state.tracks.some((t) => /\bmask\s+"</.test(t.code));
const live = () => $("#autoplay").checked;
// Silencio de verdad: "hush" solo para los patrones, pero las notas largas, la reverb y el eco
// seguían sonando, y una pre-escucha en marcha volvía a poner la música al acabar su tiempo.
// "panic" (BootTidal) además corta todo lo que suena en SuperDirt; y paramos el audio del navegador.
function hushAll() {
  audition = null; refreshVariants();
  if (preview) { clearTimeout(preview.timer); const { onEnd } = preview; preview = null; if (onEnd) onEnd(); }
  clearTimeout(ctlTimer);
  seqTimers.forEach(clearTimeout); seqTimers = [];
  smStop(); stopBeeps();
  return evalCode(["panic", ...midiSilence()].join("\n\n"));
}

// ------------------------------------------------------------------ pistas
function freeId() {
  for (let i = 1; i <= maxTracks(); i++) if (!state.tracks.find((t) => t.id === "d" + i)) return "d" + i;
  return null;
}
function selectedTrack() {
  return state.tracks.find((t) => t.id === state.selected) || state.tracks[state.tracks.length - 1];
}
function addTrack(name, kind, code) {
  const id = freeId();
  if (!id) { toast(L(`Máximo ${maxTracks()} pistas. Borra alguna o sube el número en Ajustes → Límites.`, `Maximum ${maxTracks()} tracks. Delete one or raise the number in Settings → Limits.`)); return null; }
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

function renderBpmLock() {
  const b = $("#bpm-lock"); if (!b) return;
  b.classList.toggle("on", !!state.bpmLock);
  b.innerHTML = icon(state.bpmLock ? "lock" : "unlock", 16);
  b.title = state.bpmLock ? L("BPM bloqueado: Maestro, las ideas y los cursos no lo cambian (pulsa para desbloquear)", "BPM locked: Maestro, ideas and courses won't change it (click to unlock)")
    : L("Bloquear el BPM: Maestro, las ideas y los cursos no lo cambian", "Lock the BPM: Maestro, ideas and courses won't change it");
}
function changed() {
  save();
  renderTracks();
  renderProgress();
  if (!state.trying) renderIdeas();
  renderPalette();
  renderBlocks();
  renderArrange();
  renderTimeline();
  renderMixer();
  refreshCards();
  syncCodeTab();
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
  $("#blocks").innerHTML = songBlocksHTML(state, { icon: (k, n) => icon(CATEGORIES.find((c) => c.id === k) ? k : "fx", n), uiIcon: icon, mixBadge: (t) => mixBadgeHTML(t, state, icon("mixer", 13)), fxAdd: fxAddSelect,
    kindColor: (k) => KIND_COLOR[k] || "var(--ink-3)", kindName: (k) => CATEGORIES.find((c) => c.id === k)?.nombre || k });
  bkSync("blocks");
}

// ------------------------------------------------------------------ lo que suena, iluminado
// Cada fotograma: dónde está el ciclo de cada pista que suena y qué trozo de su código toca ahora.
function paintPlaying(t, cycle) {
  const on = cycle !== null && audible(t, state);
  const ta = document.querySelector(`#tracks .track[data-id="${t.id}"] textarea`);
  if (ta) setPlayRanges(ta, on && document.activeElement !== ta ? rangesAt(t.code, cycle) : []); // mientras escribes, sin luces
  const code = $("#code");
  if ($("#tab-code").classList.contains("active")) {
    if (!code._playOf) code._playOf = {};
    code._playOf[t.id] = on ? rangesAt(t.code, cycle) : [];
  }
  const bt = $("#tab-blocks").classList.contains("active") && document.querySelector(`#blocks .bk-track[data-id="${t.id}"]`);
  if (bt) {
    const keys = on ? blockKeysAt(t.code, cycle) : [], sig = keys.join(" ");
    if (bt._play !== sig) {
      bt._play = sig;
      bt.querySelectorAll(".bk-step.playing").forEach((x) => x.classList.remove("playing"));
      for (const k of keys) bt.querySelector(`[data-key="${CSS.escape(k)}"]`)?.classList.add("playing");
    }
  }
}
// En la pestaña Código: cada pista está en una línea "d1 $ …"; pasamos sus rangos a posiciones del texto completo
function paintCodeTab() {
  const code = $("#code");
  if (!$("#tab-code").classList.contains("active") || !code._playOf) return;
  if (document.activeElement === code) return setPlayRanges(code, []);
  const txt = code.value, all = [];
  for (const t of state.tracks) {
    const rs = code._playOf[t.id];
    if (!rs || !rs.length) continue;
    const m = new RegExp(`^${t.id} \\$ `, "m").exec(txt);
    if (!m) continue;
    const off = m.index + m[0].length;
    if (txt.slice(off, off + t.code.length) !== t.code) continue; // lo has cambiado a mano: no sabemos dónde está
    for (const [a, b] of rs) all.push([a + off, b + off]);
  }
  setPlayRanges(code, all);
}
function startPlaying() {
  startPlayhead({
    api, isReal: () => !!(server.engine && server.engine.superdirt_ready && !server.engine.simulation),
    tracks: () => {
      setTempo(state.bpm); paintCodeTab();
      // Línea de tiempo: el cursor va con la primera pista que suena
      let c = null;
      for (const t of state.tracks) { if (!audible(t, state)) continue; const x = cycleOf(t.id); if (x !== null) { c = x; break; } }
      paintTimeline(c);
      return state.tracks;
    },
    paint: paintPlaying,
  });
}

// ------------------------------------------------------------------ bloques: tooltip para ver y editar cada bloque
let bkSel = null;     // { id, key } del bloque seleccionado
let bkTimer = null;
// El mismo editor sirve en las tres vistas: Bloques (cualquier bloque), Pistas y Código (las fichas de efectos).
// bkSel.view dice dónde está la ficha que lo abrió: "blocks" | "tracks" | "code".
const BK_ROOT = { blocks: "#blocks .bk-track", tracks: "#tracks .track", code: "#code-fx .cfx-track" };
const bkFind = (sel) => sel.key === "bpm" ? $("#blocks .bk-tag") : document.querySelector(`${BK_ROOT[sel.view || "blocks"]}[data-id="${sel.id}"] [data-key="${CSS.escape(sel.key)}"]`);
function bkClose() { bkSel = null; $("#bk-pop").hidden = true; document.querySelectorAll("#blocks .on, .fx-chip.sel").forEach((x) => x.classList.remove("on", "sel")); }
// Tras repintar una vista, vuelve a colocar (o abrir) el editor sobre su ficha
function bkSync(view) {
  if (!bkSel || (bkSel.view || "blocks") !== view) return;
  const el = bkFind(bkSel);
  if (!el || !el.offsetParent) return bkClose();
  el.classList.add(view === "blocks" ? "on" : "sel");
  if (!bkSel.keep) bkOpen(el); else bkPlace(el);
}
function bkPlace(el) {
  const pop = $("#bk-pop");
  const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const w = Math.min(360, vw - 16);
  pop.style.width = w + "px";
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  pop.style.left = left + "px";
  const h = pop.offsetHeight || 260, below = r.bottom + 8 + h <= vh - 8 || r.top - 8 - h < 8;
  pop.classList.toggle("above", !below);
  pop.style.top = (below ? r.bottom + 8 : r.top - 8 - h) + "px";
  pop.style.setProperty("--arrow", Math.max(14, Math.min(w - 20, r.left - left + Math.min(r.width, 60) / 2)) + "px");
}
// Abre el editor de un efecto desde Pistas o Código (en Bloques lo abre el clic en el bloque)
function fxOpen(view, id, key, el) {
  if (bkSel && bkSel.view === view && bkSel.id === id && bkSel.key === key && !$("#bk-pop").hidden) return bkClose();
  bkClose();
  bkSel = { id, key, view };
  el.classList.add("sel");
  bkOpen(el);
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
    const onoff = canBypass(part.name) ? `<div class="fx-onoff ${part.off ? "off" : ""}">${fxSwitch(bkSel.key, part)}<span>${part.off ? L("Apagado: no suena, pero guarda su valor", "Off: bypassed, its value is kept") : L("Encendido", "On")}</span></div>` : "";
    return `<div class="bk-ed">${onoff}${sl}<label>${L("Valor", "Value")}<input type="text" data-bk-in="set" value="${esc(part.text)}" spellcheck="false"></label>
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
  const pop = $("#bk-pop");
  if (bkSel && bkSel.key === "bpm") {
    pop.innerHTML = `<div class="bk-pop-head"><code>setcps (${state.bpm}/60/4)</code><button class="close" data-bk="close">${icon("close", 14)}</button></div>
      <p>${esc(blockInfo(el).text)}</p><div class="bk-ed"><label>BPM<input type="number" data-bk-in="bpm" min="40" max="220" value="${state.bpm}"></label></div>
      <div class="bk-pop-foot"><button data-bk="songcard">${icon("sliders", 14)} ${L("Tarjeta de la canción en Maestro", "Song card in Maestro")}</button></div>`;
    pop.hidden = false; return bkPlace(el);
  }
  const t = state.tracks.find((x) => x.id === bkSel.id);
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
  noteSoundChange(t, t.code);
  t.code = code; t.explain = null; t.edited = true;
  if (rerender) { bkSel.keep = false; changed(); }
  else { save(); const chip = $("#bk-pop .bk-pop-head code"); const part = partOf(t.code, bkSel.key); if (chip && part && part.kind === "step") chip.textContent = part.text; }
  clearTimeout(bkTimer);
  bkTimer = setTimeout(() => { if (live()) playTrack(t); if (!rerender) changedQuiet(); }, rerender ? 0 : 200);
}
// Enciende o apaga un efecto (# room, # delay…) de una pista sin perder su valor: queda como «{- # room 0.3 -}»
function toggleFx(id, key) {
  const t = state.tracks.find((x) => x.id === id); if (!t) return;
  let code; try { code = applyEdit(t.code, key, "toggle"); } catch { return; }
  if (!code || code === t.code) return;
  t.code = code; t.explain = null; t.edited = true;
  if (bkSel) bkSel.keep = true;
  changed();
  if (live()) playTrack(t);
  tourFlag("fx-toggle");
}
// Repinta todo menos el tooltip (tras arrastrar un deslizador)
// Abre la pestaña Mezcla y resalta la tira de esa pista
function openMixFor(id) {
  document.querySelector('.tab[data-tab="mixer"]')?.click();
  renderMixer(true);
  const strip = document.querySelector(`#mixer .mx-strip[data-id="${CSS.escape(id)}"]`);
  if (strip) { strip.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); strip.classList.add("flash"); setTimeout(() => strip.classList.remove("flash"), 1600); }
}
function changedQuiet() { if (bkSel) bkSel.keep = true; renderTracks(); renderBlocks(); renderMixer(); renderArrange(); renderTimeline(); refreshCards(); syncCodeTab(); }
function wireBlocks() {
  $("#blocks").addEventListener("change", (e) => {
    const s = e.target.closest(".fx-add"), tr = e.target.closest(".bk-track");
    if (s && tr && s.value) addFx(tr.dataset.id, s.dataset.fxAdd, s.value);
  });
  $("#blocks").addEventListener("click", (e) => {
    if (e.target.closest(".fx-add")) return;
    const tr = e.target.closest(".bk-track");
    const sw = e.target.closest(".fx-sw");
    if (sw && tr) { e.stopPropagation(); return toggleFx(tr.dataset.id, sw.dataset.fx); }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "edit") {
      state.selected = tr.dataset.id; save(); renderTracks(); renderPalette();
      document.querySelector(".tab[data-tab=tracks]").click();
      document.querySelector(`.track.selected`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (a === "card") return openCard(tr.dataset.id);
    if (a === "mix") { e.stopPropagation(); return openMixFor(tr.dataset.id); }
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
    if (b.classList.contains("fx-sw")) { const id = bkSel.id; toggleFx(id, bkSel.key); if (bkSel) { bkSel.keep = false; bkSync(bkSel.view || "blocks"); } return; }
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
  document.body.appendChild(pop); // flota sobre cualquier vista (Bloques, Pistas, Código)
  document.addEventListener("click", (e) => { if (bkSel && !e.target.closest("#bk-pop, #blocks [data-key], #blocks .bk-tag, .fx-chip, .fx-add")) bkClose(); });
  window.addEventListener("scroll", () => { if (bkSel && !$("#bk-pop").hidden) { const el = bkFind(bkSel); if (el) bkPlace(el); } }, true);
  window.addEventListener("resize", () => { if (bkSel && !$("#bk-pop").hidden) { const el = bkFind(bkSel); if (el) bkPlace(el); } });
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
  stopAudition();
  clearedChat = { chat: state.chat, options: state.options };
  state.chat = [];
  say(L("Chat limpio. Tu canción sigue igual; solo he borrado la conversación.", "Chat cleared. Your song is unchanged; I only removed the conversation."),
    [L("Recuperar el chat", "Bring the chat back"), CARD_CHIP(), L("Dame una idea", "Give me an idea")]);
}
// Fila de efectos de una pista (Pistas y Código): las MISMAS fichas que en Bloques.
// Interruptor = encender/apagar; pulsar el nombre = editar (deslizador, valor, quitar); «+ efecto» añade uno.
function fxRowHTML(t, disabled = false) {
  let fx = [], els = []; try { els = elementsOf(t.code); fx = effectsOf(t.code); } catch { /* código raro */ }
  const src = els.find((e) => e.kind === "src" || e.kind === "raw");
  const have = new Set(fx.map((e) => e.name));
  const add = src && !disabled ? fxAddSelect(src.key, [...have]) : "";
  if (!fx.length && !add) return "";
  return `<div class="fxbar${disabled ? " disabled" : ""}"><span class="fx-row-lbl">${L("Efectos", "Effects")}</span>${fx.map((e) =>
    fxChipHTML(e.key, e, "", `data-x="${esc(`${e.op} ${e.name} ${e.text}`)}" data-w="${esc(e.name)}"`)).join("")}${add}</div>`;
}
// Desplegable «+ efecto»: el mismo en Pistas, Bloques y Código
function fxAddSelect(srcKey, have = []) {
  return `<select class="fx-add" data-fx-add="${esc(srcKey)}" title="${esc(L("Añadir un efecto", "Add an effect"))}"><option value="">${L("+ efecto", "+ effect")}</option>${ADD_PARAMS.filter((p) => !have.includes(p)).map((p) => `<option value="${p}">${p} · ${esc(L(CTL_PARAMS[p].es, CTL_PARAMS[p].en))}</option>`).join("")}</select>`;
}
// Valor inicial razonable para un efecto nuevo
const fxDefault = (name) => fmt(name === "lpf" ? 2000 : name === "hpf" ? 200 : name === "room" || name === "delay" ? 0.3 : CTL_PARAMS[name]?.def ?? 0.5);
function addFx(id, srcKey, name) {
  const t = state.tracks.find((x) => x.id === id); if (!t || !name) return;
  let code; try { code = applyEdit(t.code, srcKey, "addParam", name, fxDefault(name)); } catch { return; }
  if (!code || code === t.code) return;
  if (!t.error && !t.lastGood) t.lastGood = t.code;
  t.code = code; t.explain = null; t.edited = true;
  changed();
  if (live()) playTrack(t);
}
// Pestaña Código: las fichas de efectos de cada pista encima del texto (mismo editor que Bloques y Pistas)
function renderCodeFx() {
  const box = $("#code-fx"); if (!box) return;
  if (!$("#tab-code").classList.contains("active")) return;
  const off = !codeSynced;
  box.innerHTML = state.tracks.length ? `<div class="cfx-head"><b>${L("Efectos por pista", "Effects per track")}</b><span class="hint">${off ? L("Has cambiado el código: pulsa Aplicar para editar los efectos aquí.", "You changed the code: press Apply to edit the effects here.") : L("Enciende, apaga o pulsa un efecto para editarlo. Igual que en Pistas y Bloques.", "Switch an effect on or off, or click it to edit. Same as in Tracks and Blocks.")}</span></div>` +
    state.tracks.map((t) => `<div class="cfx-track${off ? " disabled" : ""}" data-id="${esc(t.id)}"><span class="cfx-id" style="--k:${KIND_COLOR[t.kind] || "var(--ink-3)"}">${esc(t.id)}</span>${fxRowHTML(t, off) || `<span class="hint">${L("sin efectos", "no effects")}</span>`}</div>`).join("") : "";
  bkSync("code");
}
// Tarjeta «Código extra»: lo del archivo abierto que no es una pista (let, definiciones, once…), intacto
function extraCard() {
  const el = document.createElement("div");
  el.className = "track extra-code";
  el.innerHTML = `<div class="head"><span class="kico">${icon("code", 20)}</span><b>${L("Código extra", "Extra code")}</b>
      <span class="actions"><button data-a="run" title="${L("Evaluar este código", "Evaluate this code")}">${icon("play", 14)}</button>
      <button data-a="del" title="${L("Quitar el código extra", "Remove the extra code")}">${icon("trash", 16)}</button></span></div>
    <p class="xc-help">${L("Venía en el archivo y no es una pista (definiciones con let, ajustes, once…). Se guarda tal cual y se evalúa antes de las pistas al pulsar Tocar todo.", "It came in the file and isn't a track (let definitions, settings, once…). It's kept as is and evaluated before the tracks when you press Play all.")}</p>
    <textarea rows="${Math.min(10, state.extra.split("\n").length + 1)}" spellcheck="false"></textarea>`;
  const ta = el.querySelector("textarea");
  ta.value = state.extra;
  ta.onchange = () => { state.extra = ta.value; save(); };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); state.extra = ta.value; save(); evalCode(state.extra); } });
  el.querySelector("[data-a=run]").onclick = () => { state.extra = ta.value; save(); evalCode(state.extra); };
  el.querySelector("[data-a=del]").onclick = () => { state.extra = ""; changed(); };
  return el;
}
function renderTracks() {
  const box = $("#tracks");
  box.innerHTML = "";
  $("#empty").style.display = state.tracks.length || state.extra ? "none" : "block";
  if (state.extra) box.appendChild(extraCard());
  for (const t of state.tracks) {
    const el = document.createElement("div");
    el.className = "track" + (t.id === state.selected ? " selected" : "") + (t.muted ? " muted" : "");
    el.dataset.kind = t.kind; el.dataset.id = t.id;
    el.innerHTML = `
      <div class="head">
        <span class="kico">${icon(CATEGORIES.find((c) => c.id === t.kind) ? t.kind : "fx", 20)}</span>
        <span class="id">${t.id}</span>
        <input class="tname">${scoreBadgeHTML(t)}
        <span class="actions">
          <button data-a="explain" class="explain" title="${L("¿Qué hace este código?", "What does this code do?")}">${icon("explain", 15)} ${L("Explícame", "Explain")}</button>
          <button data-a="help" class="helpbtn" title="${L("¿No suena como quieres o da error? Maestro te ayuda", "Not sounding right or erroring? Maestro helps you")}">${icon("wand", 15)} ${L("Ayuda", "Help")}</button>
          <button data-a="controls" class="ctlbtn" title="${L("Ajustar esta pista con controles en el chat", "Tweak this track with controls in the chat")}">${icon("sliders", 15)}</button>
          <button data-a="card" class="ctlbtn" title="${L("Tarjeta configuradora: todos sus valores en el chat", "Configurator card: all its values in the chat")}">${icon("blocks", 15)}</button>
          <button data-a="lock" class="lockbtn${isLocked(t) ? " on" : ""}" title="${isLocked(t) ? L("Bloqueada para Maestro (pulsa para cambiar qué partes)", "Locked for Maestro (click to change which parts)") : L("Bloquear la pista o una parte para que Maestro no la cambie", "Lock the track or a part so Maestro won't change it")}">${icon(isLocked(t) ? "lock" : "unlock", 15)}</button>
          <button data-a="play" title="${L("Hacer sonar esta pista", "Play this track")}">${icon("play", 14)}</button>
          <button data-a="mute" title="${t.muted ? L("Activar", "Unmute") : L("Silenciar", "Mute")}">${icon(t.muted ? "unmute" : "mute", 16)}</button>
          <button data-a="del" title="${L("Borrar pista", "Delete track")}">${icon("trash", 16)}</button>
        </span>
      </div>
      <textarea rows="${Math.min(6, t.code.split("\n").length + 1)}" spellcheck="false" title="${L("Ctrl+Enter para escuchar", "Ctrl+Enter to listen")}"></textarea>
      ${fxRowHTML(t)}
      ${lockRowHTML(t, icon)}
      ${scoreBarHTML(t)}
      ${mixBadgeHTML(t, state, icon("mixer", 13))}
      ${t.error ? `<div class="err ${t.errorCode && t.errorCode !== t.code ? "stale" : ""}"><button class="err-x" data-a="clear-err" title="${L("Borrar este error (ya no aplica)", "Clear this error (no longer applies)")}" aria-label="${L("Borrar error", "Clear error")}">${icon("close", 14)}</button>${t.errorCode && t.errorCode !== t.code ? `<span class="err-stale">${L("Error de una versión anterior del código. Pulsa ▶ para comprobarlo o × para borrarlo.", "Error from an earlier version of the code. Press ▶ to check it or × to clear it.")}</span>` : ""}<span class="err-txt"></span></div>` : ""}
      ${t.help && t.help.open ? `<div class="explain-box help-box">${helpHTML(t)}</div>` : ""}
      ${t.explain ? `<div class="explain-box">${t.explain.loading ? L('<span class="typing">Maestro está leyendo el código…</span>', '<span class="typing">Maestro is reading the code…</span>') : explainHTML(t.explain, true)}</div>` : ""}`;
    el.querySelector(".tname").value = t.name;
    el.querySelector("textarea").value = t.code;
    if (t.error) el.querySelector(".err-txt").textContent = t.error;
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
      if (btn && btn.dataset.fx) return toggleFx(t.id, btn.dataset.fx);
      if (btn && btn.dataset.fxOpen) return fxOpen("tracks", t.id, btn.dataset.fxOpen, btn.closest(".fx-chip"));
      if (a === "lock") { t.lockOpen = !t.lockOpen; save(); renderTracks(); return; }
      if (btn && btn.dataset.lock) { toggleLock(t, btn.dataset.lock); save(); renderTracks(); renderBlocks(); return; }
      if (btn && btn.dataset.sc) { scoreBarAction(state, t, btn.dataset.sc); return; }
      if (a === "mix") return openMixFor(t.id);
      if (a === "controls") return showControls(t);
      if (a === "card") return openCard(t.id);
      if (a === "help") { t.help = t.help && t.help.open ? null : { open: true }; save(); renderTracks(); }
      if (a === "wish") runHelp(t, btn.dataset.w);
      if (a === "ask") runHelp(t, el.querySelector(".help-free").value.trim());
      if (a === "fix-apply") applyFix(t);
      if (a === "help-again") { t.help = { open: true }; save(); renderTracks(); }
      if (a === "fix-revert") { t.code = t.lastGood; t.help = null; t.error = ""; changed(); playTrack(t);
        sysMsg(L(`${t.id} vuelve a la última versión que funcionaba.`, `${t.id} is back to the last version that worked.`)); }
      if (a === "clear-err") { clearTrackError(t); save(); renderTracks(); return; }
      if (a === "explain") explainTrack(t);
      if (a === "play") playTrack(t);
      if (a === "mute") { t.muted = !t.muted; changed(); playTrack(t); }
      if (a === "del") removeTrack(t.id);
    });
    el.querySelector(".tname").addEventListener("change", (e) => { t.name = e.target.value; changed(); });
    el.querySelector(".fx-add")?.addEventListener("change", (e) => addFx(t.id, e.target.dataset.fxAdd, e.target.value));
    const ta = el.querySelector("textarea");
    const commit = () => { if (ta.value !== t.code) { if (!t.error && (!t.lastGood || !t.edited)) t.lastGood = t.code; noteSoundChange(t, t.code); t.code = ta.value; t.explain = null; t.edited = true; changed(); } };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); playTrack(t); }
    });
    ta.addEventListener("change", () => { commit(); if (live()) playTrack(t); });
    box.appendChild(el);
    attachHighlight(el.querySelector("textarea"));
  }
  bkSync("tracks");
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
// Ideas descartadas («no me gusta»): se guardan en el navegador para todos los proyectos,
// no se vuelven a mostrar y Maestro (la IA) recibe la lista para no proponerlas igual.
const DISMISS_KEY = "tidal-studio-dismissed-ideas-v1";
let dismissed = [];
try { dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]").filter((x) => x && x.k); } catch { dismissed = []; }
const ideaKey = (idea) => String(idea.titulo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const isDismissed = (idea) => { const k = ideaKey(idea); return !!k && dismissed.some((d) => d.k === k); };
function saveDismissed() { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed.slice(-80))); } catch { /* sin almacenamiento */ } }
function dismissIdea(idea) {
  const k = ideaKey(idea); if (!k || isDismissed(idea)) return;
  dismissed.push({ k, t: idea.titulo, c: idea.concepto || "" });
  saveDismissed();
  if (state.ideas) state.ideas = state.ideas.filter((x) => !isDismissed(x));
  save(); renderIdeas();
}
function restoreDismissed() { dismissed = []; saveDismissed(); renderIdeas(); }
function currentIdeas() {
  const fromAI = (state.ideas || []).filter((x) => !isDismissed(x));
  if (fromAI.length) return fromAI;
  const ideas = localSuggestions(state, 1, false, isDismissed);
  if (state.tracks.length >= 2) {
    const keys = Object.keys(FLAVORS).filter((k) => k !== state.style);
    for (let i = 0; i < keys.length; i++) {
      const f = flavorIdea(keys[(flavorTurn + i) % keys.length], state.tracks);
      if (f && !isDismissed(f)) { ideas.push(f); break; }
    }
  }
  return ideas;
}
// Pre-escucha: suena unos compases y vuelve sola a como estaba (sin tocar tu proyecto)
let preview = null;
function preHear(cambios, onEnd) {
  if (preview) stopPreHear();
  if (audition) stopAudition();
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
// Instrumentos de la biblioteca que usa un código (cursos): se descargan antes de sonar.
// Una sola descarga a la vez: las siguientes esperan a la anterior (no se pisan las carpetas).
let ensuring = Promise.resolve();
function ensureInstruments(codes, { quiet = false } = {}) {
  const run = async () => {
    if (!codes.length || !live()) return { failed: [] };
    let job;
    try { job = await api("/api/instruments/ensure", { codes }); } catch { return { failed: [] }; }
    if (job.ready) return { failed: [] };
    if (!quiet) toastSoft(L("Descargando los instrumentos de este paso…", "Downloading this step's instruments…"));
    while (job.state === "running") {
      await new Promise((r) => setTimeout(r, 600));
      try { job = await api(`/api/instruments/job?id=${job.id}`); } catch { break; }
    }
    const failed = (job.result && job.result.failed) || [];
    if (failed.length) toast(L(`No he podido descargar: ${failed.map((f) => f.es).join(", ")}. Esas pistas sonarán en silencio hasta que los instales en Instrumentos (¿hay conexión a internet?).`,
      `Couldn't download: ${failed.map((f) => f.en).join(", ")}. Those tracks will be silent until you install them from Instruments (are you online?).`));
    else if (job.result && job.result.installed && job.result.installed.length && !quiet) toastSoft(L("Instrumentos listos", "Instruments ready"));
    return { failed };
  };
  ensuring = ensuring.then(run, run);
  return ensuring;
}

function wirePreHear(btn, cambios) {
  btn.onclick = async (e) => {
    e.stopPropagation();
    if (btn.classList.contains("playing")) { stopPreHear(); return; }
    if (btn.dataset.loading) return;
    btn.dataset.loading = "1";
    const label = btn.innerHTML;
    btn.innerHTML = icon("speaker", 13) + " " + L("Preparando…", "Getting ready…");
    let ch = cambios;
    if (typeof cambios === "function") {
      try { ch = await cambios(); } catch (err) { delete btn.dataset.loading; btn.innerHTML = label; toast(err.message); return; }
    }
    await ensureInstruments((ch.pistas || []).map((p) => p.codigo));
    delete btn.dataset.loading; btn.innerHTML = label;
    document.querySelectorAll(".prehear.playing").forEach((b) => { b.classList.remove("playing"); b.innerHTML = icon("speaker", 13) + " " + L("Escuchar", "Listen"); });
    const secs = preHear(ch, () => { btn.classList.remove("playing"); btn.innerHTML = icon("speaker", 13) + " " + L("Escuchar", "Listen"); });
    btn.classList.add("playing");
    btn.innerHTML = icon("stop", 12) + ` ${L("Escuchando…", "Listening…")} ${Math.round(secs)} s`;
  };
}

// ------------------------------------------------------------------ opciones para escuchar
// La opción suena en directo sobre la canción, sin límite de tiempo, hasta que paras, eliges o cambias a otra (A/B).
let audition = null; // { mi, k, prev, wasLive, touched: Set }
function variantLines(v, touched) {
  const c = v.cambios, gone = new Set(c.eliminar || []), mine = new Map((c.pistas || []).map((p) => [p.id, p]));
  const lines = [cps(c.bpm ? Math.round(c.bpm) : state.bpm)];
  for (const t of state.tracks) {
    if (gone.has(t.id)) { lines.push(`${t.id} silence`); continue; }
    const p = mine.get(t.id);
    lines.push(trackLine(p ? { ...t, code: p.codigo, muted: false } : t));
  }
  for (const p of mine.values()) if (!state.tracks.some((t) => t.id === p.id)) lines.push(`${p.id} $ ${p.codigo}`);
  // Lo que añadió la opción anterior y esta no tiene, se calla
  for (const id of touched) if (!mine.has(id) && !state.tracks.some((t) => t.id === id)) lines.push(`${id} silence`);
  return lines;
}
function startAudition(mi, k) {
  const m = state.chat[mi]; if (!m || !m.variantes || !m.variantes[k]) return;
  if (preview) stopPreHear();
  const prev = audition && audition.mi === mi ? (audition.k === k ? audition.prev : audition.k) : null;
  const wasLive = audition && audition.mi === mi ? audition.wasLive : live();
  const touched = audition && audition.mi === mi ? audition.touched : new Set();
  const v = m.variantes[k];
  api("/api/eval", { code: variantLines(v, touched).join("\n\n") }).catch(() => {});
  (v.cambios.pistas || []).forEach((p) => touched.add(p.id));
  audition = { mi, k, prev, wasLive, touched };
  refreshVariants();
}
async function stopAudition(revert = true) {
  if (!audition) return;
  const { wasLive, touched } = audition;
  audition = null;
  refreshVariants();
  if (!revert) return;
  const extra = [...touched].filter((id) => !state.tracks.some((t) => t.id === id)).map((id) => `${id} silence`);
  const code = wasLive ? [cps(state.bpm), ...state.tracks.map(trackLine), ...extra].join("\n\n") : "hush";
  try { await api("/api/eval", { code }); } catch { /* sin motor */ }
}
// El código de cada opción comparado con lo que suena ahora (explicación corta para no llenar el chat)
function variantDiff(v) {
  const d = diffFor({ bpm: state.bpm, tracks: state.tracks }, v.cambios);
  d.forEach((x) => { if (x.explicacion && x.explicacion.length > 160) x.explicacion = x.explicacion.slice(0, 157).replace(/\s+\S*$/, "") + "…"; });
  return diffHTML(d);
}
function refreshVariants() {
  // Solo repinta los bloques de opciones (no todo el chat) para no perder el scroll
  document.querySelectorAll("#chat .variants").forEach((box) => {
    const mi = +box.closest(".msg").dataset.mi;
    const m = state.chat[mi]; if (!m) return;
    const openCodes = [...box.querySelectorAll(".va-code")].map((d) => d.open);
    box.outerHTML = variantsHTML(m, mi, audition, (k) => variantDiff(m.variantes[k]));
    const nb = $(`#chat .msg[data-mi="${mi}"] .variants`);
    if (nb) nb.querySelectorAll(".va-code").forEach((d, i) => { if (openCodes[i]) d.open = true; });
  });
}
// 0.20.1: guardar una opción en «Mis estilos» (tu canción con esa opción puesta: groove, instrumentos y tempo)
function songWithVariant(v) {
  const c = v.cambios || {}, gone = new Set(c.eliminar || []);
  const tracks = state.tracks.filter((t) => !gone.has(t.id)).map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code }));
  for (const p of c.pistas || []) {
    const t = tracks.find((x) => x.id === p.id);
    if (t) Object.assign(t, { code: p.codigo, name: p.nombre || t.name, kind: p.tipo || t.kind });
    else tracks.push({ id: p.id, name: p.nombre || p.id, kind: p.tipo || "", code: p.codigo });
  }
  tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  return { name: v.titulo, bpm: c.bpm ? Math.round(c.bpm) : state.bpm, style: state.style, tracks, score: state.score };
}
async function saveVariantStyle(mi, k, btn) {
  const v = state.chat[mi].variantes[k];
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/styles/save", { song: songWithVariant(v), name: v.titulo, description: v.descripcion || "" });
    v.estilo = { id: r.style.id, name: r.style.name };
    save(); refreshVariants();
    toastSoft(L(`Estilo «${r.style.name}» guardado en Memoria → Mis estilos.`, `Style «${r.style.name}» saved in Memory → My styles.`));
  } catch (e) {
    if (btn) btn.disabled = false;
    toast(L("No se ha podido guardar el estilo: ", "Couldn't save the style: ") + e.message);
  }
}
// Lo que guardó el servidor (pedido por chat) se marca en las tarjetas de opciones
function markSavedStyles(list) {
  const m = [...state.chat].reverse().find((x) => x.variantes && x.variantes.length);
  for (const s of list) {
    const k = LETTERS.indexOf(String(s.opcion || ""));
    if (m && k >= 0 && m.variantes[k]) m.variantes[k].estilo = { id: s.id, name: s.name };
  }
}
async function pickVariant(mi, k) {
  const m = state.chat[mi]; const v = m.variantes[k];
  if (audition && live()) {
    // Sigue sonando sin cortes: solo callamos lo que añadieron las otras opciones
    const mine = new Set((v.cambios.pistas || []).map((p) => p.id));
    const extra = [...audition.touched].filter((id) => !mine.has(id) && !state.tracks.some((t) => t.id === id));
    audition = null;
    api("/api/eval", { code: [cps(state.bpm), ...extra.map((id) => `${id} silence`)].join("\n\n") }).catch(() => {});
  } else await stopAudition(true);
  const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
  m.picked = k;
  recordVote({ kind: "pick", ...songContext(state), request: lastRealRequest().slice(0, 500), blind: !!m.blind,
    candidates: m.variantes.map((x) => ({ title: x.titulo, concept: x.concepto || "", changes: x.cambios })), chosen: k })
    .then((r) => { if (r && r.memoria_nueva && r.memoria_nueva.length) { toast(memoNote(r.memoria_nueva)); refreshMemBadge(); } });
  // 0.16: al elegir un sonido entre varios, el ranking aprende (sin IA)
  if (m.soundPick) api("/api/sounds/choice", { role: m.soundPick.role, style: m.soundPick.style, chosen: m.soundPick.sounds[k], others: m.soundPick.sounds }).catch(() => {});
  state.chat.push({ role: "user", content: L(`Me quedo con la opción ${LETTERS[k]}: «${v.titulo}».`, `I'll keep option ${LETTERS[k]}: «${v.titulo}».`) });
  const summary = applyChanges(v.cambios);
  if (v.concepto && !state.learnedMusic.includes(v.concepto)) state.learnedMusic.push(v.concepto);
  // 0.18: lo que pediste, el código de antes y el de después: si te convence, se guarda como caso musical
  const ids = [...(v.cambios.pistas || []).map((p) => p.id), ...(v.cambios.eliminar || [])];
  const codeOf = (tracks) => tracks.filter((t) => ids.includes(t.id)).map((t) => `${t.id} $ ${t.code}`).join("\n");
  const caseDraft = { problem: lastRealRequest().slice(0, 400), title: v.titulo, before: codeOf(before.tracks), after: codeOf(state.tracks), why: v.descripcion || "" };
  say(L(`¡Buena elección! La ${LETTERS[k]}, «${v.titulo}», ya forma parte de tu canción. ${v.descripcion}\n\nAsí ha cambiado el código:`, `Good choice! ${LETTERS[k]}, «${v.titulo}», is now part of your song. ${v.descripcion}\n\nHere's how the code changed:`),
    [L("Explícame el código", "Explain the code"), L("Dame variaciones de esta", "Give me variations of this one"), CASE_CHIP(), VA_UNDO()],
    { changes: summary, diff: diffFor(before, v.cambios), pickSnap: JSON.stringify(before), caseDraft });
}
const VA_UNDO = () => L("Deshacer la elección", "Undo the pick");
const CASE_CHIP = () => L("Guardar como caso", "Save as a case");
const MEM_OPEN = () => L("Abrir Memoria", "Open Memory");
const SC_NAME = { song: ["esta canción", "this song"], course: ["este curso", "this course"], genre: ["el género", "the genre"], global: ["siempre", "always"] };
// 0.21: cambiar TÚ el sonido de una pista (controles, bloques, código, «Poner en…») cuenta como elección para ese papel
// y género, igual que elegirlo entre opciones: con 3 iguales sale la memoria. Se espera a que dejes de probar (4 s).
const manualSound = {};
function mainSound(code) { const m = /\b(?:s|sound)\s+"\s*[[<(]*\s*([A-Za-z][A-Za-z0-9_.-]*)/.exec(code || ""); return m ? m[1] : ""; }
function noteSoundChange(t, before) {
  if (!t) return;
  const was = mainSound(before);
  const cur = manualSound[t.id] || (manualSound[t.id] = { from: was });
  clearTimeout(cur.timer);
  cur.timer = setTimeout(() => {
    delete manualSound[t.id];
    const tr = state.tracks.find((x) => x.id === t.id); const now = tr && mainSound(tr.code);
    if (!now || !cur.from || now === cur.from) return;
    const style = state.course ? state.course.id : (state.style || "");
    api("/api/sounds/choice", { role: tr.kind || "", style, chosen: now, others: [cur.from], source: "manual" })
      .then((r) => { if (r && r.memoria_nueva && r.memoria_nueva.length) { toast(memoNote(r.memoria_nueva)); refreshMemBadge(); } })
      .catch(() => {});
  }, 4000);
}
function memoNote(list) {
  return list.map((m) => m.status === "approved"
    ? L(`apuntado en tu memoria (${SC_NAME[m.scope][0]}): «${m.text}»`, `noted in your memory (${SC_NAME[m.scope][1]}): «${m.text_en || m.text}»`)
    : L(`a la bandeja de Memoria: «${m.text}»`, `to the Memory inbox: «${m.text_en || m.text}»`)).join(" · ");
}
async function refreshMemBadge() {
  try { const r = await (await fetch("/api/memory")).json(); setMemBadge(r.stats ? r.stats.pending : 0); } catch { /* sin servidor */ }
}
function setMemBadge(n) {
  const b = $("#mem-count"); if (!b) return;
  b.hidden = !n; b.textContent = n || "";
}
function undoPick() {
  const m = [...state.chat].reverse().find((x) => x.pickSnap);
  if (!m) return false;
  const before = JSON.parse(m.pickSnap);
  recordVote({ kind: "undo", ...songContext(state), undone_to: before });
  const keep = new Set(before.tracks.map((t) => t.id));
  const removed = state.tracks.filter((t) => !keep.has(t.id)).map((t) => t.id);
  state.bpm = before.bpm; $("#bpm").value = state.bpm; state.tracks = before.tracks;
  removed.forEach(silenceId);
  if (live()) playAll();
  delete m.pickSnap;
  const offer = [...state.chat].reverse().find((x) => x.variantes && x.picked != null);
  if (offer) { offer.picked = null; offer.dismissed = false; }
  sysMsg(L("Deshecho: tu canción vuelve a como estaba. Las opciones siguen ahí para que escuches otra.", "Undone: your song is back as it was. The options are still there so you can try another."));
  changed();
  return true;
}
function wirePlan() {
  $("#chat").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pl]"); if (!b) return;
    const mi = +b.dataset.mi, a = b.dataset.pl;
    const m = state.chat[mi]; if (!m || !m.plan) return;
    const p = m.plan;
    if (a === "goto") { const el = $(`#chat .msg[data-mi="${mi}"] .plan`); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (a === "pause") { if (planRun) planRun.stop = true; b.disabled = true; b.textContent = L("Pararé al acabar este paso…", "I'll stop after this step…"); return; }
    if (busy) return;
    if (a === "start") { state.options = []; return runPlan(mi, true); }
    if (a === "stepwise" || a === "next" || a === "retry") { state.options = []; return runPlan(mi, a === "stepwise" ? false : a === "retry" ? p.auto : false); }
    if (a === "rest") { state.options = []; return runPlan(mi, true); }
    if (a === "all") { p.estado = "reemplazado"; save(); return send(PLAN_ALL()); }
    if (a === "stop") { p.estado = "parado"; state.options = []; save(); return renderChat(); }
    if (a === "drop" && p.estado === "propuesto") { p.pasos.splice(+b.dataset.k, 1); save(); return renderChat(); }
    if (a === "skip") { p.pasos[+b.dataset.k].estado = "saltado"; if (planDone(p)) p.estado = "terminado"; save(); return renderChat(); }
    if (a === "change") { const f = b.closest(".plan").querySelector(".pl-change"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus(); }
  });
  $("#chat").addEventListener("submit", (e) => {
    const f = e.target.closest(".pl-change"); if (!f) return;
    e.preventDefault();
    const txt = f.querySelector("input").value.trim(); if (!txt) return;
    send(L(`Cambia el plan: ${txt}`, `Change the plan: ${txt}`));
  });
  const t = $("#plan-on");
  if (t) { t.checked = planEnabled(); t.onchange = () => setPlanEnabled(t.checked); }
}
function wireVariants() {
  $("#chat").addEventListener("click", (e) => {
    const b = e.target.closest("[data-va]"); if (!b) return;
    const mi = +b.dataset.mi, k = +b.dataset.k, a = b.dataset.va;
    const m = state.chat[mi]; if (!m || !m.variantes) return;
    if (a === "play") return audition && audition.mi === mi && audition.k === k ? stopAudition() : startAudition(mi, k);
    if (a === "stop") return stopAudition();
    if (a === "ab" && audition && audition.prev != null) return startAudition(mi, audition.prev);
    if (a === "pick") return pickVariant(mi, k);
    if (a === "style") return saveVariantStyle(mi, k, b);
    if (a === "blind") { stopAudition(); blindStart(m); save(); return refreshVariants(); }
    if (a === "unblind") { m.blind.revealed = true; save(); return refreshVariants(); }
    if (a === "vote" || a === "same") {
      const why = (b.closest(".variants").querySelector(".va-why input") || {}).value || "";
      m.blind.choice = a === "vote" ? k : null; m.blind.revealed = true;
      recordVote({ kind: "ab", blind: true, ...songContext(state), request: lastRealRequest().slice(0, 500), order: m.blind.order,
        candidates: m.variantes.map((x) => ({ title: x.titulo, concept: x.concepto || "", changes: x.cambios })), chosen: a === "vote" ? k : null, reason: why.slice(0, 500) });
      stopAudition(); save(); refreshVariants();
      return sysMsg(a === "vote"
        ? L(`Voto guardado. Elegiste a ciegas la ${BLIND[m.blind.order.indexOf(k)]}, que era la ${LETTERS[k]}: «${m.variantes[k].titulo}». Si la quieres en tu canción, pulsa «Elegir esta».`, `Vote saved. You blindly picked ${BLIND[m.blind.order.indexOf(k)]}, which was ${LETTERS[k]}: «${m.variantes[k].titulo}». If you want it in your song, press «Pick this one».`)
        : L("Guardado: ninguna te gustó más que las otras. Ya puedes ver sus nombres.", "Saved: none stood out over the others. You can see their names now."));
    }
    if (a === "more") { stopAudition(); return send(L("Dame otras opciones distintas a estas.", "Give me other options, different from these.")); }
    if (a === "none") { stopAudition(); m.dismissed = true; save(); renderChat(); return send(L("No me convence ninguna. Pregúntame qué busco y propón otras.", "None of them convinces me. Ask me what I'm after and suggest others.")); }
    if (a === "refine") { const f = b.closest(".variants").querySelector(".va-refine"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus(); }
  });
  $("#chat").addEventListener("submit", (e) => {
    const f = e.target.closest(".va-refine"); if (!f) return;
    e.preventDefault();
    const txt = f.querySelector("input").value.trim(); if (!txt) return;
    const m = state.chat[+f.dataset.mi];
    const ref = audition && audition.mi === +f.dataset.mi ? ` (${L("estaba escuchando la", "I was listening to")} ${LETTERS[audition.k]}: «${m.variantes[audition.k].titulo}»)` : "";
    stopAudition();
    send(L(`Afina las opciones${ref}: ${txt}`, `Refine the options${ref}: ${txt}`));
  });
  // Teclas 1-4 cambian de opción al vuelo; Esc para (si no estás escribiendo)
  document.addEventListener("keydown", (e) => {
    if (!audition || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    const m = state.chat[audition.mi];
    if (/^[1-4]$/.test(e.key) && m.variantes[+e.key - 1]) {
      e.preventDefault();
      const pos = +e.key - 1;  // a ciegas, las teclas siguen el orden barajado (X, Y, Z, W)
      startAudition(audition.mi, m.blind && !m.blind.revealed ? m.blind.order[pos] : pos);
    }
    if (e.key === "Escape") stopAudition();
  });
  const t = $("#variants-on");
  if (t) { t.checked = variantsEnabled(); t.onchange = () => setVariantsEnabled(t.checked); }
}

// ------------------------------------------------------------------ samples de internet (Maestro los descarga)
// Sin IA: «descarga un sample de cencerro» busca, descarga y ofrece una pista nueva con él
async function offlineFetch(q) {
  const name = safeName(q).split("_").slice(0, 2).join("_") || "sample";
  sysMsg(L(`Buscando «${q}» en internet…`, `Searching the internet for «${q}»…`));
  let r;
  try { r = await api("/api/samples/find", { nombre: name, busqueda: q, auto: true }); } catch (e) { return say(L("No he podido buscar: ", "I couldn't search: ") + e.message, state.options); }
  const d = (r.descargas || [])[0];
  if (!d) return say(L("Dime qué sonido buscas, por ejemplo «descarga un sample de marimba».", "Tell me what sound you're after, e.g. «download a marimba sample»."), state.options);
  server.samples = null; sm.mine = null;
  const ok = d.estado === "descargado" || d.estado === "ya";
  const type = guessType(`${q} ${(d.candidatos[0] || {}).title || ""}`);
  say(ok ? L(`Listo: ya tienes «${d.nombre}». En Tidal se usa con s "${d.nombre}". ¿Le hago una pista?`, `Done: you now have «${d.nombre}». In Tidal you use it with s "${d.nombre}". Shall I make a track with it?`)
    : d.estado === "permiso" ? L("He encontrado esto, pero es grande: dime si lo descargo.", "I found this, but it's big: tell me if I should download it.")
      : L("No he encontrado nada con licencia libre. Prueba con otras palabras (en inglés suele ir mejor) o con la biblioteca.", "I didn't find anything with a free license. Try other words or the library."),
    ok ? [L(`Añadir pista con ${d.nombre}`, `Add a track with ${d.nombre}`), ...(state.options || []).slice(0, 3)] : state.options, { descargas: [d], fxType: type });
}
let fxPlaying = null, fxAudio = null;
function fxStop() { if (fxAudio) { fxAudio.pause(); fxAudio = null; } fxPlaying = null; }
function refreshFetch(mi) {
  const box = $(`#chat .msg[data-mi="${mi}"] .fetch`); const m = state.chat[mi];
  if (box && m) box.outerHTML = fetchHTML(m, mi, fxPlaying);
}
async function fetchChoice(m, mi, d, k, replace) {
  d.busy = true; refreshFetch(mi);
  try {
    const r = await api("/api/samples/fetch", { name: d.nombre, choice: d.candidatos[k], replace });
    d.elegido = k; d.estado = "descargado"; d.loaded = r.loaded; delete d.error;
    server.samples = null; sm.mine = null;
  } catch (e) { d.error = e.message; if (d.estado !== "descargado") d.estado = "error"; toast(L("No se pudo descargar: ", "Couldn't download: ") + e.message); }
  d.busy = false; save(); refreshFetch(mi);
}
function wireFetch() {
  $("#chat").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fx]"); if (!b) return;
    const mi = +b.dataset.mi, k = +b.dataset.k, a = b.dataset.fx;
    const m = state.chat[mi]; const d = m && m.descargas && m.descargas[k]; if (!d || d.busy) return;
    if (a === "hear") {
      const again = fxPlaying && fxPlaying.mi === mi && fxPlaying.k === k;
      fxStop();
      if (!again) {
        const c = d.candidatos[d.elegido || 0];
        const src = /descargado|ya/.test(d.estado) ? `/api/samples/file?name=${encodeURIComponent(d.nombre)}&i=0` : `/api/samples/remote?url=${encodeURIComponent(c.preview)}`;
        fxAudio = new Audio(src); fxPlaying = { mi, k };
        fxAudio.onended = () => { fxStop(); refreshFetch(mi); };
        fxAudio.play().catch(() => { fxStop(); refreshFetch(mi); });
      }
      return refreshFetch(mi);
    }
    if (a === "get") return fetchChoice(m, mi, d, d.elegido || 0, false);
    if (a === "skip") { d.estado = "rechazado"; save(); return refreshFetch(mi); }
    if (a === "other") { fxStop(); return fetchChoice(m, mi, d, ((d.elegido || 0) + 1) % d.candidatos.length, true); }
    if (a === "library") { sm.q = d.busqueda; sm.page = 1; return openSamples("online").then(() => (sm.keySet ? smSearch() : null)); }
  });
  const t = $("#web-samples-on");
  if (t) { t.checked = fetchEnabled(); t.onchange = () => setFetchEnabled(t.checked); }
}

function renderIdeas() {
  const list = $("#idea-list");
  const ideas = state.trying ? state.trying.ideas : currentIdeas();
  $("#ideas").style.display = ideas.length || dismissed.length ? "block" : "none";
  list.innerHTML = "";
  if (!ideas.length) list.innerHTML = `<p class="hint">${L("Has descartado las ideas de ahora. Pulsa «Otra idea» o pídele algo distinto a Maestro.", "You dismissed the current ideas. Press «Another idea» or ask Maestro for something different.")}</p>`;
  if (dismissed.length && !state.trying) {
    const r = document.createElement("div");
    r.className = "ideas-dismissed";
    r.innerHTML = `<span>${L(`${dismissed.length} descartada${dismissed.length === 1 ? "" : "s"}: Maestro no te las vuelve a proponer.`, `${dismissed.length} dismissed: Maestro won't suggest ${dismissed.length === 1 ? "it" : "them"} again.`)}</span><button class="link" data-a="restore">${dismissed.length === 1 ? L("Recuperarla", "Bring it back") : L("Recuperarlas", "Bring them back")}</button>`;
    r.querySelector("button").onclick = restoreDismissed;
    list.appendChild(r);
  }
  ideas.forEach((idea, i) => {
    const trying = state.trying && state.trying.index === i;
    const el = document.createElement("div");
    el.className = "idea" + (trying ? " trying" : "");
    el.innerHTML = `<div class="t"></div><div class="p"></div>
      ${idea.concepto ? `<span class="tag"></span>` : ""}
      <div class="row">${trying
        ? `<button data-a="keep" class="primary">${L("Me gusta, me lo quedo", "I like it, keep it")}</button><button data-a="undo">${L("Deshacer", "Undo")}</button>`
        : `<button class="prehear" title="${L("Escúchala unos compases sin cambiar tu proyecto", "Hear it for a few bars without changing your project")}" ${state.trying ? "disabled" : ""}>${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button><button data-a="try" ${state.trying ? "disabled" : ""}>${icon("play", 12)} ${L("Probar y ver el código", "Try it and see the code")}</button>`}</div>
      ${state.trying ? "" : `<button data-a="dismiss" class="idea-dismiss" title="${L("No me gusta: descartar esta idea (Maestro no la vuelve a proponer)", "Not for me: dismiss this idea (Maestro won't suggest it again)")}" aria-label="${L("Descartar idea", "Dismiss idea")}">${icon("close", 14)}</button>`}`;
    el.querySelector(".t").textContent = idea.titulo;
    el.querySelector(".p").textContent = idea.porque;
    if (idea.concepto) el.querySelector(".tag").textContent = idea.concepto;
    const ph = el.querySelector(".prehear");
    if (ph) wirePreHear(ph, idea.cambios);
    const dz = el.querySelector(".idea-dismiss");
    if (dz) dz.onclick = (e) => { e.stopPropagation(); dismissIdea(idea); };
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
    <div class="inst-row">${INSTRUMENTS.map((i) => `<button class="inst-card" data-i="${i.id}" style="--k:${KIND_COLOR[i.kind]}"><span class="inst-art">${instThumb(i)}</span><span>${esc(L(i.es, i.en))}</span></button>`).join("")}${pinnedInstruments().map((p) => `<button class="inst-card inst-pinned" data-pin="${esc(p.id)}" title="${esc(L(p.es, p.en))} · s &quot;${esc(p.id)}&quot;"><span class="inst-art"><img src="${esc(p.photo)}" alt="" draggable="false"></span><span>${esc(L(p.es, p.en).split(/: | \(/)[0])}</span></button>`).join("")}<button class="inst-card inst-more" data-lib="1" title="${L("Biblioteca de instrumentos: cientos de instrumentos concretos", "Instrument library: hundreds of specific instruments")}"><span class="inst-art inst-more-art"><b>600+</b></span><span>${L("Biblioteca", "Library")}</span></button></div></div>`;
  box.querySelectorAll(".inst-card").forEach((b) => b.onclick = () => (b.dataset.pin ? openInstLib({ id: b.dataset.pin }) : b.dataset.lib ? openInstLib() : openInstrument(b.dataset.i)));
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
  const tabs = `<div class="inst-tabs">${INSTRUMENTS.map((i) => `<button data-i="${i.id}" class="${i.id === ins.id ? "active" : ""}" style="--k:${KIND_COLOR[i.kind]}"><span class="inst-art">${instThumb(i)}</span>${esc(L(i.es, i.en))}</button>`).join("")}<button data-lib="1" class="inst-tab-more"><span class="inst-art inst-more-art"><b>600+</b></span>${L("Más instrumentos", "More instruments")}</button></div>`;
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
    if (e.target.closest(".inst-tabs [data-lib]")) { $("#instrument").close(); return openInstLib({ cat: ({ piano: "pianos", bass: "basses", guitar: "guitars", sax: "woodwinds", trumpet: "brass", marimba: "mallets", kalimba: "world", drums: "percussion" })[inst.id] || "pianos" }); }
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
  {
    const pmi = state.chat.map((m) => !!(m.plan && (m.plan.estado === "en_marcha" || m.plan.estado === "pausado"))).lastIndexOf(true);
    if (pmi >= 0) box.insertAdjacentHTML("beforeend", planBarHTML(state.chat[pmi], pmi, planRun && planRun.mi === pmi));
  }
  state.chat.forEach((m, mi) => {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    el.dataset.mi = mi;
    el.textContent = m.content;
    if (m.planTag) el.insertAdjacentHTML("afterbegin", `<div class="pl-tag">${icon("steps", 12)} ${esc(m.planTag)}</div>`);
    if (m.plan) el.insertAdjacentHTML("beforeend", planHTML(m, mi, planRun && planRun.mi === mi));
    // Cómo ha usado Maestro las skills para decidir (justo debajo del texto, para que se vea)
    if (m.skills && m.skills.decisions && m.skills.decisions.length) el.insertAdjacentHTML("beforeend", decisionsHTML(m.skills.decisions, mi === state.chat.length - 1));
    if (m.explicacion && m.explicacion.length) {
      el.insertAdjacentHTML("beforeend", `<ul class="parts">${m.explicacion.map((p) =>
        `<li><code>${esc(p.fragmento)}</code><span>${esc(p.explicacion)}</span></li>`).join("")}</ul>`);
    }
    if (m.diff && m.diff.length) el.insertAdjacentHTML("beforeend", diffHTML(m.diff));
    if (m.descargas && m.descargas.length) el.insertAdjacentHTML("beforeend", fetchHTML(m, mi, fxPlaying));
    if (m.instrumentos && m.instrumentos.length) el.insertAdjacentHTML("beforeend", `<div class="inst-fetch">${m.instrumentos.map((x) => x.estado === "descargado"
      ? `<span class="ok">${icon("check", 13)} ${L("Instrumento descargado", "Instrument downloaded")}: <b>${esc(L(x.es, x.en))}</b> <code>${esc(x.id)}</code></span>`
      : `<button data-instlib="${esc(x.id)}">${icon("download", 13)} ${x.estado === "error" ? L("Reintentar", "Retry") : L("Descargar", "Download")} ${esc(L(x.es, x.en))}${x.mb ? ` · ${x.mb} MB` : ""}</button>`).join("")}</div>`);
    if (m.variantes && m.variantes.length) el.insertAdjacentHTML("beforeend", variantsHTML(m, mi, audition, (k) => variantDiff(m.variantes[k])));
    if (m.reto) el.insertAdjacentHTML("beforeend", `<div class="reto"><b>${L("Reto.", "Challenge.")}</b> ${esc(m.reto.replace(/^Reto:\s*/i, ""))}</div>`);
    if (m.changes) el.insertAdjacentHTML("beforeend", `<div class="changes">${esc(m.changes)}</div>`);
    if (m.links && m.links.length) el.insertAdjacentHTML("beforeend", `<div class="links">${m.links.map((a) =>
      `<a href="${esc(a.href)}" target="_blank" rel="noopener">${icon("link", 14)} ${esc(a.label)}</a>`).join("")}</div>`);
    if (m.controles && m.controles.length) el.insertAdjacentHTML("beforeend", controlsHTML(m.controles, state, mi));
    if (m.skills) el.insertAdjacentHTML("beforeend", skillsLineHTML(m.skills));
    if (m.trace && m.trace.events && m.trace.events.length) el.insertAdjacentHTML("beforeend", traceHTML(m.trace));
    box.appendChild(el);
  });
  // Mientras hay opciones por elegir, ocupan el sitio de las Ideas de Maestro
  const last = state.chat[state.chat.length - 1];
  // …y lo mismo mientras hay un plan por aprobar o en marcha
  const planOpen = state.chat.some((m) => m.plan && ["propuesto", "en_marcha", "pausado"].includes(m.plan.estado));
  $(".panel.assistant").classList.toggle("va-open", !!(last && last.variantes && last.picked == null && !last.dismissed) || planOpen);
  if (busy) box.insertAdjacentHTML("beforeend", `<div class="msg assistant typing">${planRun && planRun.label ? `<div class="pl-tag">${icon("steps", 12)} ${esc(planRun.label)}</div>` : ""}${L("Maestro está pensando…", "Maestro is thinking…")} <button class="link chat-cancel" data-cancel="1" title="${esc(L("Cancelar lo que has enviado (Esc)", "Cancel what you sent (Esc)"))}">${icon("stop", 12)} ${L("Cancelar", "Cancel")}</button>${liveTrace ? traceHTML(liveTrace, { live: true, open: traceOpen }) : ""}</div>`);
  box.scrollTop = box.scrollHeight;
  // Mientras Maestro piensa, el botón de enviar se convierte en «Cancelar»
  const sb = $("#chat-form button[type=submit]");
  if (sb && sb.classList.contains("is-stop") !== busy) {
    sb.classList.toggle("is-stop", busy);
    sb.innerHTML = icon(busy ? "stop" : "send", 18);
    sb.title = busy ? L("Cancelar (Esc)", "Cancel (Esc)") : L("Enviar", "Send");
  }
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
    [COURSE_OPEN(), L("Crear proyecto con wizard", "Create project with wizard"), L("Lluvia de ideas: diseñar mi canción", "Brainstorm: design my song"), ...Object.values(STYLES).map((s) => s.nombre), L("Sorpréndeme", "Surprise me")]);
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  if (text.startsWith(L("Lluvia de ideas", "Brainstorm"))) return openWizard();
  if (text === COURSE_OPEN() || /^(cursos?|courses?)\b/i.test(text)) return openCourses();
  if (text === COURSE_NEXT() && state.course) { const c = curCourse(); if (state.course.i < c.steps.length - 1) courseGo(state.course.i + 1); state.options = []; return renderChat(); }
  if (text === COURSE_ASK() && state.course) return courseAsk();
  if (text.startsWith(L("Crear proyecto con wizard", "Create project with wizard"))) return openBuilder();
  if (text === INSPIRE_CHIP() && state.reference) text = INSPIRE_PROMPT();
  if (text === GEN_AGAIN_CHIP()) return openImportSong({ generate: true, useLast: true, style: state.generated && state.generated.style });
  if (text === GEN_SONG_CHIP() && state.generated) text = GEN_SONG_PROMPT(state.generated);
  if (text === VA_UNDO() && undoPick()) { state.options = []; return renderChat(); }
  if (text === MEM_OPEN()) { state.options = []; renderChat(); return openMemory("memories"); }
  if (text === L("Abrir Mis estilos", "Open My styles")) { state.options = []; renderChat(); return openMemory("styles"); }
  if (text === CASE_CHIP()) {
    const m = [...state.chat].reverse().find((x) => x.caseDraft);
    state.options = state.options.filter((o) => o !== CASE_CHIP()); renderChat();
    return openMemory("cases", { caseDraft: m ? m.caseDraft : null });
  }
  {
    const pmi = openPlanIndex();
    if (pmi >= 0 && text === PLAN_RETRY()) { state.options = []; renderChat(); return runPlan(pmi, state.chat[pmi].plan.auto); }
    if (pmi >= 0 && (text === PLAN_START() || text === PLAN_STEPWISE() || text === PLAN_CONTINUE())) {
      state.options = []; renderChat();
      return runPlan(pmi, text !== PLAN_STEPWISE() && !(text === PLAN_CONTINUE() && !state.chat[pmi].plan.auto));
    }
    if (pmi >= 0 && text === PLAN_ALL()) state.chat[pmi].plan.estado = "reemplazado";
    if (text === PLAN_SPLIT() && server.llm && !state.offline) {
      const req = lastRealRequest();
      state.chat.push({ role: "user", content: text }); state.options = []; save(); renderChat();
      return askLLM({ forcePlan: true, request: req });
    }
  }
  if (text === L("Recuperar el chat", "Bring the chat back") && clearedChat) { state.chat = clearedChat.chat; state.options = clearedChat.options; clearedChat = null; save(); return renderChat(); }
  if (text.startsWith(L("Empieza tú con un ritmo", "You start with a beat"))) { const c = byId[state.style ? (state.style === "hiphop" || state.style === "lofi" ? "kickhh" : "kick4") : "kick4"]; const t = addComponent(c); if (t) teachAbout(c, t); return; }
  // «Descárgalo» / «Download it» con un paquete grande pendiente: se descarga sin pasar por la IA
  if (/^(desc[aá]rg(alo|ala|alos)?|b[aá]jalo|download( it)?|s[ií],? (desc[aá]rgalo|b[aá]jalo)|yes,? download( it)?)\b/i.test(text)) {
    const mi = state.chat.map((m) => !!(m.descargas && m.descargas.some((d) => d.estado === "permiso"))).lastIndexOf(true);
    if (mi >= 0) {
      state.chat.push({ role: "user", content: text }); state.options = []; save(); renderChat();
      for (const d of state.chat[mi].descargas.filter((x) => x.estado === "permiso")) await fetchChoice(state.chat[mi], mi, d, d.elegido || 0, false);
      const ok = state.chat[mi].descargas.filter((x) => x.estado === "descargado").map((x) => x.nombre);
      return sysMsg(ok.length ? L(`Descargado: ${ok.join(", ")}. Ya suena en tu canción.`, `Downloaded: ${ok.join(", ")}. It's playing in your song now.`) : L("No se pudo descargar.", "Couldn't download it."));
    }
  }
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
  if (/^\/[\w.-]+(:[\w.-]+)?(\s|$)/.test(text)) return say(L("Los comandos de los plugins (/nombre) necesitan la IA: configúrala en Ajustes y vuelve a escribirlo.", "Plugin commands (/name) need the AI: set it up in Settings and type it again."), state.options);
  offlineGuide(text);
}

// Razonamiento en directo: mientras la IA responde, preguntamos al servidor qué está haciendo
let liveTrace = null;
let traceOpen = false;
function startTrace() {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  liveTrace = { events: [], seconds: 0 };
  let stop = false;
  const paint = () => {
    const el = $("#chat .msg.typing"); if (!el) return;
    const box = $("#chat");
    const chatAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    const old = el.querySelector(".trace");
    const scroller = old && old.querySelector(".tr-body");
    const atBottom = !scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8;
    if (old) old.remove();
    el.insertAdjacentHTML("beforeend", traceHTML(liveTrace, { live: true, open: traceOpen }));
    const d = el.querySelector(".trace");
    d.addEventListener("toggle", () => { traceOpen = d.open; if (d.open) box.scrollTop = box.scrollHeight; });
    const b = d.querySelector(".tr-body"); if (b && atBottom) b.scrollTop = b.scrollHeight;
    if (chatAtBottom) box.scrollTop = box.scrollHeight;
  };
  const tick = async () => {
    if (stop) return;
    try { const r = await api(`/api/trace?id=${encodeURIComponent(id)}`); if (!stop && r.events) { liveTrace = r; paint(); } } catch { /* sin servidor */ }
    if (!stop) setTimeout(tick, 450);
  };
  setTimeout(tick, 250);
  return { id, end: () => { stop = true; const t = liveTrace; liveTrace = null; return t; } };
}
function keepTrace(t) {
  if (!t || !t.events) return undefined;
  // Se guarda con el mensaje (recortado) para poder releerlo luego
  const events = t.events.map((e) => ({ ...e, text: String(e.text).slice(-6000) }));
  return { events, seconds: t.seconds, done: true };
}

// Plan por pasos en marcha: { mi, label, stop }
let planRun = null;
function openPlanIndex() {
  for (let i = state.chat.length - 1; i >= 0; i--) {
    const p = state.chat[i].plan;
    if (p) return p.estado === "propuesto" || p.estado === "pausado" ? i : -1;
  }
  return -1;
}
function lastRealRequest() {
  const skip = new Set([PLAN_SPLIT(), PLAN_START(), PLAN_STEPWISE(), PLAN_CONTINUE(), PLAN_ALL()]);
  return ([...state.chat].reverse().find((m) => m.role === "user" && !skip.has(m.content)) || {}).content || "";
}

async function runPlan(mi, auto) {
  const m = state.chat[mi]; if (!m || !m.plan || busy || planRun) return;
  const p = m.plan;
  p.auto = auto; p.estado = "en_marcha";
  planRun = { mi, label: "", stop: false };
  save(); renderChat();
  while (true) {
    const i = nextPlanStep(p);
    if (i < 0) break;
    const step = p.pasos[i];
    step.estado = "haciendo"; delete step.error;
    planRun.label = L(`Paso ${i + 1} de ${p.pasos.length} · ${step.titulo}`, `Step ${i + 1} of ${p.pasos.length} · ${step.titulo}`);
    save(); renderChat();
    const res = await askLLM({ planStep: { titulo: p.titulo, resumen: p.resumen, peticion: p.peticion, i, pasos: p.pasos.map((x) => ({ titulo: x.titulo, que: x.que, estado: x.estado })) }, planTag: planRun.label });
    if (!res.ok && res.cancelled) {
      step.estado = "pendiente";
      p.estado = "pausado";
      sysMsg(L(`Plan en pausa: cancelaste el paso ${i + 1}. Lo hecho hasta aquí sigue guardado.`, `Plan paused: you cancelled step ${i + 1}. Everything done so far is still saved.`));
      break;
    }
    if (!res.ok) {
      step.estado = "error";
      step.error = res.timeout ? L("La IA tardó demasiado en este paso. Lo hecho hasta aquí está guardado: reinténtalo.", "The AI took too long on this step. Everything done so far is saved: retry it.") : res.error;
      p.estado = "pausado";
      break;
    }
    step.estado = "hecho";
    save();
    if (planRun.stop || !p.auto) { if (nextPlanStep(p) >= 0) { p.estado = "pausado"; } break; }
  }
  if (planDone(p)) p.estado = "terminado";
  planRun = null;
  if (p.estado === "terminado") {
    say(L(`¡Plan «${p.titulo}» terminado! Escucha la canción entera. Puedes deshacer cualquier paso en el Historial o pedirme retoques.`, `Plan «${p.titulo}» finished! Listen to the whole song. You can undo any step in History or ask me for tweaks.`),
      [L("Dame ideas para mejorarla", "Give me ideas to improve it"), L("Explícame la canción", "Explain the song to me")]);
  } else {
    const ni = nextPlanStep(p);
    state.options = p.estado !== "pausado" || ni < 0 ? [] : p.pasos[ni].estado === "error" ? [PLAN_RETRY()] : [PLAN_CONTINUE()];
    save(); renderChat();
  }
}

// Petición en curso al chat, para poder cancelarla: { controller, trace, text }
let inflight = null;
function cancelChat() {
  if (!inflight) return;
  const f = inflight; inflight = null;
  f.cancelled = true;
  f.controller.abort();
  api("/api/chat/cancel", { trace: f.trace }).catch(() => {});
}

async function askLLM(opts = {}) {
  busy = true;
  const trace = startTrace();
  const me = { controller: new AbortController(), trace: trace.id, text: opts.planStep ? "" : lastRealRequest() };
  inflight = me;
  renderChat();
  try {
    let history = state.chat.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content + variantsContext(m) + fetchContext(m) + planContext(m) }));
    if (opts.planStep) history.push({ role: "user", content: L(`Haz el paso ${opts.planStep.i + 1} del plan: ${opts.planStep.pasos[opts.planStep.i].titulo}`, `Do step ${opts.planStep.i + 1} of the plan: ${opts.planStep.pasos[opts.planStep.i].titulo}`) });
    if (opts.forcePlan && opts.request) history.push({ role: "user", content: L(`Hazlo por pasos con un plan: ${opts.request}`, `Do it in steps with a plan: ${opts.request}`) });
    if (!server.samples) { try { server.samples = (await api("/api/samples")).sounds.map((x) => ({ name: x.name, type: x.type, n: x.files.length })); } catch { server.samples = []; } }
    const session = {
      curso: state.course ? (() => { const c = curCourse(); return c ? { id: state.course.id, nombre: c.name, tradicion: c.tradition, skill: c.skill, paso: state.course.i + 1, ...(c.variant ? { variante: c.variant.name } : {}), ...(c.form ? { forma: c.form.map((f) => `${f.name} (${f.bars} compases)`).join(" · ") } : {}), ...(c.ref ? { ejemplo_real: `${c.ref.style}: ${c.ref.note}` } : {}), ...(state.course.mine ? { ejemplo_del_alumno: state.course.mine.reference } : {}) } : undefined; })() : undefined,
      max_tracks: maxTracks(), bpm: state.bpm, bpm_lock: !!state.bpmLock, song_id: state.projectId || "", step: state.step, style: state.style, lastError: state.lastError, samples: server.samples, variantes: variantsEnabled(), descargas: fetchEnabled(),
      plan_modo: planEnabled() && !state.course, ...(opts.planStep ? { plan_paso: opts.planStep } : {}), ...(opts.forcePlan ? { plan_forzar: true } : {}),
      referencia: state.reference || undefined,
      master: state.master || undefined,
      estilo: state.styleUse || undefined,
      name: state.name || "", opciones_recientes: recentOptions(state.chat),
      ideas_descartadas: dismissed.length ? dismissed.slice(-25).map((d) => d.t) : undefined,
      tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: t.muted, ...(t.mix ? { mezcla_db: t.mix } : {}), ...(t.solo ? { solo: true } : {}), ...(t.lock ? { lock: t.lock } : {}),
        ...(t.edited ? { name: t.name + L(" (editada a mano por el alumno)", " (edited by hand by the student)") } : {}) })),
    };
    if (state.score && state.score.parts && state.score.parts.length) session.score = state.score;
    state.tracks.forEach((t) => delete t.edited);
    // Huella de cada pista que vio Maestro: si una pista que él cambia ha cambiado mientras pensaba, su propuesta no se aplica sola
    const sentCodes = Object.fromEntries(state.tracks.map((t) => [t.id, hashText(t.code)]));
    const sentBpm = state.bpm;
    const r = await api("/api/chat", { messages: history, session, trace: trace.id }, me.controller.signal);
    if (me.cancelled) throw Object.assign(new Error("cancelled"), { data: { cancelled: true } });
    inflight = null;
    const lastTrace = trace.end();
    busy = false;
    if ((r.descargas || []).some((d) => d.estado === "descargado")) { server.samples = null; sm.mine = null; }
    if (r.paso) state.step = r.paso;
    // Si la canción cambió mientras Maestro pensaba, sus cambios no se aplican solos: se ofrecen como opción para escuchar
    const rc = r.cambios || {};
    const touched = [...(rc.pistas || []).map((p) => p.id), ...(rc.eliminar || [])];
    const nowCode = (id) => { const t = state.tracks.find((x) => x.id === id); return t ? hashText(t.code) : undefined; };
    const stale = touched.filter((id) => nowCode(id) !== sentCodes[id]);
    if (stale.length || (rc.bpm && state.bpm !== sentBpm)) {
      r.variantes = [{ titulo: L("La propuesta de Maestro", "Maestro's proposal"), concepto: "",
        descripcion: L("Tu canción cambió mientras Maestro pensaba, así que no la aplico sola: escúchala sobre lo que suena ahora y elígela si te convence.",
          "Your song changed while Maestro was thinking, so I won't apply it on its own: listen to it over what's playing now and pick it if you like it."),
        cambios: rc }, ...(r.variantes || [])].slice(0, 4);
      r.cambios = {};
    }
    const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
    let summary = applyChanges(r.cambios || {});
    if (r.bloqueado && r.bloqueado.length) summary = (summary ? summary + " · " : "") + L("candados (descartado por el servidor): ", "locks (dropped by the server): ") + r.bloqueado.join(", ");
    if (r.memoria_nueva && r.memoria_nueva.length) {
      // En la respuesta local («recuerda que…») el mensaje ya lo cuenta; con IA lo añado debajo
      if (!r.local) summary = (summary ? summary + " · " : "") + memoNote(r.memoria_nueva);
      refreshMemBadge();
    }
    if (r.estilos_guardados && r.estilos_guardados.length) markSavedStyles(r.estilos_guardados);
    if (r.recetas_nuevas && r.recetas_nuevas.length) summary = (summary ? summary + " · " : "") + L("receta nueva en tu recetario: ", "new recipe in your recipe book: ") + r.recetas_nuevas.map((x) => L(x.name_es, x.name_en)).join(", ");
    const diff = diffFor(before, r.cambios || {});
    if (r.sugerencias && r.sugerencias.length) state.ideas = r.sugerencias.filter((x) => !isDismissed(x));
    let controles = normalizeControls(r.controles, state.tracks);
    const lastUser = (state.chat.filter((m) => m.role === "user").pop() || {}).content || "";
    if (!opts.planStep && !controles.length && CTL_RE.test(lastUser) && selectedTrack()) controles = controlsFor(selectedTrack(), { bpm: /bpm|tempo|velocidad|speed/i.test(lastUser), samples: server.samples || [] });
    countUse(r.skills);
    if (r.variantes && r.variantes.length) {
      stopAudition();
      state.chat.forEach((m) => { if (m.variantes && m.picked == null) m.dismissed = true; });
    }
    let plan;
    if (r.plan && !opts.planStep) {
      // Un plan nuevo sustituye al que hubiera sin terminar
      state.chat.forEach((m) => { if (m.plan && (m.plan.estado === "propuesto" || m.plan.estado === "pausado")) m.plan.estado = "reemplazado"; });
      plan = newPlan(r.plan, opts.request || lastRealRequest());
    }
    const options = plan ? [PLAN_START(), PLAN_STEPWISE(), PLAN_ALL()] : opts.planStep ? [] : (r.opciones || []);
    say(r.mensaje || "…", options, { ...(plan ? { plan } : {}), ...(opts.planTag ? { planTag: opts.planTag } : {}), ...(r.variantes && r.variantes.length ? { variantes: r.variantes } : {}), ...(r.descargas && r.descargas.length ? { descargas: r.descargas } : {}), ...(r.instrumentos && r.instrumentos.length ? { instrumentos: r.instrumentos } : {}), explicacion: r.explicacion, reto: r.reto, changes: summary, diff, ...(controles.length ? { controles } : {}), ...(r.skills ? { skills: { ...r.skills, ...(r.command ? { command: r.command } : {}) } } : {}), ...(keepTrace(r.trace || lastTrace) ? { trace: keepTrace(r.trace || lastTrace) } : {}) });
    renderIdeas();
    return { ok: true, r };
  } catch (e) {
    trace.end();
    busy = false;
    if (inflight === me) inflight = null;
    if (me.cancelled || e.name === "AbortError" || (e.data && e.data.cancelled)) {
      // Cancelado: no se aplica nada. Lo que escribiste vuelve a la caja para que lo cambies si quieres
      if (opts.planStep) { renderChat(); return { ok: false, cancelled: true }; }
      const inp = $("#chat-input");
      if (inp && !inp.value && me.text && !opts.forcePlan) inp.value = me.text;
      sysMsg(L("Cancelado: no he cambiado nada en tu canción. Tu mensaje está otra vez en la caja por si quieres cambiarlo.", "Cancelled: I didn't change anything in your song. Your message is back in the box in case you want to change it."));
      return { ok: false, cancelled: true };
    }
    const timeout = !!(e.data && e.data.timeout);
    if (opts.planStep) { renderChat(); return { ok: false, timeout, error: e.message }; }
    if (timeout) {
      say(L("La IA ha tardado demasiado: lo que has pedido es grande para una sola respuesta. Lo hago por pasos: primero te enseño un plan y luego voy paso a paso, guardando cada uno.", "The AI took too long: what you asked for is big for a single answer. Let me do it in steps: first I'll show you a plan, then go step by step, saving each one."),
        [PLAN_SPLIT(), L("Inténtalo otra vez", "Try again")]);
      return { ok: false, timeout };
    }
    say(L("Uy, no he podido hablar con la IA: ", "Oops, I couldn't reach the AI: ") + e.message + L("\n\nRevisa los Ajustes. Mientras tanto te sigo guiando sin IA.", "\n\nCheck Settings. Meanwhile I'll keep guiding you without AI."), [L("Seguir sin IA", "Continue without AI")]);
    return { ok: false, error: e.message };
  }
}

function applyChanges(c) {
  const notes = [];
  // Candados: lo bloqueado no se toca (pistas enteras, partes, BPM). Lo que se descarta se avisa en el resumen.
  const g = guardChanges(state, c || {});
  c = g.cambios;
  if (c.bpm && Math.round(c.bpm) !== state.bpm) {
    state.bpm = Math.round(c.bpm); $("#bpm").value = state.bpm;
    notes.push(`${state.bpm} BPM`);
    if (live()) evalCode(cps(state.bpm));
  }
  for (const id of c.eliminar || []) {
    const t = state.tracks.find((x) => x.id === id);
    if (t) { if (t.fromScore) unlinkTrack(state, t); removeTrack(id); notes.push(L(`borrada ${id}`, `deleted ${id}`)); }
  }
  if (c.score_meta && state.score) { state.score.key = c.score_meta.key || state.score.key; state.score.meter = c.score_meta.meter || state.score.meter; }
  for (const p of c.pistas || []) {
    p.codigo = fixNegatives(p.codigo);
    let t = state.tracks.find((x) => x.id === p.id);
    if (t) { t.code = p.codigo; t.name = p.nombre || t.name; t.kind = p.tipo || t.kind; t.muted = false; t.explain = null; notes.push(L(`cambiada ${p.id} ${t.name}`, `changed ${p.id} ${t.name}`)); }
    else { t = { id: p.id, name: p.nombre, kind: p.tipo, code: p.codigo, muted: false }; state.tracks.push(t); notes.push(L(`nueva ${p.id} ${t.name}`, `new ${p.id} ${t.name}`)); }
    // Melodía, acordes o bajo que caben en una partitura: van también al cuaderno (la partitura de la canción)
    if (p.parte) linkPart(state, t, p.parte);
    else if (t.fromScore) unlinkTrack(state, t);
    state.tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    state.selected = p.id;
    if (live()) playTrack(t);
  }
  if (g.blocked.length) notes.push(L("bloqueado, no se ha aplicado: ", "locked, not applied: ") + blockedText(g.blocked));
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
  if (variantsEnabled() && state.tracks.length && /opcion|opción|options?\b|sorpr|surprise|variaci|variation/.test(low)) {
    // Sin IA: opciones hechas con las ideas y recetas de estilo locales
    const pool = localSuggestions(state, 3, true);
    const keys = Object.keys(FLAVORS).filter((k) => k !== state.style);
    for (let i = 0; pool.length < 4 && i < keys.length; i++) { const f = flavorIdea(keys[(flavorTurn + i) % keys.length], state.tracks); if (f) pool.push(f); }
    flavorTurn++;
    const variantes = pool.slice(0, 4).map((x) => ({ titulo: x.titulo, descripcion: x.porque, concepto: x.concepto, cambios: x.cambios }));
    if (variantes.length) {
      stopAudition();
      state.chat.forEach((m) => { if (m.variantes && m.picked == null) m.dismissed = true; });
      return say(L("Sin IA puedo proponerte estas opciones. Escúchalas sobre tu canción y elige la que más te guste.", "Without AI I can offer you these options. Listen to them over your song and pick the one you like best."), state.options, { variantes });
    }
  }
  const want = fetchEnabled() && text.match(/(?:descarga|descárgame|bájame|baja|busca|búscame|consigue|download|get|find|fetch)\s+(?:me\s+)?(?:un|una|unos|a|an|some)?\s*(?:sample|sonido|sound)s?\s+(?:de|del|of|for|with)?\s*(.{2,40})$/i);
  const addFx = text.match(/^(?:Añadir pista con|Add a track with) ([a-z0-9_]+)$/);
  if (addFx) {
    const m = [...state.chat].reverse().find((x) => x.descargas && x.descargas.some((d) => d.nombre === addFx[1]));
    const t = { id: freeId(), name: addFx[1], kind: typeKind((m && m.fxType) || "percusion"), code: starterCode(addFx[1], (m && m.fxType) || "percusion"), muted: false };
    state.tracks.push(t); state.selected = t.id; if (live()) playTrack(t); changed();
    return say(L(`Nueva pista ${t.id} con «${addFx[1]}». Cambia el ritmo en el código y escucha.`, `New track ${t.id} with «${addFx[1]}». Change the rhythm in the code and listen.`), state.options, { explicacion: explainLocal(t.code).partes.slice(0, 4) });
  }
  const want2 = !want && fetchEnabled() && text.match(/^(?:download|get|find|fetch)\s+(?:me\s+)?(?:a|an|some)\s+(.{2,30}?)\s+(?:sample|sound)s?[.!]?$/i);
  if (want || want2) return offlineFetch((want || want2)[1].replace(/[.!?¿¡]+$/, "").trim());
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
const FRESH = () => ({ lang: LANG, bpm: 120, tracks: [], extra: "", file: null, selected: null, style: "", step: "estilo", chat: [], options: [], ideas: [],
  trying: null, learnedMusic: state.learnedMusic || [], lastError: "", offline: state.offline, projectId: "p" + Date.now(), name: "" });

function renderAll() {
  $("#bpm").value = state.bpm; $("#proj-name").value = state.name || "";
  renderCatalog(); renderTracks(); renderProgress(); renderIdeas(); renderChat(); renderCourse(); renderTimeline();
  $("#code").value = buildCode();
  renderFileStatus();
  renderTabs();
}
async function openNewProject() {
  $("#np-kicker").innerHTML = icon("plus", 16) + L(" Nuevo proyecto", " New project");
  const body = $("#np-body");
  body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">${L("¿Cómo quieres empezar?", "How do you want to start?")}</h2>
    <p class="wz-help">${L("Se abre en una pestaña nueva: tu canción actual sigue abierta en la suya (y guardada en «Mis proyectos»).", "It opens in a new tab: your current song stays open in its own tab (and saved in «My projects»).")}</p>
    <div class="np-choices">
      <button class="np-choice" data-m="blank">${icon("blank", 28)}<b>${L("En blanco", "Blank")}</b><span>${L("Un lienzo vacío. Tú añades cada pieza desde el catálogo o pidiéndosela a Maestro.", "An empty canvas. You add each piece from the catalog or by asking Maestro.")}</span></button>
      <button class="np-choice rec" data-m="wizard"><em>${L("Recomendado", "Recommended")}</em>${icon("steps", 28)}<b>${L("Con wizard", "With wizard")}</b><span>${L("Vas pulsando opciones paso a paso (estilo, ritmo, bajo, acordes…) y se crea tu proyecto base. Todo suena mientras eliges.", "Click options step by step (style, beat, bass, chords…) and your base project is built. Everything plays while you choose.")}</span></button>
      <button class="np-choice" data-m="ideas">${icon("wand", 28)}<b>${L("Lluvia de ideas", "Brainstorm")}</b><span>${L("Maestro te hace preguntas abiertas sobre lo que quieres sentir y diseña contigo un plan.", "Maestro asks you open questions about what you want to feel and designs a plan with you.")}</span></button>
      <button class="np-choice" data-m="import">${icon("upload", 28)}<b>${L("Desde una canción", "From a song")}</b><span>${L("Importa un MIDI o un audio: lo convierto en pistas y Maestro te ayuda a crear algo nuevo inspirado en ella.", "Import a MIDI or audio file: I turn it into tracks and Maestro helps you create something new inspired by it.")}</span></button>
      <button class="np-choice" data-m="style">${icon("palette", 28)}<b>${L("Desde uno de mis estilos", "From one of my styles")}</b><span>${L("Tu groove, tus papeles e instrumentos y tu tempo, sin repetir las notas: como inspiración para Maestro, transformado a otra tonalidad o tempo, o copiado tal cual.", "Your groove, roles, instruments and tempo, without repeating the notes: as inspiration for Maestro, transformed to another key or tempo, or copied as is.")}</span></button>
      <button class="np-choice" data-m="generate">${icon("wand", 28)}<b>${L("Generar desde mi MIDI", "Generate from my MIDI")}</b><span>${L("Sube tu MIDI, elige un estilo (merengue, salsa, bossa, jazz, house…) y qué te quedas (melodía, acordes, bajo, batería). Escribo el resto en ese estilo.", "Upload your MIDI, pick a style (merengue, salsa, bossa, jazz, house…) and what to keep (melody, chords, bass, drums). I write the rest in that style.")}</span></button>
    </div>`;
  body.querySelector(".np-choices").onclick = (e) => {
    const m = e.target.closest("button")?.dataset.m;
    if (!m) return;
    if (m === "import") return openImportSong();
    if (m === "generate") return openImportSong({ generate: true });
    if (m === "style") { $("#newproj").close(); return openMemory("styles"); }
    $("#newproj").close();
    if (m === "blank") startBlank();
    if (m === "wizard") openBuilder();
    if (m === "ideas") { startFresh(); openWizard(); }
  };
  $("#newproj").showModal();
}
// Importar una canción (MIDI o audio) como punto de partida: ver web/importsong.js
// Lo importado se abre en una pestaña nueva (adoptImport → startFresh), así que no hace falta preguntar por cambios sin guardar
async function openImportSong(opts = {}) {
  const dlg = $("#newproj");
  let listening = false, adopted = false;
  dlg.addEventListener("close", () => { if (listening && !adopted) evalCode("hush"); }, { once: true });
  openImport({
    body: $("#np-body"), kicker: $("#np-kicker"),
    open: () => { if (!dlg.open) dlg.showModal(); }, close: () => { adopted = true; dlg.close(); }, isOpen: () => dlg.open,
    hush: () => { listening = false; evalCode("hush"); },
    listen: async (tracks, bpm) => {
      listening = true;
      await ensureInstruments(tracks.map((t) => t.codigo));
      if (listening) evalCode(["hush", cps(bpm), ...tracks.map((t, i) => `d${i + 1} $ ${t.codigo}`)].join("\n\n"));
    },
    adopt: adoptImport,
  }, opts);
}
function adoptImport(r) {
  startFresh();
  state.name = r.name;
  state.bpm = Math.max(40, Math.min(220, Math.round(r.bpm || 120)));
  state.tracks = r.tracks.slice(0, maxTracks()).map((t, i) => ({ id: "d" + (i + 1), name: t.nombre, kind: t.tipo, code: fixNegatives(t.codigo), muted: false }));
  state.reference = r.reference; state.refSummary = r.summary;
  state.step = "libre";
  resetHistory(state);
  if (r.generated) {
    // Una versión generada desde tu MIDI en un estilo: Maestro cuenta qué ha hecho con cada pista
    const { tracks: gt, ...g } = r.generated;
    state.generated = g;
    renderAll(); renderHistoryButtons();
    ensureInstruments(state.tracks.map((t) => t.code)).then(() => { if (live()) playAll(true); });
    return say(generatedSummary(r.generated, state.name),
      [GEN_AGAIN_CHIP(), ...(useLLM() ? [GEN_SONG_CHIP()] : []), L("Explícame cómo está hecha", "Explain how it's made"), CTL_CHIP()]);
  }
  const intro = importedSummary(r.summary, state.tracks.length);
  renderAll(); renderHistoryButtons();
  if (live()) playAll(true);
  if (r.inspire && useLLM()) {
    say(intro + L("\n\nAhora la uso de referencia para crear contigo algo nuevo…", "\n\nNow I'll use it as a reference to create something new with you…"));
    return send(INSPIRE_PROMPT());
  }
  say(intro + (r.inspire
    ? L("\n\nPara hacerla tuya sin copiarla, prueba esto (yo lo haría en este orden):\n• Cambia el sonido de la melodía o de los acordes (por ejemplo superpiano → superhammond).\n• Mantén el ritmo y el bajo, pero inventa una melodía nueva sobre los mismos acordes.\n• Sube o baja el tempo 10-20 BPM y mira cómo cambia la energía.\n• Cambia un acorde de la progresión por otro de la misma tonalidad.", "\n\nTo make it yours without copying it, try this (I'd do it in this order):\n• Change the sound of the melody or chords (for example superpiano → superhammond).\n• Keep the beat and the bass, but invent a new melody over the same chords.\n• Raise or lower the tempo by 10-20 BPM and notice how the energy changes.\n• Swap one chord of the progression for another one in the same key.")
    : L("\n\nPulsa «Explícame» en cualquier pista para entender su código, o silencia pistas para escuchar cada parte por separado.", "\n\nPress «Explain» on any track to understand its code, or mute tracks to hear each part on its own.")),
    [INSPIRE_CHIP(), L("Explícame cómo está hecha", "Explain how it's made"), CTL_CHIP()]);
}
const INSPIRE_CHIP = () => L("Crear algo nuevo inspirado en ella", "Create something new inspired by it");

// 0.18: «Mis estilos». Tres maneras de usar un estilo: inspiración (Maestro compone material nuevo con sus
// relaciones), transformación (el groove se queda y el resto se reescribe en otra tonalidad/tempo/instrumentos)
// y copia literal (las pistas tal cual; solo si la eliges, y queda en el registro de Memoria)
const STYLE_MODE = { inspiration: ["inspiración", "inspiration"], transformation: ["transformación", "transformation"], literal: ["copia literal", "literal copy"] };
async function useStyle(st, mode) {
  if (mode === "inspiration" && !useLLM()) {
    // Sin IA no hay inspiración: hago una transformación con el generador del estudio (otra versión cada vez)
    try {
      const r = await api("/api/styles/transform", { id: st.id, seed: Math.floor(Math.random() * 1000) + 2 });
      return adoptStyleTracks(st, r.tracks, r.bpm, "transformation", r, L("Sin IA no puedo componer «inspirado en»: te he hecho una transformación con el generador del estudio. ", "Without AI I can't compose «inspired by»: I made you a transformation with the studio's generator. "));
    } catch (e) { return toast(e.message.split("|")[0]); }
  }
  startFresh();
  state.name = L(`Nueva canción · ${st.name}`, `New song · ${st.name}`);
  state.bpm = st.bpm; $("#bpm").value = st.bpm;
  if (st.genre) state.style = st.genre;
  state.styleUse = { id: st.id, modo: "inspiration" };
  state.step = "libre";
  renderAll();
  return send(L(`Compón una canción nueva inspirada en mi estilo «${st.name}»: usa su groove, sus papeles e instrumentos y un tempo parecido, pero con material nuevo (no copies sus pistas). Empieza por la base rítmica y el bajo.`,
    `Write a new song inspired by my style «${st.name}»: use its groove, its roles and instruments and a similar tempo, but with new material (don't copy its tracks). Start with the beat and the bass.`));
}
function adoptStyleTracks(st, tracks, bpm, mode, res, prefix = "") {
  startFresh();
  state.name = mode === "literal" ? L(`Copia de ${st.name}`, `Copy of ${st.name}`) : L(`${st.name} (${res && res.key ? res.key : "nueva"})`, `${st.name} (${res && res.key ? res.key : "new"})`);
  state.bpm = Math.max(40, Math.min(220, Math.round(bpm || st.bpm || 120))); $("#bpm").value = state.bpm;
  state.style = (res && res.genre) || st.genre || state.style;
  state.styleUse = { id: st.id, modo: mode };
  state.tracks = tracks.slice(0, maxTracks()).map((t, i) => ({ id: t.id || "d" + (i + 1), name: t.name || t.id, kind: t.kind || "", code: fixNegatives(t.code), muted: false }));
  state.step = "libre";
  resetHistory(state);
  renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons();
  ensureInstruments(state.tracks.map((t) => t.code)).then(() => { if (live()) playAll(true); });
  save();
  say(prefix + (mode === "literal"
    ? L(`Copia literal de «${st.name}»: sus ${state.tracks.length} pistas tal cual, con sus notas. Queda anotada en el registro de Memoria.`, `Literal copy of «${st.name}»: its ${state.tracks.length} tracks as they are, with their notes. It's noted in the Memory log.`)
    : L(`«${st.name}» transformado a ${res.key}, ${state.bpm} BPM: el groove es el de tu estilo y el bajo, los acordes y la melodía están escritos de nuevo para ${res.genre}.`, `«${st.name}» transformed to ${res.key}, ${state.bpm} BPM: the groove is your style's, and the bass, chords and melody are written again for ${res.genre}.`)),
    [L("Explícame cómo está hecha", "Explain how it's made"), L("Dale otro aire a la melodía", "Give the melody a different feel"), MEM_OPEN()]);
}

// Canción nueva en una pestaña nueva (la de antes sigue abierta en la suya)
function startFresh() {
  openTabSlot();
  state = FRESH();
  // Ajuste «Crear las canciones nuevas directamente en GitHub»: sea cual sea la plantilla
  // (en blanco, asistente, lluvia de ideas, curso, MIDI…) la canción nace en el repositorio
  if (server.github && server.ghNew) state.github = { pending: true };
  resetHistory(state);
  tabOpened();
  renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons();
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
      ${p.id === state.projectId ? `<span class="hint">${L("abierto", "open")}</span>` : `${tabs.ids.includes(p.id) ? `<span class="hint">${L("en otra pestaña", "in another tab")}</span>` : ""}<button data-a="open">${tabs.ids.includes(p.id) ? L("Ir", "Go") : L("Abrir", "Open")}</button>`}
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
      $("#newproj").close();
      if (focusTabIf((s, tid) => tid === id)) return;
      if (busy) return busyMsg();
      const p = listProjects().find((x) => x.id === id);
      if (!p) return;
      openTabSlot();
      state = { ...FRESH(), ...p.data, projectId: id, trying: null };
      restoreHistory(state, null); tabOpened();
      renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons(); if (live()) playAll();
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
  syncCodeTab();
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
    if (b.dataset.fx) {
      e.stopPropagation();
      const t = state.tracks.find((y) => y.id === k.id); if (!t) return;
      ctlApply(k.mi, () => { t.code = applyEdit(t.code, b.dataset.fx, "toggle"); return t; });
      return refreshPanel(k.mi);
    }
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
        if (c.que === "sonido") { const [nm, vv] = o.split(":"); const cur = ctl.querySelector(".ctl-opts button.on")?.dataset.o?.split(":")[0]; const code = swapSound(t.code, nm, vv ? +vv : null, cur); if (code) { noteSoundChange(t, t.code); t.code = code; } }
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
  const tabs = [["builtin", "wave", L("Incluidos", "Built-in")], ["mine", "folder", L("Mis samples", "My samples")], ["loops", "loop", L("Loops largos", "Long loops")],
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
  if (sm.tab === "loops") html += `<div id="lp-root"></div>`;
  body.innerHTML = html;
  if (sm.tab === "loops") mountLoops($("#lp-root"));
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
    noteSoundChange(t, t.code);
    t.code = code; t.explain = null; changed(); if (live()) playTrack(t);
    $("#samples").close();
    return say(L(`He cambiado el sonido de ${t.id} a «${name}» sin tocar el ritmo. Fíjate: solo cambian las palabras dentro de s "…"; los ~, * y [ ] siguen igual. Así pruebas sonidos sin reescribir nada.`, `I changed ${t.id}'s sound to «${name}» without touching the rhythm. Notice: only the words inside s "…" change; the ~, * and [ ] stay the same. That way you try sounds without rewriting anything.`), state.options);
  }
  const lc = loopCodeFor(name);
  const t = addTrack(name, lc ? loopKindFor(name) : typeKind(type), lc || starterCode(name, type));
  if (!t) return;
  $("#samples").close();
  if (!(state.options || []).includes(CTL_CHIP())) state.options = [CTL_CHIP(), ...(state.options || [])].slice(0, 6);
  say(L(`Nueva pista ${t.id} con «${name}». En Tidal un sample se elige por su nombre de carpeta, y «:n» elige la variante (${name.split(":")[0]}:0, ${name.split(":")[0]}:1…).`, `New track ${t.id} with «${name}». In Tidal a sample is picked by its folder name, and «:n» picks the variant (${name.split(":")[0]}:0, ${name.split(":")[0]}:1…).`), state.options, { explicacion: explainLocal(t.code).partes });
}
function wireSamples() {
  const body = $("#sm-body");
  $("#samples").addEventListener("close", () => { smStop(); stopLoop(); });
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { smStop(); stopLoop(); sm.tab = b.dataset.tab; sm.type = ""; return renderSamples(); }
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
// --- biblioteca de instrumentos (web/instlib.js)
function wireInstLib() {
  initInstLib({
    api, state, toast, beep, isSim, evalCode,
    addTrack: (name, kind, code) => addTrack(name, kind, code),
    say: (text, code) => say(text, state.options, { explicacion: explainLocal(code).partes }),
    onPinsChanged: () => renderCatalog(),
    restartEngine: async () => { await api("/api/engine/stop", {}); await api("/api/engine/start", {}); refreshStatus(); },
  });
  mountInstLib();
  $("#btn-instlib").onclick = () => openInstLib();
}
// --- teclado MIDI (web/midikeys.js): tu piano suena y se traduce a pistas de Tidal
function wireMidi() {
  initAudioStatus();
  initMidi({
    toast, beep: (m) => beep(m, "piano", 0.6),
    bpm: () => state.bpm,
    // sonidos para tocar: los de siempre, los instrumentos que has fijado y los que ya usa tu canción
    sounds: () => [...pinnedInstruments().map((p) => p.id), ...state.tracks.flatMap((t) => [...t.code.matchAll(/#\s*s\s+"([\w.-]+)"/g)].map((m) => m[1]))],
    ensure: (snd) => ensureInstruments([`note "c" # s "${snd}"`], { quiet: true }),
    preview: async (tracks, bpm, synced) => {
      await ensureInstruments(tracks.map((t) => t.codigo), { quiet: true });
      const ids = []; for (let i = maxTracks(); i >= 1 && ids.length < tracks.length; i--) if (!state.tracks.find((t) => t.id === "d" + i)) ids.push("d" + i);
      preHear({ bpm: synced || bpm === state.bpm ? undefined : bpm, pistas: tracks.map((t, i) => ({ id: ids[i] || "d" + (maxTracks() - i), codigo: fixNegatives(t.codigo) })) });
    },
    stopPreview: () => stopPreHear(),
    // salida al teclado: pasar pistas a tu piano (s "midi") y volver
    tracks: () => state.tracks,
    patchTrack: (id, patch) => {
      const t = state.tracks.find((x) => x.id === id); if (!t) return;
      Object.assign(t, patch); t.explain = null;
      changed();
      if (live()) playTrack(t);
    },
    clockChanged: (on) => { if (!live()) return; evalCode(on ? clockLines(false).join("\n\n") : 'p "ts-midiclock" silence'); },
    addTracks: (tracks, bpm, synced) => {
      // Canción vacía: se queda con el tempo al que has tocado. Si no, va al tempo de tu canción (ya grabaste a ese).
      if (!state.tracks.length && !synced && bpm) { state.bpm = Math.max(40, Math.min(220, bpm)); $("#bpm").value = state.bpm; if (live()) evalCode(cps(state.bpm)); }
      const added = [];
      for (const t of tracks) { const x = addTrack(t.nombre, t.tipo, fixNegatives(t.codigo)); if (x) added.push(x); }
      ensureInstruments(added.map((t) => t.code), { quiet: true });
      return added;
    },
    adopt: (r) => adoptImport(r),
    generate: (name, bytes) => { rememberMidi(name, bytes); openImportSong({ generate: true, useLast: true }); },
    say: (text) => say(text, state.options),
    ask: (text) => (useLLM() ? send(text) : say(text.split("\n\n")[0] + "\n\n" + L("Para que Maestro te lo explique y te proponga cómo seguir, conecta una IA en Ajustes. Mientras, pulsa «Explícame» en las pistas nuevas.", "For Maestro to explain it and suggest how to continue, connect an AI in Settings. Meanwhile, press «Explain» on the new tracks."), state.options)),
  });
  $("#btn-midi").onclick = () => toggleMidi();
}
// --- librería única (web/library.js): todos los sonidos, incluidos y descargados, en una sola lista
const isReal = () => !!(server.engine && server.engine.superdirt_ready && !server.engine.simulation);
async function waitJob(r) {
  let job = r;
  while (job && job.state === "running") { await new Promise((ok) => setTimeout(ok, 600)); job = await api(`/api/instruments/job?id=${job.id}`); }
  if (job && job.state === "error") throw new Error(job.error);
  return job;
}
// Escuchar cualquier sonido de la librería: con el motor, en SuperDirt; sin él, una vista previa en el navegador
function hearEntry(e) {
  const ref = e.ref || e.sound;
  if (isReal() && e.installed) {
    if (e.kind === "hit" || e.kind === "loop") return evalCode(`once $ s "${ref}"`);
    return evalCode(`once $ n "0 4 7" # s "${e.sound}"${e.extra || ""}`);
  }
  smStop();
  if (e.origin === "library" || (e.origin === "mine" && e.kind === "pitched" && e.id)) { smAudio = new Audio(`/api/instruments/preview?id=${encodeURIComponent(e.id || e.sound)}&midi=60`); return smAudio.play().catch(() => {}); }
  if (e.origin === "mine" || e.origin === "loop") { const [n, i] = ref.split(":"); smAudio = new Audio(`/api/samples/file?name=${encodeURIComponent(n)}&i=${i || 0}`); return smAudio.play().catch(() => {}); }
  if (e.kind === "hit") return hearDirt(e.sound, 0);
  beep(60, "piano", 0.6);
}
// 0.16: selector de instrumentos. Los 3 sonidos que mejor encajan y YA SUENAN, sobre la misma frase de tu pista,
// junto al que tienes: eliges de oído (también a ciegas) y el ranking aprende de tu elección.
async function compareSounds(base, ta, track) {
  const card = ta && ta.closest(".track");
  const t = track || (card && state.tracks.find((x) => x.id === card.dataset.id));
  if (!t || !base) return;
  const style = state.course ? state.course.id : (state.style || "");
  let r = null;
  try { r = await (await fetch(`/api/sounds/rank?sound=${encodeURIComponent(base)}&role=${encodeURIComponent(t.kind || "")}&style=${encodeURIComponent(style)}&n=3`)).json(); } catch { /* sin servidor */ }
  const top = (r && r.top) || [];
  if (!top.length) {
    return sysMsg(L(`Ningún sonido parecido a «${base}» suena ahora mismo${r && !r.engine_ok ? " (el motor de sonido no está listo)" : ""}. Descarga alguno desde la Librería o el Laboratorio de sonido.`,
      `No sound similar to «${base}» plays right now${r && !r.engine_ok ? " (the sound engine isn't ready)" : ""}. Download one from the Library or the Sound lab.`));
  }
  const hit = r.base && r.base.kind === "hit";
  const opt = (e, current) => ({
    titulo: current ? L(`El que tienes: ${base}`, `The one you have: ${base}`) : L(e.es, e.en) || e.sound,
    descripcion: current ? L("Tu sonido de ahora, para comparar.", "Your current sound, to compare.")
      : L(`${e.sound}${e.learned > 0 ? " · te ha gustado antes" : ""}`, `${e.sound}${e.learned > 0 ? " · you liked it before" : ""}`),
    concepto: current ? "" : L("Sonido", "Sound"),
    suena: current ? L((r.base && r.base.sounds_like) || "", (r.base && r.base.sounds_like_en) || "") : L(e.sounds_like, e.sounds_like_en),
    cambios: { pistas: [{ id: t.id, nombre: t.name, tipo: t.kind, codigo: current ? t.code : replaceSound(t.code, base, e.sound, hit && e.kind === "hit") }] },
  });
  const variantes = [opt(null, true), ...top.map((e) => opt(e, false))];
  stopAudition();
  state.chat.forEach((m) => { if (m.variantes && m.picked == null) m.dismissed = true; });
  say(L(`Cuatro sonidos para ${t.id} «${t.name}», sobre la misma frase: el tuyo y los 3 que mejor encajan entre los que ya suenan. Escúchalos (o pulsa «A ciegas») y elige: el estudio aprende de tu elección.`,
    `Four sounds for ${t.id} «${t.name}», on the same phrase: yours and the 3 best matches among the ones that already play. Listen (or press «Blind») and pick: the studio learns from your choice.`),
    state.options, { variantes, soundPick: { role: t.kind || "", style, sounds: [base, ...top.map((e) => e.sound)] } });
}

async function installEntry(e) {
  if (e.kind === "engine") { $("#library").close(); openInstLib({ id: e.id }); throw new Error(L("Los motores se instalan desde su ficha.", "Engines are installed from their page.")); }
  const r = await api("/api/instruments/install", { id: e.id || e.sound });
  await waitJob(r);
}
// Código de partida de una pista con ese sonido (el mismo que usan la biblioteca de samples y la de instrumentos)
function entryCode(e) {
  if (e.kind === "loop") return loopCodeFor(e.ref) || `loopAt 2 $ chop 8 $ s "${e.ref}"`;
  if (e.kind === "hit") return starterCode(e.sound, ["bombo", "caja", "platos", "percusion", "voz", "fx"].includes(e.role) ? e.role : "percusion");
  if (e.kind === "midi") return `n "c e g e" # s "midi" # midichan 0`;
  return `n "c e g e" # s "${e.sound}"${e.extra || ""}`;
}
function wireLibrary() {
  initLibrary({
    toast, hear: hearEntry, install: installEntry,
    add: (e) => { const kind = e.kind === "hit" || e.kind === "loop" ? "percusion" : e.family === "basses" || e.family === "synth_bass" ? "bajo" : e.family === "synth_pad" ? "textura" : "melodia"; addTrack(L(e.es, e.en) || e.sound, kind, entryCode(e)); },
    openSamples: () => openSamples(), openInstLib: (o) => openInstLib(o),
  });
  // Asistente para cambiar un instrumento (web/replace.js): selecciona su nombre en el código
  initReplace({
    toast, hear: hearEntry, install: installEntry, compare: compareSounds,
    canAsk: () => useLLM(), ask: (text) => send(text),
    // un cambio en una caja de código: igual que si lo hubieras escrito tú
    commit: (ta) => {
      if (ta.id === "code") { $("#btn-apply-code").click(); return; }
      ta.dispatchEvent(new Event("input")); ta.dispatchEvent(new Event("change"));
    },
    replaceEverywhere: (from, to, keepIdx) => {
      let n = 0;
      for (const t of state.tracks) { const c = replaceSound(t.code, from, to, keepIdx); if (c !== t.code) { t.code = c; t.explain = null; n++; } }
      if (state.extra) state.extra = replaceSound(state.extra, from, to, keepIdx);
      changed();
      $("#code").value = buildCode();
      if (n && live()) playAll();
    },
  });
  // Los dos botones de siempre abren la misma librería, con el filtro puesto
  $("#btn-instlib").onclick = () => openLibrary({ kind: "pitched", show: "" });
  $("#btn-samples").onclick = () => openLibrary({ kind: "", show: "" });
}
// --- loops largos (web/loops.js): el cargador, el navegador y cómo entran en la canción
function wireLoops() {
  initLoops({
    api, state, lang: LANG, toast, say: (text) => say(text, state.options),
    onLibraryChanged: () => { server.samples = null; sm.mine = null; },
    setBpm: (bpm) => { state.bpm = Math.max(40, Math.min(220, bpm)); $("#bpm").value = state.bpm; changed(); evalCode(cps(state.bpm)); toast(L(`Canción a ${state.bpm} BPM: así el loop suena a su velocidad y en su tono original.`, `Song set to ${state.bpm} BPM: now the loop plays at its own speed and in its original key.`)); },
    addLoopTrack: (x, code, what, p) => {
      const t = addTrack(x.name, loopKindFor(x.ref) || "percusion", code);
      if (!t) return;
      $("#samples").close();
      const pct = Math.round((p.speed - 1) * 100);
      say(L(`Nueva pista ${t.id} con el loop «${x.ref}»${what}. Lo he escuchado: ${x.bpm ? `${Math.round(x.bpm * 10) / 10} BPM` : "tempo sin detectar"}, ${p.bars} ${p.bars === 1 ? "compás" : "compases"}${x.key ? `, ${x.key}` : ""}. «loopAt ${p.n}» hace que dure ${p.n} ${p.n === 1 ? "ciclo" : "ciclos"} de tu canción (${state.bpm} BPM)${Math.abs(pct) >= 1 ? `, así que suena un ${Math.abs(pct)}% más ${pct > 0 ? "rápido" : "lento"}` : ""}, y «# cut 1» evita que una vuelta se pise con la siguiente.`,
        `New track ${t.id} with the loop «${x.ref}»${what}. I listened to it: ${x.bpm ? `${Math.round(x.bpm * 10) / 10} BPM` : "tempo not detected"}, ${p.bars} ${p.bars === 1 ? "bar" : "bars"}${x.key ? `, ${x.key}` : ""}. «loopAt ${p.n}» makes it last ${p.n} ${p.n === 1 ? "cycle" : "cycles"} of your song (${state.bpm} BPM)${Math.abs(pct) >= 1 ? `, so it plays ${Math.abs(pct)}% ${pct > 0 ? "faster" : "slower"}` : ""}, and «# cut 1» stops one pass from overlapping the next.`),
        state.options, { explicacion: explainLocal(t.code).partes });
    },
  });
  loadLoops();
  // Soltar loops en cualquier parte del estudio: se abre la biblioteca en «Loops largos» y se cargan
  const audioish = (e) => isFileDrag(e) && !e.target.closest("dialog:not(#samples)");
  window.addEventListener("dragover", (e) => { if (audioish(e)) { e.preventDefault(); document.body.classList.add("lp-dropping"); } });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("lp-dropping"); });
  window.addEventListener("drop", async (e) => {
    document.body.classList.remove("lp-dropping");
    if (!audioish(e)) return;
    e.preventDefault();
    const pending = filesFromDrop(e.dataTransfer);  // leer ya: después el navegador olvida las carpetas
    const files = await pending;
    if (!files.some((f) => /\.(wav|aif|aiff|flac|ogg|mp3|zip)$/i.test(f.file.name))) return;
    await openSamples("loops");
    loadFiles(files);
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
    noteSoundChange(t, t.code);
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
    projectId: state.projectId, tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted, ...(t.fromScore ? { fromScore: t.fromScore } : {}) })),
    ...(state.score && state.score.parts && state.score.parts.length ? { score: state.score } : {}) };
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
      state.github = ghFrom(r); save();
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
  // Solo cuenta como «ya abierta» una pestaña que viene de GitHub, nunca la de un archivo local con el mismo proyecto
  if (!ref && focusTabIf((s) => s && s.github && s.github.slug === slug && !s.github.ref && !s.file,
    L(`«${slug}» ya estaba abierta en una pestaña.`, `«${slug}» was already open in a tab.`))) { $("#newproj").close(); return; }
  if (busy) { $("#newproj").close(); return busyMsg(); }
  openTabSlot();
  // Lo que hubiera en este navegador (chat, mezcla…) se reutiliza, pero NUNCA su archivo local:
  // una canción abierta desde GitHub enseña su ruta en GitHub, aunque exista un .tidal con el mismo nombre
  const local = listProjects().find((x) => x.id === data.projectId && !(x.data && x.data.file));
  const clash = data.projectId && tabs.ids.includes(data.projectId);
  state = { ...FRESH(), ...(local && !clash ? local.data : {}), name: data.name || slug, bpm: data.bpm || 120, style: data.style || "",
    tracks: (data.tracks || []).map((t) => ({ ...t })), extra: data.extra || "",
    projectId: (!clash && data.projectId) || "p" + Date.now(), file: null,
    github: ghFrom({ ...(data.github || {}), slug, ref: ref || null }), trying: null };
  fileHandle = null;
  // Una versión antigua se abre como copia para no pisar la actual
  if (ref) { state.projectId = "p" + Date.now(); state.name = `${state.name} (${ref.slice(0, 7)})`; }
  const regen = data.score ? await adoptScore(state, data.score) : [];
  restoreHistory(state, null); tabOpened();
  $("#newproj").close(); renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons(); if (live()) playAll();
  if (regen.length) sysMsg(L(`La partitura (song.musicxml) manda sobre la melodía, los acordes y el bajo: he regenerado ${regen.join(", ")} a partir de ella.`, `The score (song.musicxml) leads the melody, chords and bass: I regenerated ${regen.join(", ")} from it.`));
  sysMsg(ref ? L(`Abierta la versión ${ref.slice(0, 7)} de «${slug}». Si la guardas en GitHub, pasará a ser la versión más nueva.`, `Opened version ${ref.slice(0, 7)} of «${slug}». If you save it to GitHub, it becomes the newest version.`)
    : L(`Abierta «${slug}» desde GitHub.`, `Opened «${slug}» from GitHub.`));
}
// ------------------------------------------------------------------ GitHub: dónde vive cada canción
// {slug, ref, repo, path, remote, html_url} a partir de lo que devuelve el servidor
function ghFrom(r) {
  const w = server.ghWhere || {};
  const repo = r.repo || w.repo || "", path = r.path || `${w.folder || "songs"}/${r.slug}`;
  return { slug: r.slug, ref: r.ref && r.ref !== (r.branch || w.branch) ? r.ref : null, repo, path,
    remote: r.remote || (repo ? `${repo}/${path}` : path), html_url: r.html_url || (repo ? `https://github.com/${repo}/tree/${w.branch || "main"}/${path}` : "") };
}
// «usuario/repo/songs/mi-cancion» (+ «@ abc1234» si es una versión antigua)
function ghRemote(g) {
  const w = server.ghWhere || {};
  if (g.pending) return `${w.repo || "GitHub"}/${w.folder || "songs"}/${slugify(state.name || L("nueva", "new"))}`;
  const base = g.remote || (g.repo || w.repo ? `${g.repo || w.repo}/${g.path || `${w.folder || "songs"}/${g.slug}`}` : g.slug);
  return base + (g.ref ? " @ " + g.ref.slice(0, 7) : "");
}
// Un nombre de carpeta que no pise otra canción del repositorio
function uniqueSlug(base, taken) {
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base.slice(0, 56)}-${n++}`;
  taken.add(slug);
  return slug;
}
// Guarda una pestaña que no es la de delante (su copia en Mis proyectos)
function persistDoc(s) {
  if (s === state) return save();
  try {
    const list = listProjects(), p = list.find((x) => x.id === s.projectId);
    if (p) { p.data = { ...s, trying: null }; localStorage.setItem(PROJ_KEY, JSON.stringify(list)); }
  } catch { /* sin almacenamiento */ }
  renderTabs();
}

// Ajuste «crear las canciones nuevas directamente en GitHub»: en cuanto la canción tiene alguna pista,
// se crea su carpeta en el repo con un primer commit. A partir de ahí Guardar (⌘S) crea versiones nuevas.
let ghCreateTimer = null, ghCreating = false;
function scheduleGitHubCreate() {
  clearTimeout(ghCreateTimer);
  ghCreateTimer = setTimeout(createOnGitHub, 2500);
}
async function createOnGitHub() {
  const s = state;
  if (ghCreating || !s.github || !s.github.pending || !s.tracks.length || !server.github) return;
  if (busy) return scheduleGitHubCreate(); // el Maestro aún está montando la canción: espero a que acabe
  ghCreating = true;
  try {
    const list = await api("/api/github/list", {});
    const slug = uniqueSlug(slugify(s.name || L("cancion", "song") + "-" + new Date().toISOString().slice(0, 10)), new Set(list.songs.map((x) => x.slug)));
    const payload = { name: s.name || L("Canción sin título", "Untitled song"), bpm: s.bpm, style: s.style, projectId: s.projectId, extra: s.extra || "",
      tracks: s.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted })),
      ...(s.score && s.score.parts && s.score.parts.length ? { score: s.score } : {}) };
    const r = await api("/api/github/save", { project: payload, slug, message: L(`Creo «${payload.name}»`, `Create «${payload.name}»`) });
    if (!s.github || !s.github.pending) return;
    s.github = ghFrom(r);
    persistDoc(s);
    if (s === state) sysMsg(L(`Canción creada en GitHub: ${s.github.remote}. Cuando quieras guardar una versión nueva, pulsa ${KEY_MOD}S.`,
      `Song created on GitHub: ${s.github.remote}. To save a new version, press ${KEY_MOD}S.`));
  } catch (e) {
    toast(L("No se pudo crear la canción en GitHub: ", "Couldn't create the song on GitHub: ") + e.message);
    if (s.github && s.github.pending) { s.github = null; persistDoc(s); } // sigue en local; no reintento en bucle
  } finally { ghCreating = false; }
}

// ------------------------------------------------------------------ Importador: subir varios .tidal a GitHub
let ghImport = { dir: "", files: [], taken: new Set(), running: false };
async function openGitHubImport() {
  const dlg = $("#ghimport");
  if (!server.github) { toast(L("Primero configura GitHub (token y repositorio) y pulsa «Probar GitHub».", "Set up GitHub first (token and repository) and press «Test GitHub».")); return; }
  if (!fileInfo) fileInfo = await api("/api/file/info", {}).catch(() => null);
  const w = server.ghWhere || {};
  dlg.innerHTML = `<div class="wz-head"><span class="wz-kicker">${icon("cloud", 16)} ${L("Subir canciones a GitHub", "Upload songs to GitHub")}</span>
      <button class="icon-btn" data-a="close" title="${esc(L("Cerrar", "Close"))}">${icon("close", 18)}</button></div>
    <p class="wz-help">${L(`Elige una carpeta de tu ordenador. Cada archivo <code>.tidal</code> que marques será una canción en <b>${esc(w.repo || "")}/${esc(w.folder || "songs")}/&lt;nombre&gt;/</b>, con su propio commit.`,
      `Choose a folder on your computer. Each <code>.tidal</code> file you tick becomes a song in <b>${esc(w.repo || "")}/${esc(w.folder || "songs")}/&lt;name&gt;/</b>, with its own commit.`)}</p>
    <div class="gi-dir"><input id="gi-dir" spellcheck="false" value="${esc(ghImport.dir || lastDir())}">
      <button data-a="pick">${icon("folder", 14)} ${L("Elegir carpeta…", "Choose folder…")}</button>
      <button data-a="scan">${L("Ver archivos", "List files")}</button></div>
    <div id="gi-list" class="gi-list"></div>
    <label class="check gi-del"><input type="checkbox" id="gi-delete"> <span>${L("Eliminar los archivos locales después de subirlos", "Delete the local files after uploading them")}</span></label>
    <p class="hint gi-del-hint">${L("Solo se borra un archivo cuando GitHub ha confirmado la subida y he comprobado que la canción está allí entera. Va a la Papelera, así que puedes recuperarlo.",
      "A file is only deleted once GitHub confirmed the upload and I checked the whole song is there. It goes to the Trash, so you can get it back.")}</p>
    <div class="wz-nav"><span id="gi-msg" class="hint"></span><div class="right"><button class="primary" data-a="upload" disabled>${icon("cloud", 14)} ${L("Subir", "Upload")}</button></div></div>`;
  dlg.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b || ghImport.running) return;
    if (b.dataset.a === "close") return dlg.close();
    if (b.dataset.a === "pick") {
      try {
        const r = await api("/api/file/dialog", { mode: "folder", dir: $("#gi-dir").value, title: L("Carpeta con tus canciones", "Folder with your songs") });
        if (r.path) { $("#gi-dir").value = r.path; scanImport(); }
        else if (r.unavailable) toast(L("No hay diálogo de carpetas en este sistema: escribe la ruta de la carpeta.", "No folder dialog on this system: type the folder path."));
      } catch (err) { toast(err.message); }
    }
    if (b.dataset.a === "scan") scanImport();
    if (b.dataset.a === "upload") runImport();
  };
  dlg.onchange = (e) => { if (e.target.matches(".gi-file input")) updateImportButton(); };
  $("#gi-dir").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); scanImport(); } });
  dlg.showModal();
  scanImport();
}
async function scanImport() {
  const box = $("#gi-list"); if (!box) return;
  box.innerHTML = `<p class="hint">${L("Buscando archivos…", "Looking for files…")}</p>`;
  try {
    const [r, gh] = await Promise.all([api("/api/file/list", { dir: $("#gi-dir").value }), api("/api/github/list", {}).catch(() => ({ songs: [] }))]);
    ghImport = { dir: r.dir, files: r.files, taken: new Set(gh.songs.map((x) => x.slug)), running: false };
    $("#gi-dir").value = r.dir;
    box.innerHTML = r.files.length ? r.files.map((f, i) => {
      const slug = slugify(f.name.replace(/\.(tidal|hs)$/i, "")), exists = ghImport.taken.has(slug);
      return `<label class="gi-file" data-i="${i}"><input type="checkbox" ${f.too_big ? "disabled" : "checked"}>
        <span class="n">${esc(f.name)}<span class="d">${f.too_big ? L("demasiado grande (máx. 2 MB)", "too big (max 2 MB)")
          : exists ? L(`ya hay una canción «${esc(slug)}» en GitHub: se subirá como «${esc(slug)}-2»`, `there is already a song «${esc(slug)}» on GitHub: it will be uploaded as «${esc(slug)}-2»`) : esc(slug + "/")}</span></span>
        <span class="gi-state"></span></label>`;
    }).join("") : `<p class="hint">${L("No hay archivos .tidal ni .hs en esta carpeta.", "There are no .tidal or .hs files in this folder.")}</p>`;
  } catch (e) { box.innerHTML = `<p class="hint">Error: ${esc(e.message)}</p>`; }
  updateImportButton();
}
function updateImportButton() {
  const n = document.querySelectorAll("#gi-list .gi-file input:checked:not(:disabled)").length, b = document.querySelector('#ghimport [data-a="upload"]');
  if (!b) return;
  b.disabled = !n || ghImport.running;
  b.innerHTML = `${icon("cloud", 14)} ${!n ? L("Subir", "Upload") : n === 1 ? L("Subir 1 canción", "Upload 1 song") : L(`Subir ${n} canciones`, `Upload ${n} songs`)}`;
}
const sameSong = (a, b) => JSON.stringify((a.tracks || []).map((t) => [t.id, t.code, !!t.muted])) === JSON.stringify((b.tracks || []).map((t) => [t.id, t.code, !!t.muted]))
  && (a.extra || "").trim() === (b.extra || "").trim();
async function runImport() {
  const rows = [...document.querySelectorAll("#gi-list .gi-file")].filter((r) => r.querySelector("input:checked:not(:disabled)"));
  if (!rows.length) return;
  const del = $("#gi-delete").checked, msg = $("#gi-msg");
  ghImport.running = true; updateImportButton();
  const set = (row, cls, text) => { const st = row.querySelector(".gi-state"); st.className = "gi-state " + cls; st.textContent = text; };
  let ok = 0, removed = 0, failed = 0;
  for (const [k, row] of rows.entries()) {
    const f = ghImport.files[+row.dataset.i];
    msg.textContent = L(`Subiendo ${k + 1} de ${rows.length}…`, `Uploading ${k + 1} of ${rows.length}…`);
    set(row, "run", L("subiendo…", "uploading…"));
    try {
      const file = await api("/api/file/read", { path: f.path });
      const meta = readMeta(file.content), p = parseCode(file.content, meta && meta.master);
      if (!p.tracks.length && !(p.extra || "").trim()) throw new Error(L("no tiene código de Tidal que pueda leer", "has no Tidal code I can read"));
      const name = (meta && meta.name) || f.name.replace(/\.(tidal|hs)$/i, "");
      const project = { name, bpm: Math.max(40, Math.min(220, Math.round(p.bpm || (meta && meta.bpm) || 120))), style: (meta && meta.style) || "",
        projectId: "p" + Date.now() + k, extra: p.extra || "", tracks: p.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted })) };
      const slug = uniqueSlug(slugify(f.name.replace(/\.(tidal|hs)$/i, "")), ghImport.taken);
      const r = await api("/api/github/save", { project, slug, message: L(`Importo «${name}» desde ${f.name}`, `Import «${name}» from ${f.name}`) });
      // Comprobación: vuelvo a leer la canción de GitHub y tiene que ser idéntica a la que he subido
      const back = await api("/api/github/load", { slug: r.slug });
      if (!sameSong(project, back)) throw new Error(L("GitHub no devuelve la misma canción que he subido", "GitHub doesn't return the same song I uploaded"));
      ok++;
      if (del) {
        try {
          // Solo si el archivo sigue igual que cuando lo leí (fecha y tamaño)
          await api("/api/file/trash", { path: f.path, mtime: file.mtime, size: f.size });
          removed++;
          movedToGitHub(f.path, r);
          set(row, "ok", L(`subida a ${r.remote} · archivo local eliminado`, `uploaded to ${r.remote} · local file deleted`));
        } catch (err) { set(row, "warn", L(`subida a ${r.remote}, pero no borré el archivo: ${err.message}`, `uploaded to ${r.remote}, but I didn't delete the file: ${err.message}`)); }
      } else set(row, "ok", L(`subida a ${r.remote}`, `uploaded to ${r.remote}`));
      row.querySelector("input").checked = false; row.querySelector("input").disabled = true;
    } catch (err) {
      failed++;
      set(row, "err", L("no se subió: ", "not uploaded: ") + err.message + (del ? L(" (el archivo local sigue ahí)", " (the local file is still there)") : ""));
    }
  }
  ghImport.running = false; updateImportButton();
  msg.textContent = L(`${ok} subidas${del ? `, ${removed} archivos eliminados` : ""}${failed ? `, ${failed} con error` : ""}.`,
    `${ok} uploaded${del ? `, ${removed} files deleted` : ""}${failed ? `, ${failed} failed` : ""}.`);
}
// Una pestaña que tenía abierto un archivo que acabo de subir y borrar pasa a ser la canción de GitHub
function movedToGitHub(path, r) {
  for (const id of tabs.ids) {
    const s = tabState(id);
    if (s && s.file && s.file.path === path) { s.file = null; s.github = ghFrom(r); if (s === state) fileHandle = null; persistDoc(s); }
  }
  dropRecent(path);
  renderFileStatus();
}

function confirmDelete(id) {
  const list = listProjects();
  const p = list.find((x) => x.id === id);
  if (!p) return false;
  if (!window.confirm(L(`¿Borrar «${p.name}»? No se puede deshacer.`, `Delete «${p.name}»? This can't be undone.`))) return false;
  localStorage.setItem(PROJ_KEY, JSON.stringify(list.filter((x) => x.id !== id)));
  api("/api/songs/forget", { id }).catch(() => {}); // y su archivo (las copias de seguridad lo conservan)
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
    server.ghWhere = s.github_where || null; server.ghNew = !!s.github_create_new;
    if (s.max_tracks) setMaxTracks(s.max_tracks);
    if (s.undo_steps) setUndoSteps(s.undo_steps);
    if (!dataNoticed && s.data) noticeData(s.data);
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
  const cc = c.claudecode || {};
  $("#cc-mode").value = cc.auth_mode || (cc.use_subscription === false ? "terminal" : "auto");
  $("#cc-url").value = cc.base_url || ""; $("#cc-key").value = cc.api_key || ""; $("#diag").hidden = true;
  $("#cc-effort").value = cc.effort ?? "low";
  toggleCcMode(); loadDetect(false);
  const preset = [...$("#oa-preset").options].find((o) => o.value.split("|")[0] === c.openai.base_url);
  $("#oa-preset").value = preset ? preset.value : "custom";
  const g = c.github || {};
  $("#gh-token").value = g.token || ""; $("#gh-repo").value = g.repo || "";
  $("#gh-branch").value = g.branch || "main"; $("#gh-folder").value = g.folder || "songs";
  $("#gh-create-new").checked = !!g.create_new;
  $("#gh-msg").textContent = ""; $("#btn-gh-create").hidden = true;
  $("#tracks-count").value = c.tracks?.count || maxTracks(); tracksCpuHint();
  renderLimits($("#limits-settings"), api);
  toggleProvider(); $("#test-msg").textContent = "";
  $("#settings").showModal();
}
function toggleProvider() {
  const p = document.querySelector("input[name=provider]:checked").value;
  $("#fs-openai").hidden = p !== "openai"; $("#fs-anthropic").hidden = p !== "anthropic"; $("#fs-claudecode").hidden = p !== "claudecode";
}
// Ajustes → Límites: lo que cuesta cada número, en una frase
function tracksCpuHint() {
  const n = Math.max(TRACKS_MIN, Math.min(TRACKS_MAX, Math.round(+$("#tracks-count").value || 12)));
  const extra = Math.round((n + 1) / 13 * 100) - 100;
  $("#tracks-cpu").textContent = n === 12 ? L("Arranque estándar.", "Standard start.")
    : L(`${n} pistas + 1 para el teclado MIDI = ${n + 1} orbits: unos ${extra} % más de CPU en efectos que con 12.`,
      `${n} tracks + 1 for the MIDI keyboard = ${n + 1} orbits: about ${extra}% more effects CPU than with 12.`);
}
async function saveSettings() {
  const nTracks = Math.max(TRACKS_MIN, Math.min(TRACKS_MAX, Math.round(+$("#tracks-count").value || 12)));
  const tracksChanged = nTracks !== maxTracks();
  if (tracksChanged && state.tracks.some((t) => +t.id.slice(1) > nTracks)) {
    toast(L(`Tu canción usa pistas por encima de d${nTracks}: bórralas o muévelas antes de bajar el número.`,
      `Your song uses tracks above d${nTracks}: delete or move them before lowering the number.`));
    return false;
  }
  await api("/api/config", {
    tracks: { count: nTracks },
    ...(collectLimits($("#limits-settings")) ? { limits: collectLimits($("#limits-settings")) } : {}),
    provider: document.querySelector("input[name=provider]:checked").value,
    openai: { base_url: $("#oa-url").value, api_key: $("#oa-key").value, model: $("#oa-model").value },
    anthropic: { api_key: $("#an-key").value, model: $("#an-model").value },
    claudecode: { path: $("#cc-path").value, model: $("#cc-model").value, auth_mode: $("#cc-mode").value, effort: $("#cc-effort").value,
      base_url: $("#cc-url").value, api_key: $("#cc-key").value },
    github: { token: $("#gh-token").value, repo: $("#gh-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""),
      branch: $("#gh-branch").value, folder: $("#gh-folder").value, create_new: $("#gh-create-new").checked },
  });
  state.offline = false; save();
  setMaxTracks(nTracks);
  if (tracksChanged) toast(L(`Ahora tienes ${nTracks} pistas (d1…d${nTracks}). Reiniciando el sonido: dale a Play cuando ponga «Sonido listo».`, `You now have ${nTracks} tracks (d1…d${nTracks}). Restarting the sound: press Play when it says «Sound ready».`));
  await refreshStatus();
}

// ------------------------------------------------------------------ autodetección de Claude Code
let detected = null;
function toggleCcMode() { $("#cc-api").hidden = $("#cc-mode").value !== "api"; }
function srcName(s) {
  if (!s) return "";
  if (s.startsWith("env:")) return L(`variable ${s.slice(4)} de tu terminal`, `${s.slice(4)} variable from your terminal`);
  return ({ settings: L("tus Ajustes de Tidal Studio", "your Tidal Studio settings"), terminal_path: L("PATH de tu terminal", "your terminal's PATH"),
    search: L("carpeta habitual de instalación", "usual install folder"), cli: L("el propio claude", "claude itself"),
    plan_default: L("el de tu plan (no hay ninguno fijado)", "your plan's default (none set)"),
    official: L("oficial de Anthropic", "Anthropic's official one"), none: L("ninguna", "none"), env: L("tu entorno", "your environment"),
    missing: L("no encontrado", "not found") })[s] || s;
}
async function loadDetect(refresh) {
  $("#cc-detect-msg").textContent = L("Detectando…", "Detecting…");
  try { detected = await api("/api/llm/detect", { refresh }); $("#cc-detect-msg").textContent = ""; renderDetect(); }
  catch (e) { $("#cc-detect-msg").textContent = "Error: " + e.message; }
}
function renderDetect() {
  const d = detected; if (!d?.items) return;
  const it = d.items;
  const rows = [
    [L("Comando claude", "claude command"), it.path], [L("Versión", "Version"), it.version],
    [L("Sesión", "Sign-in"), it.login && { ...it.login, shown: (it.login.value ? L("iniciada", "signed in") : L("NO iniciada", "NOT signed in")) + " · " + it.login.shown }],
    [L("Modelo por defecto", "Default model"), it.model && { ...it.model, shown: it.model.value || L("el de tu plan", "your plan's") }],
    ["Endpoint", it.endpoint && { ...it.endpoint, shown: it.endpoint.value || "api.anthropic.com" }],
    [L("Clave de API", "API key"), it.key && { ...it.key, shown: it.key.value ? `${it.key.value} ${it.key.shown}` : L("ninguna", "none") }],
  ];
  if (it.cloud?.value) rows.push(["Bedrock / Vertex", it.cloud]);
  $("#cc-detect-table").innerHTML = rows.filter((r) => r[1]).map(([k, v]) =>
    `<tr><th>${esc(k)}</th><td><code>${esc(v.shown ?? v.value)}</code></td><td class="hint">${esc(srcName(v.source))}</td></tr>`).join("");
  // lo detectado aparece en los campos vacíos (si escribes algo, manda lo tuyo)
  $("#cc-path").placeholder = it.path?.value ? L("auto: ", "auto: ") + it.path.value : "claude";
  $("#cc-model").placeholder = it.model?.value && it.model.source !== "settings" ? L("auto: ", "auto: ") + it.model.value : L("auto: el de tu plan (opus, sonnet…)", "auto: your plan's (opus, sonnet…)");
  $("#cc-url").placeholder = it.endpoint?.value ? L("auto: ", "auto: ") + it.endpoint.value : "https://api.anthropic.com";
  $("#cc-key").placeholder = it.key?.value ? L("auto: ", "auto: ") + it.key.shown : "sk-ant-…";
  const a = d.auto || {};
  const why = { custom: L("Claude Code tiene un endpoint, Bedrock/Vertex o una clave en sus ajustes", "Claude Code has an endpoint, Bedrock/Vertex or a key in its settings"),
    key_and_login: L("tienes una clave de API en tu terminal pero también sesión con tu plan: uso tu plan, como Claude Desktop", "you have an API key in your terminal but also a plan sign-in: using your plan, like Claude Desktop"),
    key_only: L("solo hay una clave de API, sin sesión de plan", "there's only an API key, no plan sign-in"),
    login: L("tienes sesión iniciada con tu plan", "you're signed in with your plan"),
    no_login: L("no hay sesión: ejecuta «claude» en una terminal e inicia sesión", "not signed in: run «claude» in a terminal and sign in") }[a.why] || a.why || "";
  const modeName = { subscription: L("tu suscripción", "your subscription"), terminal: L("igual que en tu terminal", "same as your terminal") }[a.mode] || a.mode;
  $("#cc-auto").textContent = $("#cc-mode").value === "auto" ? L(`Automática usará ${modeName}: ${why}.`, `Automatic will use ${modeName}: ${why}.`) : "";
}

// ------------------------------------------------------------------ diagnóstico de la IA
let lastDiag = null;
async function runDiagnostics() {
  $("#diag").hidden = false; $("#diag-steps").innerHTML = ""; $("#diag-hints").innerHTML = ""; $("#diag-models").innerHTML = "";
  $("#diag-msg").textContent = L("Comprobando… (puede tardar unos 20 s)", "Checking… (may take about 20 s)");
  try {
    await saveSettings();
    const r = await api("/api/llm/diagnose", { lang: LANG }); lastDiag = r;
    $("#diag-msg").textContent = r.ok ? L("Todo bien: Maestro puede hablar con la IA.", "All good: Maestro can talk to the AI.")
      : L("Algo falla: mira los pasos en rojo.", "Something fails: look at the red steps.");
    $("#diag-hints").innerHTML = (r.hints || []).map((h) => `<li>${esc(h)}</li>`).join("");
    $("#diag-steps").innerHTML = r.steps.map((s) => `<li class="${s.ok === false ? "bad" : s.ok ? "ok" : ""}">
      <details><summary><b>${s.ok === false ? "✗" : s.ok ? "✓" : "·"} ${esc(s.name)}</b> <span>${esc(s.summary)}</span></summary>
      <pre>${esc(JSON.stringify(s.detail, null, 2))}</pre></details></li>`).join("");
    if (r.models?.length) renderDiagModels(r.models);
  } catch (e) { $("#diag-msg").textContent = "Error: " + e.message; }
}
async function runModelTest() {
  $("#diag").hidden = false; $("#diag-models").innerHTML = "";
  $("#diag-msg").textContent = L("Probando modelos… (unos 20 s)", "Testing models… (about 20 s)");
  try {
    await saveSettings();
    const r = await api("/api/llm/models", { lang: LANG });
    if (r.steps) lastDiag = r;
    renderDiagModels(r.models || []);
    $("#diag-msg").textContent = L("Pulsa «Usar» en uno que funcione.", "Press «Use» on one that works.");
  } catch (e) { $("#diag-msg").textContent = "Error: " + e.message; }
}
function renderDiagModels(models) {
  const p = document.querySelector("input[name=provider]:checked").value;
  const field = p === "claudecode" ? "#cc-model" : p === "anthropic" ? "#an-model" : "#oa-model";
  $("#diag-models").innerHTML = `<table class="diag-models"><tr><th>${L("Modelo", "Model")}</th><th></th><th></th><th></th></tr>` +
    models.map((m) => `<tr class="${m.ok === false ? "bad" : m.ok ? "ok" : ""}"><td><code>${esc(m.model)}</code></td>
      <td>${m.ok === null || m.ok === undefined ? "" : m.ok ? "✓" : "✗"}</td>
      <td class="hint">${esc(m.ok ? `${(m.used || []).join(", ")} · ${m.seconds} s` : (m.error || ""))}</td>
      <td>${m.ok !== false ? `<button type="button" data-use-model="${esc(m.model)}">${L("Usar", "Use")}</button>` : ""}</td></tr>`).join("") + "</table>";
  $("#diag-models").querySelectorAll("[data-use-model]").forEach((b) => b.onclick = async () => {
    $(field).value = b.dataset.useModel; await saveSettings();
    $("#diag-msg").textContent = L(`Guardado: ${b.dataset.useModel}`, `Saved: ${b.dataset.useModel}`);
  });
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
    const tracks = (d.tracks || []).filter((t) => Array.isArray(t) && /^d[1-9]\d?$/.test(t[0]) && +t[0].slice(1) <= maxTracks()).map(([id, name, kind, code, muted]) => ({ id, name: String(name || id).slice(0, 60), kind: String(kind || "textura"), code: String(code || "").slice(0, 2000), muted: !!muted }));
    if (!tracks.length) return;
    openTabSlot();
    state = { ...FRESH(), name: String(d.name || L("Canción compartida", "Shared song")).slice(0, 80), bpm: Math.max(40, Math.min(220, +d.bpm || 120)), style: STYLES[d.style] ? d.style : "", tracks, step: "libre" };
    state.chat = [{ role: "assistant", content: L(`Has abierto «${state.name}», una canción compartida (${tracks.length} pistas, ${state.bpm} BPM). Está en una pestaña nueva; tu canción anterior sigue abierta en la suya. Pulsa Tocar todo para escucharla, o pídeme que te explique cómo está hecha.`, `You opened «${state.name}», a shared song (${tracks.length} tracks, ${state.bpm} BPM). It's open in a new tab; your previous song is still open in its own tab. Press Play all to hear it, or ask me how it's made.`) }];
    state.options = [L("Explícame cómo está hecha", "Explain how it's made"), CTL_CHIP()];
    resetHistory(state); tabOpened();
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

// ------------------------------------------------------------------ pestañas (varias canciones abiertas a la vez)
// Cada pestaña es un proyecto (su código, pistas, chat, historial y archivo). Solo suena la pestaña activa.
// Las demás viven en memoria (docs) y en «Mis proyectos», así que sobreviven a recargar la página.
const TABS_KEY = "tidal-studio-tabs-v1";
let tabs = { ids: [], active: 0 };
const docs = new Map();  // projectId → { state, handle, hist }
function saveTabs() { try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)); } catch { /* nada */ } }
function syncTab() {
  if (!tabs.ids.length) tabs.ids = [state.projectId];
  tabs.active = Math.max(0, Math.min(tabs.active, tabs.ids.length - 1));
  if (tabs.ids[tabs.active] !== state.projectId) { const dup = tabs.ids.indexOf(state.projectId); if (dup >= 0 && dup !== tabs.active) { tabs.ids.splice(dup, 1); if (dup < tabs.active) tabs.active--; } tabs.ids[tabs.active] = state.projectId; }
  saveTabs();
}
// Estado de una pestaña (la activa es «state»)
function tabState(id) {
  if (id === state.projectId) return state;
  const d = docs.get(id);
  if (d) return d.state;
  const p = listProjects().find((x) => x.id === id);
  if (!p) return null;
  const s = { ...FRESH(), ...p.data, projectId: id, trying: null };
  docs.set(id, { state: s, handle: null, hist: null });
  return s;
}
// ¿Tiene cambios sin guardar en su archivo? (fileText lee «state», así que lo cambiamos un momento)
function dirtyOf(s) {
  if (!s || !s.file) return false;
  if (s === state) return isDirty();
  const keep = state; state = s;
  try { return isDirty(); } finally { state = keep; }
}
const tabTitle = (s) => (s && (s.name || (s.file && s.file.name.replace(/\.(tidal|hs|txt)$/i, "")))) || L("Sin título", "Untitled");
function tabWhere(s) {
  if (!s) return "";
  if (s.github && (s.github.slug || s.github.pending)) return "GitHub · " + ghRemote(s.github);
  if (s.file) return s.file.path ? shortPath(s.file.path) : s.file.name;
  return L("En este navegador (Mis proyectos)", "In this browser (My projects)");
}
const tabIcon = (s) => s && s.github && (s.github.slug || s.github.pending) ? "cloud" : s && s.file ? "file" : s && s.course ? "course" : "melodia";
function renderTabs() {
  const bar = $("#doc-tabs"); if (!bar) return;
  syncTab();
  const html = tabs.ids.map((id, i) => {
    const s = tabState(id), on = i === tabs.active, dirty = dirtyOf(s);
    return `<div class="doc-tab ${on ? "active" : ""} ${dirty ? "dirty" : ""}" role="tab" aria-selected="${on}" data-i="${i}" title="${esc(tabTitle(s) + " — " + tabWhere(s))}">
      ${icon(tabIcon(s), 14)}<span class="dt-name">${esc(tabTitle(s))}</span>
      ${dirty ? `<span class="dirty-dot" title="${esc(L("Cambios sin guardar", "Unsaved changes"))}"></span>` : ""}
      <button class="dt-close" data-close-tab="${i}" title="${esc(L("Cerrar pestaña", "Close tab"))}" aria-label="${esc(L("Cerrar pestaña", "Close tab"))}">${icon("close", 12)}</button></div>`;
  }).join("") + `<button class="dt-new" data-a="new-tab" title="${esc(L("Nueva pestaña: canción nueva, abrir un archivo o un proyecto", "New tab: new song, open a file or a project"))}">${icon("plus", 14)}</button>`;
  if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
}
// Una pestaña que no tiene nada: la reutilizamos en vez de abrir otra
const blankDoc = (s) => !s.tracks.length && !(s.extra || "").trim() && !s.file && !s.name && !(s.github && s.github.slug) && !s.course;
function stashCurrent() {
  flushPending(state);
  save();
  docs.set(state.projectId, { state, handle: fileHandle, hist: stashHistory(state) });
}
// Antes de poner otra canción en «state»: deja la actual en su pestaña y abre un hueco nuevo a su derecha
function openTabSlot() {
  if (audition) stopAudition(false);
  stopPreHear();
  evalCode("hush");
  if (blankDoc(state)) { docs.delete(state.projectId); fileHandle = null; return; }
  stashCurrent();
  syncTab();
  tabs.active += 1;
  tabs.ids.splice(tabs.active, 0, "");
  fileHandle = null;
}
// Después de poner la canción nueva en «state»
function tabOpened() { syncTab(); renderTabs(); }
function busyMsg() { toast(L("Maestro está respondiendo en esta pestaña. Espera a que termine (o cancélalo) antes de cambiar de canción.", "Maestro is answering in this tab. Wait for it to finish (or cancel it) before switching songs.")); }
// Pone en «state» la pestaña i (la canción de antes ya está guardada o descartada)
function activate(i) {
  const id = tabs.ids[i], d = docs.get(id), s = tabState(id);
  if (!s) {
    tabs.ids.splice(i, 1);
    if (!tabs.ids.length) return blankOnly();
    return activate(Math.min(i, tabs.ids.length - 1));
  }
  tabs.active = i;
  state = s; fileHandle = d ? d.handle : null;
  docs.delete(id);
  restoreHistory(state, d && d.hist);
  bkSel = null;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* nada */ }
  syncTab();
  renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons();
  if (live() && state.tracks.length) playAll();
}
function blankOnly() {
  fileHandle = null; state = FRESH(); tabs = { ids: [state.projectId], active: 0 };
  resetHistory(state); renderAll(); renderHistoryButtons(); greet();
}
async function switchTab(i) {
  if (i === tabs.active || i < 0 || i >= tabs.ids.length) return;
  if (busy) return busyMsg();
  if (audition) await stopAudition(true);
  stopPreHear();
  stashCurrent();
  evalCode("hush");
  activate(i);
}
async function closeTab(i = tabs.active) {
  if (i < 0 || i >= tabs.ids.length) return;
  if (i !== tabs.active) {
    // Una pestaña de fondo con cambios sin guardar: la traemos delante para preguntar
    if (dirtyOf(tabState(tabs.ids[i]))) { await switchTab(i); if (tabs.active === i) return closeTab(i); return; }
    docs.delete(tabs.ids[i]);
    tabs.ids.splice(i, 1);
    if (i < tabs.active) tabs.active--;
    saveTabs(); return renderTabs();
  }
  if (busy) return busyMsg();
  if (!(await guardUnsaved())) return;
  if (audition) await stopAudition(false);
  stopPreHear();
  flushPending(state);
  save();
  evalCode("hush");
  docs.delete(state.projectId);
  tabs.ids.splice(i, 1);
  if (!tabs.ids.length) return blankOnly();
  activate(Math.min(i, tabs.ids.length - 1));
}
// ¿Ya está abierta en alguna pestaña? (mismo archivo del disco / misma canción de GitHub / mismo proyecto)
function findTab(pred) { return tabs.ids.findIndex((id) => { const s = tabState(id); return s && pred(s, id); }); }
function focusTabIf(pred, msg) {
  const i = findTab(pred);
  if (i < 0) return false;
  if (i !== tabs.active) switchTab(i);
  if (msg) toastSoft(msg);
  return true;
}
function initTabs() {
  try { const t = JSON.parse(localStorage.getItem(TABS_KEY) || "null"); if (t && Array.isArray(t.ids)) tabs = { ids: t.ids.filter((x) => typeof x === "string" && x), active: +t.active || 0 }; } catch { /* nada */ }
  // Quitamos pestañas cuyo proyecto ya no existe (borrado o en blanco sin guardar)
  const known = new Set(listProjects().map((p) => p.id));
  tabs.ids = tabs.ids.filter((id, i, a) => a.indexOf(id) === i && (id === state.projectId || known.has(id)));
  const at = tabs.ids.indexOf(state.projectId);
  if (at >= 0) tabs.active = at; else { tabs.ids.splice(Math.min(tabs.active, tabs.ids.length), 0, state.projectId); tabs.active = tabs.ids.indexOf(state.projectId); }
  saveTabs();
  const bar = $("#doc-tabs");
  bar.onclick = (e) => {
    const x = e.target.closest("[data-close-tab]");
    if (x) { e.stopPropagation(); return closeTab(+x.dataset.closeTab); }
    if (e.target.closest("[data-a=new-tab]")) return openNewProject();
  };
  // Se cambia al pulsar (como en el navegador): si un campo pierde el foco y guarda, la barra se repinta antes del «click»
  bar.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-close-tab]")) return;
    const t = e.target.closest(".doc-tab"); if (t) { const i = +t.dataset.i; setTimeout(() => switchTab(i), 0); }
  };
  bar.onauxclick = (e) => { const t = e.target.closest(".doc-tab"); if (t && e.button === 1) { e.preventDefault(); closeTab(+t.dataset.i); } };
  bar.onmousedown = (e) => { if (e.button === 1) e.preventDefault(); };
  // Alt+1…9 salta a esa pestaña; Ctrl+Alt+←/→ a la anterior o la siguiente
  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); switchTab(Math.min(+e.code.slice(5), tabs.ids.length) - 1); }
    if (e.altKey && (e.ctrlKey || e.metaKey) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); switchTab((tabs.active + (e.key === "ArrowRight" ? 1 : tabs.ids.length - 1)) % tabs.ids.length); }
  });
  renderTabs();
}

// ------------------------------------------------------------------ archivos .tidal (Archivo › Abrir / Guardar)
// Dónde se elige el archivo, de mejor a peor:
//  1. App de Mac: paneles nativos (main.swift, window.webkit.messageHandlers.tsFile)
//  2. El servidor muestra el diálogo del sistema (osascript, PowerShell, zenity/kdialog)
//  3. Chrome/Edge: showOpenFilePicker / showSaveFilePicker
//  4. Abrir: <input type=file>; Guardar: escribir la ruta a mano (el servidor guarda) o descargar
const RECENT_KEY = "tidal-studio-recent-files-v1";
let fileHandle = null;   // archivo abierto con el selector de Chrome/Edge (no tiene ruta)
let fileBusy = false;    // evita dos diálogos a la vez (atajo de teclado + menú de la app de Mac)
let fileInfo = null;     // {dir, sep, dialog} del servidor
const hashText = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ":" + t.length; };
const isDirty = () => !!(state.file && state.file.hash !== hashText(fileText()));
const macPanels = () => window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tsFile;
const KEY_MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
const fileNameFor = () => (state.file && state.file.name) || `${slugify(state.name || L("cancion", "song"))}.tidal`;
// «/Users/victor/Music/x.tidal» → «~/Music/x.tidal» (más corto en la cabecera)
const shortPath = (p) => { const h = fileInfo && fileInfo.home; return h && p && p.startsWith(h) && /[\\/]/.test(p[h.length] || "") ? "~" + p.slice(h.length) : p; };
const dirOf = (p) => { const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i > 0 ? p.slice(0, i) : ""; };

function recentFiles() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
function addRecent(path, name) {
  if (!path) return;
  const list = recentFiles().filter((r) => r.path !== path);
  list.unshift({ path, name: name || baseName(path), at: Date.now() });
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* nada */ }
}
function dropRecent(path) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentFiles().filter((r) => r.path !== path))); } catch { /* nada */ } }
const lastDir = () => (state.file && state.file.path && dirOf(state.file.path)) || (recentFiles()[0] && dirOf(recentFiles()[0].path)) || (fileInfo && fileInfo.dir) || "";

// Cabecera: nombre del archivo y si hay cambios sin guardar
function renderFileStatus() {
  const chip = $("#file-chip"); if (!chip) return;
  const f = state.file, dirty = isDirty(), gh = state.github && (state.github.slug || state.github.pending) ? state.github : null;
  chip.hidden = !f && !gh;
  chip.classList.toggle("dirty", dirty);
  chip.classList.toggle("remote", !!gh);
  // Abierta desde GitHub: se enseña la ruta remota (usuario/repo/carpeta/canción), nunca una ruta de este ordenador
  if (gh) chip.innerHTML = `${icon("cloud", 14)}<code title="${esc(gh.html_url || ghRemote(gh))}">${esc(ghRemote(gh))}</code>
    <span class="fc-state">${gh.pending ? L("se creará en GitHub", "will be created on GitHub") : gh.ref ? L("versión antigua", "old version") : "GitHub"}</span>`;
  else if (f) chip.innerHTML = `${icon("file", 14)}<code title="${esc(f.path || f.name)}">${esc(f.path ? shortPath(f.path) : f.name)}</code>
    <span class="fc-state">${dirty ? `<span class="dirty-dot"></span> ${L("cambios sin guardar", "unsaved changes")}` : L("guardado", "saved")}</span>`;
  const btn = $("#btn-file");
  if (btn) { const dot = btn.querySelector(".dirty-dot"); if (dirty && !dot) btn.insertAdjacentHTML("beforeend", '<span class="dirty-dot"></span>'); if (!dirty && dot) dot.remove(); }
  document.title = gh && gh.slug ? `${gh.slug} · Tidal Studio` : f ? `${dirty ? "● " : ""}${f.name} · Tidal Studio` : "Tidal Studio";
}

// Diálogo propio (confirm()/prompt() no funcionan igual en todas las ventanas nativas)
function ask({ title, text = "", input = null, buttons }) {
  const dlg = $("#askdlg");
  dlg.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}
    ${input !== null ? `<input id="ask-input" spellcheck="false" autocomplete="off">` : ""}
    <div class="ask-btns">${buttons.map((b) => `<button data-k="${b.k}" class="${b.cls || ""}">${esc(b.label)}</button>`).join("")}</div>`;
  if (input !== null) dlg.querySelector("#ask-input").value = input;
  return new Promise((resolve) => {
    let done = false;
    const finish = (k) => { if (done) return; done = true; const v = input !== null ? dlg.querySelector("#ask-input").value.trim() : null; dlg.close(); resolve({ k, value: v }); };
    dlg.querySelectorAll("button[data-k]").forEach((b) => b.onclick = () => finish(b.dataset.k));
    dlg.onclose = () => finish("cancel");
    const inp = dlg.querySelector("#ask-input");
    if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(buttons.find((b) => b.cls && b.cls.includes("primary")).k); } });
    dlg.showModal();
    if (inp) { inp.focus(); const n = inp.value.length, dot = inp.value.lastIndexOf("."), sl = Math.max(inp.value.lastIndexOf("/"), inp.value.lastIndexOf("\\")); inp.setSelectionRange(sl + 1, dot > sl ? dot : n); }
  });
}

// Antes de cambiar de canción: ¿guardar los cambios del archivo abierto?
async function guardUnsaved() {
  if (!isDirty()) return true;
  const r = await ask({
    title: L(`¿Guardar los cambios de «${state.file.name}»?`, `Save changes to «${state.file.name}»?`),
    text: L("Si no los guardas, el archivo se queda como estaba. (La canción sigue en Mis proyectos de todas formas.)", "If you don't save them, the file stays as it was. (The song is still kept in My projects anyway.)"),
    buttons: [{ k: "discard", label: L("No guardar", "Don't save"), cls: "spacer" }, { k: "cancel", label: L("Cancelar", "Cancel") }, { k: "save", label: L("Guardar", "Save"), cls: "primary" }],
  });
  if (r.k === "save") return await saveFile();
  return r.k === "discard";
}

// Pide una ruta al sistema. Devuelve {path} | {cancelled} | {unavailable}
async function pickPath(mode) {
  const title = mode === "save" ? L("Guardar archivo de Tidal", "Save Tidal file") : L("Abrir un archivo de Tidal", "Open a Tidal file");
  const req = { mode, name: fileNameFor(), dir: lastDir(), title };
  if (macPanels()) {
    try { const p = await macPanels().postMessage(req); return p ? { path: p } : { cancelled: true }; } catch { /* sigue con lo siguiente */ }
  }
  try { const r = await api("/api/file/dialog", req); if (r.path || r.cancelled) return r; } catch { /* sin diálogo del sistema */ }
  return { unavailable: true };
}

async function openFile() {
  if (fileBusy) return; fileBusy = true;
  try {
    const r = await pickPath("open");
    if (r.cancelled) return;
    if (r.path) return await openPath(r.path);
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: [{ description: "Tidal", accept: { "text/plain": [".tidal", ".hs", ".txt"] } }] });
        const f = await h.getFile();
        return loadFileText(await f.text(), { name: f.name }, h);
      } catch (e) { if (e.name !== "AbortError") toast(e.message); return; }
    }
    $("#file-input").click();
  } finally { fileBusy = false; }
}
async function openPath(path) {
  if (focusTabIf((s) => s.file && s.file.path === path, L(`«${baseName(path)}» ya estaba abierto en una pestaña.`, `«${baseName(path)}» was already open in a tab.`))) return;
  if (busy) return busyMsg();
  try {
    const r = await api("/api/file/read", { path });
    await loadFileText(r.content, { path: r.path, name: r.name, score: r.score });
  } catch (e) {
    dropRecent(path);
    toast(L(`No se pudo abrir ${baseName(path)}: `, `Couldn't open ${baseName(path)}: `) + e.message);
  }
}
async function loadFileText(text, file, handle = null) {
  const meta = readMeta(text);
  const p = parseCode(text, meta && meta.master);
  if (!p.tracks.length && !p.extra) return toast(L(`«${file.name}» no tiene código de Tidal que pueda leer.`, `«${file.name}» has no Tidal code I can read.`));
  if (file.path && focusTabIf((s) => s.file && s.file.path === file.path, L(`«${file.name}» ya estaba abierto en una pestaña.`, `«${file.name}» was already open in a tab.`))) return;
  if (busy) return busyMsg();
  openTabSlot();
  // Si ya habías abierto este archivo, seguimos con ese proyecto (su chat y su historia)
  const prev = file.path && listProjects().find((x) => x.data && x.data.file && x.data.file.path === file.path && !tabs.ids.includes(x.id));
  const base = prev ? { ...FRESH(), ...prev.data, projectId: prev.id } : FRESH();
  state = { ...base, trying: null, selected: null,
    name: (meta && meta.name) || file.name.replace(/\.(tidal|hs|txt)$/i, ""),
    bpm: Math.max(40, Math.min(220, Math.round(p.bpm || (meta && meta.bpm) || 120))),
    style: meta && STYLES[meta.style] ? meta.style : (prev ? base.style : ""),
    master: (meta && meta.master) || undefined, tracks: p.tracks, extra: p.extra, step: "libre" };
  fileHandle = handle;
  // cancion.tidal + cancion.musicxml: la partitura regenera las pistas que salen de ella (puede venir de MuseScore)
  const regen = file.score ? await adoptScore(state, file.score) : [];
  state.file = { path: file.path || "", name: file.name, hash: "" };
  state.file.hash = hashText(fileText());
  addRecent(file.path, file.name);
  resetHistory(state);
  tabOpened();
  const n = p.tracks.length;
  say(L(`He abierto «${file.name}»: ${n} ${n === 1 ? "pista" : "pistas"} a ${state.bpm} BPM.`, `I opened «${file.name}»: ${n} ${n === 1 ? "track" : "tracks"} at ${state.bpm} BPM.`)
    + (p.extra ? L(" El código que no es una pista (definiciones, let, once…) está intacto en «Código extra», arriba de las pistas.", " Code that isn't a track (definitions, let, once…) is kept intact in «Extra code», above the tracks.") : "")
    + (p.skipped.length ? L(` He quitado ${p.skipped.join(", ")}: aquí se para con el botón Silencio.`, ` I left out ${p.skipped.join(", ")}: here you stop with the Hush button.`) : "")
    + (file.score ? L(` Con su partitura (${file.score.parts.length} ${file.score.parts.length === 1 ? "parte" : "partes"})${regen.length ? `: he regenerado ${regen.join(", ")} a partir de ella` : ""}.`,
      ` With its score (${file.score.parts.length} ${file.score.parts.length === 1 ? "part" : "parts"})${regen.length ? `: I regenerated ${regen.join(", ")} from it` : ""}.`) : ""),
    [L("Explícame cómo está hecha", "Explain how it's made"), CTL_CHIP()]);
  renderAll(); renderBlocks(); renderMixer(true); renderArrange(); renderHistoryButtons(); renderFileStatus();
  if (live() && n) playAll(true);
}

// Escribe el archivo. Devuelve true si se ha guardado.
async function writeTo(target) {
  const content = fileText();
  if (target.handle) {
    const w = await target.handle.createWritable(); await w.write(content); await w.close();
    return { name: target.handle.name, path: "" };
  }
  const score = state.score && state.score.parts && state.score.parts.length ? state.score : undefined;
  const r = await api("/api/file/write", { path: target.path, content, overwrite: target.overwrite !== false, score, title: state.name || "" });
  return r;
}
function savedAs(r, handle = null) {
  fileHandle = handle;
  state.file = { path: r.path || "", name: r.name, hash: hashText(fileText()) };
  if (!state.name) { state.name = r.name.replace(/\.(tidal|hs|txt)$/i, ""); $("#proj-name").value = state.name; }
  state.file.hash = hashText(fileText());
  addRecent(r.path, r.name);
  save();
  toastSoft(L(`Guardado: ${r.name}`, `Saved: ${r.name}`));
  return true;
}
// Guardar: si la canción vive en GitHub (y no en un archivo), guardar es crear una versión nueva allí
function saveCmd() { return state.github && (state.github.slug || state.github.pending) && !state.file ? openGitHubSave() : saveFile(); }
async function saveFile() {
  if (!state.file || (!state.file.path && !fileHandle)) return saveFileAs();
  try {
    const r = await writeTo(fileHandle ? { handle: fileHandle } : { path: state.file.path });
    return savedAs({ ...r, name: r.name || state.file.name, path: r.path || state.file.path }, fileHandle);
  } catch (e) {
    toast(L("No se pudo guardar: ", "Couldn't save: ") + e.message + L(" Prueba con Guardar como.", " Try Save as."));
    return false;
  }
}
async function saveFileAs() {
  if (fileBusy) return false; fileBusy = true;
  try {
    const r = await pickPath("save");
    if (r.cancelled) return false;
    if (r.path) {
      try { return savedAs(await writeTo({ path: r.path })); }
      catch (e) { toast(L("No se pudo guardar: ", "Couldn't save: ") + e.message); return false; }
    }
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: fileNameFor(), types: [{ description: "Tidal", accept: { "text/plain": [".tidal"] } }] });
        return savedAs(await writeTo({ handle: h }), h);
      } catch (e) { if (e.name !== "AbortError") toast(e.message); return false; }
    }
    // Sin diálogo: escribir la ruta (el estudio guarda en este ordenador)
    if (!fileInfo) fileInfo = await api("/api/file/info", {}).catch(() => null);
    let path = shortPath((lastDir() ? lastDir() + ((fileInfo && fileInfo.sep) || "/") : "") + fileNameFor());
    for (;;) {
      const a = await ask({ title: L("Guardar como", "Save as"), text: L("¿Dónde lo guardo? Escribe la ruta completa del archivo (.tidal).", "Where should I save it? Type the full path of the file (.tidal)."), input: path,
        buttons: [{ k: "download", label: L("Descargar en su lugar", "Download instead"), cls: "spacer" }, { k: "cancel", label: L("Cancelar", "Cancel") }, { k: "ok", label: L("Guardar", "Save"), cls: "primary" }] });
      if (a.k === "download") { downloadTidal(); return false; }
      if (a.k !== "ok" || !a.value) return false;
      path = a.value;
      try {
        let w = await writeTo({ path, overwrite: false });
        if (w.exists) {
          const c = await ask({ title: L(`«${w.name}» ya existe`, `«${w.name}» already exists`), text: L("¿Quieres reemplazarlo?", "Do you want to replace it?"),
            buttons: [{ k: "cancel", label: L("Cancelar", "Cancel") }, { k: "ok", label: L("Reemplazar", "Replace"), cls: "primary" }] });
          if (c.k !== "ok") continue;
          w = await writeTo({ path, overwrite: true });
        }
        return savedAs(w);
      } catch (e) { toast(L("No se pudo guardar: ", "Couldn't save: ") + e.message); }
    }
  } finally { fileBusy = false; }
}
function downloadTidal() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([fileText()], { type: "text/plain" }));
  a.download = fileNameFor(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Menú Archivo
function renderFilePop() {
  const pop = $("#file-pop");
  const rec = recentFiles();
  const k = (x) => `<kbd>${KEY_MOD}${x}</kbd>`;
  pop.innerHTML = `<button data-f="new" role="menuitem">${icon("plus", 16)} ${L("Nuevo proyecto…", "New project…")}</button>
    <button data-f="open" role="menuitem">${icon("folder", 16)} ${L("Abrir archivo…", "Open file…")} ${k("O")}</button>
    <button data-f="github" role="menuitem">${icon("cloud", 16)} ${L("Abrir desde GitHub…", "Open from GitHub…")}</button>
    <button data-f="import" role="menuitem">${icon("upload", 16)} ${L("Importar canción (MIDI, audio)…", "Import a song (MIDI, audio)…")}</button>
    <button data-f="generate" role="menuitem">${icon("wand", 16)} ${L("Generar desde mi MIDI…", "Generate from my MIDI…")}</button>
    <hr>
    <button data-f="save" role="menuitem">${icon("save", 16)} ${L("Guardar", "Save")} ${k("S")}</button>
    <button data-f="saveas" role="menuitem">${icon("save", 16)} ${L("Guardar como…", "Save as…")} ${k(KEY_MOD === "⌘" ? "⇧S" : "Shift+S")}</button>
    <button data-f="download" role="menuitem">${icon("download", 16)} ${L("Descargar .tidal", "Download .tidal")}</button>
    <button data-f="close" role="menuitem">${icon("close", 16)} ${state.file ? L("Cerrar archivo", "Close file") : L("Cerrar pestaña", "Close tab")} ${macPanels() ? k("W") : ""}</button>
    <hr>
    <div class="fp-title">${L("Recientes", "Recent")}</div>
    ${rec.length ? rec.map((r, i) => `<button data-f="recent" data-i="${i}" class="fp-recent" role="menuitem"><span>${esc(r.name)}</span><small>${esc(shortPath(dirOf(r.path)))}</small></button>`).join("")
      + `<button data-f="clear-recent" role="menuitem">${icon("broom", 16)} ${L("Vaciar la lista", "Clear the list")}</button>`
      : `<div class="fp-empty">${L("Los archivos que abras o guardes aparecerán aquí.", "Files you open or save will show up here.")}</div>`}
    <hr>
    <button data-f="projects" role="menuitem">${icon("folder", 16)} ${L("Mis proyectos…", "My projects…")}</button>`;
}
function toggleFilePop(open) {
  const pop = $("#file-pop"), btn = $("#btn-file");
  const show = open ?? pop.hidden;
  if (show) renderFilePop();
  pop.hidden = !show; btn.setAttribute("aria-expanded", String(show));
}
const FILE_CMDS = { new: () => openNewProject(), import: () => openImportSong(), generate: () => openImportSong({ generate: true, useLast: hasLastMidi() }), open: openFile, save: () => saveCmd(), saveas: () => saveFileAs(), download: downloadTidal, projects: () => openProjects(), github: () => openProjects("github"), close: () => closeTab(), newtab: () => openNewProject(),
  nexttab: () => switchTab((tabs.active + 1) % tabs.ids.length), prevtab: () => switchTab((tabs.active + tabs.ids.length - 1) % tabs.ids.length) };
function wireFiles() {
  $("#btn-file").onclick = (e) => { e.stopPropagation(); toggleFilePop(); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".file-menu")) toggleFilePop(false); });
  $("#file-pop").onclick = async (e) => {
    const b = e.target.closest("button[data-f]"); if (!b) return;
    const f = b.dataset.f;
    toggleFilePop(false);
    if (f === "recent") {
      const r = recentFiles()[+b.dataset.i];
      if (r && !fileBusy) openPath(r.path);
      return;
    }
    if (f === "clear-recent") { try { localStorage.removeItem(RECENT_KEY); } catch { /* nada */ } return; }
    FILE_CMDS[f] && FILE_CMDS[f]();
  };
  $("#file-input").onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (f) loadFileText(await f.text(), { name: f.name });
  };
  // Atajos: Ctrl/Cmd+O abrir, Ctrl/Cmd+S guardar, Ctrl/Cmd+Shift+S guardar como (también dentro del código)
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "o") { e.preventDefault(); openFile(); }
    if (key === "s") { e.preventDefault(); if (e.shiftKey) saveFileAs(); else saveCmd(); }
  });
  // La app de Mac llama aquí desde su menú Archivo
  window.tsFileCommand = (cmd) => { if (FILE_CMDS[cmd]) FILE_CMDS[cmd](); };
  window.addEventListener("beforeunload", (e) => { if (isDirty() || tabs.ids.some((id) => id !== state.projectId && dirtyOf(tabState(id)))) { e.preventDefault(); e.returnValue = ""; } });
  api("/api/file/info", {}).then((r) => { fileInfo = r; renderFileStatus(); }).catch(() => {});
  renderFileStatus();
}

// ------------------------------------------------------------------ cursos por género
// Construir una canción completa desde cero en un estilo, paso a paso (ritmo → bajo → armonía → melodía → arreglo → mezcla).
// El curso vive en el panel izquierdo (state.course = { id, i, done }) y Maestro explica cada paso en el chat.
const COURSE_NEXT = () => L("Siguiente paso del curso", "Next course step");
const COURSE_ASK = () => L("Explícame más este paso", "Tell me more about this step");
const COURSE_OPEN = () => L("Cursos por género", "Genre courses");
const levelDots = (n) => `<span class="lvl" title="${esc(L(["", "Principiante", "Intermedio", "Avanzado"][n], ["", "Beginner", "Intermediate", "Advanced"][n]))}">${"<i></i>".repeat(n)}${"<i class='off'></i>".repeat(3 - n)}</span>`;
const stepKind = (st) => st.arrange ? "arrange" : st.mix ? "mix" : "tracks";
const stepIcon = (st) => st.arrange ? "estructura" : st.mix ? "mixer" : (st.tracks[0] || {}).tipo || "percusion";

// ------------------------------------------------------------------ skills de Maestro
let skillList = [];
let pluginUpdatePolls = 0, pluginUpdateToasted = false;
async function refreshSkillCount() {
  let r = {};
  try { r = await api("/api/skills"); skillList = r.skills || []; } catch { skillList = []; }
  // Al arrancar, el servidor busca versiones nuevas de los plugins: avisamos cuando termina
  const pu = r.plugin_updates || {};
  if ((pu.state === "idle" || pu.state === "checking") && pluginUpdatePolls < 12) { pluginUpdatePolls++; setTimeout(refreshSkillCount, 5000); }
  if (pu.state === "done" && !pluginUpdateToasted) {
    pluginUpdateToasted = true;
    if ((pu.updated || []).length) toast(L(`Plugins actualizados a su última versión: ${pu.updated.join(", ")}`, `Plugins updated to their latest version: ${pu.updated.join(", ")}`));
    else { const n = (r.plugins || []).filter((p) => (p.update || {}).available).length; if (n) toast(L(`Hay ${n} plugin${n > 1 ? "s" : ""} con versión nueva: ábrelos en Skills`, `${n} plugin${n > 1 ? "s have" : " has"} a new version: open Skills to update`)); }
  }
  const n = skillList.filter((s) => s.enabled).length;
  const b = $("#sk-count"); b.textContent = n; b.hidden = !n;
  return skillList;
}
async function openSkills(focus = "") {
  let r = { skills: [], folder: "" };
  let kn = null;
  try { [r, kn] = await Promise.all([api("/api/skills"), api("/api/knowledge").catch(() => null)]); } catch (e) { toast(e.message); }
  skillList = r.skills || [];
  $("#skills-body").innerHTML = skillsDialogHTML(skillList, { knowledge: kn, focus, folder: r.folder, plugins: r.plugins || [], pluginFolder: r.plugin_folder, defaultState: r.default_plugins, updates: r.plugin_updates, autoUpdate: r.plugins_auto_update });
  if (!$("#skills").open) $("#skills").showModal();
  const f = focus && ($(`#skills-body .sk-card[data-name="${CSS.escape(focus)}"]`) || $(`#skills-body .pl-card[data-plugin="${CSS.escape(focus)}"]`));
  if (f) f.scrollIntoView({ block: "nearest" });
  refreshSkillCount();
}
function wireSkills() {
  const body = $("#skills-body");
  body.addEventListener("change", async (e) => {
    const card = e.target.closest(".sk-card, .pl-updates"); const a = e.target.dataset.a;
    if (!card || !a) return;
    if (a === "plugin-autoupdate") {
      try { await api("/api/plugins/autoupdate", { on: e.target.checked }); } catch (err) { toast(err.message); }
      return;
    }
    if (a === "plugin-enable" || a === "plugin-prefer") {
      try { await api(`/api/plugins/${a === "plugin-enable" ? "enable" : "prefer"}`, { name: card.dataset.plugin, on: e.target.checked }); } catch (err) { toast(err.message); }
      return openSkills(card.dataset.plugin);
    }
    try { await api(`/api/skills/${a}`, { name: card.dataset.name, on: e.target.checked }); } catch (err) { toast(err.message); }
    openSkills(card.dataset.name);
  });
  const installMsg = (form, text) => { form.querySelector(".hint").textContent = text; };
  const doInstall = async (form, url, names) => {
    const btns = form.querySelectorAll("button"); btns.forEach((x) => { x.disabled = true; });
    const btn = form.querySelector('button[type="submit"]'); btn.textContent = L("Instalando…", "Installing…");
    try {
      const r = await api("/api/plugins/install", { url, ...(names ? { names } : {}) });
      if (r.choose) {
        btns.forEach((x) => { x.disabled = false; }); btn.textContent = L("Instalar", "Install");
        form.querySelector(".pl-choose-slot").innerHTML = chooseHTML(r, url);
        return;
      }
      if (r.kind === "plugin") toast(L(`Plugin instalado: ${r.installed.join(", ")}`, `Plugin installed: ${r.installed.join(", ")}`));
      await openSkills(r.kind === "plugin" ? r.installed[0] : r.name);
    } catch (err) { btns.forEach((x) => { x.disabled = false; }); btn.textContent = L("Instalar", "Install"); installMsg(form, err.message); }
  };
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    if (b.dataset.a === "install-chosen") {
      const box = b.closest(".pl-choose");
      const names = [...box.querySelectorAll("input:checked")].map((i) => i.value);
      if (names.length) doInstall(b.closest("form"), box.dataset.url, names);
      return;
    }
    if (b.dataset.a === "kn-rebuild") {
      b.disabled = true; b.textContent = L("Reconstruyendo…", "Rebuilding…");
      try {
        const r = await api("/api/knowledge/rebuild", {});
        toast(L(`Índice rehecho: ${r.sections ?? "?"} secciones`, `Index rebuilt: ${r.sections ?? "?"} sections`));
      } catch (err) { toast(err.message); }
      return openSkills();
    }
    if (b.dataset.a === "cmd") {
      $("#skills").close();
      const inp = $("#chat-input"); if (inp) { inp.value = b.dataset.cmd + " "; inp.focus(); }
      return;
    }
    if (b.dataset.a === "plugin-check" || b.dataset.a === "plugin-update" || b.dataset.a === "plugin-update-all") {
      const pc = b.closest(".pl-card"); const name = pc ? pc.dataset.plugin : "";
      const check = b.dataset.a === "plugin-check";
      b.disabled = true; b.textContent = check ? L("Buscando…", "Checking…") : L("Actualizando…", "Updating…");
      try {
        const r = await api(`/api/plugins/${check ? "check" : "update"}`, { name });
        if (!check && r.updated) toast(L(`Plugin actualizado: ${r.updated.join(", ")}`, `Plugin updated: ${r.updated.join(", ")}`));
      } catch (err) { toast(err.message); }
      return openSkills(name);
    }
    if (b.dataset.a === "plugin-remove") {
      const pc = b.closest(".pl-card");
      try { await api("/api/plugins/remove", { name: pc.dataset.plugin }); } catch (err) { toast(err.message); }
      return openSkills();
    }
    const card = b.closest(".sk-card"); if (!card) return; const name = card.dataset.name;
    if (b.dataset.a === "view") {
      const pre = card.querySelector(".sk-body");
      if (!pre.hidden) { pre.hidden = true; return; }
      try {
        const r = await api(`/api/skills/body?name=${encodeURIComponent(name)}`);
        pre.textContent = r.skill + Object.entries(r.refs || {}).map(([k, v]) => `\n\n──────── ${k} ────────\n${v}`).join("");
        pre.hidden = false;
      } catch (err) { toast(err.message); }
    }
    if (b.dataset.a === "remove") {
      try { await api("/api/skills/remove", { name }); } catch (err) { toast(err.message); }
      openSkills();
    }
  });
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target; const url = form.url.value.trim();
    if (!url) return;
    form.querySelector(".pl-choose-slot").innerHTML = "";
    doInstall(form, url);
  });
}

function openCourses() {
  const prog = courseProgress();
  const body = $("#courses-body");
  body.innerHTML = `<div class="cs-intro"><h2>${L("Construye una canción desde cero", "Build a song from scratch")}</h2>
    <p>${L("Elige un género y Maestro te guía como en una clase de producción: primero el ritmo característico, luego el bajo, la armonía, la melodía, el arreglo y la mezcla. En cada paso añades una pieza que ya suena bien y aprendes por qué suena a ese estilo.",
      "Pick a genre and Maestro guides you like a production class: first the signature rhythm, then bass, harmony, melody, arrangement and mix. At each step you add a piece that already sounds good and learn why it sounds like that style.")}</p>
    <p class="hint">${L("Empezar un curso crea un proyecto nuevo; el que tienes ahora se queda guardado en «Mis proyectos».", "Starting a course creates a new project; your current one stays saved in «My projects».")}</p></div>
    <div class="cs-grid">${COURSES.map((c) => {
      const done = (prog[c.id] || []).length, total = c.steps.length;
      const active = state.course && state.course.id === c.id;
      return `<article class="cs-card" style="--g:${c.color}">
        <header><b>${esc(c.name)}${c.added ? ` <span class="cs-new">${L("nuevo", "new")}</span>` : ""}${c.beta ? ` <span class="cs-new beta" title="${esc(L("La guitarra de la biblioteca aún no se ha probado de oído: si no te convence, elige otra en el paso del requinto.", "The library guitar hasn't been checked by ear yet: if you don't like it, pick another on the requinto step."))}">beta</span>` : ""}</b><span>${esc(c.origin)}</span></header>
        ${c.variants ? `<div class="cs-vars">${icon("redo", 12)} ${c.variants.length} ${L("variantes", "variants")}: ${c.variants.map((v) => esc(v.name)).join(" · ")}</div>` : ""}
        <div class="cs-meta"><span>${c.bpm} BPM</span>${levelDots(c.level)}<span>${esc(c.key)}</span></div>
        <p>${esc(c.blurb)}</p>
        ${c.skill ? `<p class="cs-trad"><b>${L("Tradición:", "Tradition:")}</b> ${esc(c.tradition)}</p>
          <div class="cs-skill" title="${esc(L("Este curso sigue las reglas de esta skill de tu plugin de composición. Maestro la carga al explicarte cada paso.", "This course follows the rules of this skill from your composition plugin. Maestro loads it when explaining each step."))}">${icon("skill", 13)} ${L("Skill", "Skill")} · ${esc(c.skill)}</div>` : ""}
        ${c.ref ? `<div class="cs-ref" title="${esc(L("Una interpretación de un baterista profesional en MIDI (Groove MIDI Dataset, CC BY 4.0). Se descarga y suena con los instrumentos del curso.", "A professional drummer's performance in MIDI (Groove MIDI Dataset, CC BY 4.0). It downloads and plays with the course's instruments."))}">${icon("percusion", 13)} ${L("Baterista real", "Real drummer")} · ${esc(c.ref.style)}</div>` : ""}
        <div class="cs-learn">${c.learn.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
        <div class="cs-prog"><div class="bar"><div style="width:${Math.round((done / total) * 100)}%"></div></div><small>${done}/${total} ${L("pasos", "steps")}</small></div>
        <div class="cs-actions">
          <button class="primary" data-start="${c.id}">${icon(active ? "arrow" : "play", 13)} ${active ? L("Continuar", "Continue") : done ? L("Empezar de nuevo", "Start again") : L("Empezar curso", "Start course")}</button>
          <button class="prehear" data-hear="${c.id}">${icon("speaker", 13)} ${L("Escuchar el resultado", "Hear the result")}</button>
          ${c.ref ? `<button class="prehear" data-hear-ref="${c.id}">${icon("speaker", 13)} ${L("Baterista real", "Real drummer")}</button>` : ""}
        </div></article>`;
    }).join("")}</div>
    <p class="hint cs-foot">${L("Los patrones son reconstrucciones propias de ritmos tradicionales, escritas para este estudio. Cada curso enlaza sus fuentes como lectura recomendada.", "The patterns are original reconstructions of traditional rhythms, written for this studio. Each course links its sources as further reading.")}</p>`;
  body.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => {
    const id = b.dataset.start;
    $("#courses").close(); stopPreHear();
    if (state.course && state.course.id === id) { renderCourse(); return; }
    startCourse(id);
  });
  body.querySelectorAll("[data-hear]").forEach((b) => {
    const c = courseById(b.dataset.hear);
    wirePreHear(b, { bpm: c.bpm, pistas: finalTracks(c) });
  });
  body.querySelectorAll("[data-hear-ref]").forEach((b) => {
    const c = courseById(b.dataset.hearRef);
    wirePreHear(b, async () => ({ bpm: c.bpm, pistas: (await courseReference(c)).tracks }));
  });
  $("#courses").showModal();
}

// ------------------------------------------------------------------ baterista real (Groove MIDI Dataset)
const refCache = {};
async function courseReference(c) {
  const key = `${c.id}:${state.course && state.course.id === c.id ? state.bpm : c.bpm}`;
  if (!refCache[key]) {
    refCache[key] = api("/api/courses/reference", { ref: c.ref, bpm: state.course && state.course.id === c.id ? state.bpm : c.bpm })
      .catch((e) => { delete refCache[key]; throw e; });
  }
  return refCache[key];
}

function refBox(c) {
  const r = c.ref;
  return `<div class="cs-ref-box">
    <b>${icon("percusion", 15)} ${L("Así lo toca un baterista de verdad", "How a real drummer plays it")}</b>
    <span class="cs-ref-style">${esc(r.style)}</span>
    <p>${esc(r.note)}</p>
    <div class="cs-actions">
      <button class="prehear" data-ref="hear">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button>
      <button data-ref="add">${icon("plus", 14)} ${L("Añadirlo a mi canción", "Add it to my song")}</button>
    </div>
    <small class="cs-ref-credit">${L("MIDI de", "MIDI from")} <a href="https://magenta.tensorflow.org/datasets/groove" target="_blank" rel="noopener">Groove MIDI Dataset</a> (Google Magenta) · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · ${esc(r.file.split("/")[0])}</small>
  </div>`;
}

// Tu propio ejemplo: un MIDI de una canción del estilo (tuyo o comprado). Suena solo y Maestro lo usa de referencia.
function mineBox(c) {
  const m = state.course && state.course.mine;
  const file = `<input type="file" id="cs-mine-file" accept=".mid,.midi,.rmi,audio/midi" hidden>`;
  if (!m) return `<div class="cs-mine">${file}<span>${L(`¿Tienes un MIDI de una canción de ${c.name} con todos los instrumentos (tuyo o de un pack que hayas comprado)? Cárgalo como ejemplo: lo escuchas aquí y Maestro lo usa como referencia del estilo.`, `Have a MIDI of a ${c.name} song with all the instruments (your own or from a pack you bought)? Load it as an example: you hear it here and Maestro uses it as a style reference.`)}</span>
    <div class="cs-actions"><button data-mine="load">${icon("folder", 14)} ${L("Cargar mi MIDI de ejemplo", "Load my example MIDI")}</button>
    <button data-mine="gen" title="${esc(L(`Genera una canción de ${c.name} desde tu MIDI (empieza un proyecto nuevo)`, `Generate a ${c.name} song from your MIDI (starts a new project)`))}">${icon("wand", 14)} ${L(`Hacer mi MIDI ${c.name}`, `Make my MIDI ${c.name}`)}</button></div></div>`;
  return `<div class="cs-ref-box cs-mine-box">${file}
    <b>${icon("course", 15)} ${L("Tu ejemplo", "Your example")}</b>
    <span class="cs-ref-style">${esc(m.name)} · ${m.bpm} BPM · ${esc(m.key || "")} · ${esc((m.chords || []).join(" "))}</span>
    <p>${esc(m.instruments.join(", "))}</p>
    <div class="cs-actions">
      <button class="prehear" data-mine="hear">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button>
      <button data-mine="gen" title="${esc(L(`Genera una canción de ${c.name} desde tu MIDI (empieza un proyecto nuevo)`, `Generate a ${c.name} song from your MIDI (starts a new project)`))}">${icon("wand", 14)} ${L(`Hacer mi MIDI ${c.name}`, `Make my MIDI ${c.name}`)}</button>
      <button data-mine="load">${icon("folder", 14)} ${L("Otro", "Another")}</button>
      <button data-mine="remove">${icon("close", 14)} ${L("Quitar", "Remove")}</button>
    </div></div>`;
}

function mineCambios() {
  const m = state.course.mine;
  const ids = m.tracks.map((_, k) => `d${k + 1}`);
  // Suena solo el ejemplo: lo demás de la canción calla mientras lo escuchas
  const quiet = state.tracks.filter((t) => !ids.includes(t.id)).map((t) => ({ id: t.id, codigo: "silence" }));
  return { bpm: m.bpm, pistas: [...m.tracks.map((t, k) => ({ ...t, id: ids[k] })), ...quiet] };
}

async function courseMineLoad(f) {
  try {
    const q = new URLSearchParams({ name: f.name.replace(/\.[^.]+$/, ""), lang: LANG, bars: "4" });
    const bytes = new Uint8Array(await f.arrayBuffer());
    const r = await fetch(`/api/import/midi?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    const s = data.summary;
    rememberMidi(s.name, bytes);
    state.course.mine = { name: s.name, bpm: s.studio_bpm, key: s.key && s.key.name, chords: s.window.chords, instruments: s.instruments,
      tracks: data.tracks.slice(0, maxTracks()).map((t) => ({ nombre: t.nombre, tipo: t.tipo, codigo: t.codigo })), reference: (data.reference || "").slice(0, 3000) };
    save(); renderCourse();
    say(L(`He cargado «${s.name}» como ejemplo del curso: ${s.bpm} BPM, ${s.meter}, ${s.key ? s.key.name : "?"}, acordes ${s.progression.slice(0, 4).join(" → ")}. Pulsa Escuchar en el panel del curso para oír cuatro compases con todos sus instrumentos. Cuando me preguntes por un paso, lo compararé con este ejemplo.`,
      `I loaded «${s.name}» as the course example: ${s.bpm} BPM, ${s.meter}, ${s.key ? s.key.name : "?"}, chords ${s.progression.slice(0, 4).join(" → ")}. Press Listen in the course panel to hear four bars with all its instruments. When you ask me about a step, I'll compare it with this example.`), [COURSE_ASK()]);
  } catch (e) { toast(e.message); }
}

async function courseReferenceAdd(c, btn) {
  btn.disabled = true;
  try {
    stopPreHear();
    const ex = await courseReference(c);
    await ensureInstruments(ex.tracks.map((t) => t.codigo));
    const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
    const changes = applyChanges({ pistas: ex.tracks });
    const diff = diffFor(before, { pistas: ex.tracks });
    say(L(`${c.ref.style}: el baterista real ya está en tu canción (${ex.tracks.map((t) => t.id).join(", ")}). ${c.ref.note}\n\nLos números de gain son la fuerza de cada golpe y los de nudge, lo que se adelanta o se atrasa (en segundos). Silencia tus pistas de ritmo para compararlo, o quédate con lo que te guste.\n\nMIDI: ${ex.credit.text}.`,
      `${c.ref.style}: the real drummer is now in your song (${ex.tracks.map((t) => t.id).join(", ")}). ${c.ref.note}\n\nThe gain numbers are the strength of each hit and the nudge numbers how early or late it is (in seconds). Mute your rhythm tracks to compare, or keep whatever you like.\n\nMIDI: ${ex.credit.text}.`),
      [COURSE_ASK()], { changes, diff });
    save();
  } catch (e) { toast(e.message); }
  btn.disabled = false;
}

function startCourse(id, variant) {
  const c = courseFor(id, variant);
  startFresh();
  state.course = { id, i: 0, done: [], ...(c.variant ? { variant: c.variant.id } : {}) };
  courseScore(c);
  state.name = L(`${c.name} desde cero`, `${c.name} from scratch`);
  state.bpm = c.bpm; $("#bpm").value = c.bpm; $("#proj-name").value = state.name;
  if (live()) evalCode(cps(c.bpm));
  // Los instrumentos reales del curso (congas, bajo acústico, trombones…) se van bajando mientras lees
  ensureInstruments(finalTracks(c).map((t) => t.codigo), { quiet: true }).then(() => checkCourseSounds(c));
  checkCourseSounds(c);
  state.step = "libre";
  const trad = c.skill ? L(`\n\nTradición: ${c.tradition} ${c.lens} El curso sigue la skill ${c.skill} de tu plugin de composición; los instrumentos reales se descargan solos.`,
    `\n\nTradition: ${c.tradition} ${c.lens} The course follows the ${c.skill} skill from your composition plugin; the real instruments download by themselves.`) : "";
  const vtxt = c.variant ? L(`\n\nVariante: ${c.variant.name}. ${c.variant.short} Puedes cambiarla arriba del primer paso.`, `\n\nVariant: ${c.variant.name}. ${c.variant.short} You can change it above the first step.`) : "";
  say(L(`¡Vamos a construir un ${c.name} desde cero! (${c.origin})\n\n${c.blurb}${vtxt}${trad}\n\nHe puesto el tempo a ${c.bpm} BPM. El curso está en el panel de la izquierda: lee cada paso, pulsa «Escuchar» para oírlo antes y «Añadir a mi canción» cuando quieras. Yo te explico el código de cada pieza aquí.`,
    `Let's build ${/^[aeiou]/i.test(c.name) ? "an" : "a"} ${c.name} track from scratch! (${c.origin})\n\n${c.blurb}${vtxt}${trad}\n\nI set the tempo to ${c.bpm} BPM. The course is in the left panel: read each step, press «Listen» to hear it first and «Add to my song» when you're ready. I'll explain each piece's code here.`), []);
  save();
  renderCourse();
}

// 0.17: la partitura del curso lleva su tonalidad y su forma (secciones), y las pistas de melodía, acordes y bajo
const COURSE_KEY = { merengue: "C", salsa: "Am", cumbia: "Am", reggaeton: "Am", bossa: "C", jazz: "C", funk: "Em", house: "Am", techno: "Am", dnb: "Dm", lofi: "C",
  reggae: "Am", boombap: "Dm", afrobeat: "Em", bachata: "Am" };
function courseScore(c) {
  if (!c || !c.form) return;
  state.score = state.score && Array.isArray(state.score.parts) ? state.score : { version: 1, key: "C", meter: "4/4", parts: [] };
  state.score.key = COURSE_KEY[c.id] || state.score.key;
  let bar = 1;
  state.score.sections = c.form.map((f) => { const s = { name: f.name, bar }; bar += f.bars; return s; });
}
async function courseLinkScore(c, tracks) {
  courseScore(c);
  for (const p of tracks || []) {
    if (!/^(melodia|bajo|armonia)$/.test(p.tipo)) continue;
    const t = state.tracks.find((x) => x.id === p.id);
    if (!t || /^\s*(struct|swingBy|degradeBy|every|jux|sometimes)/.test(t.code)) continue;   // código con trucos: se queda libre
    try {
      const r = await api("/api/score/from-tidal", { code: t.code, meter: "4/4" });
      if (r.bars) linkPart(state, t, { id: t.id, name: t.name, role: t.kind, bars: r.bars, sound: r.sound, fx: r.fx });
    } catch { /* sin partitura no pasa nada */ }
  }
}

// 0.17: ¿suenan ya los sonidos del curso? Los que faltan se avisan en el panel (y se descargan solos si tienen licencia libre)
async function checkCourseSounds(c) {
  if (!c || !state.course || state.course.id !== c.id) return;
  let r;
  try { r = await api("/api/sounds/check", { sounds: courseSounds(c) }); } catch { return; }
  if (!state.course || state.course.id !== c.id) return;
  state.course.sounds = (r.sounds || []).filter((s) => s.state !== "playable").map((s) => ({ sound: s.sound, state: s.state, name: s.name, license: s.license }));
  state.course.engineOk = !!r.engine_ok;
  renderCourse();
}
function courseSoundsBox(c) {
  const miss = (state.course && state.course.sounds) || [];
  if (!miss.length || state.course.engineOk === false) return "";
  const dl = miss.filter((s) => s.state === "catalog"), loading = miss.filter((s) => s.state === "downloaded" || s.state === "loaded"), none = miss.filter((s) => s.state === "unknown");
  const list = (xs) => xs.map((s) => `<code title="${esc(s.license || "")}">${esc(s.sound)}</code>`).join(" ");
  return `<div class="cs-warn">${icon("speaker", 15)}<div><b>${L("Sonidos que aún no suenan", "Sounds that don't play yet")}</b>
    ${dl.length ? `<span>${L("Con licencia libre, se descargan solos:", "Freely licensed, they download by themselves:")} ${list(dl)} <button class="link" data-cs="sounds">${L("Descargar ahora", "Download now")}</button></span>` : ""}
    ${loading.length ? `<span>${L("Descargados, cargándose en el motor:", "Downloaded, loading into the engine:")} ${list(loading)}</span>` : ""}
    ${none.length ? `<span>${L("No están en tu librería ni en el catálogo libre: esas pistas sonarán en silencio. Elige otro sonido de oído.", "Not in your library or the free catalogue: those tracks will be silent. Pick another sound by ear.")} ${list(none)}</span>` : ""}
  </div></div>`;
}
function courseVariantsBox(c) {
  const base = courseById(c.id);
  if (!base.variants) return "";
  const cur = c.variant ? c.variant.id : base.variants[0].id;
  return `<div class="cs-variants"><b>${L("Elige la variante antes del ritmo", "Choose the variant before the rhythm")}</b>
    ${base.variants.map((v) => `<label class="${v.id === cur ? "on" : ""}"><input type="radio" name="cs-variant" value="${esc(v.id)}" ${v.id === cur ? "checked" : ""}>
      <span><b>${esc(v.name)}</b>${v.bpm ? ` · ${v.bpm} BPM` : ` · ${base.bpm} BPM`}<small>${esc(v.short)}</small></span></label>`).join("")}</div>`;
}
function setCourseVariant(id) {
  if (!state.course || state.course.variant === id) return;
  stopPreHear();
  state.course.variant = id;
  const c = curCourse();
  if (!state.bpmLock) { state.bpm = c.bpm; $("#bpm").value = c.bpm; if (live()) evalCode(cps(c.bpm)); }
  state.course.sounds = null;
  ensureInstruments(finalTracks(c).map((t) => t.codigo), { quiet: true }).then(() => checkCourseSounds(c));
  checkCourseSounds(c);
  save(); renderCourse();
  sysMsg(L(`Variante: ${c.variant.name}. ${c.variant.short}`, `Variant: ${c.variant.name}. ${c.variant.short}`));
}

function leaveCourse() {
  stopPreHear();
  state.course = null; save(); renderCourse();
  say(L("Has salido del curso. Tu canción sigue aquí: ahora es tuya para cambiarla como quieras. Puedes volver a los cursos cuando quieras.", "You left the course. Your song is still here: now it's yours to change as you like. You can come back to the courses any time."), [COURSE_OPEN()]);
}

function courseStepDone(i) { return !!(state.course && state.course.done.includes(i)); }

function renderCourse() {
  const dock = $("#course-dock");
  const c = curCourse();
  document.querySelector(".layout").classList.toggle("course-mode", !!c);
  dock.hidden = !c;
  if (!c) { dock.innerHTML = ""; return; }
  const i = Math.max(0, Math.min(c.steps.length - 1, state.course.i));
  const st = c.steps[i], done = courseStepDone(i), kind = stepKind(st);
  const allDone = c.steps.every((_, k) => courseStepDone(k));
  const dots = c.steps.map((s, k) => `<button class="cs-dot ${k === i ? "on" : ""} ${courseStepDone(k) ? "done" : ""}" data-go="${k}" title="${esc(`${k + 1}. ${s.t}`)}">${courseStepDone(k) ? icon("check", 12) : k + 1}</button>`).join("");
  let what = "";
  if (kind === "tracks") what = st.tracks.map((t) => {
    const cur = state.tracks.find((x) => x.id === t.id);
    const snd = cur && soundOf(cur.code);
    return `<div class="cs-track" style="--k:${KIND_COLOR[t.tipo] || "var(--ink-3)"}"><div class="cs-tname">${icon(t.tipo, 14)} <code>${esc(t.id)}</code> ${esc(t.nombre)}
      ${snd ? `<button class="link cs-ear" data-ear="${esc(t.id)}" title="${esc(L(`Los 3 sonidos que mejor encajan con «${snd}» y ya suenan, sobre la misma frase. El estudio aprende lo que te gusta en ${c.name}.`, `The 3 sounds that best match «${snd}» and already play, on the same phrase. The studio learns what you like in ${c.name}.`))}">${icon("ear", 13)} ${L("Elegir sonido de oído", "Choose the sound by ear")}</button>` : ""}</div><pre class="cs-code">${esc(t.codigo)}</pre></div>`;
  }).join("");
  if (kind === "arrange") what = `<div class="cs-arr">${Object.entries(st.arrange).map(([id, m]) => {
      const t = state.tracks.find((x) => x.id === id) || (finalTracks(c).find((x) => x.id === id) || {});
      return `<div class="cs-arr-row"><span><code>${esc(id)}</code> ${esc(t.name || t.nombre || "")}</span><span class="cs-bars">${maskArr(m).map((on) => `<i class="${on ? "on" : ""}"></i>`).join("")}</span></div>`;
    }).join("")}</div>`;
  if (kind === "mix") what = `<div class="cs-mix">${Object.entries(st.mix).map(([id, m]) => {
      const t = state.tracks.find((x) => x.id === id) || {};
      const parts = [m.vol != null ? `${dbText(m.vol)}` : "", ...["low", "mid", "high"].filter((b) => m[b]).map((b) => `${L({ low: "graves", mid: "medios", high: "agudos" }[b], b === "low" ? "lows" : b === "mid" ? "mids" : "highs")} ${m[b] > 0 ? "+" : ""}${m[b]}`)].filter(Boolean).join(" · ");
      return `<div class="cs-mix-row"><span>${id === "master" ? "<b>Master</b>" : `<code>${esc(id)}</code> ${esc(t.name || "")}`}</span><span>${esc(parts)}</span></div>`;
    }).join("")}</div>`;
  const applyLabel = kind === "arrange" ? L("Aplicar el arreglo", "Apply the arrangement") : kind === "mix" ? L("Aplicar la mezcla", "Apply the mix") : L("Añadir a mi canción", "Add to my song");
  const missing = kind !== "tracks" && Object.keys(st.arrange || st.mix).some((id) => id !== "master" && !state.tracks.find((t) => t.id === id));
  dock.innerHTML = `<div class="cs-head" style="--g:${c.color}">
      <div><span class="cs-kicker">${icon("course", 14)} ${L("Curso", "Course")} · ${esc(c.name)}</span><b>${L("Paso", "Step")} ${i + 1} ${L("de", "of")} ${c.steps.length}</b></div>
      <button class="icon-btn" data-cs="list" title="${esc(L("Todos los cursos", "All courses"))}">${icon("folder", 17)}</button>
      <button class="icon-btn" data-cs="leave" title="${esc(L("Salir del curso (tu canción se queda)", "Leave the course (your song stays)"))}">${icon("close", 17)}</button>
    </div>
    <div class="cs-dots">${dots}</div>
    ${i === 0 ? courseVariantsBox(c) : ""}
    ${courseSoundsBox(c)}
    ${c.skill && i === 0 ? `<div class="cs-trad-box"><b>${L("La tradición que vamos a tocar", "The tradition we'll play")}</b><span>${esc(c.tradition)}</span><span class="cs-lens">${esc(c.lens)}</span></div>` : ""}
    ${i <= 1 ? (c.ref ? refBox(c) : "") + mineBox(c) : ""}
    <div class="cs-step">
      <h3>${icon(stepIcon(st), 18)} ${esc(st.t)}</h3>
      <p>${esc(st.why)}</p>
      ${st.rule ? `<div class="cs-rule">${icon("skill", 15)} <span><b>${L("Lo que dice la skill", "What the skill says")} <code>${esc(c.skill)}</code></b>${esc(st.rule)}</span></div>` : ""}
      ${st.listen ? `<div class="cs-listen">${icon("speaker", 15)} <span><b>${L("Escucha:", "Listen for:")}</b> ${esc(st.listen)}</span></div>` : ""}
      ${what}
      ${missing ? `<p class="hint">${L("Faltan pistas de pasos anteriores: se aplicará a las que existan.", "Some tracks from earlier steps are missing: it will apply to the ones that exist.")}</p>` : ""}
      <div class="cs-actions">
        <button class="primary" data-cs="apply">${icon(done ? "redo" : kind === "tracks" ? "plus" : "check", 14)} ${done ? L("Volver a aplicar", "Apply again") : applyLabel}</button>
        ${kind === "tracks" ? `<button class="prehear" data-cs="hear">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button>` : ""}
        ${kind === "tracks" && st.tracks.some((t) => /^(melodia|bajo|armonia)$/.test(t.tipo)) ? `<button data-cs="other" title="${esc(L("3 versiones nuevas de esta pista sobre el resto de tu canción, que no se toca", "3 new takes on this track over the rest of your song, which stays as it is"))}">${icon("redo", 14)} ${L("Otra versión", "Another version")}</button>` : ""}
        <button data-cs="ask">${icon("maestro", 15)} ${L("Pregunta a Maestro", "Ask Maestro")}</button>
      </div>
      ${done ? `<div class="cs-try"><b>${L("Tu turno.", "Your turn.")}</b> ${esc(st.try)}</div>` : ""}
      <div class="cs-nav">
        <button data-cs="prev" ${i === 0 ? "disabled" : ""}>${icon("back", 14)} ${L("Anterior", "Previous")}</button>
        ${i < c.steps.length - 1 ? `<button class="${done ? "primary" : ""}" data-cs="next">${L("Siguiente", "Next")} ${icon("arrow", 14)}</button>` : ""}
      </div>
      ${allDone ? `<div class="cs-done">${icon("check", 18)} <div><b>${L("¡Curso completado!", "Course complete!")}</b><span>${L(`Has construido un ${c.name} completo. Grábalo, guárdalo en GitHub o cámbialo a tu gusto.`, `You built a complete ${c.name} track. Record it, save it to GitHub or make it your own.`)}</span>
        <div class="cs-actions"><button data-cs="record">${icon("rec", 13)} ${L("Grabar", "Record")}</button><button data-cs="list">${L("Otro curso", "Another course")}</button></div></div></div>` : ""}
    </div>
    <details class="cs-sources"><summary>${L("Fuentes y lecturas recomendadas", "Sources and further reading")}</summary>
      <ul>${c.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul></details>`;
  dock.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => courseGo(+b.dataset.go));
  dock.querySelectorAll("[name=cs-variant]").forEach((r) => r.onchange = () => setCourseVariant(r.value));
  dock.querySelectorAll("[data-ear]").forEach((b) => b.onclick = () => {
    const t = state.tracks.find((x) => x.id === b.dataset.ear);
    if (t) compareSounds(soundOf(t.code), null, t);
  });
  const hear = dock.querySelector("[data-cs=hear]");
  if (hear) wirePreHear(hear, { pistas: st.tracks });
  const refHear = dock.querySelector("[data-ref=hear]");
  if (refHear) wirePreHear(refHear, async () => ({ pistas: (await courseReference(c)).tracks }));
  const mineHear = dock.querySelector("[data-mine=hear]");
  if (mineHear) wirePreHear(mineHear, mineCambios);
  dock.querySelectorAll("[data-mine=load]").forEach((b) => b.onclick = () => dock.querySelector("#cs-mine-file").click());
  const mineFile = dock.querySelector("#cs-mine-file");
  if (mineFile) mineFile.onchange = () => mineFile.files[0] && courseMineLoad(mineFile.files[0]);
  const mineDrop = dock.querySelector("[data-mine=remove]");
  if (mineDrop) mineDrop.onclick = () => { stopPreHear(); delete state.course.mine; save(); renderCourse(); };
  const mineGen = dock.querySelector("[data-mine=gen]");
  if (mineGen) mineGen.onclick = () => { stopPreHear(); openImportSong({ generate: true, useLast: hasLastMidi(), style: c.id }); };
  const refAdd = dock.querySelector("[data-ref=add]");
  if (refAdd) refAdd.onclick = () => courseReferenceAdd(c, refAdd);
  dock.querySelectorAll("[data-cs]").forEach((b) => { if (b.dataset.cs !== "hear") b.onclick = () => courseAction(b.dataset.cs); });
}

function courseGo(i) {
  if (!state.course) return;
  stopPreHear();
  state.course.i = i; save(); renderCourse();
  $("#course-dock").scrollTop = 0;
}

function courseAction(a) {
  const c = curCourse();
  if (a === "list") return openCourses();
  if (!c) return;
  const i = state.course.i, st = c.steps[i];
  if (a === "leave") return leaveCourse();
  if (a === "prev") return courseGo(i - 1);
  if (a === "next") return courseGo(i + 1);
  if (a === "record") return toggleRecord();
  if (a === "ask") return courseAsk();
  if (a === "apply") return courseApply();
  if (a === "other") return courseOther();
  if (a === "sounds") return ensureInstruments(finalTracks(c).map((t) => t.codigo)).then(() => checkCourseSounds(c));
}

// «Otra versión»: 3 candidatas de la pista melódica/bajo/armonía del paso,
// generadas con midigen v2 sobre el resto de la canción, que queda congelado.
async function courseOther() {
  const c = curCourse(), st = c.steps[state.course.i];
  const t = (st.tracks || []).find((x) => /^(melodia|bajo|armonia)$/.test(x.tipo));
  if (!t) return;
  stopPreHear();
  const cur = state.tracks.find((x) => x.id === t.id);
  const btn = $("#course-dock [data-cs=other]");
  if (btn) btn.disabled = true;
  try {
    const r = await api("/api/course/variants", { style: c.id, track: { id: t.id, nombre: t.nombre, tipo: t.tipo, codigo: (cur && cur.code) || t.codigo }, seed: Math.floor(Math.random() * 1e6),
      tracks: state.tracks.map((x) => ({ id: x.id, code: x.code, kind: x.kind, muted: x.muted })) });
    if (!r.variantes || !r.variantes.length) return toast(L("No he podido generar versiones para esta pista.", "I couldn't make versions of this track."));
    state.chat.forEach((m) => { if (m.variantes && m.picked == null) m.dismissed = true; });
    say(L(`Tres versiones nuevas de «${t.nombre}» en ${r.key} (${(r.chords || []).join(" ")}). El resto de tu canción no cambia: escúchalas encima y elige.`,
      `Three new takes on «${t.nombre}» in ${r.key} (${(r.chords || []).join(" ")}). The rest of your song stays the same: listen over it and pick one.`), state.options, { variantes: r.variantes });
  } catch (e) { toast(String(e.message || e)); }
  finally { if (btn) btn.disabled = false; }
}

async function courseApply() {
  const c = curCourse(), i = state.course.i, st = c.steps[i];
  stopPreHear();
  if (st.tracks) await ensureInstruments(st.tracks.map((t) => t.codigo));
  const before = JSON.parse(JSON.stringify({ bpm: state.bpm, tracks: state.tracks }));
  let changes = "", diff = [];
  const skipped = [];
  if (state.bpm !== c.bpm && state.bpmLock) skipped.push("BPM");
  else if (state.bpm !== c.bpm) { state.bpm = c.bpm; $("#bpm").value = c.bpm; if (live()) evalCode(cps(c.bpm)); }
  if (st.tracks) {
    // Si la pista ya tenía un arreglo (mask) lo conservamos
    const pistas = st.tracks.map((t) => {
      const cur = state.tracks.find((x) => x.id === t.id);
      const bars = cur && barsOf(cur.code, 16);
      return bars && bars.some((on) => !on) ? { ...t, codigo: setMask(t.codigo, bars) } : t;
    });
    changes = applyChanges({ pistas });
    diff = diffFor(before, { pistas });
    await courseLinkScore(c, pistas);
  }
  if (st.arrange) {
    courseScore(c);
    for (const [id, m] of Object.entries(st.arrange)) { const t = state.tracks.find((x) => x.id === id); if (t && t.lock && (t.lock.all || t.lock.ritmo)) { skipped.push(id); continue; } if (t) t.code = setMask(t.code, maskArr(m)); }
    changed(); if (live()) playAll(true);
    document.querySelector('.tab[data-tab="arrange"]')?.click();
  }
  if (st.mix) {
    for (const [id, m] of Object.entries(st.mix)) {
      const v = { vol: 0, low: 0, mid: 0, high: 0, ...m };
      if (id === "master") state.master = v; else { const t = state.tracks.find((x) => x.id === id); if (t && mixLocked(t)) { skipped.push(id); continue; } if (t) t.mix = v; }
    }
    changed(); if (live()) playAll();
    document.querySelector('.tab[data-tab="mixer"]')?.click();
  }
  if (!state.course.done.includes(i)) state.course.done.push(i);
  markStepDone(c.id, i);
  const last = i === c.steps.length - 1;
  const intro = `${L("Paso", "Step")} ${i + 1}/${c.steps.length} · ${st.t}\n\n${st.why}${st.rule ? `\n\n${L("Según la skill", "Per the skill")} ${c.skill}: ${st.rule}` : ""}${st.listen ? `\n\n${L("Escucha:", "Listen for:")} ${st.listen}` : ""}`;
  const opts = [...(last ? [] : [COURSE_NEXT()]), COURSE_ASK(), ...(last ? [COURSE_OPEN()] : [])];
  if (skipped.length) changes = (changes ? changes + " · " : "") + L("bloqueado, el curso no lo ha cambiado: ", "locked, the course didn't change it: ") + [...new Set(skipped)].join(", ");
  say(intro, opts, { explicacion: st.parts, reto: st.try, changes, diff });
  save();
  renderCourse();
}

function courseAsk() {
  const c = curCourse(), i = state.course.i, st = c.steps[i];
  if (useLLM()) {
    return send(L(`Estoy en el curso de ${c.name}, paso ${i + 1} («${st.t}»). Explícame con más detalle, como un profesor de producción, por qué esto suena a ${c.name}, qué haría un músico real aquí y propón una variación para probar en mi canción.`,
      `I'm on the ${c.name} course, step ${i + 1} («${st.t}»). Explain in more depth, like a production teacher, why this sounds like ${c.name}, what a real musician would do here, and suggest one variation to try on my song.`));
  }
  say(`${st.t}\n\n${st.why}${st.listen ? `\n\n${L("Escucha:", "Listen for:")} ${st.listen}` : ""}\n\n${L("Con una IA conectada en Ajustes te lo puedo explicar con más detalle y responder tus preguntas.", "With an AI connected in Settings I can explain it in more depth and answer your questions.")}`,
    state.options, { explicacion: st.parts, reto: st.try });
}

// ------------------------------------------------------------------ tutorial
// Ideas de Maestro: se pueden ocultar para dar más sitio al chat (se recuerda en el navegador)
const IDEAS_KEY = "tidal-studio-ideas-hidden";
function setIdeasHidden(h) {
  $("#ideas").classList.toggle("collapsed", h);
  try { localStorage.setItem(IDEAS_KEY, h ? "1" : "0"); } catch { /* sin almacenamiento */ }
}
function runTour() {
  setIdeasHidden(false);
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
  initTabs();
  importSharedSong();
  // Si cambió el idioma, Maestro vuelve a saludar en el nuevo idioma (las pistas se mantienen)
  if (state.lang !== LANG) { state.chat = []; state.options = []; state.ideas = []; state.lang = LANG; }
  translateStatic();
  hydrateIcons();
  $("#bpm").value = state.bpm;
  $("#proj-name").value = state.name || "";
  renderCatalog(); renderPalette(); renderTracks(); renderProgress(); renderIdeas(); $("#code").value = buildCode(); attachHighlight($("#code")); startPlaying();
  if (!state.chat.length) greet(); else renderChat();
  renderCourse();
  // Primera visita: el tutorial arranca solo (se puede cerrar en el primer paso)
  if (!tourSeen() && !state.tracks.length && !location.hash) setTimeout(runTour, 900);
  // 0.25: «Mis proyectos» vacío pero hay canciones en tu carpeta de datos → se recuperan solas
  if (!listProjects().length) recoverLocalSongs().then((r) => {
    if (r.added) toast(L(`He recuperado ${r.added} ${r.added === 1 ? "canción" : "canciones"} de tu carpeta de datos. Están en «Mis proyectos».`, `I recovered ${r.added} ${r.added === 1 ? "song" : "songs"} from your data folder. They're in «My projects».`));
  });

  $("#bpm").addEventListener("change", (e) => {
    state.bpm = Math.max(40, Math.min(220, parseInt(e.target.value) || 120)); e.target.value = state.bpm;
    changed(); evalCode(cps(state.bpm));
  });
  $("#btn-play").onclick = () => playAll(hasArrangement());
  $("#btn-hush").onclick = hushAll;
  $("#style-filter").onchange = (e) => { state.style = e.target.value; save(); renderCatalog(); renderIdeas(); };
  wireVariants();
  wirePlan();
  wireFetch();
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); if (busy && inflight) return cancelChat(); const i = $("#chat-input"); send(i.value); i.value = ""; };
  // Cancelar: el botón del mensaje «pensando…», el de enviar (se vuelve un cuadrado) o la tecla Esc
  $("#chat").addEventListener("click", (e) => { if (e.target.closest("[data-cancel]")) cancelChat(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && inflight && !audition) { e.preventDefault(); cancelChat(); } });
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
    if (b.dataset.tab === "code") { $("#code").value = buildCode(); codeSynced = true; renderCodeFx(); refreshHighlights(); }
    if (b.dataset.tab === "log") refreshLog();
    if (b.dataset.tab === "blocks") renderBlocks();
    if (b.dataset.tab === "arrange") renderArrange();
    if (b.dataset.tab === "timeline") renderTimeline();
    if (b.dataset.tab === "mixer") renderMixer(true);
    bkClose();
  });
  $("#code").addEventListener("input", () => { if (codeSynced) { codeSynced = false; renderCodeFx(); } });
  $("#code-fx").addEventListener("click", (e) => {
    const row = e.target.closest(".cfx-track"); if (!row || row.classList.contains("disabled")) return;
    const sw = e.target.closest(".fx-sw"); if (sw) { e.stopPropagation(); return toggleFx(row.dataset.id, sw.dataset.fx); }
    const o = e.target.closest("[data-fx-open]"); if (o) return fxOpen("code", row.dataset.id, o.dataset.fxOpen, o.closest(".fx-chip"));
  });
  $("#code-fx").addEventListener("change", (e) => { const s = e.target.closest(".fx-add"), row = e.target.closest(".cfx-track"); if (s && row && s.value) addFx(row.dataset.id, s.dataset.fxAdd, s.value); });
  $("#btn-apply-code").onclick = async () => {
    const parsed = parseCode($("#code").value);
    const keep = new Set(parsed.tracks.map((t) => t.id));
    const removed = state.tracks.filter((t) => !keep.has(t.id)).map((t) => t.id);
    const before = Object.fromEntries(state.tracks.map((t) => [t.id, t.code]));
    parsed.tracks.forEach((t) => { if (before[t.id] !== t.code) t.edited = true; });
    state.bpm = parsed.bpm; $("#bpm").value = state.bpm; state.tracks = parsed.tracks; state.extra = parsed.extra;
    codeSynced = true;
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
    downloadTidal();
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
  initListen({ api, getState: () => state, genres: COURSES.map((c) => ({ id: c.id, name: c.name })) });
  initMonitor({ api });
  initSoundLab({ api, toast, wireHear: wirePreHear, freeId, addTrack });
  initMemory({ api, toast, state: () => state, badge: setMemBadge, openStorage, hush: () => evalCode("hush"),
    songForStyle: () => ({ name: state.name, bpm: state.bpm, style: state.style, tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code })), score: state.score }),
    listen: async (tracks, bpm) => { await ensureInstruments(tracks.map((t) => t.code)); evalCode(["hush", cps(bpm), ...tracks.map((t) => `${t.id} $ ${t.code}`)].join("\n\n")); },
    useStyle, adoptStyleTracks });
  initStorage({ api, toast, librarySync: () => { server.samples = null; sm.mine = null; }, recoverSongs: recoverLocalSongs });
  $("#btn-storage").onclick = () => { $("#settings").close(); openStorage(); };
  refreshMemBadge();
  initScore({ api, getState: () => state, changed, sysMsg, toast, playTrack: (t) => live() && playTrack(t) });
  $("#bpm-lock").onclick = () => { state.bpmLock = !state.bpmLock; save(); renderBpmLock(); };
  renderBpmLock();
  initAppUpdate();
  $("#btn-new").onclick = openNewProject;
  $("#btn-projects").onclick = () => openProjects();
  wireFiles();
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
  $("#btn-save").onclick = async () => { if (await saveSettings() !== false) $("#settings").close(); };
  $("#tracks-count").addEventListener("input", tracksCpuHint);
  $("#btn-gh").onclick = openGitHubSave;
  $("#btn-samples").onclick = () => openSamples();
  $("#btn-tour").onclick = runTour;
  $("#btn-courses").onclick = openCourses;
  $("#btn-skills").onclick = () => openSkills();
  $("#chat").addEventListener("click", (e) => { const b = e.target.closest("[data-skill],[data-plugin]"); if (b) openSkills(b.dataset.skill || b.dataset.plugin); });
  // Instrumento grande que Maestro quiere usar: se abre en la biblioteca para descargarlo
  $("#chat").addEventListener("click", (e) => { const b = e.target.closest("[data-instlib]"); if (b) openInstLib({ id: b.dataset.instlib }); });
  wireSkills();
  refreshSkillCount();
  wireInstrument();
  wireSamples();
  wireInstLib();
  wireMidi();
  wireLoops();
  wireLibrary();
  wireControls();
  wireArrange();
  initTimeline({
    api, state: () => state, audible: (t) => audible(t, state),
    icon: (k, n) => icon(k, n), kindColor: (k) => KIND_COLOR[k] || "var(--ink-3)",
    canQuery: () => !!(server.engine && server.engine.ghci_path),
    noTidal: () => {},
    // «Ir a este trozo»: abre Pistas y selecciona ese trozo en el código de la pista
    goToCode: (id, a, b) => {
      document.querySelector('.tab[data-tab="tracks"]')?.click();
      const ta = document.querySelector(`#tracks .track[data-id="${id}"] textarea`);
      if (!ta) return;
      ta.scrollIntoView({ block: "center", behavior: "smooth" });
      ta.focus(); ta.setSelectionRange(a, b);
    },
  });
  wireBlocks();
  wireMixer();
  initHistory(state); renderHistoryButtons();
  $("#btn-undo").onclick = doUndo;
  $("#btn-redo").onclick = doRedo;
  $("#btn-history").onclick = openHistory;
  $("#hist-list").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; $("#history").close(); restoreSong(histGo(+b.dataset.i), L("Has vuelto a esa versión. Puedes rehacer para volver.", "You went back to that version. Redo takes you forward again.")); };
  $("#btn-clear-chat").onclick = clearChat;
  try { if (localStorage.getItem(IDEAS_KEY) === "1") setIdeasHidden(true); } catch { /* nada */ }
  $("#btn-hide-ideas").onclick = () => setIdeasHidden(!$("#ideas").classList.contains("collapsed"));
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
  $("#btn-gh-import").onclick = async () => { await saveSettings(); openGitHubImport(); };
  $("#gh-create-new").onchange = async () => {
    await saveSettings();
    const m = $("#gh-msg");
    if ($("#gh-create-new").checked && !server.github) m.textContent = L("Falta configurar GitHub: sin eso las canciones se quedan en este ordenador.", "GitHub isn't set up yet: until then songs stay on this computer.");
    else m.textContent = $("#gh-create-new").checked ? L("Las canciones nuevas se crearán en GitHub en cuanto tengan alguna pista.", "New songs will be created on GitHub as soon as they have a track.") : "";
  };
  $("#btn-gh-create").onclick = async () => {
    const m = $("#gh-msg"); m.textContent = L("Creando…", "Creating…");
    try { const r = await api("/api/github/create-repo", {}); m.textContent = L(`Creado: ${r.full_name} (privado)`, `Created: ${r.full_name} (private)`); $("#btn-gh-create").hidden = true; }
    catch (e) { m.textContent = "Error: " + e.message; }
  };
  $("#btn-test").onclick = async () => {
    $("#test-msg").textContent = L("Probando…", "Testing…");
    try { await saveSettings(); const r = await api("/api/llm/test", {}); $("#test-msg").textContent = L("Conectado: ", "Connected: ") + r.reply; }
    catch (e) { $("#test-msg").textContent = "Error: " + e.message + " · " + L("Pulsa «Diagnóstico» para ver por qué.", "Press «Diagnostics» to see why."); }
  };
  $("#btn-diag").onclick = runDiagnostics;
  $("#cc-mode").onchange = () => { toggleCcMode(); renderDetect(); };
  $("#btn-cc-detect").onclick = async () => { await saveSettings(); loadDetect(true); };
  $("#btn-diag-models").onclick = runModelTest;
  $("#btn-diag-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(lastDiag, null, 2)); $("#diag-msg").textContent = L("Copiado", "Copied"); }
    catch { $("#diag-msg").textContent = L("No se pudo copiar", "Couldn't copy"); }
  };

  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(refreshLog, 1500);
}

init();
