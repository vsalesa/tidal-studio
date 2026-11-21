// Loops largos: cargador (arrastrar archivos, carpetas o un zip), navegador con forma de onda,
// etiquetas (BPM, compases, tonalidad, tipo), escucha al tempo de la canción, trozos y variaciones.
// El análisis lo hace el servidor (server/loops.py); si no puede leer un formato (MP3/OGG sin ffmpeg),
// el navegador decodifica el audio y se lo manda.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtN = (x) => (Number.isInteger(+x) ? String(+x) : String(+(+x).toFixed(3)));
const AUDIO_RE = /\.(wav|aif|aiff|flac|ogg|mp3)$/i;

export const KINDS = [
  { id: "drums", es: "Batería", en: "Drums", track: "percusion" },
  { id: "bass", es: "Bajo", en: "Bass", track: "bajo" },
  { id: "melody", es: "Melodía", en: "Melody", track: "melodia" },
  { id: "chords", es: "Acordes", en: "Chords", track: "armonia" },
  { id: "vocal", es: "Voz", en: "Vocals", track: "textura" },
  { id: "texture", es: "Textura", en: "Texture", track: "textura" },
  { id: "full", es: "Mezcla completa", en: "Full mix", track: "percusion" },
];
const kindName = (k) => { const x = KINDS.find((y) => y.id === k); return x ? L(x.es, x.en) : L("¿?", "?"); };
export const kindTrack = (k) => (KINDS.find((y) => y.id === k) || {}).track || "textura";

let ctx = null;                       // lo que presta app.js (state, addTrack, say…)
const lp = { data: null, kind: "", q: "", open: null, mode: {}, seq: {}, bars: {}, job: null, playing: null };
const buffers = new Map();            // AudioBuffer por loop (para escuchar sin pasar por el motor)
let actx = null;

export function initLoops(c) { ctx = c; }
export function loopsCache() { return lp.data; }

// ------------------------------------------------------------------ código (igual que plan() en loops.py)
export function plan(ref, m, songBpm) {
  songBpm = +songBpm || 120;
  let bpm = +m.bpm || 0, bars = +m.bars || 0;
  if (!bpm || !bars) { bars = Math.max(1, Math.round((m.duration || 2) * songBpm / 240)); bpm = bars * 240 / (m.duration || 2); }
  let best = null;
  for (const f of [0.5, 1, 2]) {
    const n = bars * f; if (n < 0.25) continue;
    const speed = bars * songBpm / (n * bpm);
    const score = Math.abs(Math.log2(speed)) + (f !== 1 ? 0.05 : 0);
    if (!best || score < best.score) best = { score, n, speed };
  }
  const { n, speed } = best;
  const slices = +m.slices || 8;
  const s = `s "${ref}"`;
  const kind = m.kind || "drums";
  const fit = ["drums", "full"].includes(kind) ? `loopAt ${fmtN(n)} $ chop ${slices * (n <= bars ? 1 : 2)} $ ${s} # cut 1` : `loopAt ${fmtN(n)} $ ${s} # cut 1`;
  // variaciones con como mucho 16 trozos (corcheas en 2 compases, negras en 4): listas cortas y legibles
  let vslices = slices; while (vslices > 16 && vslices % 2 === 0) vslices /= 2;
  const vhits = (m.slice_hits || []).filter((_, i) => i % (slices / vslices) === 0);
  const splice = (seq, N = slices) => { const f = spliceCycles(seq, N, n); return `${f === 1 ? "" : `slow ${fmtN(f)} $ `}splice ${N} "${seq}" $ ${s} # cut 1`; };
  return { n, bars, speed, semitones: 12 * Math.log2(speed), slices, vslices, fit,
    // cada trozo dura lo que dura en el loop: con menos pasos que trozos, la vuelta es más corta
    splice, varySeq: variations(vslices, vhits), vary: () => splice(variations(vslices, vhits), vslices),
    section: (from, to) => `loopAt ${fmtN((to - from) * n / bars)} $ ${s} # begin ${fmtN(+(from / bars).toFixed(4))} # end ${fmtN(+(to / bars).toFixed(4))} # cut 1` };
}
// Cuántos ciclos dura una vuelta de la lista de trozos (pasos de primer nivel × lo que dura un trozo)
export function topSteps(seq) {
  let t = seq.trim();
  if (t.startsWith("<")) { const g = t.slice(1, -1).match(/\[(?:[^\[\]]|\[[^\]]*\])*\]/); t = g ? g[0].slice(1, -1) : t.slice(1, -1); }
  return (t.match(/\[[^\]]*\]|\S+/g) || []).length || 1;
}
export const spliceCycles = (seq, slices, n) => +(n * topSteps(seq) / slices).toFixed(4);
export function variations(slices, hits) {
  const idx = [...Array(slices).keys()], q = Math.max(1, slices >> 2);
  const base = idx.join(" ");
  const fill = idx.slice(0, slices - q).join(" ") + " " + idx.slice(slices - q).map((i) => `[${i} ${i}]`).join(" ");
  let swap = [...idx.slice(0, q), ...idx.slice(2 * q, 3 * q), ...idx.slice(q, 2 * q), ...idx.slice(3 * q)];
  const kicks = (hits || []).slice(0, slices).map((h, i) => (h === "k" ? i : -1)).filter((i) => i >= 0);
  if (kicks.length >= 2) { swap = [...idx]; swap[slices - q] = kicks[0]; }
  return `<[${base}]!2 [${fill}] [${swap.join(" ")}]>`;
}
// Código para un loop de la biblioteca (lo usan «Nueva pista» y el arreglo automático de app.js)
export function loopCodeFor(ref) {
  const x = (lp.data?.loops || []).find((l) => l.ref === ref || (l.index === 0 && l.name === ref));
  return x ? plan(x.ref, x, ctx.state.bpm).fit : null;
}
export function loopKindFor(ref) {
  const x = (lp.data?.loops || []).find((l) => l.ref === ref || (l.index === 0 && l.name === ref));
  return x ? kindTrack(x.kind) : null;
}

