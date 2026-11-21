// Opciones para escuchar: Maestro responde a una petición creativa con 3-4 opciones distintas.
// Cada una suena en directo sobre la canción (se cambia de una a otra al instante, A/B),
// y el alumno elige la que más le gusta; las demás se descartan.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const LETTERS = ["A", "B", "C", "D"];
const KEY = "tidal-studio-variants";

// Activado por defecto; se puede apagar con el interruptor bajo el chat
export function variantsEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setVariantsEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* sin almacenamiento */ }
}

// Texto que acompaña al historial para que la IA sepa qué opciones ofreció y cuál se eligió
export function variantsContext(m) {
  if (!m.variantes || !m.variantes.length) return "";
  const list = m.variantes.map((v, k) => `${LETTERS[k]}) ${v.titulo}: ${(v.cambios.pistas || []).map((p) => `${p.id} $ ${p.codigo}`).join(" | ")}`).join("\n");
  const pick = m.picked != null ? `\n${L("Elegida", "Picked")}: ${LETTERS[m.picked]}` : "";
  return `\n[${L("Opciones que ofrecí", "Options I offered")}:\n${list}${pick}]`;
}

// a: { mi, k } la opción que suena ahora (o null); diffHTML(k) devuelve el código de la opción k
export function variantsHTML(m, mi, a, diffHTML) {
  const picked = m.picked;
  const done = picked != null || m.dismissed;
  const cards = m.variantes.map((v, k) => {
    const playing = a && a.mi === mi && a.k === k;
    const lost = done && picked !== k;
    const cls = ["va-card", playing ? "playing" : "", picked === k ? "picked" : "", lost ? "lost" : ""].join(" ");
    const tracks = (v.cambios.pistas || []).map((p) => p.id).concat((v.cambios.eliminar || []).map((id) => "−" + id));
    return `<div class="${cls}" data-k="${k}">
      <div class="va-top"><span class="va-letter">${LETTERS[k]}</span><span class="va-title">${esc(v.titulo)}</span>
        ${v.concepto ? `<span class="tag">${esc(v.concepto)}</span>` : ""}<span class="va-meta">${esc(tracks.join(" · "))}${v.cambios.bpm ? ` · ${Math.round(v.cambios.bpm)} BPM` : ""}</span></div>
      ${v.descripcion ? `<div class="va-desc">${esc(v.descripcion)}</div>` : ""}
      ${done ? (picked === k ? `<div class="va-badge">${icon("check", 12)} ${L("Elegida", "Picked")}</div>` : "")
        : `<div class="va-row">
        <button class="va-play${playing ? " on" : ""}" data-va="play" data-mi="${mi}" data-k="${k}" title="${esc(L("Suena en directo sobre tu canción hasta que pares o cambies de opción", "Plays live over your song until you stop or switch options"))}">${playing ? `${icon("stop", 12)} ${L("Sonando", "Playing")}` : `${icon("speaker", 13)} ${L("Escuchar", "Listen")}`}</button>
        <button class="primary" data-va="pick" data-mi="${mi}" data-k="${k}">${icon("check", 12)} ${L("Elegir esta", "Pick this one")}</button>
      </div>`}
      <details class="va-code"><summary>${L("Ver el código", "See the code")}</summary>${diffHTML(k)}</details>
    </div>`;
  }).join("");
  const anyPlaying = a && a.mi === mi;
  const foot = done ? "" : `<div class="va-foot">
      <button data-va="stop" data-mi="${mi}" ${anyPlaying ? "" : "disabled"}>${icon("stop", 12)} ${L("Parar", "Stop")}</button>
      <button data-va="ab" data-mi="${mi}" ${a && a.mi === mi && a.prev != null ? "" : "disabled"} title="${esc(L("Salta entre las dos últimas que has escuchado", "Jump between the last two you listened to"))}">A/B</button>
      <span class="va-sp"></span>
      <button class="link" data-va="more" data-mi="${mi}">${L("Otras opciones", "Other options")}</button>
      <button class="link" data-va="refine" data-mi="${mi}">${L("Afinar…", "Refine…")}</button>
      <button class="link" data-va="none" data-mi="${mi}">${L("Ninguna", "None")}</button>
    </div>
    <form class="va-refine" data-mi="${mi}" hidden><input placeholder="${esc(L("Ej.: la B pero más suave y con menos notas", "E.g.: B but softer and with fewer notes"))}"><button class="primary" type="submit">${L("Pedir", "Ask")}</button></form>`;
  return `<div class="variants${done ? " done" : ""}">
    ${done ? `<div class="va-head">${picked != null ? L(`Elegiste la ${LETTERS[picked]}; las demás se descartaron.`, `You picked ${LETTERS[picked]}; the others were discarded.`) : L("Opciones descartadas.", "Options discarded.")}</div>`
      : `<div class="va-head">${L("Suenan en directo sobre tu canción · teclas 1-4 para cambiar, Esc para parar", "They play live over your song · keys 1-4 to switch, Esc to stop")}</div>`}
    ${cards}${foot}</div>`;
}
