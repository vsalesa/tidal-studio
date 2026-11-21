import { miniSteps, parsePattern } from "./blocks.js";
// Ilumina en el código lo que está sonando, como en Strudel.
// A partir de un instante del ciclo calcula qué trozos de la mini-notación ("bd [~ sn]", "<c e g>"…)
// están activos, con su posición en el texto, para cada pista.

// ---------------------------------------------------------------- mini-notación con posiciones
// Un patrón es una lista de capas (separadas por coma); cada capa, una secuencia de pasos con peso.
function parseSeq(str, base) {
  const layers = [[]];
  let i = 0;
  const n = str.length;
  const cur = () => layers[layers.length - 1];
  const close = { "[": "]", "<": ">", "{": "}" };
  while (i < n) {
    const ch = str[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === ",") { layers.push([]); i++; continue; }
    if (ch === "." && (i + 1 >= n || /\s/.test(str[i + 1]))) { cur().push({ dot: true }); i++; continue; }
    if (ch === "_") { const last = cur()[cur().length - 1]; if (last) last.w += 1; i++; continue; }
    let step;
    if (close[ch]) {
      // grupo: buscamos su cierre
      let depth = 0, j = i;
      for (; j < n; j++) { if ("[<{".includes(str[j])) depth++; if ("]>}".includes(str[j])) { depth--; if (!depth) break; } }
      const inner = parseSeq(str.slice(i + 1, j), base + i + 1);
      step = { type: ch === "<" ? "alt" : "group", layers: inner, start: base + i, end: base + j + 1 };
      i = j + 1;
    } else {
      let j = i;
      while (j < n && !/[\s,\[\]<>{}*\/!@?(]/.test(str[j])) j++;
      if (j === i) { i++; continue; }
      const word = str.slice(i, j);
      step = word === "~" ? { type: "rest" } : { type: "leaf", name: word, start: base + i, end: base + j };
      i = j;
    }
    step.w = 1; step.mul = 1;
    // modificadores: *n /n !n @n ? (3,8)
    for (;;) {
      const m = str.slice(i).match(/^(\*|\/|!|@)([\d.]+)|^\?[\d.]*|^\([^)]*\)|^!/);
      if (!m) break;
      if (m[1] === "*") step.mul *= parseFloat(m[2]) || 1;
      else if (m[1] === "/") step.mul /= parseFloat(m[2]) || 1;
      else if (m[1] === "@") step.w = parseFloat(m[2]) || 1;
      else if (m[1] === "!") step.rep = (step.rep || 1) + (parseInt(m[2], 10) || 1) - 1;
      else if (m[0] === "!") step.rep = (step.rep || 1) + 1;
      if (m[0].startsWith("(")) step.end = Math.max(step.end || 0, base + i + m[0].length);
      i += m[0].length;
    }
    cur().push(step);
    for (let r = 1; r < (step.rep || 1); r++) cur().push({ ...step, rep: 1 });
  }
  // "a b . c d" → grupos
  return layers.map((steps) => {
    if (!steps.some((s) => s.dot)) return steps;
    const groups = []; let g = [];
    for (const s of steps) { if (s.dot) { groups.push(g); g = []; } else g.push(s); }
    groups.push(g);
    return groups.filter((x) => x.length).map((x) => ({ type: "group", layers: [x], w: 1, mul: 1 }));
  });
}

