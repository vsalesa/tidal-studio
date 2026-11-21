import { L } from "./i18n.js";
import { fmt, codeNum } from "./controls.js";
// Mesa de mezcla: volumen (en dB) y ecualizador de 3 bandas por pista, más un canal general (master).
// No toca el código de la pista: al hacerla sonar se añade al final
//   # amp 0.283 # eqlow 3 # eqmid -2 # eqhigh 1
// amp es el volumen base de SuperDirt (0.4 = 0 dB). eqlow/eqmid/eqhigh los define BootTidal.hs
// y los aplica el módulo studio_eq de supercollider/studio-synths.scd (graves 200 Hz, medios 1 kHz, agudos 4 kHz).

export const BASE_AMP = 0.4;
export const VOL_MIN = -40, VOL_MAX = 6, EQ_MIN = -12, EQ_MAX = 12;
export const BANDS = [["high", "eqhigh"], ["mid", "eqmid"], ["low", "eqlow"]];
const FLAT = () => ({ vol: 0, low: 0, mid: 0, high: 0 });
export const mixOf = (t) => ({ ...FLAT(), ...(t && t.mix) });
export const masterOf = (state) => ({ ...FLAT(), ...(state.master || {}) });
export const isFlat = (m) => !m.vol && !m.low && !m.mid && !m.high;
export const ampOf = (db) => (db <= VOL_MIN ? 0 : BASE_AMP * Math.pow(10, db / 20));
export const dbOf = (amp) => (amp <= 0 ? VOL_MIN : Math.round(20 * Math.log10(amp / BASE_AMP) * 2) / 2);
export const dbText = (db) => (db <= VOL_MIN ? "−∞ dB" : `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db)} dB`);
const clampDb = (v, a, b) => Math.max(a, Math.min(b, Math.round(v * 2) / 2));

// Lo que se añade a la pista al sonar (pista + master). "" si todo está plano.
export function mixSuffix(t, state) {
  const m = mixOf(t), M = masterOf(state);
  const vol = Math.max(VOL_MIN, m.vol + M.vol);
  const out = [];
  if (vol) out.push(`# amp ${fmt(ampOf(vol))}`);
  for (const [b, p] of [["low", "eqlow"], ["mid", "eqmid"], ["high", "eqhigh"]]) { const v = clampDb(m[b] + M[b], -24, 24); if (v) out.push(`# ${p} ${codeNum(v)}`); }
  return out.join(" ");
}
// ¿Debe sonar? (silenciada o hay otra en solo)
export const audible = (t, state) => !t.muted && (!state.tracks.some((x) => x.solo) || t.solo);

