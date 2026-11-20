import { L } from "./i18n.js";
import { BUILTIN, swapSound, guessType } from "./samples.js";
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
const paramRe = (p) => new RegExp(`^#\\s*${p}\\s+(-?[\\d.]+|"[^"]*")(?![\\w(])`);
export function getParam(code, p) {
  const ms = topLevelMatches(code, paramRe(p));
  if (!ms.length) return null;
  const v = ms[ms.length - 1].m[1];
  return v.startsWith('"') ? v.slice(1, -1) : parseFloat(v);
}
export function setParam(code, p, v) {
  const val = typeof v === "number" ? fmt(v) : `"${v}"`;
  const ms = topLevelMatches(code, paramRe(p));
  if (ms.length) {
    const { index, m } = ms[ms.length - 1];
    return code.slice(0, index) + `# ${p} ${val}` + code.slice(index + m[0].length);
  }
  return `${code} # ${p} ${val}`;
}
export const fmt = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000));

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
    if (c.tipo === "bpm") { out.push({ tipo: "bpm", min: clamp(c.min ?? 60, 40, 200), max: clamp(c.max ?? 180, 60, 220), etiqueta: c.etiqueta || "" }); continue; }
    if (!ids.has(c.pista)) continue;
    if (c.tipo === "deslizador" && PARAMS[c.param]) {
      const P = PARAMS[c.param];
      out.push({ tipo: "deslizador", pista: c.pista, param: c.param, min: isNum(c.min) ? c.min : P.min, max: isNum(c.max) ? c.max : P.max,
        paso: isNum(c.paso) ? c.paso : P.step, valor: isNum(c.valor) ? c.valor : null, etiqueta: c.etiqueta || "", explica: c.explica || "" });
    } else if (c.tipo === "selector" && Array.isArray(c.opciones) && c.opciones.length) {
      const que = c.que === "param" && PARAMS[c.param] || c.que === "param" && c.param === "vowel" ? "param" : "sonido";
      out.push({ tipo: "selector", pista: c.pista, que, param: c.param, opciones: c.opciones.map(String).filter((o) => /^[\w.:'-]+$/.test(o)).slice(0, 12), etiqueta: c.etiqueta || "", explica: c.explica || "" });
    } else if (c.tipo === "pasos") {
      out.push({ tipo: "pasos", pista: c.pista, pasos: [8, 16].includes(+c.pasos) ? +c.pasos : 16, sonidos: (c.sonidos || []).map(String).filter((o) => /^[\w:]+$/.test(o)).slice(0, 4), explica: c.explica || "" });
    }
  }
  return out.slice(0, 6);
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
  if (opts.bpm) out.unshift({ tipo: "bpm", min: 60, max: 180 });
  return out;
}

// ------------------------------------------------------------------ pintar
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toPos = (c, v) => (PARAMS[c.param]?.log ? Math.round(1000 * Math.log(Math.max(v, c.min) / c.min) / Math.log(c.max / c.min)) : v);
export const fromPos = (c, p) => (PARAMS[c.param]?.log ? c.min * Math.pow(c.max / c.min, p / 1000) : +p);

export function controlsHTML(ctrls, state, mi) {
  const tr = (id) => state.tracks.find((t) => t.id === id);
  const rows = ctrls.map((c, ci) => {
    const t = c.pista ? tr(c.pista) : null;
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
    return "";
  }).join("");
  return `<div class="ctl-panel" data-m="${mi}"><div class="ctl-head">${L("Controles", "Controls")}<button class="ctl-reset" data-a="ctl-reset" title="${esc(L("Volver a como estaba antes de tocar los controles", "Go back to how it was before using the controls"))}">${L("Restaurar", "Restore")}</button></div>${rows}</div>`;
}