// Qué hojas suenan en la posición pos (ciclos, con decimales)
function activeIn(layers, pos, out) {
  const cyc = Math.floor(pos), f = pos - cyc;
  for (const steps of layers) {
    const total = steps.reduce((a, s) => a + s.w, 0);
    if (!total) continue;
    let acc = 0;
    for (const s of steps) {
      const a = acc / total, b = (acc + s.w) / total;
      acc += s.w;
      if (f < a || f >= b) continue;
      const local = (cyc + (f - a) / (b - a)) * s.mul;
      // "hh*4": la casilla se repite; la iluminamos a golpes, uno por repetición
      if (s.type === "leaf") { if (s.mul <= 1 || local - Math.floor(local) < 0.6) out.push([s.start, s.end]); }
      else if (s.type === "group") activeIn(s.layers, local, out);
      else if (s.type === "alt") {
        // <a b c>: cada vuelta toca uno
        const items = s.layers[0] || [];
        if (items.length) {
          const k = ((Math.floor(local) % items.length) + items.length) % items.length;
          const it = items[k];
          const sub = Math.floor(local / items.length) + (local - Math.floor(local));
          if (it.type === "leaf") out.push([it.start, it.end]);
          else if (it.type !== "rest") activeIn(it.type === "alt" ? [[it]] : it.layers, sub * it.mul, out);
        }
        for (const extra of s.layers.slice(1)) activeIn([extra], local, out);
      }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- cadenas que suenan en una pista
const cache = new Map();
export function patternsOf(code) {
  if (cache.has(code)) return cache.get(code);
  const strs = [];
  const clean = code.replace(/--.*$/gm, (m) => " ".repeat(m.length));
  for (const q of clean.matchAll(/"([^"]*)"/g)) {
    // el nombre de la escala o del acorde no es un patrón de tiempo
    if (/\b(scale|toScale)\s*$/.test(clean.slice(0, q.index))) continue;
    try { strs.push(parseSeq(q[1], q.index + 1)); } catch { /* patrón raro: sin luz */ }
  }
  // slow 2 $ … / fast 2 $ … al principio: cambian la velocidad de todo
  let speed = 1;
  for (const m of clean.matchAll(/(?:^|\$)\s*\(?\s*(slow|fast|density|sparsity|hurry)\s+"?\(?([\d.]+)(?:\s*\/\s*([\d.]+))?\)?"?\s*\)?\s*\$/g)) {
    const v = (parseFloat(m[2]) || 1) / (m[3] ? parseFloat(m[3]) || 1 : 1);
    speed *= /slow|sparsity/.test(m[1]) ? 1 / v : v;
  }
  const r = { strs, speed };
  if (cache.size > 300) cache.clear();
  cache.set(code, r);
  return r;
}

// Rangos [inicio, fin] del texto de la pista que suenan en el ciclo `cycle`
export function rangesAt(code, cycle) {
  const { strs, speed } = patternsOf(code);
  const out = [];
  for (const layers of strs) activeIn(layers, cycle * speed, out);
  return out;
}

// Casillas de la vista Bloques que suenan: claves "ruta|st2.1" (igual que blocks.js las dibuja)
function stepKeys(pattern, pos, P, out, sp = "") {
  const steps = miniSteps(pattern);
  if (!steps.length) return out;
  const cyc = Math.floor(pos), f = pos - cyc;
  const i = Math.min(steps.length - 1, Math.floor(f * steps.length));
  const tok = steps[i], key = sp === "" ? String(i) : `${sp}.${i}`;
  if (tok === "~") return out;
  const sub = tok.match(/^\[(.*)\](?:\*([\d.]+))?/);
  if (sub) return stepKeys(sub[1], (cyc + f * steps.length - i) * (parseFloat(sub[2]) || 1), P, out, key);
  const mul = parseFloat((tok.match(/^[^*]*\*([\d.]+)$/) || [])[1]) || 1;
  const local = (f * steps.length - i) * mul;
  if (mul <= 1 || local - Math.floor(local) < 0.6) out.push(`${P}|st${key}`); // "bd*4": a golpes
  return out;
}
const bcache = new Map();
function soundNodes(code) {
  if (bcache.has(code)) return bcache.get(code);
  const list = [];
  const walk = (node, path) => {
    if (!node) return;
    if (node.type === "wrap") walk(node.child, [...path, "c"]);
    else if (node.type === "stack") node.children.forEach((c, i) => walk(c, [...path, String(i)]));
    else if (node.pattern != null) list.push({ P: path.join("."), pattern: node.pattern });
  };
  try { walk(parsePattern(code), []); } catch { /* sin bloques */ }
  if (bcache.size > 300) bcache.clear();
  bcache.set(code, list);
  return list;
}
export function blockKeysAt(code, cycle) {
  const { speed } = patternsOf(code);
  const out = [];
  for (const n of soundNodes(code)) stepKeys(n.pattern, cycle * speed, n.P, out);
  return out;
}

// ---------------------------------------------------------------- reloj
// Con SuperDirt: cada nota que suena llega del servidor (ciclo + hora). Sin motor (simulación): reloj propio.
const clock = {
  orbits: new Map(), // orbit → { cycle, at, cps, last }
  playing: new Set(), // pistas que se han mandado a sonar
  simStart: null, cps: 0.5, offset: 0, seq: -1, real: false, got: false,
};
export function setTempo(bpm) {
  const cps = bpm / 60 / 4;
  if (clock.simStart !== null && cps !== clock.cps) {
    const now = performance.now() / 1000;
    const pos = (now - clock.simStart) * clock.cps;
    clock.simStart = now - pos / cps;
  }
  clock.cps = cps;
}
// Lo que se manda a Tidal: "d3 $ …" empieza a sonar, "d3 silence" la para, "hush"/"panic" lo para todo
export function noteEval(code) {
  if (/^\s*(hush|panic)\s*$/m.test(code)) { clock.playing.clear(); clock.simStart = null; return; }
  for (const m of code.matchAll(/^\s*(d\d+)\s*(\$|silence)/gm)) {
    if (m[2] === "silence") clock.playing.delete(m[1]);
    else clock.playing.add(m[1]);
  }
  if (/resetCycles/.test(code)) clock.simStart = performance.now() / 1000;
  if (clock.playing.size && clock.simStart === null) clock.simStart = performance.now() / 1000;
  if (!clock.playing.size) clock.simStart = null;
}
export const isPlaying = (id) => clock.playing.has(id);

// Posición en ciclos de una pista ahora mismo (o null si no suena)
export function cycleOf(id) {
  if (!clock.playing.has(id)) return null;
  const now = Date.now() / 1000 + clock.offset;
  if (clock.real && clock.got) {
    const o = clock.orbits.get(parseInt(id.slice(1), 10) - 1);
    if (!o || now - o.last > Math.max(1.5, 1.2 / (o.cps || 0.5))) return null; // no le llegan notas: no suena
    return o.cycle + (now - o.at) * o.cps;
  }
  if (clock.simStart === null) return null;
  return (performance.now() / 1000 - clock.simStart) * clock.cps;
}

async function poll(api) {
  try {
    const r = await api(`/api/events?since=${clock.seq < 0 ? 999999999999 : clock.seq}`);
    clock.offset = (r.now || Date.now() / 1000) - Date.now() / 1000;
    if (clock.seq < 0) { clock.seq = r.seq || 0; return; }
    clock.seq = r.seq;
    for (const e of r.events || []) {
      if (!(e.cycle >= 0) || !(e.cps > 0)) continue;
      clock.got = true;
      // ciclo + hora de la nota más reciente: con eso sabemos dónde está el ciclo en cualquier momento
      const o = clock.orbits.get(e.orbit);
      if (!o || e.at >= o.at) clock.orbits.set(e.orbit, { cycle: e.cycle, at: e.at, cps: e.cps, last: e.at });
    }
  } catch { /* el servidor no responde: seguimos con lo que hay */ }
}

// ---------------------------------------------------------------- arranque
// opts: { api, isReal(), tracks(), paint(id, cycle|null) }
export function startPlayhead(opts) {
  let busy = false, lastPoll = 0;
  const frame = (t) => {
    clock.real = !!opts.isReal();
    if (clock.real && clock.playing.size && !busy && t - lastPoll > 90) {
      busy = true; lastPoll = t;
      poll(opts.api).finally(() => { busy = false; });
    }
    for (const tr of opts.tracks()) opts.paint(tr, cycleOf(tr.id));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (opts.isReal()) poll(opts.api);
}
