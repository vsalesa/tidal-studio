import { L } from "./i18n.js";
import { BUILTIN, swapSound, guessType } from "./samples.js";
import { cardHTML, isSongCard } from "./card.js";
// Controles visuales dentro del chat de Maestro ("agentic UI"):
// deslizadores, BPM, selectores y un secuenciador por pasos que ESCRIBEN el código Tidal mientras los mueves,
// para que veas qué palabra cambia y aprendas qué hace.

// ------------------------------------------------------------------ parámetros conocidos
export const PARAMS = {
  gain: { min: 0, max: 1.5, step: 0.05, def: 1, es: "Volumen", en: "Volume", ex: ["1 es normal; por encima, más fuerte.", "1 is normal; above it, louder."] },
  lpf: { min: 100, max: 12000, step: 1, def: 12000, log: true, es: "Brillo (filtro paso bajo)", en: "Brightness (low-pass filter)", ex: ["Quita los agudos por encima de este número (Hz): más bajo = más oscuro y apagado.", "Removes the highs above this number (Hz): lower = darker and duller."] },
  hpf: { min: 0, max: 4000, step: 10, def: 0, es: "Quitar graves (paso alto)", en: "Cut lows (high-pass)", ex: ["Quita los graves por debajo de este número (Hz): deja sitio al bombo y al bajo.", "Removes the lows below this number (Hz): makes room for kick and bass."] },
  room: { min: 0, max: 1, step: 0.01, def: 0, es: "Reverb (sala)", en: "Reverb (room)", ex: ["Cuánto suena la sala: 0 seco, 1 catedral.", "How much room you hear: 0 dry, 1 cathedral."] },
  size: { min: 0, max: 1, step: 0.01, def: 0.5, es: "Tamaño de la sala", en: "Room size", ex: ["Lo grande que es la sala de la reverb.", "How big the reverb room is."] },
  delay: { min: 0, max: 1, step: 0.01, def: 0, es: "Eco", en: "Echo", ex: ["Cantidad de eco.", "Amount of echo."] },
  delaytime: { min: 0.0625, max: 1, step: 0.0625, def: 0.25, es: "Tiempo del eco", en: "Echo time", ex: ["Distancia entre ecos, en partes del ciclo (0.25 = un tiempo).", "Distance between echoes, in parts of the cycle (0.25 = one beat)."] },
  delayfeedback: { min: 0, max: 0.95, step: 0.01, def: 0.4, es: "Repeticiones del eco", en: "Echo repeats", ex: ["Cuántas veces vuelve el eco.", "How many times the echo comes back."] },
  pan: { min: 0, max: 1, step: 0.01, def: 0.5, es: "Panorama (izquierda-derecha)", en: "Pan (left-right)", ex: ["0 izquierda, 0.5 centro, 1 derecha.", "0 left, 0.5 centre, 1 right."] },
  speed: { min: -2, max: 3, step: 0.05, def: 1, es: "Velocidad del sample", en: "Sample speed", ex: ["2 = una octava más agudo y más corto; negativo = al revés.", "2 = an octave higher and shorter; negative = backwards."] },
  crush: { min: 1, max: 16, step: 0.5, def: 16, es: "Bitcrush (sonido digital)", en: "Bitcrush (digital sound)", ex: ["Menos bits = más sucio y 'videojuego'. 16 es limpio.", "Fewer bits = dirtier, more 'video game'. 16 is clean."] },
  shape: { min: 0, max: 0.9, step: 0.01, def: 0, es: "Saturación", en: "Saturation", ex: ["Calienta y ensucia el sonido.", "Warms up and dirties the sound."] },
  legato: { min: 0.1, max: 2, step: 0.05, def: 1, es: "Duración de las notas", en: "Note length", ex: ["1 = cada nota dura hasta la siguiente; menos = más cortas.", "1 = each note lasts until the next; less = shorter."] },
  resonance: { min: 0, max: 0.6, step: 0.01, def: 0, es: "Resonancia del filtro", en: "Filter resonance", ex: ["Realza la frecuencia del filtro: suena 'acid'.", "Boosts the filter frequency: sounds 'acid'."] },
  coarse: { min: 1, max: 32, step: 1, def: 1, es: "Reducir resolución", en: "Downsample", ex: ["Más alto = más áspero.", "Higher = rougher."] },
};
const isNum = (v) => typeof v === "number" && isFinite(v);

