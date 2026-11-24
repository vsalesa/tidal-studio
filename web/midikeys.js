// «Mi teclado MIDI»: toca tu piano USB (o el teclado en pantalla, o las teclas del ordenador) y Tidal Studio
// lo hace sonar con el instrumento que elijas y lo traduce a pistas de Tidal (mano izquierda y derecha).
//
// De dónde llegan las notas (todas acaban en el servidor, ver server/midilive.py):
//  - SuperCollider escucha el piano (studio-midi.scd). Es lo normal, y lo único posible en la app de Mac.
//  - Si el motor de sonido no está arrancado y el navegador tiene Web MIDI (Chrome, Edge), lo escucha la web.
//  - El teclado en pantalla y las teclas A W S E D F T G Y H U J K (do a do).
// Grabar: con cuenta atrás y metrónomo, o pegado a tu canción si está sonando (empieza en su siguiente compás).
// «Convertir lo que acabo de tocar» no necesita haber pulsado Grabar: coge tu última frase.
import { L, LANG } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STORE = "tidal-studio-midi";
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LOW = 36, HIGH = 84; // C2..C6 en pantalla (4 octavas)
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
const SOUNDS = ["superpiano", "ts_rhodes", "superhammond", "ts_pad", "superfm", "supersaw", "supersquare", "superchip", "ts_acid"];
const KIND_ICON = { percusion: "percusion", bajo: "bajo", armonia: "armonia", melodia: "melodia", textura: "textura" };

let ctx = null;
let dock = null;
const st = {
  open: false, seq: -1, offset: 0, sc: false, devices: [], devicesKey: "", error: "", held: new Set(), clicks: [],
  rec: null, result: null, opts: { grid: "auto", split: "auto", bpm: null }, busy: false, previewing: false,
  web: null, webInputs: [], kbOct: 0, plugSeq: -1, outputs: [], outActive: "", outOpen: false, lastPreview: 0, pollTimer: null, ac: null, metroTimer: null, nextClick: 0,
};
const conf = Object.assign({ sound: "superpiano", device: "", chan: -1, play: true, length: 1.2, transpose: 0, volume: 1, countin: true, metro: true,
  out: "", outch: 0, prog: -1, clock: false },
  (() => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } })());
const saveConf = () => { try { localStorage.setItem(STORE, JSON.stringify(conf)); } catch { /* sin almacenamiento */ } };

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: LANG, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
const serverNow = () => Date.now() / 1000 + st.offset;
const noteLabel = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// ---------------------------------------------------------------- arranque

export function initMidi(c) {
  ctx = c;
  dock = document.querySelector("#mididock");
  sendSettings(["sound", "device", "chan", "play", "length", "transpose", "volume", "out", "outch", "prog", "clock"]);
  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKey);
  poll();
}
export function toggleMidi(force) {
  const open = force ?? !st.open;
  if (open) openDock(); else closeDock();
}
export const midiOpen = () => st.open;

function openDock() {
  st.open = true;
  document.querySelector("#btn-midi")?.classList.remove("midi-live");
  document.querySelector("#btn-midi")?.classList.add("on");
  render();
  if (!dock.open) dock.show();
  post("/api/midi/scan", {}).catch(() => {});
  maybeWebMidi();
  clearTimeout(st.pollTimer); poll();
}
function closeDock() {
  st.open = false;
  document.querySelector("#btn-midi")?.classList.remove("on");
  if (st.rec && !st.rec.stop) stopRecording();
  stopPreview();
  dock.close();
}

function sendSettings(keys) {
  const body = {};
  keys.forEach((k) => { body[k] = conf[k]; });
  return post("/api/midi/settings", body).catch(() => {});
}

// ---------------------------------------------------------------- notas en vivo

