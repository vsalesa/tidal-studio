// Samples de internet: Maestro pide un sonido que no tienes («descargar» en su respuesta),
// el estudio lo busca con licencia libre (packs de la comunidad o Freesound), lo descarga y lo carga.
// Esta tarjeta enseña qué ha bajado (nombre, fuente, licencia), deja escucharlo, probar otro
// y pide permiso antes de bajar paquetes grandes.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const KEY = "tidal-studio-web-samples";

// Activado por defecto; interruptor «Samples web» en la cabecera de Maestro
export function fetchEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setFetchEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* sin almacenamiento */ }
}

const mb = (b) => (b ? (b > 1048576 ? `~${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB` : `~${Math.max(1, Math.round(b / 1024))} KB`) : "");
export function sourceName(c) {
  if (!c) return "";
  return c.source === "freesound" ? "Freesound" : c.pack_name || c.pack || L("pack", "pack");
}
function licTag(c) {
  const free = /^(CC0|Unlicense)/.test(c.license_name || "");
  const note = free ? L("libre, sin obligación de citar", "free, no credit required") : L("cita al autor: queda apuntado en samples/CREDITS.md", "credit the author: it's recorded in samples/CREDITS.md");
  return `<span class="lic" title="${esc(note)}">${esc(c.license_name || "?")}</span>`;
}

// Texto que acompaña al historial para que la IA sepa qué se descargó y con qué nombre
export function fetchContext(m) {
  if (!m.descargas || !m.descargas.length) return "";
  const st = { descargado: L("descargado", "downloaded"), ya: L("ya estaba", "already there"), permiso: L("pendiente de permiso", "waiting for permission"),
    nada: L("no encontrado", "not found"), error: "error", rechazado: L("el alumno no lo quiso", "the student declined it") };
  return `\n[${L("Samples de internet", "Internet samples")}: ${m.descargas.map((d) => `${d.nombre} (${st[d.estado] || d.estado}${d.sustituido ? `, ${L("usé", "used")} ${d.alternativa}` : ""})`).join(", ")}]`;
}

export function fetchHTML(m, mi, playing) {
  const items = m.descargas.map((d, k) => {
    const c = (d.candidatos || [])[d.elegido || 0];
    const busy = d.busy ? " busy" : "";
    const on = playing && playing.mi === mi && playing.k === k;
    const hear = c || d.estado === "ya" ? `<button class="fx-hear${on ? " on" : ""}" data-fx="hear" data-mi="${mi}" data-k="${k}">${on ? `${icon("stop", 12)} ${L("Parar", "Stop")}` : `${icon("speaker", 13)} ${L("Escuchar", "Listen")}`}</button>` : "";
    const others = (d.candidatos || []).length > 1 && /descargado|ya|permiso/.test(d.estado) && d.estado !== "ya"
      ? `<button class="link" data-fx="other" data-mi="${mi}" data-k="${k}" title="${esc(L("Cambia este sonido por el siguiente resultado de la búsqueda", "Swap this sound for the next search result"))}">${L("Otro sonido", "Another sound")}</button>` : "";
    let status = "", acts = "";
    if (d.estado === "descargado") status = `${icon("check", 12)}<span>${L("Descargado y cargado en SuperDirt: listo para sonar", "Downloaded and loaded into SuperDirt: ready to play")}</span>`;
    else if (d.estado === "ya") status = `${icon("check", 12)}<span>${L("Ya estaba en tu biblioteca", "Already in your library")}</span>`;
    else if (d.estado === "permiso") {
      status = L(`Es un paquete grande (${c.files} archivos${c.bytes ? ", " + mb(c.bytes) : ""}). ¿Lo descargo? Hasta entonces esa parte no suena.`,
        `It's a big pack (${c.files} files${c.bytes ? ", " + mb(c.bytes) : ""}). Shall I download it? Until then that part stays silent.`);
      acts = `<button class="primary" data-fx="get" data-mi="${mi}" data-k="${k}">${icon("download", 12)} ${L("Descargar", "Download")}</button>
        <button class="link" data-fx="skip" data-mi="${mi}" data-k="${k}">${L("No, gracias", "No, thanks")}</button>`;
    } else if (d.estado === "rechazado") status = L("No descargado.", "Not downloaded.");
    else if (d.estado === "nada" || d.estado === "error") {
      status = (d.estado === "error" ? L("No se pudo descargar: ", "Couldn't download: ") + esc(d.error || "") : L(`No he encontrado «${esc(d.busqueda)}» con licencia libre.`, `I couldn't find «${esc(d.busqueda)}» with a free license.`))
        + (d.sustituido ? " " + L(`Mientras tanto uso <code>${esc(d.alternativa)}</code>, que ya tienes.`, `Meanwhile I'm using <code>${esc(d.alternativa)}</code>, which you already have.`) : "");
      acts = `<button class="link" data-fx="library" data-mi="${mi}" data-k="${k}">${icon("search", 12)} ${L("Buscar en la biblioteca", "Search the library")}</button>`;
    }
    const who = c ? `${esc(c.title)}${c.author ? ` · ${esc(c.author)}` : ""}` : "";
    const meta = c ? `<span class="fx-src">${esc(sourceName(c))}</span>${licTag(c)}${c.duration ? `<span>${c.duration}s</span>` : ""}${c.files > 1 ? `<span>${c.files} ${L("variantes", "variants")}</span>` : ""}
      ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${icon("link", 11)} ${L("origen", "source")}</a>` : ""}` : "";
    return `<div class="fx-item ${esc(d.estado)}${busy}">
      <div class="fx-top"><code class="fx-name">s "${esc(d.nombre)}"</code><span class="fx-who">${who}</span></div>
      ${meta ? `<div class="fx-meta">${meta}</div>` : ""}
      ${d.por_que ? `<div class="fx-why">${esc(d.por_que)}</div>` : ""}
      <div class="fx-status">${d.busy ? `<span>${L("Descargando…", "Downloading…")}</span>` : `<span>${status}</span>`}</div>
      <div class="fx-row">${hear}${acts}<span class="va-sp"></span>${others}</div>
    </div>`;
  }).join("");
  return `<div class="fetch"><div class="fx-head">${icon("download", 13)} ${L("Samples de internet", "Internet samples")}</div>${items}</div>`;
}