// ------------------------------------------------------------------ leer y escribir parámetros "# param valor" de nivel superior
function topLevelMatches(code, re) {
  const out = [];
  let depth = 0, q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (q) continue;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && ch === "#") {
      const m = code.slice(i).match(re);
      if (m) out.push({ index: i, m });
    }
  }
  return out;
}
const paramRe = (p) => new RegExp(`^#\\s*${p}\\s+(-?[\\d.]+|\\(\\s*-[\\d.]+\\s*\\)|"[^"]*")(?![\\w(])`);
export function getParam(code, p) {
  const ms = topLevelMatches(code, paramRe(p));
  if (!ms.length) return null;
  const v = ms[ms.length - 1].m[1];
  return v.startsWith('"') ? v.slice(1, -1) : parseFloat(v.replace(/[()\s]/g, ""));
}
export function setParam(code, p, v) {
  return setParamRaw(code, p, typeof v === "number" ? codeNum(v) : `"${v}"`);
}
export const fmt = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000));
// Un número negativo en el código de Tidal va entre paréntesis: «# eqlow -3» Haskell lo lee como «eqlow menos 3»
// y da un error que nombra eqlow; «# eqlow (-3)» es lo correcto.
export const codeNum = (v) => (v < 0 ? `(${fmt(v)})` : fmt(v));
// Arregla «# param -3» → «# param (-3)» en código ya escrito (por la IA, el alumno o versiones anteriores)
export const fixNegatives = (code) => String(code || "").replace(/(#\s*[A-Za-z]\w*\s+)-(\d+(?:\.\d+)?)(?![\w.(])/g, "$1(-$2)");

// ------------------------------------------------------------------ secuenciador: patrón de s "…" ↔ rejilla
function topTokens(pat) {
  const out = []; let cur = "", depth = 0;
  for (const ch of pat.trim()) {
    if ("[<{(".includes(ch)) depth++;
    if ("]>})".includes(ch)) depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
// Devuelve [{t, snd}] con t en [0,1) o null si el patrón es demasiado complejo para la rejilla
export function flatten(pat, start = 0, len = 1) {
  const toks = topTokens(pat);
  if (!toks.length) return [];
  const step = len / toks.length;
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    let tok = toks[i];
    const t0 = start + i * step;
    let rep = 1;
    const mm = tok.match(/^(.*)\*(\d+)$/);
    if (mm) { tok = mm[1]; rep = +mm[2]; }
    for (let r = 0; r < rep; r++) {
      const ts = t0 + (r * step) / rep, sl = step / rep;
      if (tok === "~") continue;
      const g = tok.match(/^\[(.*)\]$/);
      if (g) { const sub = flatten(g[1], ts, sl); if (!sub) return null; out.push(...sub); continue; }
      if (!/^[A-Za-z0-9_]+(:\d+)?$/.test(tok)) return null; // < > ? ( ) / ! … no caben en una rejilla simple
      out.push({ t: ts, snd: tok });
    }
  }
  return out;
}
export function gridFrom(code, n) {
  const m = code.match(/\b(s|sound)\s+"([^"]*)"/);
  if (!m) return null;
  const ev = flatten(m[2]);
  if (!ev) return { complex: true, rows: [], cells: [] };
  const cells = Array(n).fill(null);
  for (const e of ev) {
    const k = e.t * n;
    if (Math.abs(k - Math.round(k)) > 1e-6) return { complex: true, rows: [], cells: [] };
    cells[Math.round(k)] = e.snd;
  }
  const rows = [...new Set(cells.filter(Boolean))];
  return { complex: false, rows, cells };
}
export function bestSteps(code) {
  for (const n of [4, 8, 16]) { const g = gridFrom(code, n); if (g && !g.complex) return n === 4 ? 8 : n; }
  return 16;
}
export function gridToCode(code, cells) {
  let toks = cells.map((c) => c || "~");
  // Si los pasos impares están vacíos, se escribe con la mitad de pasos (más fácil de leer)
  while (toks.length > 4 && toks.length % 2 === 0 && toks.every((t, i) => i % 2 === 0 || t === "~")) toks = toks.filter((_, i) => i % 2 === 0);
  const pat = toks.join(" ");
  const re = /\b(s|sound)\s+"([^"]*)"/;
  return re.test(code) ? code.replace(re, `$1 "${pat}"`) : `s "${pat}"`;
}