async function poll() {
  try {
    const r = await (await fetch(`/api/midi/state?since=${Math.max(0, st.seq)}`)).json();
    st.offset = r.now - Date.now() / 1000;
    const first = st.seq < 0;
    st.seq = r.seq;
    const scWas = st.sc;
    st.sc = !!r.sc;
    if (r.error !== st.error || JSON.stringify(r.devices) !== st.devicesKey) {
      st.error = r.error; st.devices = r.devices; st.devicesKey = JSON.stringify(r.devices);
      if (st.open) renderStatus();
    }
    if (scWas !== st.sc && st.open) { maybeWebMidi(); renderStatus(); }
    const outsKey = JSON.stringify([r.outputs || [], r.out_active || ""]);
    if (outsKey !== st.outsKey) { st.outsKey = outsKey; st.outputs = r.outputs || []; st.outActive = r.out_active || ""; if (st.open) renderOut(); }
    // Enchufar y desenchufar el teclado: lo avisamos (al quitarlo, el servidor ya ha soltado sus notas)
    const plugs = r.plugs || [];
    if (st.plugSeq >= 0) {
      for (const p of plugs.filter((x) => x.seq > st.plugSeq)) {
        ctx.toast(p.added ? L(`Teclado conectado: ${p.name}`, `Keyboard connected: ${p.name}`)
          : L(`Teclado desconectado: ${p.name}. He soltado las notas que se quedaron pisadas.`, `Keyboard disconnected: ${p.name}. I released any notes left held.`));
      }
    }
    st.plugSeq = plugs.length ? plugs[plugs.length - 1].seq : Math.max(0, st.plugSeq);
    if (!first) {
      for (const e of r.events) {
        if (e.type === "on") st.held.add(e.note);
        else if (e.type === "off") st.held.delete(e.note);
      }
      if (r.events.some((e) => e.type === "on")) {
        if (!st.open) document.querySelector("#btn-midi")?.classList.add("midi-live");
        // sin motor de sonido: una vista previa sencilla en el navegador para que no esté mudo
        if (!st.sc && conf.play) r.events.filter((e) => e.type === "on" && e.src !== "screen").forEach((e) => ctx.beep(e.note + conf.transpose));
      }
      if (st.open) paintKeys();
    }
    if (st.open && st.rec && !st.rec.stop) liveRecording();
  } catch { /* el servidor se está reiniciando */ }
  st.pollTimer = setTimeout(poll, st.open ? 70 : 1200);
}

function noteFromUI(type, note, vel = 96, src = "screen") {
  if (note < 0 || note > 127) return;
  if (type === "on") st.held.add(note); else st.held.delete(note);
  paintKeys();
  if (type === "on" && !st.sc && conf.play) ctx.beep(note + conf.transpose);
  post("/api/midi/note", { type, note, vel, src }).catch(() => {});
}

// Teclas del ordenador (solo con el panel abierto y sin estar escribiendo en un campo)
const down = new Set();
function onKey(e) {
  if (!st.open || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  if (e.type === "keydown" && (k === "z" || k === "x")) { conf.transpose += k === "z" ? -12 : 12; conf.transpose = Math.max(-36, Math.min(36, conf.transpose)); saveConf(); sendSettings(["transpose"]); renderSettings(); return; }
  if (!(k in KEYMAP)) return;
  e.preventDefault();
  const note = 60 + KEYMAP[k];
  if (e.type === "keydown") { if (down.has(k)) return; down.add(k); noteFromUI("on", note, 96, "keys"); }
  else { down.delete(k); noteFromUI("off", note, 0, "keys"); }
}

// Web MIDI del navegador: solo si SuperCollider no está escuchando (si no, cada nota llegaría dos veces)
async function maybeWebMidi() {
  if (st.sc) { if (st.web) { st.webInputs.forEach((i) => { i.onmidimessage = null; }); st.webInputs = []; } return; }
  if (!navigator.requestMIDIAccess) return;
  try {
    st.web = st.web || await navigator.requestMIDIAccess();
    const hook = () => {
      st.webInputs.forEach((i) => { i.onmidimessage = null; });
      st.webInputs = [...st.web.inputs.values()].filter((i) => !conf.device || conf.device === "web:" + i.name);
      st.webInputs.forEach((i) => {
        i.onmidimessage = (m) => {
          const [s, d1, d2] = m.data; const cmd = s & 0xf0, ch = s & 0x0f;
          if (conf.chan >= 0 && ch !== conf.chan) return;
          if (cmd === 0x90 && d2 > 0) post("/api/midi/note", { type: "on", note: d1, vel: d2, ch, src: "web:" + i.name }).catch(() => {});
          else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) post("/api/midi/note", { type: "off", note: d1, vel: 0, ch, src: "web:" + i.name }).catch(() => {});
          else if (cmd === 0xb0 && d1 === 64) post("/api/midi/note", { type: "pedal", note: 64, vel: d2, ch, src: "web:" + i.name }).catch(() => {});
        };
      });
      if (st.open) renderStatus();
    };
    st.web.onstatechange = hook;
    hook();
  } catch { /* el usuario no ha dado permiso */ }
}
const webNames = () => (st.web && !st.sc ? [...st.web.inputs.values()].map((i) => "web:" + i.name) : []);

// ---------------------------------------------------------------- metrónomo (WebAudio)