// Línea extra en la vista de código: "  # amp 0.283 # eqlow 3 -- mix"
export const MIX_TAG = () => L("mezcla", "mix");
export const mixLine = (t, state) => { const s = mixSuffix(t, state); return s ? `  ${s} -- ${MIX_TAG()}` : ""; };
// Lee esa línea al aplicar el código a mano (devuelve los dB de la pista, sin el master)
export function parseMixLine(line, state) {
  const m = line.match(/^\s*(#.*?)\s*--\s*(mezcla|mix)\s*$/);
  if (!m) return null;
  const M = masterOf(state), mix = FLAT();
  const amp = m[1].match(/#\s*amp\s+([\d.]+)/);
  if (amp) mix.vol = clampDb(dbOf(+amp[1]) - M.vol, VOL_MIN, VOL_MAX);
  for (const [b, p] of BANDS) { const x = m[1].match(new RegExp(`#\\s*${p}\\s+\\(?\\s*(-?[\\d.]+)`)); if (x) mix[b] = clampDb(+x[1] - M[b], EQ_MIN, EQ_MAX); }
  return mix;
}

// ------------------------------------------------------------------ pintar la mesa
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BAND_LABEL = () => ({ high: L("Agudos", "Highs"), mid: L("Medios", "Mids"), low: L("Graves", "Lows") });
function stripHTML(id, title, sub, m, { color, master, muted, solo } = {}) {
  const B = BAND_LABEL();
  return `<div class="mx-strip ${master ? "master" : ""} ${muted ? "muted" : ""}" data-id="${esc(id)}" style="--k:${color || "var(--ink)"}">
    <div class="mx-head"><code>${esc(title)}</code><span>${esc(sub)}</span></div>
    <div class="mx-eq">${BANDS.map(([b]) => `<label title="${esc(B[b])}"><span>${esc(B[b])}</span>
      <input type="range" data-mx="${b}" min="${EQ_MIN}" max="${EQ_MAX}" step="0.5" value="${m[b]}"><output>${m[b] > 0 ? "+" : ""}${m[b]}</output></label>`).join("")}</div>
    <div class="mx-fader"><input type="range" data-mx="vol" min="${VOL_MIN}" max="${VOL_MAX}" step="0.5" value="${m.vol}" aria-label="${esc(L("Volumen", "Volume"))}"></div>
    <output class="mx-db">${dbText(m.vol)}</output>
    ${master ? `<button class="mx-btn" data-mxa="flat" title="${esc(L("Dejar todo plano (0 dB)", "Set everything flat (0 dB)"))}">0 dB</button>` :
      `<div class="mx-btns"><button class="mx-btn ${muted ? "on" : ""}" data-mxa="mute" title="${esc(L("Silenciar", "Mute"))}">M</button><button class="mx-btn solo ${solo ? "on" : ""}" data-mxa="solo" title="${esc(L("Solo: escuchar solo esta", "Solo: hear only this one"))}">S</button><button class="mx-btn" data-mxa="card" title="${esc(L("Tarjeta configuradora en Maestro", "Configurator card in Maestro"))}">⋯</button></div>`}
  </div>`;
}
export function mixerHTML(state, { kindColor }) {
  if (!state.tracks.length) return `<p class="hint">${L("Cuando tengas pistas, aquí podrás mezclarlas.", "Once you have tracks, you can mix them here.")}</p>`;
  const M = masterOf(state);
  return `<div class="mx-desk">
    <div class="mx-strips">${state.tracks.map((t) => stripHTML(t.id, t.id, t.name, mixOf(t), { color: kindColor(t.kind), muted: t.muted, solo: t.solo })).join("")}</div>
    ${stripHTML("master", "Master", L("General", "Overall"), M, { master: true })}
  </div>
  <div class="mx-code" id="mx-code">${mixCodeHTML(state)}</div>`;
}
export function mixCodeHTML(state) {
  const rows = state.tracks.map((t) => { const s = mixSuffix(t, state); return s ? `<div><code>${esc(t.id)} $ … ${esc(s)}</code></div>` : ""; }).join("");
  return rows || `<div class="hint">${L("Todo está plano (0 dB): la mezcla no añade nada al código.", "Everything is flat (0 dB): the mix adds nothing to the code.")}</div>`;
}
export function setMix(state, id, band, v) {
  const lim = band === "vol" ? [VOL_MIN, VOL_MAX] : [EQ_MIN, EQ_MAX];
  v = clampDb(+v, ...lim);
  if (id === "master") { state.master = { ...masterOf(state), [band]: v }; return null; }
  const t = state.tracks.find((x) => x.id === id); if (!t) return null;
  t.mix = { ...mixOf(t), [band]: v };
  return t;
}

// ------------------------------------------------------------------ la mezcla, a la vista en Pistas y Bloques
// Una etiqueta pequeña bajo cada pista con lo que la Mezcla le añade al sonar (no está en su código).
// Al pulsarla se abre la pestaña Mezcla con esa pista resaltada.
const sgn = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
export function mixBadgeHTML(t, state, mixIcon = "") {
  const m = mixOf(t), M = masterOf(state);
  const B = BAND_LABEL();
  const parts = [];
  if (m.vol) parts.push(`${L("Vol", "Vol")} ${dbText(m.vol)}`);
  for (const b of ["low", "mid", "high"]) if (m[b]) parts.push(`${B[b]} ${sgn(m[b])} dB`);
  const solo = t.solo, others = !t.solo && state.tracks.some((x) => x.solo);
  const master = !isFlat(M);
  if (!parts.length && !master && !solo && !others) return "";
  const suf = mixSuffix(t, state);
  const tip = L(`Lo pone la pestaña Mezcla, no está en el código de la pista. Al sonar se añade: ${suf || "(nada)"}. Pulsa para abrir la Mezcla.`,
    `Set in the Mix tab, not in the track's code. When it plays it adds: ${suf || "(nothing)"}. Click to open Mix.`);
  return `<button class="mix-badge" data-a="mix" data-id="${esc(t.id)}" title="${esc(tip)}">${mixIcon}<b>${L("Mezcla", "Mix")}</b>
    ${parts.length ? `<span>${esc(parts.join(" · "))}</span>` : ""}
    ${master ? `<span class="mb-m">+ Master</span>` : ""}${solo ? `<span class="mb-s">Solo</span>` : ""}${others ? `<span class="mb-m">${L("no suena: otra pista en solo", "silent: another track is soloed")}</span>` : ""}<span class="mb-h">${L("se añade al sonar, no está en tu código", "added when it plays, not in your code")}</span></button>`;
}
