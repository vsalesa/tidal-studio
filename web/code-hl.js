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
function markup(code) {
  let html = "", pos = 0;
  for (const r of soundRefs(code)) {
    if (!isMissing(r.name)) continue;
    html += esc(code.slice(pos, r.start)) + `<mark class="miss">${esc(code.slice(r.start, r.end))}</mark>`;
    pos = r.end;
  }
  return html + esc(code.slice(pos)) + "\n";
}

const COPY = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "tabSize", "whiteSpace", "overflowWrap", "wordBreak",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing"];

function update(ta) {
  const w = ta._hl;
  if (!w || !ta.isConnected) { attached.delete(ta); return; }
  const cs = getComputedStyle(ta);
  for (const k of COPY) w.pre.style[k] = cs[k];
  w.pre.innerHTML = markup(ta.value);
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