// El AudioContext del navegador: Safari (la app de Mac) lo deja «interrupted» o «suspended» cuando cambia la
// salida de sonido (enchufar un piano USB, unos auriculares…). Lo reanudamos y, si no vuelve, creamos otro.
function audio() {
  try {
    if (!st.ac || st.ac.state === "closed") {
      st.ac = new (window.AudioContext || window.webkitAudioContext)();
      st.ac.onstatechange = () => { if (st.ac && st.ac.state === "interrupted") st.ac.resume().catch(() => {}); };
    }
  } catch { st.ac = null; }
  if (st.ac && (st.ac.state === "suspended" || st.ac.state === "interrupted")) {
    const ac = st.ac;
    ac.resume().catch(() => {});
    setTimeout(() => { if (st.ac === ac && ac.state !== "running") { try { ac.close(); } catch { /* ya cerrado */ } st.ac = null; } }, 400);
  }
  return st.ac;
}
function click(at, accent) {
  const ac = audio(); if (!ac) return;
  const t = Math.max(ac.currentTime, at);
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.08);
}
// Programa los clics de los próximos 250 ms: el «uno» de cada compás suena más agudo
function metronome(first, beat, countBeats) {
  stopMetronome();
  let n = 0;
  const tick = () => {
    const ac = audio(); if (!ac) return;
    const horizon = serverNow() + 0.25;
    while (true) {
      const t = first + n * beat;
      if (t > horizon) break;
      const inCount = n < countBeats;
      if (inCount || conf.metro) click(ac.currentTime + (t - serverNow()), (n - countBeats) % 4 === 0 || (inCount && n % 4 === 0));
      n++;
      if (!inCount && !conf.metro) break;
    }
    if (st.rec && !st.rec.stop) st.metroTimer = setTimeout(tick, 100);
  };
  tick();
}
function stopMetronome() { clearTimeout(st.metroTimer); st.metroTimer = null; }

// ---------------------------------------------------------------- grabar y traducir

async function startRecording() {
  stopPreview();
  st.result = null; st.opts = { grid: "auto", split: st.opts.split, bpm: null };
  const bpm = ctx.bpm();
  try {
    const r = await post("/api/midi/record", { bpm, countin: conf.countin ? 4 : 0, sync: true, start_now: conf.metro });
    st.offset = r.now - Date.now() / 1000;
    st.rec = r;
    if (!r.synced && r.t0) metronome(r.t0 - (conf.countin ? 4 : 0) * 60 / r.bpm, 60 / r.bpm, conf.countin ? 4 : 0);
  } catch (e) { ctx.toast(e.message); }
  render();
}
async function stopRecording() {
  stopMetronome();
  try { await post("/api/midi/record", { action: "stop" }); } catch { /* nada */ }
  if (st.rec) st.rec.stop = serverNow();
  await translate();
}
async function captureLast() {
  stopPreview();
  try {
    const r = await post("/api/midi/record", { action: "capture", bpm: ctx.bpm(), sync: true });
    if (!r.ok) return ctx.toast(L("Todavía no has tocado nada. Toca una frase y vuelve a pulsar.", "You haven't played anything yet. Play a phrase and press again."));
    st.rec = r; st.opts = { grid: "auto", split: st.opts.split, bpm: null };
    await translate();
  } catch (e) { ctx.toast(e.message); }
}
async function translate() {
  st.busy = true;
  try {
    st.result = await post("/api/midi/translate", { grid: st.opts.grid, split: st.opts.split, bpm: st.opts.bpm || undefined, sound: conf.sound, name: L("Lo que he tocado", "What I played") });
    st.result.off = new Set();
  } catch (e) { ctx.toast(e.message); }
  st.busy = false;
  render();
}
// Mientras grabas, el código se va escribiendo solo
async function liveRecording() {
  renderRecStatus();
  if (st.busy || Date.now() - st.lastPreview < 700) return;
  st.lastPreview = Date.now(); st.busy = true;
  try {
    const r = await post("/api/midi/translate", { sound: conf.sound, split: st.opts.split });
    const box = dock.querySelector(".mk-live");
    if (box && st.rec && !st.rec.stop) box.innerHTML = r.empty ? `<span class="hint">${L("El código aparecerá aquí mientras tocas…", "The code will show up here as you play…")}</span>` : r.tracks.map((t) => `<div><b>${esc(t.nombre)}</b><code>${esc(t.codigo)}</code></div>`).join("");
  } catch { /* siguiente vuelta */ }
  st.busy = false;
}
const picked = () => (st.result?.tracks || []).filter((_, i) => !st.result.off.has(i));

function stopPreview() {
  if (st.previewing) { ctx.stopPreview(); st.previewing = false; }
}

// ---------------------------------------------------------------- pintar

