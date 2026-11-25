// Panel de almacenamiento (Maestro v2, release 0.18): qué ocupa sitio, qué pasa si lo borras y si SuperDirt lo
// carga al arrancar. Nada se borra solo: tú eliges. Lo tuyo solo se borra uno a uno; tu aprendizaje no se borra aquí.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const two = (s) => { const [es, en] = String(s || "").split("|"); return L(es, en || es); };
let ctx = null, dlg = null, data = null, sort = "size", safe = null;
const open = new Set();

export function fmtSize(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}
const IMPACT = {
  safe: [() => L("Se rehace solo", "Rebuilds itself"), "ok"],
  slower: [() => L("Se vuelve a bajar o analizar", "Downloads or analyses again"), "warn"],
  feature: [() => L("Apaga una función", "Turns a feature off"), "warn"],
  yours: [() => L("Tuyo: no se recupera", "Yours: can't be recovered"), "bad"],
  keep: [() => L("No se borra aquí", "Not deleted here"), ""],
};
const ORDER = { safe: 0, slower: 1, feature: 2, yours: 3, keep: 4 };

export function initStorage(c) {
  ctx = c;
  dlg = document.querySelector("#storage");
}

export async function openStorage() {
  if (!dlg.open) dlg.showModal();
  dlg.querySelector("#st-body").innerHTML = `<p class="hint">${L("Midiendo…", "Measuring…")}</p>`;
  const [a, b, c] = await Promise.allSettled([fetch("/api/storage"), fetch("/api/backups"), fetch("/api/songs/local")].map((p) => p.then((r) => r.json())));
  data = a.status === "fulfilled" ? a.value : { error: String(a.reason) };
  safe = b.status === "fulfilled" && !b.value.error ? { ...b.value, songs: c.status === "fulfilled" ? (c.value.songs || []) : [] } : null;
  render();
}

function render() {
  const body = dlg.querySelector("#st-body");
  if (!data || data.error) { body.innerHTML = `<p class="hint">${esc(two((data && data.error) || "…"))}</p>`; return; }
  const gs = [...data.groups].sort((a, b) => sort === "size" ? b.size - a.size : ORDER[a.impact] - ORDER[b.impact] || b.size - a.size);
  const start = data.groups.filter((g) => g.start).reduce((n, g) => n + g.size, 0);
  body.innerHTML = `<p class="sl-lead">${L("Nada se borra solo. Cada línea dice cuánto ocupa y qué pasa si la borras; tú decides.", "Nothing is deleted on its own. Each line says how much space it takes and what happens if you delete it; you decide.")}</p>
    <div class="st-sum"><div><b>${fmtSize(data.total)}</b><span class="hint">${L("en total", "in total")}</span></div>
      <div><b>${fmtSize(start)}</b><span class="hint">${L("los carga SuperDirt al arrancar", "SuperDirt loads at start")}</span></div>
      <label>${L("Ordenar por", "Sort by")} <select data-sort><option value="size" ${sort === "size" ? "selected" : ""}>${L("tamaño", "size")}</option><option value="impact" ${sort === "impact" ? "selected" : ""}>${L("lo que pasa al borrar", "what happens if deleted")}</option></select></label></div>
    ${safeHTML()}
    <div class="st-list">${gs.map(groupHTML).join("")}</div>`;
  body.onclick = onClick;
  body.querySelector("[data-sort]").onchange = (e) => { sort = e.target.value; render(); };
}

