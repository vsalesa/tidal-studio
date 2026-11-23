// Biblioteca de instrumentos (al estilo de GarageBand): cientos de instrumentos concretos por categorías,
// con buscador, foto, escucha previa con las grabaciones de verdad, descarga cuando lo pides,
// tus propios instrumentos (SoundFont, SFZ, carpetas de notas) y los motores de synth (Mi-UGens, Surge XT, Vital).
// El servidor es server/instlib.py (+ instcatalog.py y engines.py).
import { L, LANG } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const NOTE_NAMES = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
const noteName = (m) => NOTE_NAMES[m % 12] + Math.floor(m / 12);   // Tidal: c5 = MIDI 60
const IMG = "img/instruments/";

let ctx = null;   // lo que presta app.js: api, addTrack, evalCode, isSim, beep, toast, say, state
const S = { data: null, credits: {}, cat: "pianos", q: "", only: "all", src: "", sel: null, oct: 4, seq: [], jobs: {}, view: "lib", sf2: null, ready: false };
const buffers = new Map();
let actx = null;

export function initInstLib(c) { ctx = c; }
export const instLibData = () => S.data;

async function load(force) {
  if (S.data && !force) return S.data;
  S.data = await ctx.api("/api/instruments");
  if (!Object.keys(S.credits).length) {
    try { S.credits = await (await fetch(IMG + "credits.json")).json(); } catch { S.credits = {}; }
  }
  return S.data;
}

export async function openInstLib(opts = {}) {
  const dlg = document.getElementById("instlib");
  if (opts.view) S.view = opts.view;
  if (opts.q !== undefined) { S.q = opts.q; S.cat = ""; }
  if (opts.cat) { S.cat = opts.cat; S.q = ""; }
  if (!dlg.open) dlg.showModal();
  render(true);
  try { await load(opts.force); } catch (e) { ctx.toast(e.message); }
  if (opts.id) select(opts.id);
  render();
}

// ------------------------------------------------------------------ datos
const nameOf = (it) => L(it.es, it.en);
const catOf = (id) => (S.data.categories.find((c) => c.id === id) || {});
const srcOf = (it) => S.data.sources[it.src] || {};
function photoKey(it) {
  const key = it.photo || catOf(it.cat).photo || "synthesizer";
  return S.credits[key] ? key : catOf(it.cat).photo && S.credits[catOf(it.cat).photo] ? catOf(it.cat).photo : "piano";
}
// La foto que hayas elegido en Wikimedia manda sobre la de la categoría
const ownPhoto = (it) => (S.data.photos || {})[it.id];
function photoSrc(it) {
  const own = ownPhoto(it);
  return own ? `/api/instruments/photo?id=${encodeURIComponent(it.id)}&v=${own.v || 0}` : `${IMG}${photoKey(it)}.jpg`;
}
function photoCredit(it) {
  const own = ownPhoto(it), cr = own || S.credits[photoKey(it)] || {};
  if (!cr.author) return "";
  const page = own ? own.page : `https://commons.wikimedia.org/wiki/${encodeURI(cr.title || "")}`;
  return `<div class="inst-credit">${L("Foto", "Photo")}: <a href="${esc(page)}" target="_blank" rel="noopener">${esc(cr.author)}</a> · ${esc(cr.license)} · ${L("vía Wikimedia Commons", "via Wikimedia Commons")}</div>`;
}

// ------------------------------------------------------------------ fijar como componente (tarjeta en la fila de instrumentos)
const PIN_KEY = "tidal-studio-inst-pins";
export function pinnedInstruments() {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); } catch { return []; }
}
function savePins(list) { try { localStorage.setItem(PIN_KEY, JSON.stringify(list)); } catch {} if (ctx.onPinsChanged) ctx.onPinsChanged(); }
const isPinned = (id) => pinnedInstruments().some((p) => p.id === id);
function togglePin(it) {
  const list = pinnedInstruments().filter((p) => p.id !== it.id);
  if (!isPinned(it.id)) list.push({ id: it.id, es: it.es, en: it.en, photo: photoSrc(it), cat: it.cat });
  savePins(list.slice(-12));
}
function refreshPin(it) {   // al cambiar la foto, la tarjeta fijada también cambia
  const list = pinnedInstruments();
  const p = list.find((x) => x.id === it.id);
  if (p) { p.photo = photoSrc(it); savePins(list); }
}
const kindTrack = (it) => ({ basses: "bajo", synth_bass: "bajo", percussion: "percusion", fx: "textura", synth_fx: "textura",
  pianos: "armonia", keys: "armonia", organs: "armonia", synth_pad: "armonia", voices: "armonia", strings: "armonia" })[it.cat] || "melodia";