function keyboardSVG() {
  const whites = [], blacks = [];
  for (let m = LOW; m <= HIGH; m++) ([1, 3, 6, 8, 10].includes(m % 12) ? blacks : whites).push(m);
  const W = 100 / whites.length;
  let html = "";
  whites.forEach((m, i) => { html += `<button class="mk-key w" data-m="${m}" style="left:${i * W}%;width:${W}%" title="${noteLabel(m)}">${m % 12 === 0 ? `<span>${noteLabel(m)}</span>` : ""}</button>`; });
  blacks.forEach((m) => {
    const i = whites.indexOf(m - 1);
    html += `<button class="mk-key b" data-m="${m}" style="left:${(i + 1) * W - W * 0.3}%;width:${W * 0.6}%" title="${noteLabel(m)}"></button>`;
  });
  return `<div class="mk-keys">${html}</div>`;
}
function paintKeys() {
  dock?.querySelectorAll(".mk-key").forEach((k) => k.classList.toggle("on", st.held.has(+k.dataset.m)));
  const n = dock?.querySelector(".mk-now");
  if (n) n.textContent = st.held.size ? [...st.held].sort((a, b) => a - b).map(noteLabel).join(" ") : "";
}

function deviceOptions() {
  const list = [...st.devices.map((d) => [d, d]), ...webNames().map((d) => [d, d.slice(4) + L(" (navegador)", " (browser)")])];
  return `<option value="">${L("Todos los teclados", "All keyboards")}</option>` + list.map(([v, t]) => `<option value="${esc(v)}" ${conf.device === v ? "selected" : ""}>${esc(t)}</option>`).join("");
}
function statusHTML() {
  const names = [...st.devices, ...webNames().map((d) => d.slice(4))];
  if (st.sc && st.error) return `<span class="mk-pill warn">${icon("close", 12)} ${L("SuperCollider no puede abrir el MIDI", "SuperCollider can't open MIDI")}</span>`;
  if (names.length) return `<span class="mk-pill ok">${icon("check", 12)} ${esc(conf.device ? (conf.device.replace(/^web:/, "")) : names.join(", "))}</span>`;
  if (!st.sc && !navigator.requestMIDIAccess) return `<span class="mk-pill">${L("Arranca el motor de sonido para usar tu piano", "Start the sound engine to use your piano")}</span>`;
  return `<span class="mk-pill warn">${L("No veo ningún teclado: enchúfalo y pulsa Buscar", "No keyboard found: plug it in and press Search")}</span>`;
}
function soundOptions() {
  const list = [...new Set([conf.sound, ...SOUNDS, ...(ctx.sounds() || [])])];
  return list.map((s) => `<option ${s === conf.sound ? "selected" : ""}>${esc(s)}</option>`).join("");
}
function renderStatus() {
  const s = dock.querySelector(".mk-status"); if (s) s.innerHTML = statusHTML();
  const d = dock.querySelector("[data-c=device]"); if (d) d.innerHTML = deviceOptions();
}
function renderSettings() {
  const o = dock.querySelector("[data-c=transpose]"); if (o) o.textContent = (conf.transpose > 0 ? "+" : "") + conf.transpose / 12;
}
function renderRecStatus() {
  const el = dock.querySelector(".mk-recstate"); if (!el || !st.rec) return;
  const r = st.rec, now = serverNow(), bar = 240 / r.bpm;
  if (r.synced && r.t0 && now < r.t0) el.textContent = L(`Empieza con el siguiente compás de tu canción (${Math.round(r.bpm)} BPM)…`, `Starts on your song's next bar (${Math.round(r.bpm)} BPM)…`);
  else if (r.t0 && now < r.t0) el.textContent = L(`Cuenta atrás… ${Math.ceil((r.t0 - now) / (60 / r.bpm))}`, `Count-in… ${Math.ceil((r.t0 - now) / (60 / r.bpm))}`);
  else if (r.t0) el.textContent = L(`Grabando · compás ${Math.floor((now - r.t0) / bar) + 1} · ${Math.round(r.bpm)} BPM`, `Recording · bar ${Math.floor((now - r.t0) / bar) + 1} · ${Math.round(r.bpm)} BPM`);
  else el.textContent = L(`Grabando · empieza en tu primera nota · ${Math.round(r.bpm)} BPM`, `Recording · starts on your first note · ${Math.round(r.bpm)} BPM`);
}

