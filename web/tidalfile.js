// Abrir y guardar archivos de Tidal (.tidal / .hs) de cualquier editor (Pulsar, VS Code, Vim…).
// - Cada «d1 $ …» / «p "nombre" $ …» se convierte en una pista.
// - Lo que no es una pista (let, definiciones, once, imports…) se guarda tal cual en «código extra».
// - Al guardar escribimos un .tidal normal que suena en cualquier editor, con una línea de
//   comentario «-- tidal-studio: {…}» que recuerda nombre, estilo y mezcla (para no perder nada).
import { L } from "./i18n.js";

export const META_RE = /^--\s*tidal-studio:\s*(\{.*\})\s*$/;
const HEADER_RE = /^--\s*(\[(?:silenciada|muted)\]\s*)?(.+?)\s*·\s*([\wáéíóú]+)\s*$/;
const STUDIO_RE = /^--\s*(Tidal Studio\b|Master:|Código extra|Extra code)/;
// Líneas que siguen la instrucción anterior aunque empiecen sin sangría (igual que server/engine.py)
const CONTINUATION = ["#", "$", "|", "+", "*", ".", ")", "]", ",", "}", "<~", "~>"];
const MAX_TRACKS = 12;
export const KINDS = ["percusion", "bajo", "armonia", "melodia", "textura", "efecto", "estructura"];