// ------------------------------------------------------------------ datos
export async function loadLoops(scan = false) {
  try {
    lp.data = scan ? await ctx.api(`/api/loops/scan?bpm=${ctx.state.bpm}`, {}) : await ctx.api(`/api/loops?bpm=${ctx.state.bpm}`);
  } catch (e) { lp.data = { loops: [], pending: [], error: e.message }; }
  finishPending();
  return lp.data;
}
// Lo que el servidor no pudo leer (MP3/OGG sin ffmpeg): lo decodifica el navegador
let pendingBusy = false;
async function finishPending() {
  if (pendingBusy || !(lp.data?.pending || []).length) return;
  pendingBusy = true;
  let any = false;
  for (const p of lp.data.pending) {
    try {
      const r = await fetch(`/api/samples/file?name=${encodeURIComponent(p.name)}&i=${p.index}`);
      await sendPCM(p.name, p.index, await r.arrayBuffer());
      any = true;
    } catch { /* formato raro: se queda como está */ }
  }
  pendingBusy = false;
  if (any) { lp.data = await ctx.api(`/api/loops?bpm=${ctx.state.bpm}`).catch(() => lp.data); lp.data.pending = []; rerender(); }
}
async function sendPCM(name, index, arrayBuf) {
  const ac = audioCtx();
  const buf = await ac.decodeAudioData(arrayBuf.slice(0));
  const sr = 11025, secs = Math.min(buf.duration, 120);
  const off = new OfflineAudioContext(1, Math.ceil(secs * sr), sr);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const pcm = new Int16Array(out.length);
  for (let i = 0; i < out.length; i++) pcm[i] = Math.max(-1, Math.min(1, out[i])) * 32767;
  const r = await fetch(`/api/loops/pcm?name=${encodeURIComponent(name)}&i=${index}&sr=${sr}&dur=${buf.duration}`, { method: "POST", body: pcm.buffer });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "error");
}

// ------------------------------------------------------------------ cargador
// files: [{file: File, path: "carpeta/sub/archivo.wav"}]
export async function loadFiles(files) {
  const list = files.filter((f) => AUDIO_RE.test(f.file.name) || /\.zip$/i.test(f.file.name));
  if (!list.length) { ctx.toast(L("No hay audios ni zips en lo que has soltado.", "There are no audio files or zips in what you dropped.")); return; }
  const job = lp.job = { total: list.length, done: 0, current: "", results: [], running: true };
  rerender();
  for (const f of list) {
    job.current = f.path || f.file.name; paintJob();
    const zip = /\.zip$/i.test(f.file.name);
    const folder = (f.path || "").split("/").slice(0, -1).join("/");
    try {
      const url = zip ? `/api/loops/zip?bpm=${ctx.state.bpm}&lang=${ctx.lang}&folder=${encodeURIComponent(folder)}`
        : `/api/loops/upload?bpm=${ctx.state.bpm}&lang=${ctx.lang}&filename=${encodeURIComponent(f.file.name)}&folder=${encodeURIComponent(folder)}`;
      const r = await fetch(url, { method: "POST", body: f.file });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      for (const a of d.added || []) {
        if (a.status === "pending" && !zip) {
          try { await sendPCM(a.name, 0, await f.file.arrayBuffer()); a.status = "ok"; } catch { /* se queda pendiente */ }
        }
        job.results.push(a);
      }
      lp.data = d;
    } catch (e) { job.results.push({ file: f.file.name, status: "error", error: e.message }); }
    job.done++; paintJob();
  }
  job.running = false; job.current = "";
  await loadLoops();
  ctx.onLibraryChanged();
  rerender();
  const ok = job.results.filter((r) => r.status === "ok" || r.status === "pending");
  if (ok.length) {
    const first = ok[0];
    ctx.say(L(`He cargado ${ok.length} ${ok.length === 1 ? "loop" : "loops"} y ya están en SuperDirt. Los he escuchado: ${ok.slice(0, 4).map((r) => `«${r.name}» (${r.bpm ? fmtN(r.bpm) + " BPM, " : ""}${r.bars ? fmtN(r.bars) + " compases" : ""}${r.key ? ", " + r.key : ""})`).join(", ")}${ok.length > 4 ? "…" : ""}. Para que suenen a tu tempo uso «loopAt» (estira el loop para que dure justo esos compases) y «# cut 1» (cada vuelta corta a la anterior). Pulsa «Añadir como pista» o pídeme «haz una base con ${first.name}».`,
      `I loaded ${ok.length} ${ok.length === 1 ? "loop" : "loops"} and they're in SuperDirt. I listened to them: ${ok.slice(0, 4).map((r) => `«${r.name}» (${r.bpm ? fmtN(r.bpm) + " BPM, " : ""}${r.bars ? fmtN(r.bars) + " bars" : ""}${r.key ? ", " + r.key : ""})`).join(", ")}${ok.length > 4 ? "…" : ""}. To play them at your tempo I use «loopAt» (stretches the loop to last exactly those bars) and «# cut 1» (each pass cuts the previous one). Press «Add as track» or ask me «make a beat with ${first.name}».`));
  }
}
// Arrastrar y soltar: hay que leer las carpetas en el mismo evento (después el navegador las olvida)
export async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])].map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])].map((file) => ({ file, path: file.name }));
  const out = [];
  const walk = async (entry, path) => {
    if (out.length > 500) return;
    if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null); if (file) out.push({ file, path: path + file.name }); return; }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res) => reader.readEntries(res, () => res([]))); for (const e of batch) await walk(e, path + entry.name + "/"); } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}