function resultHTML() {
  const r = st.result;
  if (!r) return "";
  if (r.empty) return `<div class="mk-result"><p class="hint">${L("No he oído ninguna nota en esa toma. ¿Está bien elegido el teclado y el canal?", "I didn't hear any notes in that take. Are the keyboard and channel right?")}</p></div>`;
  const s = r.summary;
  const key = s?.key ? `${s.key.name}${s.key.mode === "minor" ? L(" menor", " minor") : L(" mayor", " major")}` : "?";
  const chords = s ? (s.window?.chords || []).filter((c) => c && c !== "-") : [];
  const gridNames = { auto: L("Auto", "Auto"), 4: L("Negras", "Quarter notes"), 8: L("Corcheas", "Eighth notes"), 12: L("Tresillos", "Triplets"), 16: L("Semicorcheas", "Sixteenths"), 24: L("Tresillos de semi", "16th triplets") };
  return `<div class="mk-result">
    <div class="mk-facts">
      <span><small>${L("Notas", "Notes")}</small><b>${r.notes}</b></span>
      <span><small>${L("Compases", "Bars")}</small><b>${r.bars}</b></span>
      <span><small>${L("Tonalidad", "Key")}</small><b>${esc(key)}</b></span>
      <span><small>${L("Acordes", "Chords")}</small><b>${esc(chords.join(" → ") || "—")}</b></span>
      ${r.synced ? `<span class="mk-sync">${icon("check", 12)} ${L("Encaja con tu canción", "Locked to your song")}</span>` : ""}
    </div>
    <div class="mk-opts">
      <label>BPM <input type="number" min="40" max="220" data-o="bpm" value="${Math.round(r.bpm)}"></label>
      <label>${L("Cuadrar a", "Snap to")} <select data-o="grid">${["auto", 4, 8, 12, 16, 24].map((g) => `<option value="${g}" ${String(st.opts.grid) === String(g) ? "selected" : ""}>${gridNames[g]}${g === "auto" && st.opts.grid === "auto" ? ` (${gridNames[r.grid]})` : ""}</option>`).join("")}</select></label>
      <label>${L("Manos", "Hands")} <select data-o="split">
        <option value="auto" ${st.opts.split === "auto" ? "selected" : ""}>${L("Separar izquierda y derecha", "Split left and right hand")}</option>
        <option value="none" ${st.opts.split === "none" ? "selected" : ""}>${L("Todo en una pista", "Everything in one track")}</option></select></label>
    </div>
    <div class="imp-tracks mk-tracks">${r.tracks.map((t, i) => `<label class="imp-track k-${esc(t.tipo)}"><input type="checkbox" data-i="${i}" ${r.off.has(i) ? "" : "checked"}>${icon(KIND_ICON[t.tipo] || "textura", 16)}<b>${esc(t.nombre)}</b><code>${esc(t.codigo)}</code></label>`).join("")}</div>
    <div class="mk-actions">
      <button data-a="listen">${icon(st.previewing ? "stop" : "speaker", 14)} ${st.previewing ? L("Parar", "Stop") : L("Escuchar", "Listen")}</button>
      <button data-a="add" class="primary">${icon("plus", 14)} ${L("Añadir a mi canción", "Add to my song")}</button>
      <button data-a="maestro">${icon("maestro", 14)} ${L("Pregúntale a Maestro", "Ask Maestro")}</button>
      <button data-a="generate">${icon("wand", 14)} ${L("Generar en un estilo…", "Generate in a style…")}</button>
      <button data-a="newsong">${icon("blank", 14)} ${L("Canción nueva con esto", "New song from this")}</button>
      <button data-a="mid" class="link">${icon("download", 14)} .mid</button>
    </div>
  </div>`;
}

function render() {
  if (!dock) return;
  const recording = st.rec && !st.rec.stop;
  dock.innerHTML = `<div class="mk-head">
      <b>${icon("piano", 18)} ${L("Mi teclado MIDI", "My MIDI keyboard")}</b>
      <span class="mk-status">${statusHTML()}</span>
      <button class="link" data-a="scan" title="${L("Vuelve a buscar teclados (por si lo has enchufado ahora)", "Look for keyboards again (in case you just plugged it in)")}">${icon("search", 14)} ${L("Buscar", "Search")}</button>
      <span class="mk-now"></span>
      <button class="icon-btn mk-close" data-a="close" title="${L("Cerrar", "Close")}">${icon("close", 18)}</button>
    </div>
    <div class="mk-settings">
      <label>${L("Teclado", "Keyboard")} <select data-c="device">${deviceOptions()}</select></label>
      <label>${L("Canal", "Channel")} <select data-c="chan"><option value="-1">${L("Todos", "All")}</option>${Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${conf.chan === i ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      <label>${L("Sonido", "Sound")} <select data-c="sound">${soundOptions()}</select></label>
      <label class="mk-oct">${L("Octava", "Octave")} <button data-a="oct-" title="Z">−</button><b data-c="transpose">${(conf.transpose > 0 ? "+" : "") + conf.transpose / 12}</b><button data-a="oct+" title="X">+</button></label>
      <label class="toggle"><input type="checkbox" data-c="play" ${conf.play ? "checked" : ""}> ${L("Que suene", "Play sound")}</label>
    </div>
    <div class="mk-out">${outHTML()}</div>
    ${keyboardSVG()}
    <p class="hint mk-tip">${L("Toca tu piano, pulsa las teclas de la pantalla o usa A W S E D F T G Y H U J K en el ordenador (Z y X cambian de octava).", "Play your piano, click the keys on screen or use A W S E D F T G Y H U J K on your computer (Z and X change octave).")}</p>
    <div class="mk-rec">
      <button data-a="${recording ? "stop" : "rec"}" class="${recording ? "rec-on" : "rec-btn"}">${icon(recording ? "stop" : "rec", 14)} ${recording ? L("Parar y traducir", "Stop and translate") : L("Grabar", "Record")}</button>
      ${recording ? "" : `<button data-a="capture" title="${L("No hace falta haber pulsado Grabar: cojo tu última frase", "No need to have pressed Record: I take your last phrase")}">${icon("wand", 14)} ${L("Convertir lo que acabo de tocar", "Turn what I just played into code")}</button>`}
      <label class="toggle"><input type="checkbox" data-c="countin" ${conf.countin ? "checked" : ""}> ${L("Cuenta atrás", "Count-in")}</label>
      <label class="toggle"><input type="checkbox" data-c="metro" ${conf.metro ? "checked" : ""}> ${L("Metrónomo", "Metronome")}</label>
      <span class="mk-recstate hint">${recording ? "" : L("Si tu canción está sonando, la grabación empieza en su siguiente compás y encaja con ella.", "If your song is playing, recording starts on its next bar and fits right in.")}</span>
    </div>
    ${recording ? `<div class="mk-live"><span class="hint">${L("El código aparecerá aquí mientras tocas…", "The code will show up here as you play…")}</span></div>` : resultHTML()}`;
  paintKeys();
  if (recording) renderRecStatus();
  wire();
}

