import { L } from "./i18n.js";
import { elementsOf, ADD_PARAMS, WRAPS } from "./edit.js";
import { PARAMS as CP, fmt } from "./controls.js";
import { mixOf, masterOf, mixSuffix, dbText, VOL_MIN, VOL_MAX, EQ_MIN, EQ_MAX, BANDS } from "./mixer.js";
// «Tarjeta configuradora» de Maestro: una tarjeta en el chat con TODOS los valores de una pista
// (patrón, transformaciones y sus números, ajustes #, volumen y ecualizador) o de la canción entera
// (tempo, master y volumen de cada pista). Cada cambio reescribe el código al momento.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toPos = (r, v) => (r.log ? Math.round(1000 * Math.log(Math.max(v, r.min || 1) / (r.min || 1)) / Math.log(r.max / (r.min || 1))) : v);
export const cardFromPos = (r, p) => { if (!r.log) return +p; const v = (r.min || 1) * Math.pow(r.max / (r.min || 1), p / 1000); return v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10; };
export const isSongCard = (c) => !c.pista || c.pista === "cancion" || c.pista === "song";

function slider(attrs, r, v, out) {
  return `<div class="ctl-row"><input type="range" ${attrs} min="${r.log ? 0 : r.min}" max="${r.log ? 1000 : r.max}" step="${r.log ? 1 : r.step}" value="${toPos(r, v)}" ${r.log ? `data-log="${r.min}|${r.max}"` : ""}><output>${out}</output></div>`;
}
const mixRows = (m, id) => `<div class="card-mix" data-id="${esc(id)}">
  <span>${L("Volumen", "Volume")}</span>${slider(`data-mx="vol"`, { min: VOL_MIN, max: VOL_MAX, step: 0.5 }, m.vol, dbText(m.vol))}
  ${BANDS.map(([b]) => `<span>${{ high: L("Agudos", "Highs"), mid: L("Medios", "Mids"), low: L("Graves", "Lows") }[b]}</span>${slider(`data-mx="${b}"`, { min: EQ_MIN, max: EQ_MAX, step: 0.5 }, m[b], `${m[b] > 0 ? "+" : ""}${m[b]} dB`)}`).join("")}
</div>`;

export function cardCode(t, state) { const s = mixSuffix(t, state); return `${t.id} $ ${t.code}${s ? " " + s : ""}`; }