export function isFileDrag(e) { return [...(e.dataTransfer?.types || [])].includes("Files"); }

// ------------------------------------------------------------------ escuchar (en el navegador, al tempo de la canción)
function audioCtx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
async function bufferOf(x) {
  const k = `${x.name}|${x.index}`;
  if (!buffers.has(k)) {
    const r = await fetch(`/api/samples/file?name=${encodeURIComponent(x.name)}&i=${x.index}`);
    buffers.set(k, await audioCtx().decodeAudioData(await r.arrayBuffer()));
  }
  return buffers.get(k);
}
export function stopLoop() {
  if (lp.playing) { lp.playing.nodes.forEach((n) => { try { n.stop(); } catch { /* ya parado */ } }); clearTimeout(lp.playing.timer); lp.playing = null; }
  document.querySelectorAll(".lp-card .lp-play.on").forEach((b) => { b.classList.remove("on"); b.innerHTML = icon("play", 15); });
}
// steps: [[índice|null, inicio (0-1), duración (0-1)]] dentro de una vuelta de `cycles` ciclos
function parseSeq(seq) {
  const alts = [], s = seq.trim().replace(/(\[[^\[\]]*(?:\[[^\]]*\][^\[\]]*)*\])!(\d+)/g, (_, g, k) => Array(+k).fill(g).join(" "));
  const inner = s.replace(/^<|>$/g, "");
  const groups = s.startsWith("<") ? (inner.match(/\[(?:[^\[\]]|\[[^\]]*\])*\]/g) || [`[${inner}]`]) : [`[${s}]`];
  for (const g of groups) {
    const toks = g.slice(1, -1).match(/\[[^\]]*\]|\S+/g) || [];
    const steps = [];
    toks.forEach((t, i) => {
      if (t.startsWith("[")) { const sub = t.slice(1, -1).split(/\s+/).filter(Boolean); sub.forEach((u, j) => steps.push([u === "~" ? null : +u, (i + j / sub.length) / toks.length, 1 / toks.length / sub.length])); }
      else steps.push([t === "~" ? null : +t, i / toks.length, 1 / toks.length]);
    });
    alts.push(steps);
  }
  return alts;
}
async function playLoop(x, mode, btn) {
  if (lp.playing && lp.playing.key === `${x.ref}|${mode}`) return stopLoop();
  stopLoop();
  const buf = await bufferOf(x).catch(() => null);
  if (!buf) return ctx.toast(L("No he podido leer el audio en el navegador.", "Couldn't read the audio in the browser."));
  const ac = audioCtx(); if (ac.state === "suspended") await ac.resume();
  const p = plan(x.ref, x, ctx.state.bpm);
  const cycle = 240 / ctx.state.bpm;
  const nodes = [];
  const state = { key: `${x.ref}|${mode}`, nodes, timer: null };
  lp.playing = state;
  if (btn) { btn.classList.add("on"); btn.innerHTML = icon("stop", 15); }
  const play = (t0, from, len, dur, rate) => {
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.setValueAtTime(1, t0); g.gain.setValueAtTime(1, t0 + Math.max(0, dur - 0.006)); g.gain.linearRampToValueAtTime(0, t0 + dur);
    s.connect(g).connect(ac.destination); s.start(t0, from * buf.duration, len * buf.duration); s.stop(t0 + dur + 0.01); nodes.push(s);
  };
  let t = ac.currentTime + 0.05, pass = 0;
  const schedule = () => {
    if (lp.playing !== state) return;
    nodes.length = 0;
    const seqNow = mode === "slices" ? seqOf(x) : mode === "vary" ? p.varySeq : null;
    const N = mode === "vary" ? p.vslices : p.slices;
    const passLen = (seqNow ? spliceCycles(seqNow, N, p.n) : p.n) * cycle;
    if (mode === "fit") play(t, 0, 1, passLen, buf.duration / passLen);
    else if (mode === "section") {
      const [a, b] = lp.bars[x.ref] || [0, 1];
      const len = (b - a) * p.n / p.bars * cycle;
      play(t, a / p.bars, (b - a) / p.bars, len, ((b - a) / p.bars) * buf.duration / len);
      t += len; state.timer = setTimeout(schedule, Math.max(50, (t - ac.currentTime - 0.15) * 1000)); return;
    } else {
      const alts = parseSeq(seqNow);
      const steps = alts[pass % alts.length];
      for (const [i, st, d] of steps) if (i != null && i >= 0 && i < N) play(t + st * passLen, i / N, 1 / N, d * passLen, (buf.duration / N) / (d * passLen));
    }
    t += passLen; pass++;
    state.timer = setTimeout(schedule, Math.max(50, (t - ac.currentTime - 0.15) * 1000));
  };
  schedule();
}
async function playSlice(x, i) {
  const buf = await bufferOf(x).catch(() => null); if (!buf) return;
  const ac = audioCtx(); if (ac.state === "suspended") await ac.resume();
  const p = plan(x.ref, x, ctx.state.bpm);
  const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = p.speed;
  s.connect(ac.destination); s.start(ac.currentTime, i / p.slices * buf.duration, buf.duration / p.slices);
}