// ------------------------------------------------------------------ validar lo que propone la IA
export function normalizeControls(list, tracks) {
  const ids = new Set(tracks.map((t) => t.id));
  const out = [];
  for (const c of list || []) {
    if (!c || typeof c !== "object") continue;
    if (c.tipo === "mezcla") { out.push({ tipo: "mezcla" }); continue; }
    if (c.tipo === "tarjeta") { if (isSongCard(c) || ids.has(c.pista)) out.push({ tipo: "tarjeta", pista: isSongCard(c) ? "cancion" : c.pista, foco: typeof c.foco === "string" ? c.foco.slice(0, 30) : "" }); continue; }
    if (c.tipo === "bpm") { out.push({ tipo: "bpm", min: clamp(c.min ?? 60, 40, 200), max: clamp(c.max ?? 180, 60, 220), etiqueta: c.etiqueta || "" }); continue; }
    if (!ids.has(c.pista)) continue;
    if (c.tipo === "deslizador" && PARAMS[c.param]) {
      const P = PARAMS[c.param];
      out.push({ tipo: "deslizador", pista: c.pista, param: c.param, min: isNum(c.min) ? c.min : P.min, max: isNum(c.max) ? c.max : P.max,
        paso: isNum(c.paso) ? c.paso : P.step, valor: isNum(c.valor) ? c.valor : null, etiqueta: c.etiqueta || "", explica: c.explica || "" });
    } else if (c.tipo === "selector" && Array.isArray(c.opciones) && c.opciones.length) {
      const que = c.que === "param" && PARAMS[c.param] || c.que === "param" && c.param === "vowel" ? "param" : "sonido";
      out.push({ tipo: "selector", pista: c.pista, que, param: c.param, opciones: c.opciones.map(String).filter((o) => /^[\w.:'-]+$/.test(o)).slice(0, 12), etiqueta: c.etiqueta || "", explica: c.explica || "" });
    } else if (EXT_TYPES.includes(c.tipo)) {
      out.push({ tipo: c.tipo, pista: c.pista, funcion: ["degradeBy", "sometimesBy"].includes(c.funcion) ? c.funcion : undefined, param: c.param === "hpf" ? "hpf" : undefined, explica: c.explica || "" });
    } else if (c.tipo === "pasos") {
      out.push({ tipo: "pasos", pista: c.pista, pasos: [8, 16].includes(+c.pasos) ? +c.pasos : 16, sonidos: (c.sonidos || []).map(String).filter((o) => /^[\w:]+$/.test(o)).slice(0, 4), explica: c.explica || "" });
    }
  }
  return out.slice(0, 8);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, +v || a));

// ------------------------------------------------------------------ controles por defecto para una pista
export function controlsFor(t, opts = {}) {
  const out = [];
  const sm = (t.code || "").match(/\b(s|sound)\s+"([^"]*)"/);
  const isPerc = t.kind === "percusion";
  if (sm && isPerc) {
    const g = gridFrom(t.code, 16);
    if (g && !g.complex) {
      const extra = { bd: ["sn", "hh"], sn: ["bd", "hh"], hh: ["bd", "sn"], cp: ["bd", "hh"] };
      const first = (g.rows[0] || "bd").split(":")[0];
      out.push({ tipo: "pasos", pista: t.id, pasos: bestSteps(t.code), sonidos: extra[first] || [] });
    }
  }
  if (sm && !/^super/.test(sm[2].trim())) {
    const cur = (topTokens(sm[2]).find((x) => /^[A-Za-z]/.test(x)) || "").replace(/[*:\[\]].*$/, "").replace(/^\[/, "");
    const type = (BUILTIN.find((b) => b.name === cur) || {}).type || guessType(cur);
    const opts2 = [...new Set([cur, ...BUILTIN.filter((b) => b.type === type && b.type !== "synth").map((b) => b.name), ...(opts.samples || []).filter((x) => x.type === type).map((x) => x.name)])].filter(Boolean).slice(0, 10);
    if (opts2.length > 1) out.push({ tipo: "selector", pista: t.id, que: "sonido", opciones: opts2 });
  }
  const byKind = { percusion: ["gain", "room", "speed"], bajo: ["gain", "lpf", "legato"], armonia: ["gain", "lpf", "room"], melodia: ["gain", "lpf", "delay"], textura: ["gain", "room", "pan"] };
  for (const p of byKind[t.kind] || ["gain", "lpf", "room"]) out.push({ tipo: "deslizador", pista: t.id, param: p, min: PARAMS[p].min, max: PARAMS[p].max, paso: PARAMS[p].step, valor: null });
  const hasN = /\b(n|note)\s+(\(scale\s+"\w+"\s+)?"/.test(t.code);
  if (hasN && /'\w+/.test(t.code)) out.push({ tipo: "acordes", pista: t.id });
  else if (hasN && (t.kind === "bajo" || t.kind === "melodia")) out.push({ tipo: "notas", pista: t.id });
  if (t.kind === "bajo" || t.kind === "melodia" || t.kind === "armonia") out.push({ tipo: "filtro_mov", pista: t.id });
  if (isPerc) out.push({ tipo: "cada", pista: t.id }, { tipo: "azar", pista: t.id, funcion: "degradeBy" });
  if (opts.bpm) out.unshift({ tipo: "bpm", min: 60, max: 180 });
  if (opts.mix) return [{ tipo: "mezcla" }];
  return out;
}

// ------------------------------------------------------------------ pintar
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toPos = (c, v) => (PARAMS[c.param]?.log ? Math.round(1000 * Math.log(Math.max(v, c.min) / c.min) / Math.log(c.max / c.min)) : v);
export const fromPos = (c, p) => (PARAMS[c.param]?.log ? c.min * Math.pow(c.max / c.min, p / 1000) : +p);

export function controlsHTML(ctrls, state, mi) {
  const tr = (id) => state.tracks.find((t) => t.id === id);
  const rows = ctrls.map((c, ci) => {
    if (c.tipo === "tarjeta" && isSongCard(c)) return cardHTML(c, null, state, ci);
    const t = c.pista ? tr(c.pista) : null;
    if (c.tipo === "tarjeta" && t) return cardHTML(c, t, state, ci);
    if (c.pista && !t) return `<div class="ctl off">${L(`La pista ${esc(c.pista)} ya no existe.`, `Track ${esc(c.pista)} no longer exists.`)}</div>`;
    const tag = t ? `<span class="ctl-trk">${esc(t.id)}</span>` : "";
    if (c.tipo === "bpm") {
      return `<div class="ctl" data-c="${ci}"><div class="ctl-top"><b>${esc(c.etiqueta || L("Tempo", "Tempo"))}</b><code class="ctl-code">setcps (${state.bpm}/60/4)</code></div>
        <div class="ctl-row"><input type="range" min="${c.min}" max="${c.max}" step="1" value="${state.bpm}"><output>${state.bpm} BPM</output></div>
        <p class="ctl-ex">${L("Pulsaciones por minuto. Tidal piensa en ciclos por segundo: BPM/60/4 (un ciclo = un compás de 4 tiempos).", "Beats per minute. Tidal thinks in cycles per second: BPM/60/4 (one cycle = one 4-beat bar).")}</p></div>`;
    }
    if (c.tipo === "deslizador") {
      const P = PARAMS[c.param];
      const cur = getParam(t.code, c.param);
      const v = typeof cur === "number" ? cur : c.valor ?? P.def;
      return `<div class="ctl" data-c="${ci}"><div class="ctl-top">${tag}<b>${esc(c.etiqueta || L(P.es, P.en))}</b><code class="ctl-code">${typeof cur === "number" ? `# ${c.param} ${fmt(cur)}` : L(`# ${c.param} (aún no está)`, `# ${c.param} (not there yet)`)}</code></div>
        <div class="ctl-row"><input type="range" min="${P.log ? 0 : c.min}" max="${P.log ? 1000 : c.max}" step="${P.log ? 1 : c.paso}" value="${toPos(c, v)}"><output>${fmt(v)}</output></div>
        <p class="ctl-ex">${esc(c.explica || L(...P.ex))}</p></div>`;
    }
    if (c.tipo === "selector") {
      const curSnd = c.que === "sonido" ? ((t.code.match(/\b(?:s|sound)\s+"([^"]*)"/) || [])[1] || "") : String(getParam(t.code, c.param) ?? "");
      const active = c.opciones.find((o) => (c.que === "sonido" ? topTokens(curSnd).some((x) => x.replace(/^\[/, "").split(/[*:\]]/)[0] === o.split(":")[0]) : o === curSnd));
      return `<div class="ctl" data-c="${ci}"><div class="ctl-top">${tag}<b>${esc(c.etiqueta || (c.que === "sonido" ? L("Sonido", "Sound") : c.param))}</b><code class="ctl-code">${c.que === "sonido" ? `s "${esc(curSnd)}"` : `# ${esc(c.param)} ${esc(curSnd)}`}</code></div>
        <div class="ctl-opts">${c.opciones.map((o) => `<button data-o="${esc(o)}" class="${o === active ? "on" : ""}">${esc(o)}</button>`).join("")}</div>
        <p class="ctl-ex">${esc(c.explica || (c.que === "sonido" ? L("Cambia el sonido sin tocar el ritmo: solo cambian las palabras dentro de las comillas.", "Changes the sound without touching the rhythm: only the words inside the quotes change.") : ""))}</p></div>`;
    }
    if (c.tipo === "pasos") {
      const g = gridFrom(t.code, c.pasos);
      if (!g) return `<div class="ctl off">${tag} ${L("Esta pista no tiene un s \"…\" para el secuenciador.", "This track has no s \"…\" for the sequencer.")}</div>`;
      if (g.complex) return `<div class="ctl off">${tag} ${L("El ritmo de esta pista es demasiado complejo para la rejilla (usa < >, ?, ( ) o /). Edítalo en el código o en la paleta.", "This track's rhythm is too complex for the grid (it uses < >, ?, ( ) or /). Edit it in the code or the palette.")}</div>`;
      // Orden fijo (graves arriba, platos abajo) para que las filas no salten al editar
      const rank = (r) => { const nm = r.split(":")[0]; const t = (BUILTIN.find((b) => b.name === nm) || {}).type || guessType(nm); return { bombo: 0, caja: 1, percusion: 2, platos: 3 }[t] ?? 2.5; };
      const rows = [...new Set([...g.rows, ...(c.sonidos || [])])].slice(0, 4).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      if (!rows.length) rows.push("bd");
      const m = t.code.match(/\b(?:s|sound)\s+"([^"]*)"/);
      return `<div class="ctl" data-c="${ci}"><div class="ctl-top">${tag}<b>${L("Secuenciador", "Sequencer")} · ${c.pasos} ${L("pasos", "steps")}</b><code class="ctl-code">s "${esc(m ? m[1] : "")}"</code></div>
        <div class="seq" style="--n:${c.pasos}">${rows.map((r) => `<div class="seq-row"><span class="seq-name">${esc(r)}</span>${g.cells.map((x, i) =>
          `<button class="seq-cell ${x === r ? "on" : ""} ${i % 4 === 0 ? "beat" : ""}" data-r="${esc(r)}" data-i="${i}" aria-label="${esc(r)} ${i + 1}"></button>`).join("")}</div>`).join("")}</div>
        <p class="ctl-ex">${esc(c.explica || L("Cada casilla es un trozo igual del ciclo. Una casilla vacía se escribe ~ (silencio). Solo suena un sonido por paso.", "Each box is an equal slice of the cycle. An empty box is written ~ (rest). One sound per step."))}</p></div>`;
    }
    return extHTML(c, t, state, ci, tag);
  }).join("");
  return `<div class="ctl-panel" data-m="${mi}"><div class="ctl-head">${L("Controles", "Controls")}<button class="ctl-reset" data-a="ctl-reset" title="${esc(L("Volver a como estaba antes de tocar los controles", "Go back to how it was before using the controls"))}">${L("Restaurar", "Restore")}</button></div>${rows}</div>`;
}


// ================================================================== controles ampliados
export const EXT_TYPES = ["cada", "azar", "swing", "euclides", "filtro_mov", "notas", "acordes"];

// --- envolturas: lo que va antes de "$" (every 4 (fast 2) $ …)
export function splitWraps(code) {
  const parts = []; let last = 0, depth = 0, q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (q) continue;
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (depth === 0 && ch === "$" && code[i - 1] !== "<" && code[i + 1] !== ">") { parts.push(code.slice(last, i).trim()); last = i + 1; }
  }
  return { wraps: parts, body: code.slice(last).trim() };
}
const wrapFn = (w) => (w.match(/^[a-zA-Z']+/) || [""])[0];
export function getWrap(code, fns) {
  return splitWraps(code).wraps.find((w) => fns.includes(wrapFn(w))) || null;
}
export function setWrap(code, fns, w) {
  const { wraps, body } = splitWraps(code);
  const i = wraps.findIndex((x) => fns.includes(wrapFn(x)));
  if (i >= 0) { if (w) wraps[i] = w; else wraps.splice(i, 1); }
  else if (w) wraps.unshift(w);
  return [...wraps, body].join(" $ ");
}

// --- parámetro con expresión: # lpf (range 300 4000 $ slow 4 sine)
function paramSpan(code, p) {
  const ms = topLevelMatches(code, new RegExp(`^#\\s*${p}\\s+`));
  if (!ms.length) return null;
  const { index, m } = ms[ms.length - 1];
  let j = index + m[0].length;
  if (code[j] === "(") { let d = 0; for (; j < code.length; j++) { if (code[j] === "(") d++; if (code[j] === ")") { d--; if (!d) { j++; break; } } } }
  else if (code[j] === '"') { j = code.indexOf('"', j + 1) + 1; }
  else { while (j < code.length && /[\w.\-]/.test(code[j])) j++; }
  return { start: index, end: j, value: code.slice(index + m[0].length, j) };
}
export function setParamRaw(code, p, raw) {
  const sp = paramSpan(code, p);
  if (raw === null) return sp ? (code.slice(0, sp.start).trimEnd() + " " + code.slice(sp.end).trimStart()).trim() : code;
  if (sp) return code.slice(0, sp.start) + `# ${p} ${raw}` + code.slice(sp.end);
  return `${code} # ${p} ${raw}`;
}

const SCALES = ["major", "minor", "dorian", "mixolydian", "majPent", "minPent", "harmonicMinor", "ritusen", "egyptian"];
const CHORDS = ["maj", "min", "maj7", "min7", "dom7", "maj9", "min9", "sus4", "dim"];
const TRANSFORMS = [["fast 2", "fast 2"], ["rev", "rev"], ["(# speed 2)", "# speed 2"], ["(0.25 <~)", "0.25 <~"], ["(# crush 4)", "# crush 4"], ["(jux rev)", "jux rev"]];
const optHTML = (k, opts, cur) => `<div class="ctl-opts" data-k="${k}">${opts.map(([v, label]) => `<button data-o="${esc(v)}" class="${String(v) === String(cur) ? "on" : ""}">${esc(label)}</button>`).join("")}</div>`;
const rangeHTML = (k, min, max, step, v, out) => `<div class="ctl-row"><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${out}</output></div>`;
const box = (ci, tag, title, chip, inner, ex) => `<div class="ctl ext" data-c="${ci}"><div class="ctl-top">${tag}<b>${title}</b><code class="ctl-code">${esc(chip)}</code></div>${inner}<p class="ctl-ex">${ex}</p></div>`;
const nPattern = (code) => code.match(/\b(n|note)\s+(\(scale\s+"(\w+)"\s+)?"([^"]*)"\)?/);

// Valores actuales de cada control, leídos del código
export function extState(c, t) {
  const code = t.code;
  if (c.tipo === "cada") { const w = getWrap(code, ["every"]); const m = w && w.match(/^every\s+"?<?(\d+)>?"?\s+(.*)$/); return { n: m ? +m[1] : 0, f: m ? m[2].trim() : "fast 2", chip: w ? `${w} $` : L("(sin every)", "(no every)") }; }
  if (c.tipo === "azar") { const fn = c.funcion || "degradeBy"; const w = getWrap(code, [fn]); const m = w && w.match(/^\w+\s+([\d.]+)/); return { v: m ? +m[1] : 0, chip: w ? `${w} $` : L(`(sin ${fn})`, `(no ${fn})`) }; }
  if (c.tipo === "swing") { const w = getWrap(code, ["swingBy"]); const m = w && w.match(/^swingBy\s+\(?([\d./]+)\)?/); let v = 0; if (m) { const [a, b] = m[1].split("/"); v = b ? +a / +b : +a; } return { v, chip: w ? `${w} $` : L("(sin swing)", "(no swing)") }; }
  if (c.tipo === "euclides") { const sm = code.match(/\b(?:s|sound)\s+"([^"]*)"/); const m = sm && sm[1].match(/^\s*(\w+(?::\d+)?)\((\d+),(\d+)(?:,(\d+))?\)\s*$/); return { k: m ? +m[2] : 3, n: m ? +m[3] : 8, snd: m ? m[1] : (sm ? (sm[1].match(/[A-Za-z]\w*(:\d+)?/) || ["bd"])[0] : "bd"), on: !!m, chip: sm ? `s "${sm[1]}"` : "" }; }
  if (c.tipo === "filtro_mov") { const p = c.param || "lpf"; const sp = paramSpan(code, p); const m = sp && sp.value.match(/range\s+(\d+)\s+(\d+)\s+\$\s+slow\s+(\d+)\s+(sine|saw|tri|square)/); return { on: !!m, lo: m ? +m[1] : 300, hi: m ? +m[2] : 4000, sl: m ? +m[3] : 4, wave: m ? m[4] : "sine", chip: sp ? `# ${p} ${sp.value}` : L(`(sin # ${p})`, `(no # ${p})`) }; }
  if (c.tipo === "notas") { const m = nPattern(code); const oct = code.match(/\|([+-])\s*n\s+(\d+)/); return { scale: m && m[3] ? m[3] : "", oct: oct ? (oct[1] === "-" ? -1 : 1) * (+oct[2] / 12) : 0, ok: !!m, chip: m ? m[0] : "" }; }
  if (c.tipo === "acordes") { const m = nPattern(code); const q = m && m[4].match(/'(\w+)/); return { q: q ? q[1] : "", ok: !!(m && q), chip: m ? m[0] : "" }; }
  return {};
}

function extHTML(c, t, state, ci, tag) {
  if (c.tipo === "mezcla") {
    return `<div class="ctl ext" data-c="${ci}"><div class="ctl-top"><b>${L("Mezcla", "Mix")}</b></div><div class="mix">${state.tracks.map((x) => { const g = getParam(x.code, "gain"); const v = typeof g === "number" ? g : 1; return `<div class="mix-row" data-id="${esc(x.id)}">
      <button class="mix-mute ${x.muted ? "on" : ""}" data-k="mute" data-o="${esc(x.id)}" title="${esc(L("Silenciar", "Mute"))}">M</button><span class="mix-name"><code>${esc(x.id)}</code> ${esc(x.name)}</span>
      <input type="range" data-k="gain" data-id="${esc(x.id)}" min="0" max="1.5" step="0.05" value="${v}"><output>${fmt(v)}</output></div>`; }).join("")}</div>
      <p class="ctl-ex">${L("Cada deslizador escribe # gain en su pista. Mezclar es equilibrar: que nada tape a lo demás. M silencia la pista (d1 silence).", "Each slider writes # gain on its track. Mixing is balancing: nothing should cover the rest. M mutes the track (d1 silence).")}</p></div>`;
  }
  if (!t) return "";
  const st = extState(c, t);
  if (c.tipo === "cada") return box(ci, tag, L("Cada cuántos compases cambia", "Every how many bars it changes"), st.chip,
    optHTML("n", [[0, L("nunca", "never")], [2, "2"], [4, "4"], [8, "8"]], st.n) + optHTML("f", TRANSFORMS, st.f),
    L("every N (cambio) $ … aplica el cambio un compás de cada N: así la repetición no cansa. Primera fila: cada cuánto; segunda: qué cambio.", "every N (change) $ … applies the change one bar out of every N: repetition stays interesting. First row: how often; second: which change."));
  if (c.tipo === "azar") return box(ci, tag, c.funcion === "sometimesBy" ? L("A veces más rápido", "Sometimes faster") : L("Quitar golpes al azar", "Drop hits at random"), st.chip,
    rangeHTML("v", 0, 0.9, 0.05, st.v, `${Math.round(st.v * 100)} %`),
    c.funcion === "sometimesBy" ? L("sometimesBy 0.3 (…) aplica el cambio en un 30 % de las notas, al azar.", "sometimesBy 0.3 (…) applies the change to 30% of the notes, at random.") : L("degradeBy 0.3 quita un 30 % de los golpes al azar: el ritmo respira y nunca suena igual.", "degradeBy 0.3 removes 30% of the hits at random: the rhythm breathes and never sounds the same."));
  if (c.tipo === "swing") return box(ci, tag, "Swing", st.chip, rangeHTML("v", 0, 0.33, 0.01, st.v, fmt(st.v)),
    L("swingBy x 4 retrasa las notas que caen a contratiempo: el ritmo «cojea» con gracia, como en el jazz o el hip hop. 1/3 es swing de tresillo.", "swingBy x 4 delays the off-beat notes: the rhythm «limps» gracefully, like jazz or hip hop. 1/3 is triplet swing."));
  if (c.tipo === "euclides") return box(ci, tag, L("Ritmo euclídeo", "Euclidean rhythm"), st.chip,
    `<label class="ctl-check"><input type="checkbox" data-k="on" ${st.on ? "checked" : ""}> ${L("Usar ritmo euclídeo", "Use Euclidean rhythm")}</label>` +
    `<div class="ctl-two"><span>${L("Golpes", "Hits")}</span>${rangeHTML("k", 1, 15, 1, st.k, st.k)}<span>${L("Pasos", "Steps")}</span>${rangeHTML("n", 2, 16, 1, st.n, st.n)}</div>`,
    L(`${st.snd}(golpes,pasos) reparte los golpes lo más igualados posible en los pasos. (3,8) es el tresillo cubano; (5,8) el cinquillo.`, `${st.snd}(hits,steps) spreads the hits as evenly as possible over the steps. (3,8) is the Cuban tresillo; (5,8) the cinquillo.`));
  if (c.tipo === "filtro_mov") return box(ci, tag, L("Filtro que se mueve", "Moving filter"), st.chip,
    `<label class="ctl-check"><input type="checkbox" data-k="on" ${st.on ? "checked" : ""}> ${L("Mover el filtro solo", "Move the filter by itself")}</label>` +
    `<div class="ctl-two"><span>${L("Mínimo", "Low")}</span>${rangeHTML("lo", 100, 2000, 50, st.lo, st.lo)}<span>${L("Máximo", "High")}</span>${rangeHTML("hi", 1000, 10000, 100, st.hi, st.hi)}<span>${L("Ciclos", "Cycles")}</span>${rangeHTML("sl", 1, 16, 1, st.sl, st.sl)}</div>` +
    optHTML("wave", [["sine", L("suave (sine)", "smooth (sine)")], ["saw", L("sube (saw)", "rising (saw)")], ["tri", "tri"], ["square", L("salta (square)", "jumps (square)")]], st.wave),
    L("range bajo alto $ slow N sine: el brillo sube y baja solo cada N compases, como un DJ girando la rueda del filtro.", "range low high $ slow N sine: brightness rises and falls by itself every N bars, like a DJ turning the filter knob."));
  if (c.tipo === "notas") {
    if (!st.ok) return `<div class="ctl off">${tag} ${L("Esta pista no tiene n \"…\" con notas.", "This track has no n \"…\" with notes.")}</div>`;
    return box(ci, tag, L("Escala y octava", "Scale and octave"), st.chip,
      optHTML("scale", [["", L("sin escala", "no scale")], ...SCALES.map((x) => [x, x])], st.scale) + optHTML("oct", [[-1, "-1"], [0, "0"], [1, "+1"], [2, "+2"]], st.oct),
      L("scale \"minor\" \"0 2 4\" convierte números en notas de la escala: así nunca desafina. Mayor suena alegre, menor triste, pentatónica «no falla». La octava escribe |+ n 12 (12 semitonos = una octava).", "scale \"minor\" \"0 2 4\" turns numbers into notes of the scale: it never sounds off. Major sounds happy, minor sad, pentatonic «can't miss». The octave writes |+ n 12 (12 semitones = one octave)."));
  }
  if (c.tipo === "acordes") {
    if (!st.ok) return `<div class="ctl off">${tag} ${L("Esta pista no tiene acordes (como c'maj7).", "This track has no chords (like c'maj7).")}</div>`;
    return box(ci, tag, L("Tipo de acorde", "Chord type"), st.chip, optHTML("q", CHORDS.map((x) => [x, x]), st.q),
      L("Cambia el color de todos los acordes: maj alegre, min triste, 7 y 9 añaden notas (más jazz), sus4 queda «en el aire», dim tenso.", "Changes the colour of every chord: maj happy, min sad, 7 and 9 add notes (more jazzy), sus4 floats «in the air», dim is tense."));
  }
  return "";
}

// Aplica un control ampliado: devuelve el código nuevo de la pista
export function extApply(c, t, vals) {
  let code = t.code;
  const st = extState(c, t);
  const v = { ...st, ...vals };
  if (c.tipo === "cada") return setWrap(code, ["every"], +v.n ? `every ${+v.n} ${v.f}` : null);
  if (c.tipo === "azar") { const fn = c.funcion || "degradeBy"; return setWrap(code, [fn], +v.v > 0 ? (fn === "sometimesBy" ? `sometimesBy ${fmt(+v.v)} (fast 2)` : `degradeBy ${fmt(+v.v)}`) : null); }
  if (c.tipo === "swing") return setWrap(code, ["swingBy"], +v.v > 0 ? `swingBy ${fmt(+v.v)} 4` : null);
  if (c.tipo === "euclides") {
    const re = /\b(s|sound)\s+"([^"]*)"/;
    if (!re.test(code)) code = `s "bd" ${code}`;
    if (v.on === false || v.on === "false") return code;
    return code.replace(re, `$1 "${v.snd}(${Math.min(+v.k, +v.n)},${+v.n})"`);
  }
  if (c.tipo === "filtro_mov") {
    const p = c.param || "lpf";
    if (!v.on) return setParamRaw(code, p, String(Math.round(+v.hi)));
    return setParamRaw(code, p, `(range ${Math.round(+v.lo)} ${Math.round(Math.max(+v.hi, +v.lo + 100))} $ slow ${+v.sl} ${v.wave})`);
  }
  if (c.tipo === "notas") {
    const m = nPattern(code); if (!m) return code;
    const inner = `"${m[4]}"`;
    code = code.replace(m[0], v.scale ? `${m[1]} (scale "${v.scale}" ${inner})` : `${m[1]} ${inner}`);
    code = code.replace(/\s*\|[+-]\s*n\s+\d+/g, "");
    if (+v.oct) code += ` |${+v.oct > 0 ? "+" : "-"} n ${Math.abs(+v.oct) * 12}`;
    return code;
  }
  if (c.tipo === "acordes") {
    const m = nPattern(code); if (!m) return code;
    return code.replace(m[0], m[0].replace(/'\w+/g, `'${v.q}`));
  }
  return code;
}
