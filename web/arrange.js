import { L } from "./i18n.js";
import { setWrap, getWrap } from "./controls.js";
// Arreglo: cuándo suena cada pista, compás a compás. Escribe mask "<t!4 f!4>" $ … en cada pista
// (t = suena, f = calla; la lista se repite cuando se acaba).

export function parseMask(code) {
  const w = getWrap(code, ["mask"]);
  if (!w) return null;
  const m = w.match(/^mask\s+"<([^">]*)>"\s*$/) || w.match(/^mask\s+"([tf1 0]+)"\s*$/);
  if (!m) return { complex: true };
  const out = [];
  for (const tok of m[1].trim().split(/\s+/)) {
    const r = tok.match(/^([tf10])(?:!(\d+))?$/);
    if (!r) return { complex: true };
    for (let i = 0; i < (r[2] ? +r[2] : 1); i++) out.push(r[1] === "t" || r[1] === "1");
  }
  return out.length ? out : null;
}
export function maskString(arr) {
  const toks = []; let i = 0;
  while (i < arr.length) { let j = i; while (j < arr.length && arr[j] === arr[i]) j++; toks.push((arr[i] ? "t" : "f") + (j - i > 1 ? `!${j - i}` : "")); i = j; }
  return `<${toks.join(" ")}>`;
}
export function setMask(code, arr) {
  return setWrap(code, ["mask"], arr.every(Boolean) ? null : `mask "${maskString(arr)}"`);
}
// Lee la pista como N compases (si la máscara es más corta, se repite)
export function barsOf(code, n) {
  const m = parseMask(code);
  if (!m) return Array(n).fill(true);
  if (m.complex) return null;
  return Array.from({ length: n }, (_, i) => m[i % m.length]);
}

export const PRESETS = [
  { id: "todo", es: "Todo siempre", en: "Everything always", f: () => true },
  // Primero la armonía, luego la batería, después el bajo y al final la melodía, en bloques de n/4 compases
  { id: "capas", es: "Entra poco a poco", en: "Builds up", f: (t, k, n) => k >= ({ armonia: 0, textura: 0, percusion: 1, bajo: 2, melodia: 3 }[t.kind] ?? 1) * (n / 4) },
  { id: "drop", es: "Intro y drop", en: "Intro and drop", f: (t, k, n) => ["armonia", "textura"].includes(t.kind) || k >= n / 2 },
  { id: "break", es: "Con break en medio", en: "With a break", f: (t, k, n) => t.kind !== "percusion" || !(k >= n / 2 - n / 8 && k < n / 2 + n / 8) },
  { id: "pregunta", es: "Pregunta y respuesta", en: "Call and response", f: (t, k, n, i) => (t.kind === "melodia" ? k % 4 < 2 : t.kind === "armonia" ? true : t.kind === "percusion" || t.kind === "bajo" ? true : k % 4 >= 2) },
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function arrangeHTML(state, n, { icon, kindColor }) {
  if (!state.tracks.length) return `<p class="hint">${L("Añade pistas y aquí decidirás cuándo entra y sale cada una.", "Add tracks and here you'll decide when each one comes in and out.")}</p>`;
  const head = Array.from({ length: n }, (_, k) => `<span class="ar-bar ${k % 4 === 0 ? "major" : ""}">${k % 4 === 0 ? k + 1 : ""}</span>`).join("");
  const rows = state.tracks.map((t) => {
    const bars = barsOf(t.code, n);
    const w = getWrap(t.code, ["mask"]);
    if (!bars) return `<div class="ar-row" style="--k:${kindColor(t.kind)}"><span class="ar-name">${icon(t.kind, 14)} <code>${esc(t.id)}</code> ${esc(t.name)}</span><span class="hint ar-complex">${L("Su mask es demasiado complejo para la rejilla", "Its mask is too complex for the grid")}: <code>${esc(w)}</code></span></div>`;
    return `<div class="ar-row ${t.muted ? "muted" : ""}" data-id="${esc(t.id)}" style="--k:${kindColor(t.kind)}"><span class="ar-name">${icon(t.kind, 14)} <code>${esc(t.id)}</code> ${esc(t.name)}</span>
      <div class="ar-cells" style="--n:${n}">${bars.map((on, k) => `<button class="ar-cell ${on ? "on" : ""} ${k % 4 === 0 ? "major" : ""}" data-k="${k}" aria-label="${esc(t.id)} ${k + 1}"></button>`).join("")}</div>
      <code class="ar-code">${w ? esc(w) + " $" : L("(siempre suena)", "(always plays)")}</code></div>`;
  }).join("");
  return `<div class="ar-tools"><label>${L("Compases", "Bars")} <select id="ar-n">${[8, 16, 32].map((x) => `<option ${x === n ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    <span class="ar-presets">${PRESETS.map((p) => `<button data-p="${p.id}">${esc(L(p.es, p.en))}</button>`).join("")}</span></div>
    <div class="ar-grid"><div class="ar-row ar-head"><span class="ar-name"></span><div class="ar-cells" style="--n:${n}">${head}</div><span></span></div>${rows}</div>`;
}
