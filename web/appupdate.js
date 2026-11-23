// Actualizaciones de Tidal Studio (la app entera): aviso arriba cuando hay versión nueva en GitHub,
// descarga con barra de progreso, «Instalar y reiniciar», y la sección «Actualizaciones» de Ajustes.
// El servidor hace el trabajo: server/appupdate.py
import { L, LANG } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LATER_KEY = "tidal-studio-update-later";   // «Más tarde»: no volver a avisar de esa versión hasta mañana
let st = null;
let timer = null;

async function call(path, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: LANG, ...body }) };
  const r = await fetch(path, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// Notas: **negrita**, `código` y viñetas «- »
function notesHTML(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const items = lines.filter((l) => l.startsWith("- "));
  if (items.length === lines.length) return `<ul>${items.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
  return lines.map((l) => (l.startsWith("- ") ? `<p>• ${inline(l.slice(2))}</p>` : `<p>${inline(l)}</p>`)).join("");
}

const mb = (n) => `${Math.round((n || 0) / 1048576)} MB`;
const pct = (p) => `${Math.round((p || 0) * 100)} %`;
const systemName = (s) => ({ mac: "macOS", windows: "Windows", linux: "Linux" }[s.platform] || "");

function passwordHint(s) {
  return s.platform === "mac" ? L("Tu Mac te pedirá tu contraseña para instalarla.", "Your Mac will ask for your password to install it.")
    : s.platform === "windows" ? L("Windows te pedirá permiso para instalarla.", "Windows will ask for permission to install it.")
    : L("Linux te pedirá tu contraseña para instalarla.", "Linux will ask for your password to install it.");
}

function actionsHTML(s, where) {
  if (s.kind === "source") {
    return `<a class="upd-btn primary" href="${esc(s.page)}" target="_blank" rel="noopener">${icon("cloud", 14)} ${L("Ver la versión nueva", "See the new version")}</a>`;
  }
  if (!s.asset) {
    return `<a class="upd-btn primary" href="${esc(s.page)}" target="_blank" rel="noopener">${L("Descargar desde GitHub", "Download from GitHub")}</a>`;
  }
  if (s.state === "available" || (s.state === "error" && s.latest)) {
    return `<button class="upd-btn primary" data-u="download">${icon("download", 14)} ${L("Actualizar ahora", "Update now")} <small>(${mb(s.asset.size)})</small></button>`;
  }
  if (s.state === "downloading" || s.state === "verifying") {
    return `<span class="upd-bar" title="${pct(s.progress)}"><span style="width:${pct(s.progress).replace(" ", "")}"></span></span>
      <span class="upd-pct">${s.state === "verifying" ? L("Comprobando…", "Verifying…") : pct(s.progress)}</span>`;
  }
  if (s.state === "ready") {
    return `<button class="upd-btn primary" data-u="install">${L("Instalar y reiniciar", "Install and restart")}</button>`;
  }
  if (s.state === "installing") return `<span class="upd-pct">${L("Cerrando para instalar…", "Closing to install…")}</span>`;
  return "";
}

function statusText(s) {
  if (s.state === "checking") return L("Buscando versiones nuevas…", "Checking for new versions…");
  if (s.state === "uptodate") {
    const when = s.checked_at ? new Date(s.checked_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return L(`Tienes la última versión (comprobado a las ${when}).`, `You have the latest version (checked at ${when}).`);
  }
  if (s.state === "error") return L("No he podido comprobarlo: ", "Couldn't check: ") + (s.error || "");
  if (["available", "downloading", "verifying", "ready", "installing"].includes(s.state)) {
    if (s.kind === "source") {
      return L(`Hay una versión nueva: ${s.latest}. Como usas Tidal Studio desde el código, actualiza con «git pull» (o vuelve a ejecutar el instalador).`,
        `A new version is out: ${s.latest}. You run Tidal Studio from source, so update with «git pull» (or run the installer again).`);
    }
    if (!s.asset) return L(`Hay una versión nueva: ${s.latest}, pero no trae instalador para tu ordenador.`, `A new version is out: ${s.latest}, but it has no installer for your computer.`);
    if (s.state === "ready") return L(`Tidal Studio ${s.latest} está descargado. Al instalar, la app se cierra y se vuelve a abrir sola. ${passwordHint(s)}`,
      `Tidal Studio ${s.latest} is downloaded. Installing closes the app and opens it again. ${passwordHint(s)}`);
    return L(`Tidal Studio ${s.latest} ya está disponible.`, `Tidal Studio ${s.latest} is available.`);
  }
  return "";
}

// ------------------------------------------------------------------ aviso arriba
function bannerVisible(s) {
  if (!s || !s.latest || !["available", "downloading", "verifying", "ready", "installing"].includes(s.state)) return false;
  if (s.skipped === s.latest && s.state === "available") return false;
  try {
    const later = JSON.parse(localStorage.getItem(LATER_KEY) || "{}");
    if (later.v === s.latest && Date.now() - later.at < 20 * 3600e3 && s.state === "available") return false;
  } catch { /* sin localStorage */ }
  return true;
}

function renderBanner() {
  const el = document.getElementById("upd-banner");
  if (!el) return;
  const s = st;
  if (!bannerVisible(s)) { el.hidden = true; el.innerHTML = ""; return; }
  const notes = (s.notes || {})[LANG === "en" ? "en" : "es"] || (s.notes || {}).en || "";
  el.hidden = false;
  el.innerHTML = `<div class="upd-main">
      <span class="upd-ico">${icon("download", 18)}</span>
      <div class="upd-text"><b>${L(`Tidal Studio ${esc(s.latest)} ya está aquí`, `Tidal Studio ${esc(s.latest)} is here`)}</b>
        <span>${s.state === "ready" ? esc(L("Listo para instalar. ", "Ready to install. ") + passwordHint(s))
          : esc(L(`Tienes la ${s.current}.`, `You have ${s.current}.`))}
        ${notes ? `<button class="upd-link" data-u="notes">${L("Novedades", "What's new")}</button>` : ""}</span></div>
      <div class="upd-actions">${actionsHTML(s, "banner")}
        ${s.state === "available" ? `<button class="upd-link" data-u="later">${L("Más tarde", "Later")}</button>
        <button class="upd-link" data-u="skip">${L("Saltar esta versión", "Skip this version")}</button>` : ""}
        ${s.state === "ready" ? `<button class="upd-link" data-u="later">${L("Ahora no", "Not now")}</button>` : ""}
      </div>
    </div>
    ${s.state === "error" && s.error ? `<p class="upd-err">${esc(s.error)}</p>` : ""}
    <div class="upd-notes" hidden>${notesHTML(notes)}</div>`;
}

// ------------------------------------------------------------------ Ajustes › Actualizaciones
function renderSettings() {
  const box = document.getElementById("upd-settings");
  if (!box || !st) return;
  const s = st;
  const notes = (s.notes || {})[LANG === "en" ? "en" : "es"] || "";
  box.innerHTML = `<p class="hint">${L(`Versión instalada: <b>${esc(s.current)}</b>`, `Installed version: <b>${esc(s.current)}</b>`)}
      ${s.kind === "source" ? L(" (desde el código)", " (from source)") : systemName(s) ? ` · ${systemName(s)}` : ""}</p>
    <label class="toggle"><input type="checkbox" data-u="auto" ${s.auto_check ? "checked" : ""}>
      ${L("Buscar versiones nuevas sola (al arrancar y cada 12 horas)", "Check for new versions automatically (at startup and every 12 hours)")}</label>
    <div class="row">
      <button type="button" data-u="check" ${["checking", "downloading", "installing"].includes(s.state) ? "disabled" : ""}>${icon("cloud", 14)} ${L("Buscar actualizaciones", "Check for updates")}</button>
      ${["available", "downloading", "verifying", "ready", "installing"].includes(s.state) ? actionsHTML(s, "settings") : ""}
    </div>
    <p class="hint upd-status">${esc(statusText(s))}</p>
    ${notes && s.latest && s.state !== "uptodate" ? `<details class="upd-notes-s"><summary>${L(`Novedades de la ${esc(s.latest)}`, `What's new in ${esc(s.latest)}`)}</summary>${notesHTML(notes)}</details>` : ""}
    <p class="hint">${L("Las versiones nuevas salen de las Releases de GitHub. El instalador se comprueba (SHA-256) antes de abrirlo; tus canciones, samples y ajustes no se tocan.",
      "New versions come from the GitHub Releases. The installer is verified (SHA-256) before it runs; your songs, samples and settings are left alone.")}</p>`;
}

function render() { renderBanner(); renderSettings(); }

// ------------------------------------------------------------------ acciones
async function act(a, el) {
  try {
    if (a === "notes") {
      const n = el.closest("#upd-banner").querySelector(".upd-notes");
      n.hidden = !n.hidden; return;
    }
    if (a === "later") {
      try { localStorage.setItem(LATER_KEY, JSON.stringify({ v: st.latest, at: Date.now() })); } catch { /* */ }
      document.getElementById("upd-banner").hidden = true; return;
    }
    if (a === "skip") st = await call("/api/appupdate/skip", { version: st.latest });
    if (a === "auto") st = await call("/api/appupdate/auto", { on: el.checked });
    if (a === "check") { st = { ...st, state: "checking" }; render(); st = await call("/api/appupdate/check", {}); }
    if (a === "download") { st = await call("/api/appupdate/download", {}); poll(800); }
    if (a === "install") {
      if (!confirm(L(`Tidal Studio se va a cerrar para instalar la ${st.latest} y se volverá a abrir. ¿Has guardado tu canción?`,
        `Tidal Studio will close to install ${st.latest} and open again. Have you saved your song?`))) return;
      const r = await call("/api/appupdate/install", {});
      st = r;
      if (!r.quitting) alert(L("Cierra Tidal Studio para terminar la actualización: se instalará y volverá a abrirse.",
        "Close Tidal Studio to finish the update: it will install and open again."));
    }
    if (a === "check" && st.state === "available" && st.skipped === st.latest) {
      // al buscar a mano, volver a ofrecer una versión que habías saltado
      st = await call("/api/appupdate/skip", { version: "" });
    }
  } catch (err) {
    st = { ...(st || {}), state: "error", error: err.message };
  }
  render();
}

function bind(root) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-u]");
    if (!b || b.dataset.u === "auto") return;
    e.preventDefault();
    act(b.dataset.u, b);
  });
  root.addEventListener("change", (e) => { if (e.target.dataset.u === "auto") act("auto", e.target); });
}

async function refresh() {
  try { st = await call("/api/appupdate"); render(); } catch { /* servidor viejo o apagándose */ }
  return st;
}

function poll(ms) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await refresh();
    const busy = st && ["checking", "downloading", "verifying"].includes(st.state);
    poll(busy ? 800 : 60_000);
  }, ms);
}

export function initAppUpdate() {
  const banner = document.getElementById("upd-banner");
  const box = document.getElementById("upd-settings");
  if (banner) bind(banner);
  if (box) bind(box);
  refresh();
  poll(25_000);  // la primera comprobación del servidor es a los 20 s del arranque
  // La app de Mac llama aquí desde «Tidal Studio › Buscar actualizaciones…»
  window.tsCheckUpdates = () => openUpdateSettings(true);
}

export async function openUpdateSettings(check = false) {
  const dlg = document.getElementById("settings");
  const sec = document.getElementById("upd-section");
  if (dlg && !dlg.open) document.getElementById("btn-settings")?.click();
  if (sec) { sec.open = true; setTimeout(() => sec.scrollIntoView({ block: "nearest" }), 200); }
  if (check) act("check");
  else refresh();
}
