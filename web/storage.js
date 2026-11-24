// Panel de almacenamiento (Maestro v2, release 0.18): qué ocupa sitio, qué pasa si lo borras y si SuperDirt lo
// carga al arrancar. Nada se borra solo: tú eliges. Lo tuyo solo se borra uno a uno; tu aprendizaje no se borra aquí.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const two = (s) => { const [es, en] = String(s || "").split("|"); return L(es, en || es); };
let ctx = null, dlg = null, data = null, sort = "size";
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
  try { data = await (await fetch("/api/storage")).json(); } catch (e) { data = { error: String(e) }; }
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

async function onClick(e) {
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