// Quita un comentario «-- …» del final de una línea (si no está dentro de comillas)
export function stripLineComment(line) {
  let q = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    if (!q && c === "-" && line[i + 1] === "-" && (i === 0 || /\s/.test(line[i - 1])) && !/[!#$%&*+./<=>?@\\^|~:]/.test(line[i + 2] || "")) return line.slice(0, i).replace(/\s+$/, "");
  }
  return line;
}

// Adivina qué es una pista mirando sus sonidos (para su color e icono)
export function guessKind(code) {
  const c = code.toLowerCase();
  const snd = (c.match(/\b(?:s|sound)\s+"([^"]*)"/g) || []).join(" ");
  if (/\b(bd|sn|hh|oh|ch|cp|kick|snare|hat|clap|drum|808|909|tom|rim|ride|crash|perc|tabla|bongo|conga|cowbell|clak|jvbass:\d|realclaps)/.test(snd) || /drum/.test(snd)) return "percusion";
  if (/bass/.test(snd) || /\boctave\s+[23]\b|\|-\s*n\s+(12|24)|-\s*24/.test(c)) return "bajo";
  if (/\b(chord|arp|'maj|'min|'m7|'dom7|'major|'minor|pad)/.test(c) || /superpiano.*\[/.test(c)) return "armonia";
  if (/\b(n|note)\s+"/.test(c)) return "melodia";
  if (/\b(room|delay|lpf|hpf|crush|shape)\b/.test(c) && !/\b(s|sound|n|note)\s/.test(c)) return "efecto";
  return "textura";
}

// ¿Es un número o una cuenta sencilla? «(130/60/4)», «0.54», «135/240»
function evalNum(expr) {
  const e = expr.trim();
  if (!/^[\d.\s+\-*/()]+$/.test(e)) return null;
  try { const v = Function(`"use strict";return (${e})`)(); return Number.isFinite(v) ? v : null; } catch { return null; }
}

// Parte el texto en instrucciones de nivel superior. Cada una lleva sus comentarios de antes.
function statements(text) {
  const lines = text.split("\n");
  const out = []; let cur = null; let comments = [];
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], s = line.trim();
    if (s.startsWith("{-")) { // comentario de bloque: va entero a «extra»
      flush();
      const blk = [line];
      while (!lines[i].includes("-}") && i < lines.length - 1) blk.push(lines[++i]);
      out.push({ lines: blk, comments, block: true }); comments = [];
      continue;
    }
    if (!s) { // línea vacía: sigue la instrucción solo si lo siguiente va con sangría
      if (cur) {
        let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
        const nx = lines[j];
        if (nx !== undefined && /^\s/.test(nx) && !nx.trim().startsWith("--")) { cur.lines.push(""); continue; }
      }
      flush();
      if (comments.length) comments.push("");
      continue;
    }
    const indented = /^\s/.test(line);
    if (s.startsWith("--") && !indented) { flush(); comments.push(line); continue; }
    if (cur && (indented || CONTINUATION.some((p) => s.startsWith(p)))) { cur.lines.push(line); continue; }
    flush();
    cur = { lines: [line], comments }; comments = [];
  }
  flush();
  if (comments.length) out.push({ lines: [], comments });
  return out;
}

// Comentarios que son código desactivado («-- d1 $ …»): pistas silenciadas
function commentedTrack(comments) {
  const i = comments.findIndex((l) => /^--\s?\s*(d\d+|p\s+("[^"]*"|\d+))\b/.test(l));
  if (i < 0) return null;
  const run = comments.slice(i).filter((l) => l.trim());
  if (!run.every((l) => l.trim().startsWith("--"))) return null;
  return { before: comments.slice(0, i), code: run.map((l) => l.replace(/^--\s?/, "")) };
}

/**
 * Lee un archivo de Tidal. Devuelve { bpm, meta, tracks:[{id,name,kind,code,muted,mix?,solo?}], extra, skipped }
 * opts.parseMixLine(line) → mix | null (las líneas «# amp … -- mezcla» que escribe Tidal Studio)
 * opts.bpm: el BPM por defecto si el archivo no lo dice
 */
export function parseTidalFile(text, opts = {}) {
  const src = String(text || "").replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
  const res = { bpm: null, meta: null, tracks: [], extra: [], skipped: [] };
  const metaLine = src.split("\n").find((l) => META_RE.test(l.trim()));
  if (metaLine) { try { res.meta = JSON.parse(metaLine.trim().match(META_RE)[1]); } catch { /* metadatos rotos: se ignoran */ } }
  const parseMix = opts.parseMixLine || (() => null);
  const used = new Set();
  // Los d1…d12 escritos en el archivo se reservan para su pista; los «p "nombre"» cogen los que sobren
  const reserved = new Set([...src.matchAll(/^\s*(?:--\s*)?(?:do\s+)?d(\d+)\s*\$/gm)].map((m) => "d" + m[1]));
  const free = (want) => {
    if (want && /^d([1-9]|1[0-2])$/.test(want) && !used.has(want)) return want;
    for (const avoid of [true, false]) for (let i = 1; i <= MAX_TRACKS; i++) if (!used.has("d" + i) && !(avoid && reserved.has("d" + i))) return "d" + i;
    return null;
  };
  // Comentarios que no se han usado como nombre de pista: se guardan en «extra» para no perderlos
  const keepComments = (comments, skip) => {
    const keep = comments.filter((l) => l !== skip && l.trim() && !META_RE.test(l.trim()) && !STUDIO_RE.test(l.trim()) && !HEADER_RE.test(l.trim()));
    if (keep.length) res.extra.push(keep.join("\n"));
  };

  const extra = (st) => {
    const keep = st.comments.filter((l) => !META_RE.test(l.trim()) && !STUDIO_RE.test(l.trim()) && !HEADER_RE.test(l.trim()));
    const body = [...keep, ...st.lines].join("\n").replace(/^\n+|\n+$/g, "");
    if (body.trim()) res.extra.push(body);
  };

  // Una instrucción de código (sin comentarios delante) → pista, tempo o null si no es nada de eso
  const handle = (codeLines, comments, muted) => {
    let lines = codeLines.slice();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let mix = null;
    lines = lines.filter((l) => { const m = parseMix(l); if (m) mix = m; return !m; });
    const text = lines.join("\n");
    const first = text.trim();
    // tempo
    let m = first.match(/^setcps\s*(?:\$\s*)?([\s\S]+)$/);
    if (m) {
      const v = evalNum(m[1]);
      if (v && v > 0) { res.bpm = Math.round(v * 240 * 100) / 100; keepComments(comments); return true; }
      return false;
    }
    m = first.match(/^setbpm\s+([\d.]+)\s*$/); // algunos BootTidal definen setbpm
    if (m) { res.bpm = +m[1]; keepComments(comments); return true; }
    if (/^(hush|panic|resetCycles|silence)\s*$/.test(first)) { res.skipped.push(first); keepComments(comments); return true; }
    // pistas: d1 $ …, d1 (…), p "nombre" $ …, p 3 $ …
    let id = null, name = "", code = null;
    m = first.match(/^d(\d+)\s*(\$\s*)?([\s\S]+)$/);
    if (m && (m[2] || /^[("]/.test(m[3].trim()) || m[3].trim() === "silence")) { id = "d" + m[1]; code = m[3]; }
    else {
      m = first.match(/^p\s+(?:"([^"]+)"|(\d+))\s*(\$\s*)?([\s\S]+)$/);
      if (m && (m[3] || /^[("]/.test(m[4].trim()))) { name = m[1] || "p" + m[2]; code = m[4]; }
    }
    if (code === null) return false;
    const finalId = free(id);
    if (!finalId) return false; // más de 12 pistas: va a «extra»
    used.add(finalId);
    // Quitar comentarios de final de línea: al tocar se añade la mezcla detrás y quedaría comentada
    const codeOut = code.split("\n").map(stripLineComment).join("\n").replace(/^\s+|\s+$/g, "");
    if (!codeOut) return false;
    // Nombre y tipo: la cabecera de Tidal Studio «-- nombre · tipo», o un comentario corto justo encima
    let kind = "", usedLine = null;
    const near = comments.filter((l) => l.trim()).slice(-1)[0];
    const h = near && near.trim().match(HEADER_RE);
    if (h && !STUDIO_RE.test(near.trim())) { usedLine = near; name = name || h[2]; kind = KINDS.includes(h[3]) ? h[3] : ""; if (h[1]) muted = true; }
    else if (near && !META_RE.test(near.trim()) && !STUDIO_RE.test(near.trim())) {
      const c = near.trim().replace(/^-+\s*/, "");
      if (c && c.length <= 40 && !/[$#"]/.test(c)) { name = name || c; usedLine = near; }
    }
    keepComments(comments, usedLine);
    const pm = res.meta && res.meta.tracks && res.meta.tracks[finalId];
    const t = { id: finalId, name: (name || (id && id !== finalId ? id : finalId)).slice(0, 60), kind: kind || (pm && pm.kind) || guessKind(codeOut), code: codeOut, muted: !!muted };
    if (mix) t.mix = mix;
    if (pm && pm.solo) t.solo = true;
    res.tracks.push(t);
    return true;
  };

  for (const st of statements(src)) {
    if (st.block) { extra(st); continue; }
    // pista silenciada escrita como comentario
    const ct = commentedTrack(st.comments);
    if (ct) {
      const headerAbove = ct.before;
      if (!handle(ct.code, headerAbove, true)) res.extra.push(st.comments.join("\n"));
      st.comments = [];
    }
    if (!st.lines.length) { if (st.comments.length) extra({ comments: st.comments, lines: [] }); continue; }
    const first = st.lines[0].trim();
    // bloque «do»: si no define nada con let, se parte en sus instrucciones
    if (/^do\s*$/.test(first) || /^do\s+\S/.test(first)) {
      const tail = st.lines.slice(1).filter((l) => l.trim());
      if (!tail.some((l) => /^\s*let\b/.test(l)) && !/^do\s+let\b/.test(first)) {
        const ind = tail.length ? Math.min(...tail.map((l) => l.match(/^\s*/)[0].length)) : 0;
        const dedented = [first.replace(/^do\s*/, ""), ...tail.map((l) => l.slice(ind))].filter((l) => l.trim()).join("\n");
        const inner = statements(dedented);
        const rest = inner.filter((x) => !(x.lines.length && handle(x.lines, x.comments, false)));
        if (rest.some((x) => x.lines.length)) res.extra.push(["do", ...rest.flatMap((x) => [...x.comments, ...x.lines]).map((l) => "  " + l)].join("\n"));
        continue;
      }
    }
    if (!handle(st.lines, st.comments, false)) extra(st);
  }
  res.extra = res.extra.join("\n\n").trim();
  return res;
}

// Línea de metadatos que escribimos al guardar (todo lo que el código no dice por sí solo)
export function metaLine(state) {
  const tracks = {};
  for (const t of state.tracks) {
    const o = { kind: t.kind };
    if (t.solo) o.solo = true;
    tracks[t.id] = o;
  }
  const meta = { v: 1, name: state.name || "", bpm: state.bpm, tracks };
  if (state.style) meta.style = state.style;
  if (state.master && (state.master.vol || state.master.low || state.master.mid || state.master.high)) meta.master = state.master;
  return `-- tidal-studio: ${JSON.stringify(meta)}`;
}

export const EXTRA_HEADER = () => L("-- Código extra (definiciones, ajustes…): se evalúa antes de las pistas", "-- Extra code (definitions, settings…): evaluated before the tracks");

// Nombre de archivo a partir de una ruta (/ o \)
export const baseName = (p) => String(p || "").split(/[\\/]/).pop();

// Solo la línea de metadatos (para saber el master antes de leer las líneas de mezcla)
export function readMeta(text) {
  const line = String(text || "").split(/\r?\n/).find((l) => META_RE.test(l.trim()));
  if (!line) return null;
  try { return JSON.parse(line.trim().match(META_RE)[1]); } catch { return null; }
}