// ---------------------------------------------------------------- salida: de Tidal Studio a tu teclado

// Sonidos General MIDI más útiles (programa 0-127): la mayoría de pianos digitales y teclados los entienden
const GM = [[-1, "—"], [0, "Piano"], [4, "Electric piano"], [6, "Harpsichord"], [11, "Vibraphone"], [16, "Organ"], [19, "Church organ"],
  [24, "Nylon guitar"], [32, "Acoustic bass"], [33, "Electric bass"], [40, "Violin"], [48, "Strings"], [52, "Choir"], [56, "Trumpet"],
  [65, "Alto sax"], [73, "Flute"], [80, "Square lead"], [81, "Saw lead"], [88, "New age pad"], [89, "Warm pad"]];
const isMidiTrack = (code) => /#\s*s(ound)?\s+"midi"/.test(code);
// Pasa una pista a tu teclado: el sonido pasa a ser "midi" (el anterior se guarda en la pista, kbWas, para volver)
export function toKeyboard(code, ch) {
  const m = code.match(/#\s*s(?:ound)?\s+"([^"]+)"/);
  const was = m ? m[1] : "";
  const out = (m ? code.replace(m[0], '# s "midi"') : code + ' # s "midi"').replace(/\s*#\s*midichan\s+\d+/g, "") + ` # midichan ${ch}`;
  return { code: out, was };
}
export function fromKeyboard(code, was) {
  return code.replace(/\s*#\s*midichan\s+\d+/g, "").replace(/#\s*s(ound)?\s+"midi"/, `# s "${was || "superpiano"}"`);
}

function outHTML() {
  const outs = st.outputs;
  const tracks = ctx.tracks ? ctx.tracks() : [];
  const head = `<button class="link mk-out-toggle" data-a="out-toggle" aria-expanded="${st.outOpen}">${icon("arrow", 12)} ${L("Enviar a mi teclado", "Send to my keyboard")}${conf.out ? ` · <b>${esc(conf.out)}</b>${st.outActive === conf.out ? "" : L(" (desconectado)", " (disconnected)")}` : ""}</button>`;
  if (!st.outOpen) return head;
  if (!st.sc) return head + `<p class="hint">${L("Para mandar notas a tu teclado hace falta el motor de sonido en marcha.", "Sending notes to your keyboard needs the sound engine running.")}</p>`;
  return head + `<div class="mk-out-body">
    <label>${L("Salida", "Output")} <select data-c="out"><option value="">${L("Ninguna", "None")}</option>${outs.map((o) => `<option ${o === conf.out ? "selected" : ""}>${esc(o)}</option>`).join("")}${conf.out && !outs.includes(conf.out) ? `<option selected>${esc(conf.out)}</option>` : ""}</select></label>
    <label>${L("Canal", "Channel")} <select data-c="outch">${Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${conf.outch === i ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
    <label>${L("Sonido del teclado", "Keyboard sound")} <select data-c="prog">${GM.map(([n, t]) => `<option value="${n}" ${conf.prog === n ? "selected" : ""}>${n < 0 ? L("El que tenga", "Leave as is") : t}</option>`).join("")}</select></label>
    <label class="toggle" title="${L("El arpegiador o la batería de tu teclado siguen el tempo de la canción y arrancan y paran con ella", "Your keyboard's arpeggiator or drums follow the song tempo and start and stop with it")}"><input type="checkbox" data-c="clock" ${conf.clock ? "checked" : ""}> ${L("Reloj y start/stop", "Clock and start/stop")}</label>
    ${conf.out ? `<div class="mk-out-tracks">${tracks.length ? tracks.map((t) => `<button data-a="${isMidiTrack(t.code) ? "trk-studio" : "trk-kb"}" data-t="${esc(t.id)}" class="${isMidiTrack(t.code) ? "on" : ""}">${icon(isMidiTrack(t.code) ? "piano" : "speaker", 12)} ${esc(t.name || t.id)}</button>`).join("") : `<span class="hint">${L("Añade pistas a tu canción para tocarlas en tu teclado.", "Add tracks to your song to play them on your keyboard.")}</span>`}
      <span class="hint">${L("Pulsa una pista para que suene en tu teclado (y otra vez para volver al estudio). Si oyes cada nota dos veces, desactiva «Local Control» en tu teclado.", "Click a track to play it on your keyboard (click again to go back to the studio). If you hear every note twice, turn off «Local Control» on your keyboard.")}</span></div>` : ""}
  </div>`;
}
function renderOut() {
  const el = dock && dock.querySelector(".mk-out");
  if (el) { el.innerHTML = outHTML(); wireOut(el); }
}
function wireOut(root) {
  root.querySelectorAll("[data-c]").forEach((el) => {
    el.onchange = () => {
      const k = el.dataset.c;
      conf[k] = el.type === "checkbox" ? el.checked : (k === "outch" || k === "prog") ? +el.value : el.value;
      saveConf(); sendSettings([k]);
      if (k === "clock" && ctx.clockChanged) ctx.clockChanged(conf.clock);
      renderOut();
    };
  });
}
export const midiOutOn = () => !!(conf.out && st.outActive === conf.out);
// Reloj MIDI para «Tocar todo»: 24 pulsos por negra (96 por ciclo de 4 negras) y start al empezar
export function clockLines(start) {
  if (!(conf.clock && conf.out)) return [];
  return ['p "ts-midiclock" $ midicmd "midiClock*96" # s "midi"', ...(start ? ['once $ midicmd "start" # s "midi"'] : [])];
}
// Silencio: stop al teclado y All Notes Off (nada se queda sonando en tu piano)
export function midiSilence() {
  if (!conf.out) return [];
  post("/api/midi/panic", {}).catch(() => {});
  return conf.clock ? ['once $ midicmd "stop" # s "midi"'] : [];
}

function wire() {
  // teclado en pantalla
  let mouseNote = null;
  const keys = dock.querySelector(".mk-keys");
  keys.onpointerdown = (e) => { const k = e.target.closest(".mk-key"); if (!k) return; mouseNote = +k.dataset.m; noteFromUI("on", mouseNote, 96); };
  const up = () => { if (mouseNote !== null) { noteFromUI("off", mouseNote, 0); mouseNote = null; } };
  keys.onpointerup = up; keys.onpointerleave = up;
  wireOut(dock.querySelector(".mk-out"));
  dock.querySelectorAll(".mk-settings [data-c], .mk-rec [data-c]").forEach((el) => {
    if (el.tagName === "B") return;
    el.onchange = () => {
      const k = el.dataset.c;
      conf[k] = el.type === "checkbox" ? el.checked : k === "chan" ? +el.value : el.value;
      saveConf();
      if (["sound", "device", "chan", "play"].includes(k)) sendSettings([k]);
      if (k === "device" || k === "chan") maybeWebMidi();
      if (k === "sound") ctx.ensure(conf.sound);
      if (k === "sound" && st.result && !st.result.empty) translate();
    };
  });
  dock.querySelectorAll("[data-o]").forEach((el) => {
    el.onchange = () => {
      const k = el.dataset.o;
      st.opts[k] = k === "bpm" ? Math.max(40, Math.min(220, +el.value || 120)) : el.value;
      stopPreview(); translate();
    };
  });
  dock.querySelectorAll(".mk-tracks input").forEach((c) => c.onchange = () => { c.checked ? st.result.off.delete(+c.dataset.i) : st.result.off.add(+c.dataset.i); });
  dock.onclick = (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    act(b.dataset.a, b);
  };
}

async function act(a, b) {
  const r = st.result;
  if (a === "close") return closeDock();
  if (a === "out-toggle") { st.outOpen = !st.outOpen; return renderOut(); }
  if (a === "trk-kb" || a === "trk-studio") {
    const id = b?.dataset.t; const t = (ctx.tracks() || []).find((x) => x.id === id); if (!t) return;
    if (a === "trk-kb") { const r = toKeyboard(t.code, conf.outch); ctx.patchTrack(id, { code: r.code, kbWas: r.was }); }
    else ctx.patchTrack(id, { code: fromKeyboard(t.code, t.kbWas), kbWas: undefined });
    return renderOut();
  }
  if (a === "scan") { post("/api/midi/scan", {}).catch(() => {}); maybeWebMidi(); return ctx.toast(L("Buscando teclados…", "Looking for keyboards…")); }
  if (a === "oct-" || a === "oct+") { conf.transpose = Math.max(-36, Math.min(36, conf.transpose + (a === "oct+" ? 12 : -12))); saveConf(); sendSettings(["transpose"]); return renderSettings(); }
  if (a === "rec") return startRecording();
  if (a === "stop") return stopRecording();
  if (a === "capture") return captureLast();
  if (!r || r.empty) return;
  const tracks = picked();
  const bpm = Math.round(r.bpm);
  if (a === "listen") {
    if (st.previewing) { stopPreview(); return render(); }
    if (!tracks.length) return;
    st.previewing = true; render();
    return ctx.preview(tracks, bpm, r.synced);
  }
  if (a === "mid") {
    const bytes = Uint8Array.from(atob(r.midi_b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: L("lo-que-he-tocado.mid", "what-i-played.mid") });
    document.body.appendChild(link); link.click(); link.remove();
    return setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  if (a === "generate") {
    stopPreview();
    const bytes = Uint8Array.from(atob(r.midi_b64), (c) => c.charCodeAt(0));
    closeDock();
    return ctx.generate(L("Lo que he tocado", "What I played"), bytes);
  }
  if (!tracks.length) return ctx.toast(L("Marca al menos una pista.", "Tick at least one track."));
  stopPreview();
  if (a === "newsong") {
    closeDock();
    return ctx.adopt({ name: L("Lo que he tocado", "What I played"), bpm, tracks, reference: r.reference, summary: r.summary });
  }
  if (a === "add" || a === "maestro") {
    const added = ctx.addTracks(tracks, bpm, r.synced);
    if (!added.length) return;
    if (a === "maestro") { closeDock(); return ctx.ask(maestroPrompt(r, added)); }
    ctx.say(addedText(r, added));
    st.result = null; render();
  }
}

function addedText(r, added) {
  const s = r.summary, names = added.map((t) => `«${t.name}» (${t.id})`).join(L(" y ", " and "));
  const key = s?.key ? s.key.name + (s.key.mode === "minor" ? "m" : "") : "";
  const chords = (s?.window?.chords || []).filter((c) => c && c !== "-");
  return L(`He traducido lo que has tocado a Tidal y lo he añadido como ${names}.\n\n${r.bars} ${r.bars === 1 ? "compás" : "compases"}${key ? `, en ${key}` : ""}${chords.length ? `, acordes ${chords.join(" → ")}` : ""}. Cada nota es un nombre (c5 es el do central) y «~» es un silencio; «@2» alarga una nota dos pasos y «<…>» toca un compás distinto en cada vuelta.${r.synced ? "" : "\n\nSi no encaja con el resto, prueba otro BPM o «Cuadrar a» en el panel del teclado antes de añadirlo."}`,
    `I translated what you played into Tidal and added it as ${names}.\n\n${r.bars} ${r.bars === 1 ? "bar" : "bars"}${key ? `, in ${key}` : ""}${chords.length ? `, chords ${chords.join(" → ")}` : ""}. Each note is a name (c5 is middle C) and «~» is a rest; «@2» holds a note for two steps and «<…>» plays a different bar on each loop.${r.synced ? "" : "\n\nIf it doesn't fit with the rest, try another BPM or «Snap to» in the keyboard panel before adding it."}`);
}
function maestroPrompt(r, added) {
  const s = r.summary;
  const key = s?.key ? s.key.name + (s.key.mode === "minor" ? "m" : "") : "?";
  const chords = (s?.window?.chords || []).filter((c) => c && c !== "-").join(" → ") || "?";
  const code = added.map((t) => `${t.id} (${t.name}): ${t.code}`).join("\n");
  return L(`Acabo de tocar esto en mi teclado MIDI y lo he añadido a la canción:\n${code}\n\nTonalidad ${key}, acordes ${chords}, ${r.bars} compases a ${Math.round(r.bpm)} BPM. Explícame qué he tocado (en música y en código de Tidal) y propónme cómo continuarlo o qué añadirle para que suene mejor. No borres lo que he tocado.`,
    `I just played this on my MIDI keyboard and added it to the song:\n${code}\n\nKey ${key}, chords ${chords}, ${r.bars} bars at ${Math.round(r.bpm)} BPM. Explain what I played (as music and as Tidal code) and suggest how to continue it or what to add so it sounds better. Don't delete what I played.`);
}