function groupHTML(g) {
  const [lab, cls] = IMPACT[g.impact];
  const items = g.items || [];
  return `<div class="st-g" data-g="${g.id}">
    <div class="st-top"><b>${esc(L(g.es, g.en))}</b><span class="st-size">${g.partial ? L("más de ", "over ") : ""}${fmtSize(g.size)}</span>
      <span class="pill ${cls}">${lab()}</span>${g.start ? `<span class="pill">${icon("power", 11)} ${L("carga al arrancar", "loads at start")}</span>` : ""}
      ${g.deletable ? `<button data-a="del">${icon("trash", 13)} ${items.length ? L("Borrar todo", "Delete all") : L("Borrar", "Delete")}</button>` : ""}</div>
    <p class="hint">${esc(L(g.impact_es, g.impact_en))}</p>
    ${items.length ? `<details ${open.has(g.id) ? "open" : ""} data-det="${g.id}"><summary>${items.length < (g.n_items || 0) ? L(`los ${items.length} más grandes de ${g.n_items}`, `the ${items.length} biggest of ${g.n_items}`) : L(`${items.length} elementos`, `${items.length} items`)}</summary>
      <div class="st-items">${items.map((it) => `<div class="st-it" data-item="${esc(it.id)}"><span>${esc(it.name)}</span><span class="st-size">${fmtSize(it.size)}</span>
        ${g.impact !== "keep" ? `<button class="icon-btn" data-a="del-item" title="${L("Borrar", "Delete")}">${icon("trash", 14)}</button>` : ""}</div>`).join("")}</div></details>` : ""}</div>`;
}