// ------------------------------------------------------------------ pintar
const seqOf = (x) => lp.seq[x.ref] ?? [...Array(plan(x.ref, x, ctx.state.bpm).slices).keys()].join(" ");
let root = null;
function rerender() { if (root && root.isConnected) render(); }
function paintJob() {
  const el = root && root.querySelector(".lp-progress"); const j = lp.job;
  if (!el || !j) return;
  const pct = Math.round(100 * j.done / j.total);
  el.innerHTML = `<div class="lp-bar"><span style="width:${j.running ? Math.max(3, pct) : 100}%"></span></div>
    <div class="hint">${j.running ? L(`Cargando y analizando ${j.done + 1} de ${j.total}: `, `Loading and analysing ${j.done + 1} of ${j.total}: `) + `<code>${esc(j.current)}</code>`
    : jobSummary(j)}</div>`;
}
function jobSummary(j) {
  const c = (s) => j.results.filter((r) => r.status === s).length;
  const parts = [L(`${c("ok") + c("pending")} loops nuevos`, `${c("ok") + c("pending")} new loops`)];
  if (c("oneshot")) parts.push(L(`${c("oneshot")} golpes cortos (están en «Mis samples»)`, `${c("oneshot")} short hits (in «My samples»)`));
  if (c("dup")) parts.push(L(`${c("dup")} ya estaban`, `${c("dup")} were already there`));
  if (c("error")) parts.push(L(`${c("error")} con error: `, `${c("error")} failed: `) + j.results.filter((r) => r.status === "error").slice(0, 3).map((r) => `${esc(r.file)} (${esc(r.error)})`).join(", "));
  return `${icon("check", 13)} ${parts.join(" · ")}`;
}
function tags(x, p) {
  const src = { name: L("del nombre", "from the name"), audio: L("detectado", "detected"), user: L("corregido por ti", "set by you") };
  const t = [];
  t.push(`<span class="lp-tag bpm" title="${esc(src[x.bpm_source] || "")}">${x.bpm ? fmtN(x.bpm) : "?"} BPM${x.bpm_conf != null && x.bpm_conf < 0.5 && x.bpm_source === "audio" ? " ?" : ""}</span>`);
  if (x.bars) t.push(`<span class="lp-tag">${fmtN(x.bars)} ${x.bars === 1 ? L("compás", "bar") : L("compases", "bars")}</span>`);
  if (x.key) t.push(`<span class="lp-tag key" title="${esc(src[x.key_source] || "")}">${esc(x.key.replace(" major", L(" mayor", " major")).replace(" minor", L(" menor", " minor")))}</span>`);
  t.push(`<span class="lp-tag kind k-${esc(x.kind || "")}">${esc(kindName(x.kind))}</span>`);
  t.push(`<span class="lp-tag dim">${(+x.duration).toFixed(1)} s</span>`);
  if (x.license_name) t.push(`<span class="lic">${esc(x.license_name)}</span>`);
  return t.join("");
}
function speedNote(x, p) {
  const pct = Math.round((p.speed - 1) * 100);
  if (Math.abs(pct) < 1) return `<span class="lp-speed ok">${icon("check", 12)} ${L("Ya va a tu tempo", "Already at your tempo")}</span>`;
  const st = p.semitones, tonal = !["drums", "full"].includes(x.kind) || x.key;
  const half = p.n !== p.bars ? (p.n > p.bars ? L(" · a medio tempo", " · half-time") : L(" · a doble tempo", " · double-time")) : "";
  return `<span class="lp-speed ${Math.abs(st) >= 1.5 && tonal ? "warn" : ""}">${pct > 0 ? "+" : ""}${pct}% ${L("de velocidad", "speed")}${tonal ? ` (${st > 0 ? "+" : ""}${st.toFixed(1)} ${L("semitonos", "semitones")})` : ""}${half}</span>`;
}
function modeHTML(x, p) {
  const mode = lp.mode[x.ref] || "fit";
  const tabs = [["fit", "loop", L("Al tempo", "At tempo")], ["vary", "dice", L("Variaciones", "Variations")], ["section", "steps", L("Un trozo", "A section")], ["slices", "scissors", L("Trozos", "Slices")]];
  let code = p.fit, help = "";
  if (mode === "fit") help = L(`<b>loopAt ${fmtN(p.n)}</b> estira o encoge el loop para que dure ${fmtN(p.n)} ${p.n === 1 ? "ciclo" : "ciclos"} (1 ciclo = 1 compás) y vaya a ${ctx.state.bpm} BPM. ${p.fit.includes("chop") ? `<b>chop ${p.slices * (p.n <= p.bars ? 1 : 2)}</b> lo parte en trozos que se recolocan en cada vuelta, así no se desfasa aunque empieces a mitad. ` : ""}<b># cut 1</b>: cada vuelta corta a la anterior, no se pisan.`,
    `<b>loopAt ${fmtN(p.n)}</b> stretches or squeezes the loop to last ${fmtN(p.n)} ${p.n === 1 ? "cycle" : "cycles"} (1 cycle = 1 bar) at ${ctx.state.bpm} BPM. ${p.fit.includes("chop") ? `<b>chop ${p.slices * (p.n <= p.bars ? 1 : 2)}</b> cuts it into pieces that line up every pass, so it never drifts even if you start halfway. ` : ""}<b># cut 1</b>: each pass cuts the previous one, so they don't overlap.`);
  if (mode === "vary") { code = p.vary(); help = L(`Para que no suene siempre igual: <b>splice ${p.vslices}</b> lo parte en ${p.vslices} trozos y la lista dice en qué orden tocarlos. <b>&lt;[…] […]&gt;</b> usa una lista distinta en cada vuelta: <b>!2</b> repite el original dos veces, luego un relleno que repite el final ([12 12] = el trozo 12 dos veces, rápido) y otra con trozos cambiados.`, `So it doesn't always sound the same: <b>splice ${p.vslices}</b> cuts it into ${p.vslices} slices and the list says in which order to play them. <b>&lt;[…] […]&gt;</b> uses a different list each pass: <b>!2</b> repeats the original twice, then a fill that repeats the end ([12 12] = slice 12 twice, fast) and one with swapped slices.`); }
  if (mode === "section") {
    const [a, b] = lp.bars[x.ref] || [0, Math.min(1, p.bars)];
    code = p.section(a, b);
    help = L("Elige qué compases usar. <b># begin</b> y <b># end</b> dicen desde dónde hasta dónde suena (0 = principio, 1 = final del archivo).", "Pick which bars to use. <b># begin</b> and <b># end</b> say where it starts and stops (0 = start, 1 = end of the file).");
  }
  if (mode === "slices") { code = p.splice(seqOf(x)); help = L("Pulsa los trozos para oírlos y añadirlos a la lista; edita la lista a mano (usa ~ para un silencio y [3 3] para repetir rápido).", "Click the slices to hear them and add them to the list; edit the list by hand (use ~ for a rest and [3 3] for a quick repeat)."); }
  const nb = Math.max(1, Math.ceil(p.bars));
  const [a, b] = lp.bars[x.ref] || [0, Math.min(1, p.bars)];
  return `<div class="lp-modes">${tabs.map(([id, ic, n]) => `<button data-lp="mode" data-m="${id}" class="${mode === id ? "active" : ""}">${icon(ic, 13)} ${n}</button>`).join("")}</div>
    ${mode === "section" ? `<div class="lp-barsel">${Array.from({ length: nb }, (_, i) => `<button data-lp="bar" data-b="${i}" class="${i >= a && i < b ? "on" : ""}">${i + 1}</button>`).join("")}<span class="hint">${L("Pulsa un compás; mayúsculas+clic para elegir varios", "Click a bar; shift+click to pick several")}</span></div>` : ""}
    ${mode === "slices" ? `<div class="lp-slices" style="--n:${p.slices}">${Array.from({ length: p.slices }, (_, i) => `<button data-lp="slice" data-i="${i}" class="h-${(x.slice_hits || [])[i] || "n"}" title="${esc(L("Trozo", "Slice"))} ${i}">${i}</button>`).join("")}</div>
      <div class="row lp-seq"><input data-lp="seq" value="${esc(seqOf(x))}" spellcheck="false"><button data-lp="seq-clear">${L("Vaciar", "Clear")}</button><button data-lp="seq-orig">${L("Original", "Original")}</button><button data-lp="seq-shuffle">${icon("dice", 13)} ${L("Mezclar", "Shuffle")}</button></div>` : ""}
    <code class="ctl-code lp-code">${esc(code)}</code>
    <p class="hint lp-help">${help}</p>
    <div class="row"><button data-lp="hear" data-m="${mode}" class="lp-play">${icon("play", 13)} ${L("Escuchar así", "Listen like this")}</button>
      <button class="primary" data-lp="add" data-m="${mode}">${icon("plus", 13)} ${L("Añadir como pista", "Add as track")}</button>
      ${Math.abs(p.semitones) >= 1.5 && (!["drums", "full"].includes(x.kind) || x.key) && x.bpm ? `<button data-lp="song-bpm">${L(`Poner la canción a ${fmtN(Math.round(x.bpm))} BPM`, `Set the song to ${fmtN(Math.round(x.bpm))} BPM`)}</button>` : ""}</div>`;
}
function fixHTML(x) {
  return `<details class="lp-fix"><summary>${L("¿Algo mal detectado? Corrígelo", "Something detected wrong? Fix it")}</summary>
    <form data-lp="fix" class="row">
      <label>BPM <input name="bpm" type="number" step="0.1" min="30" max="300" value="${x.bpm || ""}"></label>
      <label>${L("Compases", "Bars")} <select name="bars">${[0.5, 1, 2, 3, 4, 6, 8, 12, 16, 32].map((b) => `<option ${+x.bars === b ? "selected" : ""}>${b}</option>`).join("")}${[0.5, 1, 2, 3, 4, 6, 8, 12, 16, 32].includes(+x.bars) ? "" : `<option selected>${x.bars || ""}</option>`}</select></label>
      <label>${L("Tonalidad", "Key")} <input name="key" value="${esc(x.key || "")}" placeholder="A minor" size="9"></label>
      <label>${L("Tipo", "Type")} <select name="kind">${KINDS.map((k) => `<option value="${k.id}" ${k.id === x.kind ? "selected" : ""}>${esc(L(k.es, k.en))}</option>`).join("")}</select></label>
      <button type="submit">${L("Guardar", "Save")}</button></form>
    <p class="hint">${L("Si cambias el BPM recalculo los compases (y al revés): la duración del archivo no cambia.", "If you change the BPM I recalculate the bars (and the other way round): the file length doesn't change.")}</p></details>`;
}
function cardHTML(x) {
  const p = plan(x.ref, x, ctx.state.bpm), open = lp.open === x.ref;
  return `<div class="lp-card ${open ? "open" : ""}" data-ref="${esc(x.ref)}" style="--k:var(--k-${kindTrack(x.kind)})">
    <div class="lp-head">
      <button class="icon-btn lp-play" data-lp="hear" data-m="fit" title="${esc(L(`Escuchar a ${ctx.state.bpm} BPM`, `Listen at ${ctx.state.bpm} BPM`))}">${icon("play", 15)}</button>
      <span class="lp-name"><code>${esc(x.ref)}</code><span class="lp-tags">${tags(x, p)}</span></span>
      ${speedNote(x, p)}
      <button class="primary" data-lp="add" data-m="fit">${icon("plus", 13)} ${L("Añadir como pista", "Add as track")}</button>
      <button class="icon-btn" data-lp="toggle" title="${esc(L("Forma de onda, trozos y variaciones", "Waveform, slices and variations"))}">${icon(open ? "close" : "scissors", 15)}</button>
    </div>
    <canvas class="lp-wave" width="900" height="${open ? 110 : 44}" data-ref="${esc(x.ref)}"></canvas>
    ${open ? modeHTML(x, p) + fixHTML(x) : ""}</div>`;
}
function filtered() {
  const q = lp.q.toLowerCase();
  const bpm = ctx.state.bpm;
  const dist = (x) => { if (!x.bpm) return 9; const r = bpm / x.bpm; return Math.min(...[r, r * 2, r / 2].map((v) => Math.abs(Math.log2(v)))); };
  return (lp.data?.loops || []).filter((x) => (!lp.kind || x.kind === lp.kind) && (!q || `${x.ref} ${x.key || ""} ${x.file}`.toLowerCase().includes(q)))
    .sort((a, b) => dist(a) - dist(b));
}
function render() {
  const d = lp.data || { loops: [] };
  const counts = {}; (d.loops || []).forEach((x) => { counts[x.kind] = (counts[x.kind] || 0) + 1; });
  const list = filtered();
  root.innerHTML = `<p class="wz-help">${L("Loops largos: bases de batería, bajos, melodías o voces de varios compases. Al cargarlos los <b>escucho</b> (tempo, compases, tonalidad, tipo y dónde está cada golpe) y escribo el código para que suenen <b>a tu tempo</b> y <b>sin repetirse</b>. Maestro también los conoce.",
    "Long loops: drum beats, basslines, melodies or vocals that last several bars. When you load them I <b>listen</b> to them (tempo, bars, key, type and where each hit is) and write the code so they play <b>at your tempo</b> and <b>without repeating</b>. Maestro knows them too.")}</p>
    <div class="lp-drop" data-lp="drop">
      ${icon("upload", 26)}
      <div><b>${L("Suelta aquí tus loops", "Drop your loops here")}</b><span class="hint">${L("Archivos, carpetas enteras o un .zip (WAV, AIFF, FLAC, OGG, MP3)", "Files, whole folders or a .zip (WAV, AIFF, FLAC, OGG, MP3)")}</span></div>
      <label class="file-btn">${icon("file", 14)} ${L("Elegir archivos", "Choose files")}<input type="file" data-lp="pick" multiple accept=".wav,.aif,.aiff,.flac,.ogg,.mp3,.zip,audio/*"></label>
      <label class="file-btn">${icon("folder", 14)} ${L("Elegir carpeta", "Choose folder")}<input type="file" data-lp="pick" webkitdirectory multiple></label>
    </div>
    <div class="lp-progress">${lp.job ? "" : ""}</div>
    ${d.error ? `<p class="hint">Error: ${esc(d.error)}</p>` : ""}
    <div class="lp-tools">
      <div class="sm-types"><button data-lp="kind" data-k="" class="${lp.kind ? "" : "active"}">${L("Todos", "All")} <span>${(d.loops || []).length}</span></button>${KINDS.filter((k) => counts[k.id]).map((k) => `<button data-lp="kind" data-k="${k.id}" class="${lp.kind === k.id ? "active" : ""}" style="--k:var(--k-${k.track})">${esc(L(k.es, k.en))} <span>${counts[k.id]}</span></button>`).join("")}</div>
      <input data-lp="q" value="${esc(lp.q)}" placeholder="${L("Buscar: dembow, Am…", "Search: dembow, Am…")}">
      <span class="hint">${L(`Tu canción: <b>${ctx.state.bpm} BPM</b> · los más cercanos primero`, `Your song: <b>${ctx.state.bpm} BPM</b> · closest first`)}</span>
      <button data-lp="scan" title="${esc(L("Analiza los sonidos largos que ya tenías en la biblioteca", "Analyses the long sounds already in your library"))}">${icon("search", 13)} ${L("Buscar loops en mi biblioteca", "Find loops in my library")}</button>
    </div>
    <div class="lp-list">${list.length ? list.map(cardHTML).join("") : `<p class="hint">${(d.loops || []).length ? L("Ningún loop con ese filtro.", "No loops match that filter.") : L("Todavía no hay loops. Suelta aquí los que has descargado (o un zip con un pack entero).", "No loops yet. Drop the ones you downloaded here (or a zip with a whole pack).")}</p>`}</div>`;
  paintJob();
  root.querySelectorAll("canvas.lp-wave").forEach((c) => paintWave(c, list.find((x) => x.ref === c.dataset.ref)));
}
function paintWave(c, x) {
  if (!x) return;
  const g = c.getContext("2d"), W = c.width, H = c.height, open = lp.open === x.ref;
  const css = getComputedStyle(c);
  const ink = css.getPropertyValue("--ink-3").trim() || "#888", accent = css.getPropertyValue("--k").trim();
  g.clearRect(0, 0, W, H);
  const p = plan(x.ref, x, ctx.state.bpm);
  // compases y trozos
  if (open) {
    g.fillStyle = "rgba(127,127,127,.08)";
    for (let i = 0; i < p.slices; i++) if (i % 2 === 0) g.fillRect(i * W / p.slices, 0, W / p.slices, H);
  }
  g.strokeStyle = "rgba(127,127,127,.45)"; g.lineWidth = 1;
  const nb = Math.round(p.bars);
  if (p.bars >= 1 && Math.abs(p.bars - nb) < 0.01) for (let i = 1; i < nb; i++) { const xx = Math.round(i * W / nb) + 0.5; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H); g.stroke(); }
  // la onda
  const w = x.wave || [];
  const col = getComputedStyle(c.closest(".lp-card") || c).getPropertyValue("--k").trim();
  g.fillStyle = col.startsWith("var") ? ink : (col || accent || ink);
  const bw = W / (w.length || 1);
  w.forEach((v, i) => { const h = Math.max(1, v / 100 * (H - 6)); g.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 1), h); });
  if (!w.length) { g.fillStyle = ink; g.font = "13px sans-serif"; g.fillText(L("Analizando…", "Analysing…"), 8, H / 2 + 4); }
  // golpes
  if (open) {
    const hitCol = { k: "#c2410c", s: "#2563eb", h: "#0d9488" };
    (x.slice_hits || []).forEach((h, i) => { if (!h) return; g.fillStyle = hitCol[h]; g.beginPath(); g.arc((i + 0.5) * W / p.slices, 8, 4, 0, 7); g.fill(); });
    g.fillStyle = "rgba(0,0,0,.35)";
    (x.onsets || []).forEach((o) => g.fillRect(Math.round(o * W), H - 6, 2, 6));
    if ((lp.mode[x.ref] || "fit") === "section") {
      const [a, b] = lp.bars[x.ref] || [0, Math.min(1, p.bars)];
      g.fillStyle = "rgba(37,99,235,.15)"; g.fillRect(a / p.bars * W, 0, (b - a) / p.bars * W, H);
    }
  }
}

