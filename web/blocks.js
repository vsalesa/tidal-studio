import { L } from "./i18n.js";
import { FUNCS, PARAMS, SOUNDS } from "./explain.js";
// Vista de bloques: la canción como un árbol visual.
//   Canción → pistas → transformaciones (lo que va antes de $, anidado) → sonido (con sus pasos) + ajustes (#)
// Cada bloque lleva data-key (ver edit.js): al pulsarlo se abre un tooltip para editarlo.

const OPEN = "([{<", CLOSE = ")]}>";

// Recorre el texto a nivel superior (fuera de comillas y paréntesis) y llama a fn(i, ch)
function scanTop(str, fn) {
  let depth = 0, q = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') { q = !q; continue; }
    if (q) continue;
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && fn(i, ch) === false) return;
  }
}
function splitDollar(code) {
  const parts = []; let last = 0;
  scanTop(code, (i, ch) => { if (ch === "$" && code[i - 1] !== "<" && code[i + 1] !== ">") { parts.push(code.slice(last, i)); last = i + 1; } });
  parts.push(code.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}
const OP_RE = /^(#|\|[+\-*\/<>%]\|?|[+\-*\/<>%]\|)/;
function splitOps(code) {
  const out = []; let last = 0, op = null;
  scanTop(code, (i) => {
    const m = code.slice(i).match(OP_RE);
    if (m && (i === 0 || /\s|\)|"/.test(code[i - 1]))) { out.push({ op, text: code.slice(last, i).trim() }); op = m[1]; last = i + m[1].length; }
  });
  out.push({ op, text: code.slice(last).trim() });
  return out.filter((x) => x.text);
}
function unwrapParens(s) {
  s = s.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0, ok = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++; else if (s[i] === ")") depth--;
      if (depth === 0 && i < s.length - 1) { ok = false; break; }
    }
    if (!ok) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}
function splitList(inner) {
  const out = []; let last = 0;
  scanTop(inner, (i, ch) => { if (ch === ",") { out.push(inner.slice(last, i)); last = i + 1; } });
  out.push(inner.slice(last));
  return out.map((x) => x.trim()).filter(Boolean);
}

// Árbol de un patrón
export function parsePattern(code) {
  code = unwrapParens(code.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim());
  const parts = splitDollar(code);
  const body = unwrapParens(parts.pop() || "");
  const wraps = parts;
  let node;
  const st = body.match(/^stack\s*\[(.*)\]\s*$/);
  if (st) node = { type: "stack", children: splitList(st[1]).map(parsePattern) };
  else {
    const segs = splitOps(body);
    const src = segs.shift();
    node = { type: "sound", ...parseSource(src ? src.text : body), params: segs.map(parseParam) };
  }
  // Las envolturas se anidan: la primera es la de fuera
  for (let i = wraps.length - 1; i >= 0; i--) node = { type: "wrap", code: wraps[i], fn: (wraps[i].match(/^[a-zA-Z']+/) || [""])[0], child: node };
  return node;
}
function parseSource(text) {
  const m = text.match(/^(s|sound|n|note|up)\s+"([^"]*)"\s*$/);
  if (m) return { fn: m[1], pattern: m[2], raw: text };
  // Patrón complejo: usamos la primera cadena entre comillas que no sea el nombre de una escala o arpegio
  const fn = (text.match(/^\(?([a-zA-Z]+)\b/) || [])[1] || "";
  for (const q of text.matchAll(/"([^"]*)"/g)) {
    if (/\b(scale|toScale|arp|arpeggiate|vowel)\s*$/.test(text.slice(0, q.index))) continue;
    return { fn, pattern: q[1], raw: text, complex: true, patStart: q.index, patEnd: q.index + q[0].length };
  }
  return { fn, pattern: null, raw: text, complex: true };
}
function parseParam({ op, text }) {
  const m = text.match(/^([a-zA-Z]\w*)\s*(.*)$/);
  return { op, name: m ? m[1] : text, value: m ? m[2].trim() : "", raw: `${op} ${text}` };
}

// Mini-notación: pasos de nivel superior
export function miniSteps(pat) {
  const out = []; let cur = "", depth = 0;
  for (const ch of pat.trim()) {
    if ("[<{".includes(ch)) depth++;
    if ("]>}".includes(ch)) depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  if (out.some((t) => t === ".")) { // "bd sn . hh hh hh" → grupos separados por punto
    const groups = []; let g = [];
    for (const t of out) { if (t === ".") { groups.push(g.join(" ")); g = []; } else g.push(t); }
    groups.push(g.join(" "));
    return groups.map((x) => `[${x}]`);
  }
  return out;
}

// ------------------------------------------------------------------ explicaciones
export function explainWord(w) {
  const f = FUNCS.find(([re]) => re.test(w));
  return f ? f[1] : PARAMS[w] || SOUNDS[w.split(":")[0]] || "";
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function stepHTML(tok, P, sp) {
  const k = `data-key="${esc(P)}|st${sp}"`;
  if (tok === "~") return `<span class="bk-step rest" data-x="~" ${k}>·</span>`;
  const sub = tok.match(/^\[(.*)\](.*)$/);
  if (sub) return `<span class="bk-step group" data-x="${esc(tok)}" ${k}>${miniSteps(sub[1]).map((t, i) => stepHTML(t, P, `${sp}.${i}`)).join("")}${sub[2] ? `<b class="bk-badge">${esc(sub[2])}</b>` : ""}</span>`;
  const alt = tok.match(/^<(.*)>(.*)$/);
  if (alt) return `<span class="bk-step alt" data-x="${esc(tok)}" ${k}>${miniSteps(alt[1]).map((t) => `<span class="alt-i">${esc(t)}</span>`).join("")}${alt[2] ? `<b class="bk-badge">${esc(alt[2])}</b>` : ""}</span>`;
  const m = tok.match(/^([^*/!?(@]+)(.*)$/);
  const name = m ? m[1] : tok, mod = m ? m[2] : "";
  return `<span class="bk-step" data-x="${esc(tok)}" ${k}><span class="nm">${esc(name)}</span>${mod ? `<b class="bk-badge">${esc(mod.replace(/^\*/, "×"))}</b>` : ""}</span>`;
}

const SRC_LABEL = () => ({ s: L("sonido", "sound"), sound: L("sonido", "sound"), n: L("notas", "notes"), note: L("notas", "notes"), up: L("notas", "notes") });

function nodeHTML(node, path = []) {
  const P = path.join(".");
  if (node.type === "wrap") {
    return `<div class="bk-wrap" data-x="${esc(node.code)}" data-w="${esc(node.fn)}" data-key="${esc(P)}|w">
      <div class="bk-label"><span class="bk-kind">${L("transforma", "transforms")}</span><code>${esc(node.code)}</code><span class="bk-dollar">$</span></div>
      <div class="bk-inner">${nodeHTML(node.child, [...path, "c"])}</div></div>`;
  }
  if (node.type === "stack") {
    return `<div class="bk-wrap stack" data-x="stack" data-w="stack"><div class="bk-label"><span class="bk-kind">${L("a la vez", "at once")}</span><code>stack [ … ]</code></div>
      <div class="bk-inner">${node.children.map((c, i) => nodeHTML(c, [...path, String(i)])).join("")}</div></div>`;
  }
  const lbl = SRC_LABEL()[node.fn] || node.fn || L("patrón", "pattern");
  const steps = node.pattern != null ? miniSteps(node.pattern) : [];
  return `<div class="bk-sound">
    <div class="bk-src" data-x="${esc(node.raw)}" data-w="${esc(node.fn)}" data-key="${esc(P)}|src">
      <div class="bk-label"><span class="bk-kind">${esc(lbl)}</span><code>${esc(node.complex ? node.raw : `${node.fn} "${node.pattern}"`)}</code></div>
      ${steps.length ? `<div class="bk-steps" title="${esc(L("Cada casilla ocupa la misma parte del ciclo", "Each box takes the same share of the cycle"))}">${steps.map((t, i) => stepHTML(t, P, String(i))).join("")}</div>` : ""}
    </div>
    ${node.params.length ? `<div class="bk-params">${node.params.map((p, i) =>
      `<span class="bk-param" data-x="${esc(p.raw)}" data-w="${esc(p.name)}" data-key="${esc(P)}|p${i}"><span class="op">${esc(p.op)}</span> ${esc(p.name)} <b>${esc(p.value)}</b></span>`).join("")}</div>` : ""}
  </div>`;
}

export function songBlocksHTML(state, { icon, uiIcon = icon, kindColor, kindName }) {
  const tracks = state.tracks || [];
  if (!tracks.length) return `<p class="hint">${L("Cuando añadas pistas, aquí verás tu canción montada en bloques.", "Once you add tracks, you'll see your song built out of blocks here.")}</p>`;
  const kinds = {};
  tracks.forEach((t) => { kinds[t.kind] = (kinds[t.kind] || 0) + 1; });
  return `<div class="bk-song">
    <div class="bk-song-head">
      <span class="bk-kind">${L("canción", "song")}</span>
      <strong>${esc(state.name || L("Canción sin título", "Untitled song"))}</strong>
      <span class="bk-tag" data-x="setcps" data-w="setcps">${state.bpm} BPM · <code>setcps (${state.bpm}/60/4)</code></span>
      <span class="bk-mix">${Object.entries(kinds).map(([k, n]) => `<span style="--k:${kindColor(k)}">${icon(k, 13)} ${n}</span>`).join("")}</span>
    </div>
    <div class="bk-tracks">${tracks.map((t) => {
      let tree; try { tree = parsePattern(t.code || ""); } catch { tree = { type: "sound", fn: "", pattern: null, raw: t.code, complex: true, params: [] }; }
      return `<section class="bk-track ${t.muted ? "muted" : ""} ${t.id === state.selected ? "selected" : ""}" data-id="${esc(t.id)}" style="--k:${kindColor(t.kind)}">
        <header><span class="kico">${icon(t.kind, 16)}</span><code class="id">${esc(t.id)}</code><strong>${esc(t.name)}</strong>
          <span class="hint">${esc(kindName(t.kind))}${t.muted ? " · " + L("silenciada", "muted") : ""}</span>
          <span class="bk-acts">
            <button class="icon-btn" data-a="root" data-key="|root" title="${esc(L("Añadir una transformación o configurar la pista", "Add a transformation or configure the track"))}">${uiIcon("plus", 15)}</button>
            <button class="icon-btn" data-a="card" title="${esc(L("Abrir su tarjeta configuradora en Maestro", "Open its configurator card in Maestro"))}">${uiIcon("sliders", 15)}</button>
            <button class="icon-btn" data-a="edit" title="${esc(L("Editar esta pista como código", "Edit this track as code"))}">${uiIcon("code", 15)}</button></span></header>
        ${nodeHTML(tree)}
      </section>`;
    }).join("")}</div>
  </div>`;
}

// Texto para el panel de detalle al pulsar un bloque
export function blockInfo(el) {
  const x = el.dataset.x || "";
  const w = el.dataset.w || "";
  if (el.classList.contains("bk-step")) {
    if (x === "~") return { code: "~", text: L("Silencio: en este trozo del ciclo no suena nada.", "Rest: nothing plays in this part of the cycle.") };
    if (x.startsWith("[")) return { code: x, text: L("Grupo: todo lo de dentro se reparte en el hueco de UN paso.", "Group: everything inside is squeezed into the space of ONE step.") };
    if (x.startsWith("<")) return { code: x, text: L("Alterna: en cada ciclo suena el siguiente de la lista.", "Alternates: each cycle plays the next one in the list.") };
    const name = x.match(/^[^*/!?(@]+/)?.[0] || x;
    const bits = [explainWord(name) || (/^-?\d/.test(name) ? L(`nota o número ${name}.`, `note or number ${name}.`) : "")];
    if (/\*(\d+)/.test(x)) bits.push(L(`×${x.match(/\*(\d+)/)[1]}: se repite ese número de veces en su hueco.`, `×${x.match(/\*(\d+)/)[1]}: repeats that many times in its slot.`));
    if (/\//.test(x)) bits.push(L("/: suena más lento, una vez cada varios ciclos.", "/: plays slower, once every few cycles."));
    if (/\?/.test(x)) bits.push(L("?: a veces se salta (al azar).", "?: sometimes skipped (at random)."));
    if (/\(\d+,\d+/.test(x)) bits.push(L("(golpes,pasos): ritmo euclídeo, reparte los golpes lo más igualados posible.", "(hits,steps): Euclidean rhythm, spreads the hits as evenly as possible."));
    return { code: x, text: bits.filter(Boolean).join(" ") || L("Un paso del patrón.", "One step of the pattern.") };
  }
  if (w === "setcps") return { code: x, text: L("La velocidad de toda la canción: ciclos por segundo. Un ciclo es un compás de 4 tiempos.", "The tempo of the whole song: cycles per second. A cycle is one 4-beat bar.") };
  if (w === "stack") return { code: "stack", text: explainWord("stack") };
  const e = explainWord(w);
  const kind = el.classList.contains("bk-wrap") ? L("Transformación: cambia todo lo que tiene dentro (lo que va después del $).", "Transformation: changes everything inside it (what comes after the $).")
    : el.classList.contains("bk-param") ? L("Ajuste: se aplica a cada nota del sonido que tiene a la izquierda.", "Setting: applies to every note of the sound on its left.") : "";
  return { code: x, text: [e && e[0].toUpperCase() + e.slice(1), kind].filter(Boolean).join(" ") };
}
