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
// A ciegas (0.14): se esconden nombres, descripciones y código; las opciones se barajan y se llaman X, Y, Z, W.
// Escuchas sobre tu canción, votas la que más te gusta y entonces se revela cuál era. El voto se guarda en tu dataset.
export const BLIND = ["X", "Y", "Z", "W"];
export function blindStart(m) {
  const order = m.variantes.map((_, k) => k);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  m.blind = { order, choice: null, revealed: false };
}
const blindOn = (m) => !!(m.blind && !m.blind.revealed);

export function variantsHTML(m, mi, a, diffHTML) {
  if (blindOn(m) && m.picked == null && !m.dismissed) return blindHTML(m, mi, a);
  const picked = m.picked;
  const done = picked != null || m.dismissed;
  const cards = m.variantes.map((v, k) => {
    const playing = a && a.mi === mi && a.k === k;
    const lost = done && picked !== k;
    const cls = ["va-card", playing ? "playing" : "", picked === k ? "picked" : "", lost ? "lost" : ""].join(" ");
    const tracks = (v.cambios.pistas || []).map((p) => p.id).concat((v.cambios.eliminar || []).map((id) => "−" + id));
    const blindPick = m.blind && m.blind.revealed && m.blind.choice === k;
    return `<div class="${cls}${blindPick ? " blind-win" : ""}" data-k="${k}">
      ${blindPick ? `<div class="va-blind-win">${icon("ear", 13)} ${L(`Tu voto a ciegas (era la ${BLIND[m.blind.order.indexOf(k)]})`, `Your blind vote (it was ${BLIND[m.blind.order.indexOf(k)]})`)}</div>` : ""}
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
      ${m.variantes.length > 1 && !m.blind ? `<button data-va="blind" data-mi="${mi}" title="${esc(L("Esconde los nombres y baraja las opciones: votas solo con el oído", "Hides the names and shuffles the options: you vote by ear only"))}">${icon("ear", 13)} ${L("A ciegas", "Blind")}</button>` : ""}
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

function blindHTML(m, mi, a) {
  const cards = m.blind.order.map((k, pos) => {
    const playing = a && a.mi === mi && a.k === k;
    return `<div class="va-card blind${playing ? " playing" : ""}" data-k="${k}">
      <div class="va-top"><span class="va-letter">${BLIND[pos]}</span><span class="va-title">${L("Opción oculta", "Hidden option")}</span></div>
      <div class="va-row">
        <button class="va-play${playing ? " on" : ""}" data-va="play" data-mi="${mi}" data-k="${k}">${playing ? `${icon("stop", 12)} ${L("Sonando", "Playing")}` : `${icon("speaker", 13)} ${L("Escuchar", "Listen")}`}</button>
        <button class="primary" data-va="vote" data-mi="${mi}" data-k="${k}">${icon("ear", 12)} ${L("Me gusta más esta", "I like this one best")}</button>
      </div>
    </div>`;
  }).join("");
  return `<div class="variants blind">
    <div class="va-head">${icon("ear", 14)} ${L("A ciegas: sin nombres ni código. Escúchalas sobre tu canción (teclas 1-4) y vota con el oído; luego te digo cuál era.", "Blind: no names or code. Listen over your song (keys 1-4) and vote by ear; then I'll tell you which one it was.")}</div>
    ${cards}
    <form class="va-why" data-mi="${mi}"><input name="why" placeholder="${esc(L("¿Por qué? (opcional: más groove, menos notas…)", "Why? (optional: more groove, fewer notes…)"))}"></form>
    <div class="va-foot">
      <button data-va="stop" data-mi="${mi}" ${a && a.mi === mi ? "" : "disabled"}>${icon("stop", 12)} ${L("Parar", "Stop")}</button>
      <button data-va="ab" data-mi="${mi}" ${a && a.mi === mi && a.prev != null ? "" : "disabled"}>A/B</button>
      <span class="va-sp"></span>
      <button class="link" data-va="same" data-mi="${mi}">${L("Me dan igual", "No preference")}</button>
      <button class="link" data-va="unblind" data-mi="${mi}">${L("Ver nombres", "Show names")}</button>
    </div></div>`;
}