// ------------------------------------------------------------------ montar y eventos
export function mountLoops(el) {
  root = el;
  if (!lp.data) { root.innerHTML = `<p class="hint">${L("Cargando loops…", "Loading loops…")}</p>`; loadLoops().then(render); } else render();
  el.addEventListener("click", onClick);
  el.addEventListener("input", onInput);
  el.addEventListener("change", onChange);
  el.addEventListener("submit", onSubmit);
  el.addEventListener("dragover", (e) => { if (isFileDrag(e)) { e.preventDefault(); e.stopPropagation(); el.querySelector(".lp-drop")?.classList.add("over"); } });
  el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.querySelector(".lp-drop")?.classList.remove("over"); });
  el.addEventListener("drop", async (e) => { if (!isFileDrag(e)) return; e.preventDefault(); e.stopPropagation(); el.querySelector(".lp-drop")?.classList.remove("over"); loadFiles(await filesFromDrop(e.dataTransfer)); });
}
const loopOf = (el) => { const c = el.closest(".lp-card"); return c && (lp.data?.loops || []).find((x) => x.ref === c.dataset.ref); };
async function onClick(e) {
  const b = e.target.closest("[data-lp]"); if (!b || b.tagName === "INPUT" || b.tagName === "FORM") return;
  const a = b.dataset.lp, x = loopOf(b);
  if (a === "kind") { lp.kind = b.dataset.k; return render(); }
  if (a === "scan") { b.disabled = true; b.textContent = L("Analizando…", "Analysing…"); await loadLoops(true); ctx.onLibraryChanged(); return render(); }
  if (!x) return;
  const p = plan(x.ref, x, ctx.state.bpm);
  if (a === "toggle") {
    stopLoop(); lp.open = lp.open === x.ref ? null : x.ref; render();
    if (lp.open) root.querySelector(".lp-card.open")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  if (a === "mode") { stopLoop(); lp.mode[x.ref] = b.dataset.m; return render(); }
  if (a === "hear") return playLoop(x, b.dataset.m === "vary" ? "vary" : b.dataset.m, b);
  if (a === "bar") {
    const i = +b.dataset.b, cur = lp.bars[x.ref] || [0, 1];
    lp.bars[x.ref] = e.shiftKey ? [Math.min(cur[0], i), Math.max(cur[1], i + 1)] : [i, Math.min(p.bars, i + 1)];
    stopLoop(); return render();
  }
  if (a === "slice") { playSlice(x, +b.dataset.i); const cur = lp.seq[x.ref]; lp.seq[x.ref] = (cur === undefined || lp.seqFresh !== x.ref ? "" : cur + " ") + b.dataset.i; lp.seqFresh = x.ref; return render(); }
  if (a === "seq-clear") { lp.seq[x.ref] = ""; lp.seqFresh = x.ref; return render(); }
  if (a === "seq-orig") { delete lp.seq[x.ref]; lp.seqFresh = null; return render(); }
  if (a === "seq-shuffle") {
    const idx = [...Array(p.slices).keys()];
    // mezcla con sentido: se mantienen los trozos en tiempos fuertes (cada 4) y se barajan los demás
    const weak = idx.filter((i) => i % 4), sh = [...weak].sort(() => Math.random() - 0.5);
    lp.seq[x.ref] = idx.map((i) => (i % 4 ? sh.shift() : i)).join(" "); lp.seqFresh = null; return render();
  }
  if (a === "song-bpm") { ctx.setBpm(Math.round(x.bpm)); return render(); }
  if (a === "add") {
    const mode = b.dataset.m;
    let code = p.fit, what = "";
    if (mode === "vary") { code = p.vary(); what = L(" con variaciones", " with variations"); }
    if (mode === "section") { const [s0, s1] = lp.bars[x.ref] || [0, Math.min(1, p.bars)]; code = p.section(s0, s1); what = L(` (compás ${s0 + 1}${s1 - s0 > 1 ? `-${s1}` : ""})`, ` (bar ${s0 + 1}${s1 - s0 > 1 ? `-${s1}` : ""})`); }
    if (mode === "slices") { code = p.splice(seqOf(x)); what = L(" con tus trozos", " with your slices"); }
    stopLoop();
    ctx.addLoopTrack(x, code, what, p);
  }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.lp === "q") { lp.q = t.value; clearTimeout(lp.qT); lp.qT = setTimeout(() => { render(); const i = root.querySelector('[data-lp="q"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
  if (t.dataset.lp === "seq") { const x = loopOf(t); lp.seq[x.ref] = t.value; lp.seqFresh = x.ref; const c = t.closest(".lp-card").querySelector(".lp-code"); if (c) c.textContent = plan(x.ref, x, ctx.state.bpm).splice(t.value); }
}
function onChange(e) {
  if (e.target.dataset.lp === "pick") { const files = [...e.target.files].map((file) => ({ file, path: file.webkitRelativePath || file.name })); e.target.value = ""; loadFiles(files); }
}
async function onSubmit(e) {
  if (e.target.dataset.lp !== "fix") return;
  e.preventDefault();
  const f = e.target, x = loopOf(f);
  const body = { name: x.name, index: x.index, kind: f.kind.value, key: f.key.value.trim() };
  if (+f.bpm.value && +f.bpm.value !== +x.bpm) body.bpm = +f.bpm.value;
  else if (+f.bars.value && +f.bars.value !== +x.bars) body.bars = +f.bars.value;
  try { lp.data = await ctx.api(`/api/loops/edit?bpm=${ctx.state.bpm}`, body); render(); ctx.onLibraryChanged(); } catch (err) { ctx.toast(err.message); }
}