// ------------------------------------------------------------------ 0.25: tus datos a salvo
const REASON = (r) => {
  r = String(r || "");
  if (r === "manual") return L("Hecha por ti", "Made by you");
  if (r.startsWith("update-from-")) return L(`Antes de actualizar (desde ${r.slice(12)})`, `Before updating (from ${r.slice(12)})`);
  if (r.startsWith("before-restore")) return L("Antes de restaurar otra copia", "Before restoring another backup");
  if (r.startsWith("before-")) return L(`Al estrenar la ${r.slice(7).split("-from-")[0]}`, `When ${r.slice(7).split("-from-")[0]} first started`);
  return r;
};
const WHEN = (iso) => { try { return new Date(iso).toLocaleString(L("es-ES", "en-GB"), { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };

function safeHTML() {
  if (!safe) return "";
  const pend = safe.pending && safe.pending.id;
  const rows = (safe.backups || []).map((b) => `<div class="st-it" data-bk="${esc(b.id)}">
      <span><b>${esc(WHEN(b.created))}</b> · ${esc(REASON(b.reason))}${b.version ? ` · ${esc(b.version)}` : ""}<br>
      <span class="hint">${L(`${b.songs} canciones`, `${b.songs} songs`)}${b.memory ? L(", memoria", ", memory") : ""} · ${b.n_files} ${L("archivos", "files")}${(b.errors || []).length ? ` · ${L("con avisos", "with warnings")}` : ""}</span></span>
      <span class="st-size">${fmtSize(b.size)}</span>
      ${pend === b.id ? `<span class="pill warn">${L("se restaura al reabrir", "restores on reopen")}</span><button data-a="bk-cancel">${L("Cancelar", "Cancel")}</button>`
        : `<button data-a="bk-restore">${icon("undo", 13)} ${L("Restaurar", "Restore")}</button>`}</div>`).join("");
  const missing = safe.songs.length;
  return `<div class="st-g st-safe">
    <div class="st-top"><b>${L("Tus datos a salvo", "Your data, safe")}</b><span class="pill ok">${L("las actualizaciones no lo tocan", "updates don't touch it")}</span>
      <button data-a="bk-create">${icon("disk", 13)} ${L("Hacer copia ahora", "Back up now")}</button></div>
    <p class="hint">${L("Tus canciones, memoria, sonidos, ajustes, skills y plugins viven en", "Your songs, memory, sounds, settings, skills and plugins live in")} <code>${esc(safe.data_folder)}</code>,
      ${L(`fuera del programa. Antes de cada actualización se hace una copia sola; se guardan las ${safe.keep} últimas. Restaurar se aplica al volver a abrir la app y antes guarda tu estado actual, así que también se puede deshacer.`,
          `outside the program. A backup is made on its own before every update; the last ${safe.keep} are kept. Restoring applies when you reopen the app and saves your current state first, so it can be undone too.`)}</p>
    <div class="st-items">${rows || `<p class="hint">${L("Aún no hay copias.", "No backups yet.")}</p>`}</div>
    <p class="hint">${L(`${missing} ${missing === 1 ? "canción guardada" : "canciones guardadas"} en archivo (songs/).`, `${missing} ${missing === 1 ? "song" : "songs"} saved as files (songs/).`)}
      ${missing ? `<button class="link" data-a="songs-recover">${L("Recuperar las que falten en «Mis proyectos»", "Bring back any missing from «My projects»")}</button>` : ""}</p></div>`;
}

async function onSafe(a, b) {
  b.disabled = true;
  try {
    if (a === "bk-create") {
      const r = await ctx.api("/api/backups/create", {});
      ctx.toast(L("Copia hecha.", "Backup made.") + (r.backup && r.backup.errors && r.backup.errors.length ? " " + L("Con avisos: ", "With warnings: ") + r.backup.errors.join("; ") : ""));
    } else if (a === "bk-restore") {
      const id = b.closest("[data-bk]").dataset.bk, bk = safe.backups.find((x) => x.id === id);
      if (!confirm(L(`¿Restaurar la copia del ${WHEN(bk.created)}? Se aplica la próxima vez que abras la app. Tu estado actual se guarda antes en otra copia.`,
        `Restore the backup from ${WHEN(bk.created)}? It applies the next time you open the app. Your current state is saved first in another backup.`))) { b.disabled = false; return; }
      await ctx.api("/api/backups/restore", { id });
      ctx.toast(L("Listo: cierra y vuelve a abrir Tidal Studio para restaurar la copia.", "Done: close and reopen Tidal Studio to restore the backup."));
    } else if (a === "bk-cancel") {
      await ctx.api("/api/backups/cancel", {});
    } else if (a === "songs-recover") {
      const r = ctx.recoverSongs ? await ctx.recoverSongs() : { added: 0 };
      ctx.toast(r.added ? L(`Recuperadas ${r.added}. Están en «Mis proyectos».`, `Brought back ${r.added}. They're in «My projects».`)
        : L("No faltaba ninguna: todas las de tu carpeta ya estaban en «Mis proyectos».", "None were missing: every song in your folder was already in «My projects»."));
    }
  } catch (err) { ctx.toast(two(err.message)); }
  try { safe = { ...(await (await fetch("/api/backups")).json()), songs: safe.songs }; } catch { /* se queda como estaba */ }
  render();
}

async function onClick(e) {
  const sb = e.target.closest("button[data-a^='bk-'], button[data-a='songs-recover']");
  if (sb) return onSafe(sb.dataset.a, sb);
  const det = e.target.closest("summary") && e.target.closest("details");
  if (det) { setTimeout(() => (det.open ? open.add(det.dataset.det) : open.delete(det.dataset.det)), 0); return; }
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const gid = b.closest("[data-g]").dataset.g;
  const g = data.groups.find((x) => x.id === gid);
  const item = b.dataset.a === "del-item" ? b.closest("[data-item]").dataset.item : null;
  const what = item ? `«${item}»` : `«${L(g.es, g.en)}» (${fmtSize(g.size)})`;
  const warn = g.impact === "yours" ? L(" Es tuyo y NO se puede recuperar.", " It's yours and can NOT be recovered.") : " " + L(g.impact_es, g.impact_en);
  if (!confirm(L(`¿Borrar ${what}?`, `Delete ${what}?`) + warn)) return;
  b.disabled = true;
  try {
    const r = await ctx.api("/api/storage/delete", { id: gid, item });
    data = r.storage;
    ctx.toast(L(`Borrado: ${what}.`, `Deleted: ${what}.`));
    if (["instruments", "downloads", "mine"].includes(gid)) ctx.librarySync && ctx.librarySync();
  } catch (err) { ctx.toast(two(err.message)); }
  render();
}
