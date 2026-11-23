// «Importar canción»: coge un MIDI (o un audio, con herramientas opcionales) y lo convierte en pistas de
// Tidal y en un resumen (tempo, tonalidad, acordes, estructura, groove) para crear una canción NUEVA
// inspirada en ella con Maestro. Todo pasa en este ordenador; no se sube nada.
import { L, LANG } from "./i18n.js";
import { icon } from "./icons.js";
import { courseById } from "./courses.js";

const MIDI_EXT = /\.(mid|midi|kar|rmi)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a|aiff?)$/i;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const msg = (s) => { const [es, en] = String(s || "").split("|"); return LANG === "en" && en ? en : es; };
const KIND_ICON = { percusion: "percusion", bajo: "bajo", armonia: "armonia", melodia: "melodia", textura: "textura" };

let ctx = null; // {body, kicker, open, close, adopt, evalCode, hush}
let cur = null; // {name, midi: Uint8Array, start, bars, result, fromAudio, off:Set}
let polling = null;
// «Generar desde mi MIDI»: estilo elegido, qué te quedas de tu MIDI y la versión (semilla)
let gen = { style: "merengue", keep: new Set(["melody", "chords"]), seed: 1, result: null };
let lastMidi = null; // el último MIDI que has cargado (para generar otra vez sin volver a elegirlo)
let mode = "import"; // "generate": tras leer el MIDI se va directo a elegir estilo

// Estilos que sabe generar (los mismos que los cursos de género: de ahí salen las baterías)
export const GEN_STYLES = ["merengue", "salsa", "cumbia", "reggaeton", "bossa", "jazz", "funk", "house", "techno", "dnb", "lofi"];
const ROLE_TXT = () => ({
  melody: [L("Melodía", "Melody"), L("Tu melodía nota por nota, con un instrumento del estilo.", "Your melody note for note, on one of the style's instruments.")],
  chords: [L("Acordes", "Chords"), L("Tus acordes, tocados como los toca el estilo.", "Your chords, played the way the style plays them.")],
  bass: [L("Bajo", "Bass"), L("Tu línea de bajo tal cual (si no, uno del estilo sobre tus acordes).", "Your bass line as is (otherwise a style bass over your chords).")],
  drums: [L("Batería", "Drums"), L("Tu batería (si no, la del estilo).", "Your drums (otherwise the style's).")],
  tempo: [L("Tempo", "Tempo"), L("Tu velocidad en vez de la típica del estilo.", "Your speed instead of the style's usual one.")],
});
const ORIGIN = () => ({ midi: L("de tu MIDI", "from your MIDI"), style: L("del estilo", "style"), new: L("nuevo", "new") });

export function openImport(c, opts = {}) {
  ctx = c; cur = null; stopPoll();
  mode = opts.generate ? "generate" : "import";
  if (opts.style && GEN_STYLES.includes(opts.style)) gen.style = opts.style;
  gen.result = null; gen.seed = 1;
  ctx.kicker.innerHTML = mode === "generate" ? icon("wand", 16) + " " + L("Generar desde mi MIDI", "Generate from my MIDI") : icon("upload", 16) + " " + L("Importar canción", "Import a song");
  if (opts.useLast && lastMidi) {
    cur = { name: lastMidi.name, midi: lastMidi.midi, start: null, bars: 4, fromAudio: false, off: new Set() };
    ctx.open();
    return analyse();
  }
  pickView();
  ctx.open();
}
export const hasLastMidi = () => !!lastMidi;
export function rememberMidi(name, midi) { lastMidi = { name, midi }; }

function stopPoll() { if (polling) { clearTimeout(polling); polling = null; } }

