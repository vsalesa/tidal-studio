// Marca en rojo, dentro del código, los sonidos o sintes que SuperDirt no tiene.
// El servidor lee de SuperCollider la lista de sonidos cargados (TIDAL_STUDIO_SOUNDS) y
// los avisos "no synth or module named …"; aquí se pinta una capa detrás del textarea.
import { L } from "./i18n.js";

let known = null;          // Set con los sonidos disponibles (null = aún no lo sabemos: simulación o arrancando)
let reported = new Set();  // los que SuperDirt ha dicho que no encuentra
let rev = -1;
const attached = new Set();

export function setSoundInfo(info) {
  known = info.sounds && info.sounds.length ? new Set(info.sounds) : null;
  reported = new Set(info.missing || []);
  refreshHighlights();
}
// Llama a esto con el sounds_rev de /api/status: si ha cambiado, vuelve a pedir la lista
export async function syncSounds(newRev, api) {
  if (newRev === undefined || newRev === rev) return;
  rev = newRev;
  try { setSoundInfo(await api("/api/sounds")); } catch { /* sin servidor */ }
}
export const isMissing = (name) => reported.has(name) || (known !== null && !known.has(name));

// Nombres usados en  s "…"  /  sound "…"  con su posición en el texto
export function soundRefs(code) {
  const out = [], re = /(^|[^\w'])(s|sound)(\s*\(?\s*)"([^"]*)"/g;
  let m;
  while ((m = re.exec(code))) {
    const base = m.index + m[1].length + m[2].length + m[3].length + 1, body = m[4];
    const tok = /[A-Za-z0-9_]+/g;
    let t;
    while ((t = tok.exec(body))) {
      const before = body.slice(0, t.index).trimEnd().slice(-1);
      if ("*/!@%(,:?".includes(before) && before !== "") continue;   // números de *2, :3, (3,8)…
      if (/^\d+(\.\d+)?$/.test(t[0])) continue;
      out.push({ name: t[0], start: base + t.index, end: base + t.index + t[0].length });
    }
  }
  return out;
}
export const missingIn = (code) => [...new Set(soundRefs(code).filter((r) => isMissing(r.name)).map((r) => r.name))];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function markup(code, play = []) {
  // Rangos a marcar: sonidos que faltan (rojo) y lo que está sonando ahora (play)
  const ranges = [];
  for (const r of soundRefs(code)) if (isMissing(r.name)) ranges.push({ start: r.start, end: r.end, cls: "miss" });
  for (const [a, b] of play) if (a >= 0 && b <= code.length && b > a) ranges.push({ start: a, end: b, cls: "play" });
  const cuts = [...new Set([0, code.length, ...ranges.flatMap((r) => [r.start, r.end])])].sort((x, y) => x - y);
  let html = "";
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const cls = [...new Set(ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.cls))];
    const txt = esc(code.slice(a, b));
    html += cls.length ? `<mark class="${cls.join(" ")}">${txt}</mark>` : txt;
  }
  return html + "\n";
}

const COPY = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "tabSize", "whiteSpace", "overflowWrap", "wordBreak",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing"];

function update(ta) {
  const w = ta._hl;
  if (!w || !ta.isConnected) { attached.delete(ta); return; }
  const cs = getComputedStyle(ta);
  for (const k of COPY) w.pre.style[k] = cs[k];
  w.pre.innerHTML = markup(ta.value, ta._play || []);
  w.sig = JSON.stringify(ta._play || []);
  w.pre.scrollTop = ta.scrollTop; w.pre.scrollLeft = ta.scrollLeft;
  const miss = missingIn(ta.value);
  w.note.hidden = !miss.length;
  w.note.textContent = miss.length ? L(`No existe en SuperDirt: ${miss.join(", ")}. Revisa el nombre o instala el sonido.`,
    `Not found in SuperDirt: ${miss.join(", ")}. Check the name or install the sound.`) : "";
}

export function attachHighlight(ta) {
  if (ta._hl) { update(ta); return; }
  const wrap = document.createElement("div"), pre = document.createElement("pre"), note = document.createElement("div");
  wrap.className = "hlwrap" + (ta.id ? ` hlwrap-${ta.id}` : "");
  pre.className = "hl"; pre.setAttribute("aria-hidden", "true");
  note.className = "miss-note"; note.hidden = true;
  const cs = getComputedStyle(ta);
  wrap.style.background = cs.backgroundColor; wrap.style.borderRadius = cs.borderRadius;
  ta.parentNode.insertBefore(wrap, ta);
  wrap.append(pre, ta);
  wrap.after(note);
  ta._hl = { pre, note };
  ta.addEventListener("input", () => update(ta));
  ta.addEventListener("scroll", () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
  attached.add(ta);
  update(ta);
}
export function refreshHighlights() { [...attached].forEach(update); }

// Lo que está sonando: [[inicio, fin], …] en el texto del textarea. Solo repinta la capa si cambia.
export function setPlayRanges(ta, ranges) {
  if (!ta || !ta._hl) return;
  const sig = JSON.stringify(ranges);
  if (sig === ta._hl.sig) return;
  ta._play = ranges; ta._hl.sig = sig;
  ta._hl.pre.innerHTML = markup(ta.value, ranges);
  ta._hl.pre.scrollTop = ta.scrollTop;
}