const isPitched = (it) => it.kind !== "kit";
// Variantes del mismo instrumento (juegos de sonidos o articulaciones): una tarjeta por grupo
function groups(items) {
  const m = new Map();
  for (const it of items) {
    const g = it.group || it.id;
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(it);
  }
  return [...m.values()];
}
function groupName(list) {
  const n = nameOf(list[0]);
  return list.length > 1 ? n.split(/: | \(/)[0] : n;
}
function matches(it, q) {
  if (!q) return true;
  const syn = S.data.synonyms || {};
  const hay = `${it.id} ${it.es} ${it.en} ${it.tags || ""} ${srcOf(it).name || ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || (syn[w] || "").split(" ").some((x) => x && hay.includes(x)));
}
function visible() {
  let items = S.data.items;
  if (S.q) items = items.filter((it) => matches(it, S.q));
  else if (S.cat) items = items.filter((it) => it.cat === S.cat);
  if (S.only === "installed") items = items.filter((it) => it.installed && it.kind !== "synth");
  if (S.only === "ready") items = items.filter((it) => it.installed);
  if (S.src) items = items.filter((it) => it.src === S.src);
  return items;
}

// ------------------------------------------------------------------ código
function trackCode(it, seq) {
  const s = it.sound || it.id, extra = it.extra || "";
  const notes = (seq && seq.some((m) => m != null)) ? seq.map((m) => (m == null ? "~" : noteName(m))).join(" ") : null;
  if (it.kind === "kit") return `n "${notes ? seq.map((m, i) => (m == null ? "~" : i % 8)).join(" ") : "0 ~ 1 2 0 ~ 3 ~"}" # s "${s}"${extra}`;
  if (notes) return `n "${notes}" # s "${s}"${extra}${it.cat === "synth_pad" || it.cat === "strings" ? " # legato 1" : ""}`;
  switch (kindTrack(it)) {
    case "bajo": return `n "c3 ~ c3 g2 ~ c3 ~ <as2 f2>" # s "${s}"${extra}`;
    case "armonia": return `n "<c'maj e'min f'maj g'maj>" # s "${s}"${extra} # legato 1`;
    case "percusion": return `n "c4 ~ g3 ~ c4 c4 ~ g3" # s "${s}"${extra}`;
    case "textura": return `n "~ ~ c5 ~" # s "${s}"${extra} # room 0.3`;
    default: return `n "c5 e5 g5 e5 a5 g5 e5 d5" # s "${s}"${extra}`;
  }
}

// ------------------------------------------------------------------ escuchar
function ac() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); return actx; }
async function sampleFor(it, midi) {
  const key = `${it.id}:${it.installed ? "i" : "r"}:${it.kind === "kit" ? midi : Math.round(midi / 2)}`;
  if (buffers.has(key)) return buffers.get(key);
  const p = (async () => {
    const r = await fetch(`/api/instruments/sample?id=${encodeURIComponent(it.id)}&midi=${midi}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    const root = r.headers.get("X-Root-Midi");
    const buf = await ac().decodeAudioData(await r.arrayBuffer());
    return { buf, root: root === "" || root == null ? null : +root };
  })();
  buffers.set(key, p);
  p.catch(() => buffers.delete(key));
  return p;
}
async function hear(it, midi, when = 0, dur = 1.6) {
  if (it.kind === "synth" || it.kind === "engine") {
    const s = it.sound || it.id;
    if (!ctx.isSim() && it.installed) return ctx.evalCode(`once $ n "${noteName(midi)}" # s "${s}"${it.extra || ""}`);
    return setTimeout(() => ctx.beep(midi, it.voice || "triangle"), when * 1000);
  }
  try {
    const { buf, root } = await sampleFor(it, it.kind === "kit" ? (midi - 60 + 600) % 24 + 60 : midi);
    const a = ac(), src = a.createBufferSource(), g = a.createGain(), t = a.currentTime + 0.02 + when;
    src.buffer = buf;
    if (root != null && it.kind !== "kit") src.playbackRate.value = Math.pow(2, (midi - root) / 12);
    g.gain.setValueAtTime(0.9, t); g.gain.setTargetAtTime(0, t + dur, 0.15);
    src.connect(g).connect(a.destination); src.start(t); src.stop(t + dur + 1);
  } catch (e) { ctx.toast(L(`No puedo escucharlo: ${e.message}`, `Can't play it: ${e.message}`)); }
}
function hearPhrase(it) {
  if (S.seq.some((m) => m != null)) {
    const step = 60 / (ctx.state.bpm || 120) / 2;
    S.seq.forEach((m, i) => m != null && hear(it, m, i * step, step * 1.6));
    return;
  }
  const base = it.kind === "kit" ? [60, 61, 62, 63, 60, 62] : kindTrack(it) === "bajo" ? [36, 43, 48, 43] : [60, 64, 67, 72];
  base.forEach((m, i) => hear(it, m, i * 0.42, 0.9));
  if (kindTrack(it) === "armonia" && it.kind !== "kit") [60, 64, 67].forEach((m) => hear(it, m, base.length * 0.42 + 0.1, 1.8));
}

// ------------------------------------------------------------------ pintar
function select(id) {
  const it = S.data && S.data.items.find((x) => x.id === id);
  if (!it) return;
  S.sel = id;
  S.view = "lib";
  if (!S.q) S.cat = it.cat;
  S.oct = it.kind === "kit" ? 5 : kindTrack(it) === "bajo" ? 3 : 4;
}

function render(loading) {
  const box = document.getElementById("il-body");
  if (loading && !S.data) { box.innerHTML = `<div class="il-loading">${L("Cargando la biblioteca…", "Loading the library…")}</div>`; return; }
  if (!S.data) return;
  const total = S.data.items.length, inst = S.data.items.filter((i) => i.installed && (i.kind === "multi" || i.kind === "kit")).length;
  const cats = S.data.categories.filter((c) => c.n || c.id === "mine").map((c) => `<button class="il-cat${S.view === "lib" && !S.q && S.cat === c.id ? " on" : ""}" data-cat="${c.id}">
      <img src="${IMG}${S.credits[c.photo] ? c.photo : "piano"}.jpg" alt="" loading="lazy"><span>${esc(L(c.es, c.en))}</span><b>${c.n}</b></button>`).join("");
  const side = `<nav class="il-side">${cats}
    <div class="il-side-sep"></div>
    <button class="il-cat il-special${S.view === "import" ? " on" : ""}" data-view="import">${icon("upload", 16)}<span>${L("Añadir tus instrumentos", "Add your own instruments")}</span></button>
    <button class="il-cat il-special${S.view === "engines" ? " on" : ""}" data-view="engines">${icon("plugin", 16)}<span>${L("Motores de synth", "Synth engines")}</span></button></nav>`;
  const srcOpts = Object.entries(S.data.sources).filter(([k]) => S.data.items.some((i) => i.src === k))
    .map(([k, v]) => `<option value="${k}" ${S.src === k ? "selected" : ""}>${esc(v.short || v.name)}</option>`).join("");
  const top = `<div class="il-top">
    <label class="il-search">${icon("search", 15)}<input type="search" id="il-q" value="${esc(S.q)}" placeholder="${L("Busca: clavecín, contrabajo, sitar, Steinway, pad…", "Search: harpsichord, double bass, sitar, Steinway, pad…")}"></label>
    <div class="il-filters">
      <button data-only="all" class="${S.only === "all" ? "on" : ""}">${L("Todos", "All")} <b>${total}</b></button>
      <button data-only="installed" class="${S.only === "installed" ? "on" : ""}">${L("Descargados", "Downloaded")} <b>${inst}</b></button>
      <button data-only="ready" class="${S.only === "ready" ? "on" : ""}">${L("Listos para tocar", "Ready to play")}</button>
      <select id="il-src"><option value="">${L("Todas las fuentes", "All sources")}</option>${srcOpts}</select>
    </div></div>`;
  let main;
  if (S.view === "import") main = importView();
  else if (S.view === "engines") main = enginesView();
  else main = gridView();
  const sel = S.view === "lib" && S.sel ? S.data.items.find((x) => x.id === S.sel) : null;
  box.innerHTML = `${top}<div class="il-wrap${sel ? " has-detail" : ""}">${side}<section class="il-main">${main}</section>${sel ? detailView(sel) : ""}</div>`;
  const q = box.querySelector("#il-q");
  if (S._focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); S._focus = false; }
}

function gridView() {
  const items = visible();
  const title = S.q ? L(`Resultados para «${esc(S.q)}»`, `Results for «${esc(S.q)}»`) : esc(L(catOf(S.cat).es || "", catOf(S.cat).en || ""));
  if (!items.length) {
    const hint = S.cat === "mine" && !S.q ? L("Aún no has añadido instrumentos. Pulsa «Añadir tus instrumentos» para traer un SoundFont, un SFZ o tus grabaciones.", "You haven't added any instruments yet. Press «Add your own instruments» to bring a SoundFont, an SFZ or your own recordings.")
      : L("No hay nada con esos filtros.", "Nothing matches those filters.");
    return `<h3 class="il-h">${title}</h3><p class="il-empty">${hint}</p>`;
  }
  const cards = groups(items).map((list) => {
    const it = list.find((x) => x.id === S.sel) || list.find((x) => x.installed) || list[0];
    const anyInst = list.some((x) => x.installed && x.kind !== "synth");
    const vers = list.length > 1 ? `<span class="il-vers">${list.length} ${it.src && ["fluid", "musyng", "fatboy"].includes(it.src) ? L("juegos de sonidos", "sound sets") : L("variantes", "variants")}</span>` : "";
    const badge = it.kind === "synth" ? `<span class="il-badge syn">${L("synth", "synth")}</span>`
      : it.kind === "engine" ? `<span class="il-badge eng${it.installed ? " ok" : ""}">${esc(srcOf(it).short || "plugin")}</span>`
      : anyInst ? `<span class="il-badge ok">${icon("check", 11)}</span>` : `<span class="il-badge mb">${it.mb ? `${it.mb} MB` : ""}</span>`;
    return `<button class="il-card${list.some((x) => x.id === S.sel) ? " on" : ""}" data-id="${esc(it.id)}">
      <span class="il-photo"><img src="${photoSrc(it)}" alt="" loading="lazy"></span>${isPinned(it.id) ? `<span class="il-pin" title="${L("Fijado en la fila de instrumentos", "Pinned to the instrument row")}">★</span>` : ""}
      <span class="il-name">${esc(groupName(list))}</span>${vers}${badge}</button>`;
  }).join("");
  return `<h3 class="il-h">${title}<span>${items.length} ${L("sonidos", "sounds")}</span></h3><div class="il-grid">${cards}</div>`;
}

function keyboard(oct) {
  const whites = [0, 2, 4, 5, 7, 9, 11], blacks = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  let w = "", b = "";
  for (let o = 0; o < 2; o++) {
    whites.forEach((s, i) => {
      const m = (oct + 1) * 12 + o * 12 + s;
      w += `<button class="key w" data-m="${m}" style="left:${(o * 7 + i) * (100 / 14)}%">${s === 0 ? `<span>${noteName(m).toUpperCase()}</span>` : ""}</button>`;
    });
    for (const [s, i] of Object.entries(blacks)) {
      const m = (oct + 1) * 12 + o * 12 + +s;
      b += `<button class="key b" data-m="${m}" style="left:calc(${(o * 7 + i + 1) * (100 / 14)}% - 2.6%)"></button>`;
    }
  }
  return `<div class="keyboard il-kb">${w}${b}</div>`;
}

function detailView(it) {
  const list = S.data.items.filter((x) => (x.group || x.id) === (it.group || it.id));
  const src = srcOf(it);
  const vers = list.length > 1 ? `<div class="il-lbl">${["fluid", "musyng", "fatboy"].includes(it.src) ? L("Juego de sonidos", "Sound set") : L("Variante", "Variant")}</div>
    <div class="il-verlist">${list.map((x) => `<button data-ver="${esc(x.id)}" class="${x.id === it.id ? "on" : ""}">${esc(["fluid", "musyng", "fatboy"].includes(x.src) ? (srcOf(x).short) : (nameOf(x).split(": ")[1] || nameOf(x)))}${x.installed && x.kind !== "synth" ? ` ${icon("check", 11)}` : ""}</button>`).join("")}</div>` : "";
  const job = S.jobs[it.id];
  let action;
  if (it.kind === "synth") action = `<div class="il-ready">${icon("check", 14)} ${L("Sintetizador: no hay que descargar nada", "Synth: nothing to download")}</div>`;
  else if (it.kind === "engine") {
    const eng = S.data.engines[it.engine === "surge" || it.engine === "vital" ? it.engine : it.engine] || {};
    const vst = it.engine === "surge" || it.engine === "vital";
    action = !eng.installed ? `<div class="il-need">${L(`Necesita el motor ${esc(src.name)}.`, `Needs the ${esc(src.name)} engine.`)} <button data-view="engines">${icon("plugin", 13)} ${L("Instalar motores", "Install engines")}</button></div>`
      : vst && !it.installed ? `<button class="primary" data-a="install">${icon("plus", 14)} ${L("Activar este sonido", "Turn this sound on")}</button>`
      : `<div class="il-ready">${icon("check", 14)} ${L("Listo", "Ready")}${vst ? ` <button data-a="remove" class="link">${L("Desactivar", "Turn off")}</button>` : ""}${it.id === "vital" ? ` <button data-a="editor">${L("Abrir su ventana", "Open its window")}</button>` : ""}</div>`;
  } else if (job && job.state === "running") action = `<div class="il-prog"><span style="width:${job.total ? Math.round(job.done / job.total * 100) : 5}%"></span><em>${L("Descargando", "Downloading")} ${job.done}/${job.total || "…"}</em></div>`;
  else if (it.installed) action = `<div class="il-ready">${icon("check", 14)} ${L("Descargado", "Downloaded")} <button data-a="remove" class="link">${icon("trash", 12)} ${L("Quitar", "Remove")}</button></div>`;
  else action = `<button class="primary" data-a="install">${icon("download", 14)} ${L("Descargar", "Download")}${it.mb ? ` · ${it.mb} MB` : ""}</button>`;
  const code = trackCode(it, S.seq);
  const lic = src.license ? `<a href="${esc(src.home)}" target="_blank" rel="noopener">${esc(src.name)}</a> · ${esc(src.license)}` : esc(src.name || "");
  const credit = photoCredit(it);
  const ph = S.photoPick && S.photoPick.id === it.id ? S.photoPick : null;
  const picker = ph ? `<div class="il-wm">
      <div class="il-wm-row"><input id="il-wm-q" value="${esc(ph.q)}" placeholder="${L("Busca en inglés: harpsichord, sitar…", "Search: harpsichord, sitar…")}"><button data-a="wm-search">${icon("search", 13)}</button><button data-a="wm-close" title="${L("Cerrar", "Close")}">${icon("close", 13)}</button></div>
      ${ph.loading ? `<em>${L("Buscando en Wikimedia Commons…", "Searching Wikimedia Commons…")}</em>` : ph.error ? `<em class="il-err">${esc(ph.error)}</em>`
        : ph.results ? (ph.results.length ? `<div class="il-wm-grid">${ph.results.map((r, i) => `<button data-wm="${i}" title="${esc(r.title)} · ${esc(r.author)} · ${esc(r.license)}"><img src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(r.license)}</span></button>`).join("")}</div>
          <p class="il-note">${L("Solo salen fotos con licencia libre. Al elegir una se guarda con su autor y licencia.", "Only freely licensed photos are shown. The one you pick is saved with its author and license.")}</p>` : `<em>${L("Nada con licencia libre. Prueba otras palabras (mejor en inglés).", "Nothing freely licensed. Try other words.")}</em>`) : ""}
    </div>` : "";
  const pitched = isPitched(it);
  return `<aside class="il-detail">
    <div class="il-dphoto"><img src="${photoSrc(it)}" alt="">
      <div class="il-dphoto-btns"><button data-a="wm-open" title="${L("Buscar otra foto en Wikimedia Commons", "Find another photo on Wikimedia Commons")}">${icon("search", 13)} ${L("Foto de Wikimedia", "Wikimedia photo")}</button>${ownPhoto(it) ? `<button data-a="wm-reset" title="${L("Volver a la foto de la categoría", "Back to the category photo")}">${icon("undo", 13)}</button>` : ""}</div></div>${credit}${picker}
    <h3>${esc(nameOf(it))}</h3>
    <p class="il-src">${lic}${src.es ? ` · ${esc(L(src.es, src.en))}` : ""}</p>
    ${vers}
    <div class="il-act">${action}</div>
    <div class="il-lbl">${pitched ? L("Pulsa teclas para escucharlo y escribir tu melodía", "Press keys to hear it and write your melody") : L("Cada tecla es un golpe distinto", "Each key is a different hit")}
      <span class="inst-oct"><button data-a="oct" data-d="-1">−</button>${L("octava", "octave")} ${S.oct + 1}<button data-a="oct" data-d="1">+</button></span></div>
    ${keyboard(S.oct)}
    <div class="inst-seq">${S.seq.length ? S.seq.map((m) => `<span class="${m == null ? "rest" : ""}">${m == null ? "~" : noteName(m)}</span>`).join("") : `<em>${L("Sin notas: se usará un patrón de ejemplo", "No notes: an example pattern will be used")}</em>`}</div>
    <div class="inst-seqbtns"><button data-a="rest">~ ${L("silencio", "rest")}</button><button data-a="pop">${icon("back", 13)} ${L("borrar última", "delete last")}</button><button data-a="clear">${icon("trash", 13)} ${L("vaciar", "clear")}</button></div>
    <div class="inst-code"><span>${L("Código Tidal", "Tidal code")}</span><code>${esc(code)}</code></div>
    <div class="il-btns"><button data-a="listen">${icon("play", 13)} ${L("Escuchar", "Listen")}</button>
      <button data-a="pin" class="${isPinned(it.id) ? "on" : ""}" title="${L("Fijarlo como componente en la fila de instrumentos del estudio", "Pin it as a component in the studio's instrument row")}">★ ${isPinned(it.id) ? L("Fijado", "Pinned") : L("Fijar", "Pin")}</button>
      <button class="primary" data-a="add">${icon("plus", 14)} ${L("Añadir como pista", "Add as a track")}</button></div>
  </aside>`;
}

function importView() {
  const sf = S.sf2;
  const presets = sf ? `<div class="il-sf2"><h4>${esc(sf.file)} · ${sf.presets.length} ${L("sonidos", "sounds")}</h4>
      <div class="il-sf2-tools"><button data-a="sf2-all">${L("Marcar todos", "Select all")}</button><button data-a="sf2-none">${L("Ninguno", "None")}</button></div>
      <div class="il-sf2-list">${sf.presets.map((p) => `<label><input type="checkbox" data-pk="${esc(p.key)}" ${sf.pick.has(p.key) ? "checked" : ""}> <code>${p.bank}:${p.preset}</code> ${esc(p.name)}${p.drums ? ` <em>${L("batería", "drum kit")}</em>` : ""}</label>`).join("")}</div>
      <button class="primary" data-a="sf2-import">${icon("download", 14)} ${L(`Importar ${sf.pick.size}`, `Import ${sf.pick.size}`)}</button>
      ${sf.job ? `<div class="il-prog"><span style="width:${sf.job.total ? Math.round(sf.job.done / sf.job.total * 100) : 5}%"></span><em>${sf.job.done}/${sf.job.total || "…"}</em></div>` : ""}</div>` : "";
  return `<h3 class="il-h">${L("Añadir tus instrumentos", "Add your own instruments")}</h3>
    <p class="il-intro">${L("Trae cualquier instrumento que tengas y se tocará con notas igual que los de la biblioteca. Aparecerán en «Mis instrumentos».", "Bring any instrument you have and it will play with notes just like the library ones. They show up in «My instruments».")}</p>
    <ul class="il-how">
      <li><b>SoundFont (.sf2)</b> ${L("— eliges qué sonidos importar. Las notas sostenidas se desenrollan para que duren.", "— you pick which sounds to import. Looped notes are unrolled so they last.")}</li>
      <li><b>SFZ</b> ${L("— comprime la carpeta (el .sfz con sus grabaciones) en un .zip.", "— zip the folder (the .sfz with its recordings).")}</li>
      <li><b>${L("Grabaciones por nota", "Recordings per note")}</b> ${L("— archivos con la nota en el nombre (Violin_C4.wav, flauta-A#3.wav, 060.wav) sueltos o en un .zip.", "— files with the note in their name (Violin_C4.wav, flute-A#3.wav, 060.wav), loose or in a .zip.")}</li>
      <li><b>${L("Un solo sonido", "A single sound")}</b> ${L("— se afina desde la nota que elijas (do central si no dices nada).", "— it is tuned from the note you choose (middle C if you don't say).")}</li>
    </ul>
    <div class="il-drop" id="il-drop">${icon("upload", 22)}<b>${L("Arrastra aquí tus archivos", "Drop your files here")}</b>
      <span>.sf2 · .zip · .wav · .aif · .flac · .ogg · .mp3</span>
      <div class="il-drop-row"><label>${L("Nombre", "Name")} <input id="il-imp-name" placeholder="${L("mi_violin", "my_violin")}"></label>
        <label>${L("Nota del sonido suelto", "Note of a single sound")} <select id="il-imp-root">${[48, 55, 57, 60, 62, 64, 65, 67, 69, 72].map((m) => `<option value="${m}" ${m === 60 ? "selected" : ""}>${noteName(m)} (MIDI ${m})</option>`).join("")}</select></label>
        <button data-a="pick">${icon("folder", 14)} ${L("Elegir archivos", "Choose files")}</button></div>
      <input type="file" id="il-file" multiple hidden accept=".sf2,.zip,.wav,.aif,.aiff,.flac,.ogg,.mp3"></div>
    ${presets}`;
}

function enginesView() {
  const E = S.data.engines || {};
  const rows = ["sc3plugins", "mi", "vstplugin", "surge", "vital"].map((k) => {
    const e = E[k] || {}, job = S.jobs["engine:" + k];
    const st = e.installed ? `<span class="il-badge ok">${icon("check", 11)} ${L("instalado", "installed")}</span>${e.loaded ? "" : (e.kind === "extension" ? ` <em>${L("reinicia el motor de audio para usarlo", "restart the audio engine to use it")}</em>` : "")}`
      : e.needs && !(E[e.needs] || {}).installed ? `<em>${L("Primero instala VSTPlugin", "Install VSTPlugin first")}</em>` : "";
    const btn = e.installed ? "" : job && job.state === "running" ? `<em>${L("Descargando…", "Downloading…")}</em>`
      : `<button class="primary" data-eng="${k}">${icon("download", 14)} ${k === "vital" ? L("Abrir su web", "Open its website") : e.kind === "vst" ? L("Bajar el instalador", "Get the installer") : L("Instalar", "Install")}</button>`;
    const extra = k === "surge" && e.installed ? `<p class="il-note">${L(`${e.patches} sonidos de fábrica en la biblioteca (busca «surge»).`, `${e.patches} factory sounds in the library (search «surge»).`)}</p>` : "";
    return `<div class="il-eng"><div><b>${esc(L(e.es, e.en))}</b> ${st}<p>${esc(L(...(e.tip || ["", ""])))}</p>${extra}
      ${job && job.state === "error" ? `<p class="il-err">${esc(job.error)}</p>` : ""}${job && job.state === "done" && job.result && job.result.message === "installer" ? `<p class="il-note">${L("Se ha abierto el instalador: termínalo y vuelve aquí.", "The installer is open: finish it and come back here.")}</p>` : ""}</div>${btn}</div>`;
  }).join("");
  return `<h3 class="il-h">${L("Motores de synth", "Synth engines")}</h3>
    <p class="il-intro">${L("Plugins gratuitos que añaden sintetizadores profesionales. Se instalan en la carpeta de extensiones de SuperCollider", "Free plugins that add professional synths. They install into SuperCollider's extensions folder")} (<code>${esc(E._ext_dir || "")}</code>).</p>
    ${rows}
    <div class="il-eng-foot"><button data-a="restart">${icon("power", 14)} ${L("Reiniciar el motor de audio", "Restart the audio engine")}</button> <button data-a="refresh">${icon("undo", 14)} ${L("Volver a comprobar", "Check again")}</button></div>`;
}

// ------------------------------------------------------------------ acciones
async function photoSearch() {
  const ph = S.photoPick;
  ph.loading = true; ph.error = null; render();
  try { ph.results = (await ctx.api("/api/instruments/photos", { q: ph.q })).photos; } catch (e) { ph.error = e.message; }
  ph.loading = false; render();
}
async function pollJob(key, job, onDone) {
  S.jobs[key] = job;
  while (job.state === "running") {
    await new Promise((r) => setTimeout(r, 500));
    try { job = await ctx.api(`/api/instruments/job?id=${job.id}`); } catch { break; }
    S.jobs[key] = job;
    render();
  }
  if (job.state === "error") ctx.toast(job.error);
  if (onDone) await onDone(job);
  render();
}

async function install(it) {
  try {
    const r = await ctx.api("/api/instruments/install", { id: it.id });
    if (r.id && r.state) {
      await pollJob(it.id, r, async (job) => {
        if (job.state === "done") {
          ctx.toast(L(`«${nameOf(it)}» descargado: ya puedes tocarlo con s "${it.id}".`, `«${nameOf(it)}» downloaded: play it with s "${it.id}".`));
          await load(true);
        }
      });
    } else { await load(true); render(); }
  } catch (e) { ctx.toast(e.message); }
}

async function uploadFiles(files) {
  const name = (document.getElementById("il-imp-name") || {}).value || "";
  const root = (document.getElementById("il-imp-root") || {}).value || "60";
  for (const f of files) {
    try {
      const r = await fetch(`/api/instruments/upload?filename=${encodeURIComponent(f.name)}&name=${encodeURIComponent(name)}&root=${root}&lang=${LANG}`, { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      if (d.kind === "sf2") { S.sf2 = { file: d.file, presets: d.presets, pick: new Set(d.presets.filter((p) => !p.drums).slice(0, 4).map((p) => p.key)) }; render(); continue; }
      ctx.toast(L(`«${d.id}» añadido (${d.notes} ${d.kind === "kit" ? "golpes" : "notas"}).`, `«${d.id}» added (${d.notes} ${d.kind === "kit" ? "hits" : "notes"}).`));
      await load(true);
      S.cat = "mine"; S.view = "lib"; select(d.id); render();
    } catch (e) { ctx.toast(`${f.name}: ${e.message}`); }
  }
}

function wire() {
  const box = document.getElementById("il-body");
  box.addEventListener("keydown", (e) => {
    if (e.target.id === "il-wm-q" && e.key === "Enter") { e.preventDefault(); S.photoPick.q = e.target.value; photoSearch(); }
  });
  box.addEventListener("input", (e) => {
    if (e.target.id === "il-q") { S.q = e.target.value; S.view = "lib"; S._focus = true; render(); }
  });
  box.addEventListener("change", (e) => {
    if (e.target.id === "il-src") { S.src = e.target.value; render(); }
    if (e.target.id === "il-file") uploadFiles([...e.target.files]);
    if (e.target.dataset.pk && S.sf2) { e.target.checked ? S.sf2.pick.add(e.target.dataset.pk) : S.sf2.pick.delete(e.target.dataset.pk); render(); }
  });
  box.addEventListener("dragover", (e) => { if (e.target.closest("#il-drop")) { e.preventDefault(); e.target.closest("#il-drop").classList.add("over"); } });
  box.addEventListener("dragleave", (e) => { const d = e.target.closest("#il-drop"); if (d) d.classList.remove("over"); });
  box.addEventListener("drop", (e) => {
    if (!e.target.closest("#il-drop")) return;
    e.preventDefault(); e.stopPropagation();
    uploadFiles([...e.dataTransfer.files]);
  });
  box.addEventListener("click", async (e) => {
    const t = e.target;
    const c = t.closest("[data-cat]");
    if (c) { S.cat = c.dataset.cat; S.q = ""; S.view = "lib"; S.sel = null; return render(); }
    const v = t.closest("[data-view]");
    if (v) { S.view = v.dataset.view; S.sel = null; return render(); }
    const o = t.closest("[data-only]");
    if (o) { S.only = o.dataset.only; return render(); }
    const card = t.closest(".il-card");
    if (card) {
      const changedGroup = !S.sel || (S.data.items.find((x) => x.id === S.sel) || {}).group !== (S.data.items.find((x) => x.id === card.dataset.id) || {}).group;
      select(card.dataset.id); if (changedGroup) S.seq = [];
      render();
      const it = S.data.items.find((x) => x.id === S.sel);
      if (it) hear(it, it.kind === "kit" ? 60 : (S.oct + 1) * 12 + 12, 0, 1.2);
      return;
    }
    const ver = t.closest("[data-ver]");
    if (ver) { S.sel = ver.dataset.ver; render(); const it = S.data.items.find((x) => x.id === S.sel); return hear(it, (S.oct + 1) * 12 + 12); }
    const wm = t.closest("[data-wm]");
    if (wm && S.photoPick) {
      const pick = S.photoPick.results[+wm.dataset.wm], it = S.data.items.find((x) => x.id === S.photoPick.id);
      S.photoPick.loading = true; render();
      try {
        await ctx.api("/api/instruments/photo", { id: it.id, pick });
        await load(true); S.photoPick = null; refreshPin(it);
        ctx.toast(L(`Foto guardada para «${nameOf(it)}» (${pick.license}, ${pick.author}).`, `Photo saved for «${nameOf(it)}» (${pick.license}, ${pick.author}).`));
      } catch (err) { S.photoPick.loading = false; S.photoPick.error = err.message; }
      return render();
    }
    const key = t.closest(".il-kb .key");
    if (key) {
      const it = S.data.items.find((x) => x.id === S.sel), m = +key.dataset.m;
      hear(it, m);
      if (S.seq.length < 16) S.seq.push(m);
      key.classList.add("on"); setTimeout(() => key.classList.remove("on"), 200);
      return render();
    }
    const eng = t.closest("[data-eng]");
    if (eng) {
      try {
        const job = await ctx.api("/api/engines/install", { id: eng.dataset.eng });
        await pollJob("engine:" + eng.dataset.eng, job, async (j) => {
          if (j.state === "done" && j.result && j.result.message === "restart") ctx.toast(L("Instalado. Reinicia el motor de audio para usarlo.", "Installed. Restart the audio engine to use it."));
          await load(true);
        });
      } catch (err) { ctx.toast(err.message); }
      return;
    }
    const b = t.closest("button[data-a]");
    if (!b) return;
    const it = S.data.items.find((x) => x.id === S.sel);
    const a = b.dataset.a;
    if (a === "oct") { S.oct = Math.max(0, Math.min(7, S.oct + +b.dataset.d)); return render(); }
    if (a === "rest") { if (S.seq.length < 16) S.seq.push(null); return render(); }
    if (a === "pop") { S.seq.pop(); return render(); }
    if (a === "clear") { S.seq = []; return render(); }
    if (a === "listen") return hearPhrase(it);
    if (a === "pin") { togglePin(it); ctx.toast(isPinned(it.id) ? L(`«${nameOf(it)}» fijado en la fila de instrumentos.`, `«${nameOf(it)}» pinned to the instrument row.`) : L(`«${nameOf(it)}» ya no está fijado.`, `«${nameOf(it)}» unpinned.`)); return render(); }
    if (a === "wm-open") { S.photoPick = { id: it.id, q: it.en.split(/[:(]/)[0].trim(), results: null }; render(); return photoSearch(); }
    if (a === "wm-close") { S.photoPick = null; return render(); }
    if (a === "wm-search") { S.photoPick.q = (document.getElementById("il-wm-q") || {}).value || S.photoPick.q; return photoSearch(); }
    if (a === "wm-reset") { try { await ctx.api("/api/instruments/photo-remove", { id: it.id }); await load(true); refreshPin(it); } catch (err) { ctx.toast(err.message); } return render(); }
    if (a === "install") return install(it);
    if (a === "editor") return ctx.api("/api/engines/editor", { name: it.sound || it.id }).catch((err) => ctx.toast(err.message));
    if (a === "remove") {
      try { await ctx.api("/api/instruments/remove", { id: it.id }); await load(true); render(); } catch (err) { ctx.toast(err.message); }
      return;
    }
    if (a === "add") {
      if ((it.kind === "multi" || it.kind === "kit") && !it.installed) {
        await install(it);
        const now = S.data.items.find((x) => x.id === it.id);
        if (!now || !now.installed) return;
      }
      const code = trackCode(it, S.seq);
      const tr = ctx.addTrack(nameOf(it), kindTrack(it), code);
      if (!tr) return;
      document.getElementById("instlib").close();
      ctx.say(L(`He añadido ${nameOf(it)} en la pista ${tr.id}. Se toca con s "${it.sound || it.id}"${isPitched(it) ? " y las notas con n (c5 es el do central)" : " y cada golpe con n 0, n 1…"}. Fuente: ${srcOf(it).name || ""}${srcOf(it).license ? ` (${srcOf(it).license})` : ""}.`,
        `I added ${nameOf(it)} on track ${tr.id}. It plays with s "${it.sound || it.id}"${isPitched(it) ? " and its notes with n (c5 is middle C)" : " and each hit with n 0, n 1…"}. Source: ${srcOf(it).name || ""}${srcOf(it).license ? ` (${srcOf(it).license})` : ""}.`), code);
      return;
    }
    if (a === "pick") return document.getElementById("il-file").click();
    if (a === "sf2-all") { S.sf2.presets.forEach((p) => S.sf2.pick.add(p.key)); return render(); }
    if (a === "sf2-none") { S.sf2.pick.clear(); return render(); }
    if (a === "sf2-import") {
      try {
        const job = await ctx.api("/api/instruments/sf2", { file: S.sf2.file, presets: [...S.sf2.pick] });
        S.sf2.job = job;
        await pollJob("sf2", job, async (j) => {
          S.sf2.job = null;
          if (j.state === "done") {
            const n = (j.result.imported || []).length;
            ctx.toast(L(`${n} instrumentos importados del SoundFont.`, `${n} instruments imported from the SoundFont.`));
            S.sf2 = null; await load(true); S.view = "lib"; S.cat = "mine";
          }
        });
      } catch (err) { ctx.toast(err.message); }
      return;
    }
    if (a === "restart") { try { await ctx.restartEngine(); ctx.toast(L("Reiniciando el motor de audio…", "Restarting the audio engine…")); } catch (err) { ctx.toast(err.message); } return; }
    if (a === "refresh") { await load(true); return render(); }
  });
}
let wired = false;
export function mountInstLib() { if (!wired) { wire(); wired = true; } }