function pickView(err = "") {
  const g = mode === "generate";
  ctx.body.innerHTML = `<h2 class="q" style="font-size:26px;margin:4px 0">${g ? L("Sube tu MIDI y elige un estilo", "Upload your MIDI and pick a style") : L("Usa una canción como punto de partida", "Use a song as a starting point")}</h2>
    <p class="wz-help">${g ? L("Me quedo con lo que quieras de tu MIDI (melodía, acordes, bajo, batería) y escribo el resto en el estilo que elijas: merengue, salsa, bossa, jazz, house… Luego Maestro te ayuda a variarlo y a convertirlo en una canción entera.", "I keep whatever you want from your MIDI (melody, chords, bass, drums) and write the rest in the style you pick: merengue, salsa, bossa, jazz, house… Then Maestro helps you vary it and turn it into a whole song.")
      : L("La convierto en pistas de Tidal que puedes tocar y editar, y saco su receta: tempo, tonalidad, acordes, estructura y groove. Luego Maestro te ayuda a crear una canción <b>nueva</b> inspirada en ella.", "I turn it into Tidal tracks you can play and edit, and pull out its recipe: tempo, key, chords, structure and groove. Then Maestro helps you create a <b>new</b> song inspired by it.")}</p>
    <label class="imp-drop" tabindex="0">
      <input type="file" accept="${g ? ".mid,.midi,.kar,.rmi" : ".mid,.midi,.kar,.rmi,.mp3,.wav,.flac,.ogg,.m4a,.aif,.aiff"}" hidden>
      ${icon("upload", 30)}
      <b>${L("Arrastra aquí un archivo o pulsa para elegirlo", "Drop a file here or click to choose it")}</b>
      <span>${L("MIDI (.mid): rápido y exacto.", "MIDI (.mid): fast and exact.")} ${g ? L("Expórtalo desde GarageBand, Logic, MuseScore o Ableton.", "Export it from GarageBand, Logic, MuseScore or Ableton.") : L("Audio (mp3, wav, flac, m4a): aproximado; la primera vez instala herramientas extra.", "Audio (mp3, wav, flac, m4a): approximate; the first time it installs extra tools.")}</span>
    </label>
    ${err ? `<p class="imp-err">${esc(err)}</p>` : ""}
    <div class="imp-tips">
      <div>${icon("check", 14)} ${L("<b>¿Dónde encuentro MIDIs?</b> Muchas canciones tienen MIDI gratis en internet; también puedes exportarlo desde GarageBand, Logic, MuseScore o Ableton.", "<b>Where do I find MIDIs?</b> Many songs have free MIDI files online; you can also export one from GarageBand, Logic, MuseScore or Ableton.")}</div>
      <div>${icon("check", 14)} ${L("<b>Privado:</b> el archivo no sale de tu ordenador. Úsalo para estudiar; si la canción no es tuya, no publiques la copia, publica lo nuevo que crees.", "<b>Private:</b> the file never leaves your computer. Use it to study; if the song isn't yours, don't publish the copy, publish the new thing you create.")}</div>
    </div>`;
  const drop = ctx.body.querySelector(".imp-drop"), input = drop.querySelector("input");
  input.onchange = () => input.files[0] && takeFile(input.files[0]);
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) takeFile(f); });
}

async function takeFile(f) {
  const name = f.name.replace(/\.[^.]+$/, "");
  if (MIDI_EXT.test(f.name)) {
    cur = { name, midi: new Uint8Array(await f.arrayBuffer()), start: null, bars: 4, fromAudio: false, off: new Set() };
    lastMidi = { name, midi: cur.midi };
    return analyse();
  }
  if (AUDIO_EXT.test(f.name) && mode !== "generate") return audioFlow(f, name);
  pickView(L("Ese tipo de archivo no lo sé leer. Usa un MIDI (.mid) o un audio (mp3, wav, flac, ogg, m4a, aiff).", "I can't read that kind of file. Use a MIDI (.mid) or an audio file (mp3, wav, flac, ogg, m4a, aiff)."));
}

function busyView(title, pct, text, extra = "") {
  ctx.body.innerHTML = `<h2 class="q" style="font-size:24px;margin:4px 0">${esc(title)}</h2>
    <div class="imp-bar"><div style="width:${Math.max(2, Math.min(100, pct))}%"></div></div>
    <p class="wz-help">${esc(text)}</p>${extra}`;
}