export function cardHTML(c, t, state, ci) {
  if (isSongCard(c)) {
    const M = masterOf(state);
    return `<div class="ctl card" data-c="${ci}" data-t="song">
      <div class="ctl-top"><b>${L("Tarjeta de la canción", "Song card")}</b><code class="ctl-code">setcps (${state.bpm}/60/4)</code></div>
      <div class="card-sec"><h5>Tempo</h5>${slider(`data-song="bpm"`, { min: 60, max: 180, step: 1 }, state.bpm, `${state.bpm} BPM`)}</div>
      <div class="card-sec"><h5>${L("Master (toda la canción)", "Master (whole song)")}</h5>${mixRows(M, "master")}</div>
      <div class="card-sec"><h5>${L("Volumen de cada pista", "Volume of each track")}</h5>
        ${state.tracks.map((x) => { const m = mixOf(x); return `<div class="card-trk" data-id="${esc(x.id)}"><span><code>${esc(x.id)}</code> ${esc(x.name)}</span>${slider(`data-mx="vol" data-id="${esc(x.id)}"`, { min: VOL_MIN, max: VOL_MAX, step: 0.5 }, m.vol, dbText(m.vol))}<button class="card-open" data-open="${esc(x.id)}" title="${esc(L("Abrir su tarjeta", "Open its card"))}">⋯</button></div>`; }).join("")}
      </div>
      <p class="ctl-ex">${L("El master suma (o resta) dB a todas las pistas a la vez. 0 dB es el volumen normal; −6 dB es más o menos la mitad de fuerte.", "The master adds (or removes) dB on every track at once. 0 dB is normal volume; −6 dB is roughly half as loud.")}</p></div>`;
  }
  const els = elementsOf(t.code);
  const focus = c.foco ? String(c.foco).toLowerCase() : "";
  const hot = (e) => focus && ((e.name || e.fn || "").toLowerCase() === focus || e.kind === focus) ? " hot" : "";
  const pats = els.filter((e) => e.kind === "src" || e.kind === "raw").map((e) => `<label class="card-field${hot(e)}"><span>${e.kind === "raw" ? L("Patrón", "Pattern") : e.fn === "s" || e.fn === "sound" ? L("Sonidos", "Sounds") : L("Notas", "Notes")}</span>
      <input type="text" data-key="${esc(e.key)}" value="${esc(e.text)}" spellcheck="false"></label>`).join("");
  const wraps = els.filter((e) => e.kind === "wrap").map((e) => `<div class="card-wrap${hot(e)}"><div class="card-field"><span>${esc(e.fn)}</span><input type="text" data-key="${esc(e.key)}" value="${esc(e.text)}" spellcheck="false"><button class="card-del" data-del="${esc(e.key)}" title="${esc(L("Quitar", "Remove"))}">×</button></div>
      ${e.nums.map((n) => `<div class="card-num"><span>${esc(n.fn)}</span>${slider(`data-key="${esc(n.key)}" data-num="1"`, n, n.value, fmt(n.value))}</div>`).join("")}</div>`).join("");
  const params = els.filter((e) => e.kind === "param").map((e) => {
    const P = CP[e.name];
    const label = P ? L(P.es, P.en) : e.name;
    const body = e.range ? slider(`data-key="${esc(e.key)}"`, e.range, e.value, fmt(e.value)) : `<input type="text" data-key="${esc(e.key)}" value="${esc(e.text)}" spellcheck="false">`;
    return `<div class="card-param${hot(e)}"><span title="${esc(e.op + " " + e.name)}"><code>${esc(e.op)} ${esc(e.name)}</code> ${esc(label)}</span>${body}<button class="card-del" data-del="${esc(e.key)}" title="${esc(L("Quitar", "Remove"))}">×</button></div>`;
  }).join("");
  const have = new Set(els.filter((e) => e.kind === "param").map((e) => e.name));
  const srcKey = (els.find((e) => e.kind === "src" || e.kind === "raw") || {}).key;
  return `<div class="ctl card" data-c="${ci}" data-t="${esc(t.id)}">
    <div class="ctl-top"><span class="ctl-trk">${esc(t.id)}</span><b>${L("Tarjeta configuradora", "Configurator card")} · ${esc(t.name)}</b></div>
    <code class="ctl-code card-code">${esc(cardCode(t, state))}</code>
    ${pats ? `<div class="card-sec"><h5>${L("Qué suena", "What plays")}</h5>${pats}</div>` : ""}
    <div class="card-sec"><h5>${L("Transformaciones", "Transformations")} <code>… $</code></h5>${wraps || `<p class="hint">${L("Ninguna todavía.", "None yet.")}</p>`}
      <select data-addwrap="1"><option value="">${L("+ Añadir transformación…", "+ Add transformation…")}</option>${WRAPS.map(([w, lab]) => `<option value="${esc(w)}">${esc(lab())} · ${esc(w)}</option>`).join("")}</select></div>
    <div class="card-sec"><h5>${L("Ajustes", "Settings")} <code>#</code></h5>${params || `<p class="hint">${L("Ninguno todavía.", "None yet.")}</p>`}
      ${srcKey ? `<select data-addparam="${esc(srcKey)}"><option value="">${L("+ Añadir ajuste…", "+ Add setting…")}</option>${ADD_PARAMS.filter((p) => !have.has(p)).map((p) => `<option value="${p}">${esc(L(CP[p].es, CP[p].en))} · # ${p}</option>`).join("")}</select>` : ""}</div>
    <div class="card-sec"><h5>${L("Mezcla de la pista", "Track mix")}</h5>${mixRows(mixOf(t), t.id)}</div>
    <p class="ctl-ex">${L("Todo lo que ves aquí está en el código de la línea gris. Mueve un valor y fíjate en qué número cambia. Restaurar deja la pista como estaba.", "Everything here lives in the code in the grey line. Move a value and watch which number changes. Restore puts the track back as it was.")}</p></div>`;
}