async function analyse() {
  busyView(cur.name, 60, L("Leyendo las notas y buscando la receta de la canción…", "Reading the notes and finding the song's recipe…"));
  const q = new URLSearchParams({ name: cur.name, lang: LANG, bars: String(cur.bars) });
  if (cur.start) q.set("start", String(cur.start));
  try {
    const r = await fetch(`/api/import/midi?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: cur.midi });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    cur.result = data; cur.start = data.summary.window.start;
    if (mode === "generate") return genView();
    resultView();
  } catch (e) { pickView(e.message); }
}

// ---------------------------------------------------------------- audio

async function audioFlow(file, name) {
  let st;
  try { st = await (await fetch("/api/import/audio/status")).json(); } catch { st = { ready: false }; }
  if (!st.ready) return toolsView(file, name, st);
  busyView(name, 2, L("Subiendo el audio al estudio (sigue en tu ordenador)…", "Handing the audio to the studio (it stays on your computer)…"));
  try {
    const r = await fetch(`/api/import/audio?${new URLSearchParams({ filename: file.name, lang: LANG })}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
    const job = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(job.error || `Error ${r.status}`);
    pollJob(job.id, name);
  } catch (e) { pickView(e.message); }
}

function pollJob(id, name) {
  stopPoll();
  const tick = async () => {
    let j;
    try { j = await (await fetch(`/api/import/audio/job?id=${encodeURIComponent(id)}`)).json(); } catch { j = null; }
    if (!ctx.isOpen()) return;
    if (!j || j.error && j.state !== "running") return pickView(L("No he podido convertir el audio: ", "Couldn't convert the audio: ") + ((j && j.error) || "?"));
    if (j.state === "done") {
      const bin = atob(j.midi); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      cur = { name, midi: bytes, start: null, bars: 4, fromAudio: true, off: new Set() };
      return analyse();
    }
    busyView(name, j.pct, msg(j.msg), `<p class="hint">${L("Separar instrumentos tarda más o menos lo que dura la canción (algo más en ordenadores sin tarjeta gráfica). Puedes dejar esta ventana abierta.", "Separating the instruments takes about as long as the song (a bit more on computers without a graphics card). You can leave this window open.")}</p>`);
    polling = setTimeout(tick, 1000);
  };
  tick();
}

function toolsView(file, name, st) {
  const inst = st.install || {};
  const running = inst.state === "running";
  ctx.body.innerHTML = `<h2 class="q" style="font-size:24px;margin:4px 0">${L("Para leer audio hacen falta unas herramientas extra", "Reading audio needs a few extra tools")}</h2>
    <p class="wz-help">${L("Con un MIDI no hacen falta. Para un mp3 o wav instalo, una sola vez, tres programas libres que funcionan sin internet en tu ordenador:", "With a MIDI you don't need them. For an mp3 or wav I install, just once, three free programs that run offline on your computer:")}</p>
    <ul class="imp-list">
      <li><b>Demucs</b> ${L("(Meta): separa batería, bajo, voz y el resto.", "(Meta): splits drums, bass, vocals and the rest.")}</li>
      <li><b>basic-pitch</b> ${L("(Spotify): pasa cada instrumento a notas.", "(Spotify): turns each instrument into notes.")}</li>
      <li><b>librosa</b>: ${L("encuentra el pulso y el tempo.", "finds the beat and the tempo.")}</li>
    </ul>
    <p class="hint">${L(`Ocupan unos ${st.size_hint || "1-2 GB"} en ${esc(st.dir || "~/.tidal-studio/audio-tools")} y tardan 5-15 minutos en instalarse. El resultado es aproximado: un esqueleto para estudiar y reinventar, no una copia exacta.`, `They take about ${st.size_hint || "1-2 GB"} in ${esc(st.dir || "~/.tidal-studio/audio-tools")} and 5-15 minutes to install. The result is approximate: a skeleton to study and reinvent, not an exact copy.`)}</p>
    ${running ? `<div class="imp-bar"><div style="width:${Math.max(2, inst.pct || 0)}%"></div></div><p class="wz-help">${esc(msg(inst.msg))}</p>` : ""}
    ${inst.state === "error" ? `<p class="imp-err">${esc(msg(inst.msg))}</p>` : ""}
    <div class="wz-nav"><button data-a="back">${icon("back", 16)} ${L("Elegir otro archivo", "Choose another file")}</button>
      <div class="right"><button data-a="install" class="primary" ${running ? "disabled" : ""}>${icon("download", 14)} ${running ? L("Instalando…", "Installing…") : L("Instalar y convertir", "Install and convert")}</button></div></div>`;
  ctx.body.querySelector(".wz-nav").onclick = async (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "back") { stopPoll(); pickView(); }
    if (a === "install") {
      try { await fetch("/api/import/audio/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* lo enseña el estado */ }
      waitTools(file, name);
    }
  };
  if (running) waitTools(file, name);
}

function waitTools(file, name) {
  stopPoll();
  polling = setTimeout(async () => {
    if (!ctx.isOpen()) return;
    let st; try { st = await (await fetch("/api/import/audio/status")).json(); } catch { st = {}; }
    if (st.ready) return audioFlow(file, name);
    toolsView(file, name, st);
  }, 1500);
}

// ---------------------------------------------------------------- resultado

function resultView() {
  const { summary: s, tracks } = cur.result;
  const k = s.key;
  const keyTxt = k ? `${k.name}${k.mode === "minor" ? L(" (menor)", " (minor)") : L(" (mayor)", " (major)")}` : "?";
  const totalBars = s.bars;
  const g = s.groove;
  const groove = [g.swing ? L("con swing", "swung") : L("recto", "straight"),
    g.four_on_floor ? L("bombo en cada pulso (four on the floor)", "kick on every beat (four on the floor)") : g.kicks_per_bar ? L(`${g.kicks_per_bar} bombos por compás`, `${g.kicks_per_bar} kicks per bar`) : L("sin bombo", "no kick")].join(" · ");
  const prog = s.progression.slice(0, 8).map((c, i) => `<span class="imp-chord"><b>${esc(c)}</b><small>${esc(s.roman[i] || "")}</small></span>`).join("");
  const bpmNote = Math.round(s.studio_bpm) !== Math.round(s.bpm) ? L(` (en el estudio ${s.studio_bpm}, para que cada ciclo sea un compás de ${s.meter})`, ` (${s.studio_bpm} in the studio, so each cycle is one ${s.meter} bar)`) : "";
  const w = s.window;
  ctx.body.innerHTML = `<h2 class="q" style="font-size:24px;margin:4px 0">${esc(cur.name)}</h2>
    ${s.from_audio ? `<p class="hint">${L("Viene de un audio: es una aproximación. Escúchala y corrige lo que no cuadre; para inspirarte sobra.", "It comes from an audio file: it's an approximation. Listen and fix what doesn't fit; it's plenty for inspiration.")}</p>` : ""}
    <div class="imp-facts">
      <div><small>${L("Tempo", "Tempo")}</small><b>${s.bpm} BPM</b><span>${esc(bpmNote)}</span></div>
      <div><small>${L("Compás", "Meter")}</small><b>${esc(s.meter)}</b><span>${totalBars} ${L("compases", "bars")}</span></div>
      <div><small>${L("Tonalidad", "Key")}</small><b>${esc(keyTxt)}</b></div>
      <div><small>Groove</small><b class="sm">${esc(groove)}</b></div>
    </div>
    <h3>${L("Acordes", "Chords")}</h3><div class="imp-prog">${prog || "—"}</div>
    <h3>${L("Estructura", "Structure")} <span class="hint">${L("· pulsa una parte para cargar ese trozo", "· click a part to load that section")}</span></h3>
    <div class="timeline imp-sections">${s.sections.map((x) => `<div role="button" tabindex="0" data-start="${x.start}" class="${w.start >= x.start && w.start < x.start + x.bars ? "on" : ""}" style="flex:${x.bars}"><b>${esc(x.label)}</b><span>${L("compás", "bar")} ${x.start} · ${x.bars}</span></div>`).join("")}</div>
    <div class="imp-window">
      <label>${L("Desde el compás", "From bar")} <input type="number" min="1" max="${totalBars}" value="${w.start}" data-w="start"></label>
      <label>${L("Compases", "Bars")} <select data-w="bars">${[1, 2, 4, 8, 16].map((n) => `<option ${n === w.bars ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <span class="hint">${L("Acordes del trozo:", "Section chords:")} ${esc(w.chords.join(" "))}</span>
    </div>
    <h3>${L("Pistas de Tidal", "Tidal tracks")} <span class="hint">${L("· quita las que no quieras", "· untick the ones you don't want")}</span></h3>
    <div class="imp-tracks">${tracks.map((t, i) => `<label class="imp-track k-${esc(t.tipo)}"><input type="checkbox" data-i="${i}" ${cur.off.has(i) ? "" : "checked"}>${icon(KIND_ICON[t.tipo] || "textura", 16)}<b>${esc(t.nombre)}</b><code>${esc(t.codigo)}</code></label>`).join("")}</div>
    ${s.dropped && s.dropped.length ? `<p class="hint">${L("No caben más de 12 pistas; he dejado fuera: ", "Only 12 tracks fit; I left out: ")}${esc(s.dropped.join(", "))}</p>` : ""}
    <div class="wz-nav">
      <button data-a="back">${icon("back", 16)} ${L("Otro archivo", "Another file")}</button>
      <div class="right">
        <button data-a="listen">${icon("speaker", 14)} ${L("Escuchar", "Listen")}</button>
        <button data-a="study">${icon("explain", 14)} ${L("Estudiarla tal cual", "Study it as is")}</button>
        <button data-a="inspire">${icon("maestro", 14)} ${L("Crear algo nuevo con Maestro", "Create something new with Maestro")}</button>
        <button data-a="generate" class="primary">${icon("wand", 14)} ${L("Generar en un estilo…", "Generate in a style…")}</button>
      </div>
    </div>`;
  const B = ctx.body;
  B.querySelectorAll(".imp-sections [data-start]").forEach((d) => {
    const go = () => { cur.start = +d.dataset.start; analyse(); };
    d.onclick = go; d.onkeydown = (e) => { if (e.key === "Enter") go(); };
  });
  B.querySelector("[data-w=start]").onchange = (e) => { cur.start = Math.max(1, Math.min(totalBars, +e.target.value || 1)); analyse(); };
  B.querySelector("[data-w=bars]").onchange = (e) => { cur.bars = +e.target.value; analyse(); };
  B.querySelectorAll(".imp-track input").forEach((c) => c.onchange = () => { c.checked ? cur.off.delete(+c.dataset.i) : cur.off.add(+c.dataset.i); });
  B.querySelector(".wz-nav").onclick = (e) => {
    const btn = e.target.closest("button"); const a = btn?.dataset.a;
    if (!a) return;
    if (a === "back") { ctx.hush(); return pickView(); }
    if (a === "generate") { ctx.hush(); return genView(); }
    if (a === "listen") {
      if (btn.dataset.playing) { ctx.hush(); delete btn.dataset.playing; btn.innerHTML = icon("speaker", 14) + " " + L("Escuchar", "Listen"); return; }
      ctx.listen(chosen(), s.studio_bpm);
      btn.dataset.playing = "1"; btn.innerHTML = icon("stop", 14) + " " + L("Parar", "Stop");
      return;
    }
    const picked = chosen();
    if (!picked.length) return;
    ctx.close();
    ctx.adopt({ name: cur.name, bpm: s.studio_bpm, tracks: picked, reference: cur.result.reference, summary: s, inspire: a === "inspire" });
  };
}

// ---------------------------------------------------------------- generar en un estilo

function styleInfo(id) {
  const c = courseById(id);
  return { name: c ? c.name : id, origin: c ? c.origin : "", bpm: c ? c.bpm : 120, color: c ? c.color : "var(--accent)" };
}

function genView(err = "") {
  const s = cur.result.summary, tracks = cur.result.tracks;
  const has = {
    melody: tracks.some((t) => t.tipo === "melodia" || (t.tipo !== "percusion" && t.tipo !== "bajo" && !/,/.test(t.codigo))),
    chords: (s.window.chords || []).some((c) => c && c !== "-"), bass: tracks.some((t) => t.tipo === "bajo"),
    drums: tracks.some((t) => t.tipo === "percusion"), tempo: true,
  };
  gen.avail = has;
  const R = ROLE_TXT();
  const w = s.window;
  ctx.body.innerHTML = `<h2 class="q" style="font-size:24px;margin:4px 0">${esc(cur.name)}</h2>
    <p class="wz-help">${L(`Compases ${w.start}-${w.start + w.bars - 1} de tu MIDI · ${s.studio_bpm} BPM · ${s.key ? s.key.name : "?"} · ${w.chords.join(" ")}`, `Bars ${w.start}-${w.start + w.bars - 1} of your MIDI · ${s.studio_bpm} BPM · ${s.key ? s.key.name : "?"} · ${w.chords.join(" ")}`)}</p>
    <h3>${L("1. ¿En qué estilo?", "1. In which style?")}</h3>
    <div class="gen-styles" role="radiogroup">${GEN_STYLES.map((id) => { const x = styleInfo(id); return `<button role="radio" aria-checked="${gen.style === id}" data-style="${id}" class="${gen.style === id ? "on" : ""}" style="--c:${x.color}"><b>${esc(x.name)}</b><small>${esc(x.origin)} · ${x.bpm} BPM</small></button>`; }).join("")}</div>
    <h3>${L("2. ¿Qué te quedas de tu MIDI?", "2. What do you keep from your MIDI?")} <span class="hint">${L("· lo demás lo escribo yo en el estilo", "· I write the rest in the style")}</span></h3>
    <div class="gen-keep">${Object.entries(R).map(([k, [t, d]]) => `<label class="${has[k] ? "" : "off"}"><input type="checkbox" data-keep="${k}" ${gen.keep.has(k) && has[k] ? "checked" : ""} ${has[k] ? "" : "disabled"}><b>${esc(t)}</b><span>${has[k] ? esc(d) : L("No hay en este trozo de tu MIDI.", "Not in this section of your MIDI.")}</span></label>`).join("")}</div>
    <div class="imp-window">
      <label>${L("Desde el compás", "From bar")} <input type="number" min="1" max="${s.bars}" value="${w.start}" data-w="start"></label>
      <label>${L("Compases", "Bars")} <select data-w="bars">${[1, 2, 4, 8, 16].map((n) => `<option ${n === w.bars ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <span class="hint">${L("Las melodías nuevas se piensan en frases de 4 compases.", "New melodies are written in 4-bar phrases.")}</span>
    </div>
    ${err ? `<p class="imp-err">${esc(err)}</p>` : ""}
    <div class="wz-nav">
      <button data-a="back">${icon("back", 16)} ${L("Otro archivo", "Another file")}</button>
      <div class="right">${mode === "generate" ? "" : `<button data-a="result">${icon("tracks", 14)} ${L("Ver la canción tal cual", "See the song as is")}</button>`}
        <button data-a="go" class="primary">${icon("wand", 14)} ${L("Generar", "Generate")}</button></div>
    </div>`;
  const B = ctx.body;
  B.querySelector(".gen-styles").onclick = (e) => {
    const b = e.target.closest("[data-style]"); if (!b) return;
    gen.style = b.dataset.style;
    B.querySelectorAll(".gen-styles button").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
  };
  B.querySelectorAll("[data-keep]").forEach((c) => c.onchange = () => { c.checked ? gen.keep.add(c.dataset.keep) : gen.keep.delete(c.dataset.keep); });
  B.querySelector("[data-w=start]").onchange = (e) => { cur.start = Math.max(1, Math.min(s.bars, +e.target.value || 1)); analyse(); };
  B.querySelector("[data-w=bars]").onchange = (e) => { cur.bars = +e.target.value; analyse(); };
  B.querySelector(".wz-nav").onclick = (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (a === "back") { ctx.hush(); return pickView(); }
    if (a === "result") return resultView();
    if (a === "go") { gen.seed = 1; generate(); }
  };
}

async function generate() {
  const st = styleInfo(gen.style);
  busyView(cur.name, 70, L(`Escribiendo tu versión de ${st.name}…`, `Writing your ${st.name} version…`));
  const keep = [...gen.keep].filter((k) => !gen.avail || gen.avail[k]);
  const q = new URLSearchParams({ name: cur.name, lang: LANG, bars: String(cur.bars), start: String(cur.start || ""), style: gen.style, keep: keep.join(","), seed: String(gen.seed) });
  try {
    const r = await fetch(`/api/import/generate?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: cur.midi });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    gen.result = data;
    genResultView();
  } catch (e) { genView(e.message); }
}

function genResultView() {
  const g = gen.result.generated, tracks = gen.result.tracks, O = ORIGIN();
  const st = styleInfo(g.style);
  const kept0 = ["melody", "chords", "bass", "drums"].filter((k) => g.keep.includes(k)).map((k) => ROLE_TXT()[k][0].toLowerCase());
  const and = L(" y ", " and ");
  const kept = kept0.length > 1 ? [kept0.slice(0, -1).join(", ") + and + kept0[kept0.length - 1]] : kept0;
  ctx.body.innerHTML = `<h2 class="q" style="font-size:24px;margin:4px 0">${esc(cur.name)} · ${esc(st.name)}</h2>
    <p class="wz-help">${kept.length ? L(`Me he quedado con tu ${kept.join(", ")} y he escrito el resto como en el ${st.name}.`, `I kept your ${kept.join(", ")} and wrote the rest the ${st.name} way.`) : L(`Solo he usado la tonalidad de tu MIDI; todo lo demás es ${st.name} nuevo.`, `I only used your MIDI's key; everything else is new ${st.name}.`)}</p>
    <div class="imp-facts">
      <div><small>${L("Tempo", "Tempo")}</small><b>${g.bpm} BPM</b><span>${g.keep.includes("tempo") ? L("el de tu MIDI", "your MIDI's") : L(`típico del ${st.name}`, `typical ${st.name}`)}</span></div>
      <div><small>${L("Tonalidad", "Key")}</small><b>${esc(g.key || "?")}</b></div>
      <div style="grid-column: span 2"><small>${L("Acordes", "Chords")}</small><b class="sm">${esc(g.chords.join("  "))}</b></div>
    </div>
    ${g.notes.length ? `<p class="hint">${g.notes.map(esc).join(" ")}</p>` : ""}
    <div class="imp-tracks gen-tracks">${tracks.map((t) => `<div class="imp-track k-${esc(t.tipo)}">${icon(KIND_ICON[t.tipo] || "textura", 16)}<b>${esc(t.nombre)}</b><em class="gen-o gen-${esc(t.origen)}">${esc(O[t.origen] || "")}</em><code>${esc(t.codigo)}</code><span class="gen-why">${esc(t.explicacion)}</span></div>`).join("")}</div>
    <div class="wz-nav">
      <button data-a="back">${icon("back", 16)} ${L("Cambiar estilo", "Change style")}</button>
      <div class="right">
        <button data-a="listen">${icon("speaker", 14)} ${L("Escuchar", "Listen")}</button>
        <button data-a="again">${icon("dice", 14)} ${L("Otra versión", "Another version")}</button>
        <button data-a="use" class="primary">${icon("check", 14)} ${L("Usar esta versión", "Use this version")}</button>
      </div>
    </div>`;
  ctx.body.querySelector(".wz-nav").onclick = (e) => {
    const btn = e.target.closest("button"); const a = btn?.dataset.a;
    if (!a) return;
    if (a === "back") { ctx.hush(); return genView(); }
    if (a === "again") { ctx.hush(); gen.seed += 1; return generate(); }
    if (a === "listen") {
      if (btn.dataset.playing) { ctx.hush(); delete btn.dataset.playing; btn.innerHTML = icon("speaker", 14) + " " + L("Escuchar", "Listen"); return; }
      ctx.listen(tracks, g.bpm);
      btn.dataset.playing = "1"; btn.innerHTML = icon("stop", 14) + " " + L("Parar", "Stop");
      return;
    }
    if (a === "use") {
      ctx.close();
      ctx.adopt({ name: `${cur.name} (${st.name})`, bpm: g.bpm, tracks: tracks.map((t) => ({ nombre: t.nombre, tipo: t.tipo, codigo: t.codigo })),
        reference: gen.result.reference, summary: gen.result.summary, generated: { ...g, tracks } });
    }
  };
}

// Texto de Maestro tras usar una versión generada
export function generatedSummary(g, name) {
  const st = styleInfo(g.style);
  const lines = g.tracks.map((t) => `• ${t.nombre}: ${t.explicacion}`).join("\n");
  return L(`Aquí tienes «${name}» en ${st.name}, a ${g.bpm} BPM sobre ${g.chords.join(" → ")}.\n\n${lines}\n\n¿Otra melodía u otro estilo? Pulsa «Generar otra versión». Si te gusta, pídeme que la convierta en una canción entera.`,
    `Here's «${name}» as ${st.name}, at ${g.bpm} BPM over ${g.chords.join(" → ")}.\n\n${lines}\n\nWant another melody or style? Press «Generate another version». If you like it, ask me to turn it into a whole song.`);
}
export const GEN_AGAIN_CHIP = () => L("Generar otra versión", "Generate another version");
export const GEN_SONG_CHIP = () => L("Conviértela en una canción entera", "Turn it into a whole song");
export const GEN_SONG_PROMPT = (g) => L(`Convierte esta versión de ${styleInfo(g.style).name} en una canción entera (intro, estrofa, estribillo, puente y final) con la pestaña Arreglo. Mantén lo que he decidido conservar de mi MIDI y varía lo demás en cada parte.`,
  `Turn this ${styleInfo(g.style).name} version into a whole song (intro, verse, chorus, bridge and ending) using the Arrangement tab. Keep what I chose to keep from my MIDI and vary the rest in each part.`);

const chosen = () => cur.result.tracks.filter((_, i) => !cur.off.has(i)).map((t) => ({ nombre: t.nombre, tipo: t.tipo, codigo: t.codigo }));

// Texto del primer mensaje de Maestro tras importar
export function importedSummary(s, n) {
  const k = s.key ? s.key.name : "?";
  return L(`He importado «${s.name}» como punto de partida: ${n} ${n === 1 ? "pista" : "pistas"} con los compases ${s.window.start}-${s.window.start + s.window.bars - 1}.\n\nSu receta: ${s.bpm} BPM, compás ${s.meter}, tonalidad ${k}, acordes ${s.progression.slice(0, 4).join(" → ") || "?"} (${s.roman.slice(0, 4).join(" ")}), estructura ${s.sections.map((x) => x.label).join(" ")}.`,
    `I imported «${s.name}» as a starting point: ${n} ${n === 1 ? "track" : "tracks"} with bars ${s.window.start}-${s.window.start + s.window.bars - 1}.\n\nIts recipe: ${s.bpm} BPM, ${s.meter} time, key of ${k}, chords ${s.progression.slice(0, 4).join(" → ") || "?"} (${s.roman.slice(0, 4).join(" ")}), structure ${s.sections.map((x) => x.label).join(" ")}.`);
}
export const INSPIRE_PROMPT = () => L("Crea una canción nueva inspirada en la referencia que he importado: quédate con lo que la hace funcionar (tempo, groove, tipo de progresión, energía) pero con melodía, acordes o instrumentos nuevos, para que sea mía. Explícame qué tomas prestado y qué cambias.",
  "Create a new song inspired by the reference I imported: keep what makes it work (tempo, groove, kind of progression, energy) but with a new melody, chords or instruments, so it's mine. Tell me what you borrow and what you change.");
