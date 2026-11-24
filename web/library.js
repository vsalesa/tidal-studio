// Librería: TODOS los sonidos en un solo sitio, sin diferencia entre los que trae Tidal Studio y los que has
// descargado o subido tú. Dirt-Samples, sintes, biblioteca de instrumentos, tus samples, Freesound, packs,
// lo que descargó Maestro y tus loops salen en la misma lista, con el mismo buscador y los mismos botones.
// El origen es una etiqueta pequeña, no una sección. Los datos vienen de server/library.py (/api/library).
import { L, LANG } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const KINDS = [
  ["", "Todo", "All"], ["hit", "Golpes", "Hits"], ["pitched", "Instrumentos", "Instruments"], ["synth", "Sintes", "Synths"],
  ["loop", "Loops", "Loops"], ["engine", "Motores", "Engines"],
];
const SHOWS = [["", "Todos", "All"], ["installed", "Listos para usar", "Ready to use"], ["download", "Para descargar", "To download"], ["mine", "Míos", "Mine"]];
const ORIGIN = { builtin: ["Incluido", "Built-in"], library: ["Biblioteca", "Library"], mine: ["Tuyo", "Yours"], loop: ["Tu loop", "Your loop"] };
const KIND_NAME = { hit: ["golpe", "hit"], pitched: ["instrumento", "instrument"], synth: ["sinte", "synth"], engine: ["motor", "engine"], loop: ["loop", "loop"], midi: ["teclado", "keyboard"] };

let ctx = null, dlg = null;
const S = { items: null, families: [], q: "", kind: "", show: "", family: "", limit: 80, busy: new Set() };

export function initLibrary(c) { ctx = c; }
export const libraryItems = () => S.items;
export async function loadLibrary(force) {
  if (S.items && !force) return S.items;
  try {
    const d = await (await fetch("/api/library")).json();
    S.items = d.items || []; S.families = d.families || [];
  } catch { S.items = S.items || []; }
  return S.items;
}
export const familyName = (id) => { const f = S.families.find((x) => x.id === id); return f ? (LANG === "en" ? f.en : f.es) : id; };
export const entryName = (e) => (LANG === "en" ? e.en : e.es) || e.sound;
export function entryBadges(e) {
  const o = ORIGIN[e.origin] || ["", ""];
  const k = KIND_NAME[e.kind] || ["", ""];
  return `<span class="lb-badge o-${esc(e.origin)}">${L(o[0], o[1])}</span><span class="lb-badge">${L(k[0], k[1])}</span>`
    + (e.installed ? "" : `<span class="lb-badge dl">${icon("download", 11)} ${e.mb ? `${e.mb} MB` : L("descargar", "download")}</span>`)
    + (e.shadowed ? `<span class="lb-badge warn" title="${L("Tienes un sonido tuyo con el mismo nombre: suena el tuyo", "You have a sound of your own with the same name: yours plays")}">${L("tapado por el tuyo", "yours plays instead")}</span>` : "")
    + (e.license ? `<span class="lb-badge">${esc(e.license)}</span>` : "");
}

export async function openLibrary(opts = {}) {
  dlg = dlg || document.querySelector("#library");
  Object.assign(S, { q: opts.q ?? S.q, kind: opts.kind ?? S.kind, show: opts.show ?? S.show, family: opts.family ?? S.family, limit: 80 });
  render(true);
  if (!dlg.open) dlg.showModal();
  await loadLibrary(true);
  render();
  dlg.querySelector(".lb-q")?.focus();
}

function visible() {
  const terms = norm(S.q).split(/\s+/).filter(Boolean);
  return (S.items || []).filter((e) => {
    if (e.kind === "midi" && S.kind) return false;
    if (S.kind && e.kind !== S.kind) return false;
    if (S.family && e.family !== S.family) return false;
    if (S.show === "installed" && !e.installed) return false;
    if (S.show === "download" && e.installed) return false;
    if (S.show === "mine" && !(e.origin === "mine" || e.origin === "loop")) return false;
    if (!terms.length) return true;
    const w = norm([e.sound, e.es, e.en, e.tags, e.family, familyName(e.family), e.role, e.group].join(" "));
    return terms.every((t) => w.includes(t));
  }).sort((a, b) => (b.installed - a.installed) || (a.origin === "mine" ? -1 : 0) - (b.origin === "mine" ? -1 : 0) || entryName(a).localeCompare(entryName(b)));
}

function render(loading) {
  if (!dlg) return;
  const list = loading ? [] : visible();
  const fams = S.families.filter((f) => (S.items || []).some((e) => e.family === f.id));
  dlg.innerHTML = `<div class="lb-head">
      <h2>${icon("library", 20)} ${L("Librería", "Library")} <small class="hint">${S.items ? L(`${S.items.length} sonidos, todos en un sitio`, `${S.items.length} sounds, all in one place`) : ""}</small></h2>
      <button class="icon-btn" data-a="close" title="${L("Cerrar", "Close")}">${icon("close", 18)}</button>
    </div>
    <div class="lb-bar">
      <input class="lb-q" type="search" value="${esc(S.q)}" placeholder="${L("Busca: piano, bombo, trompeta, pad, 808…", "Search: piano, kick, trumpet, pad, 808…")}">
      <select class="lb-fam"><option value="">${L("Todas las familias", "All families")}</option>${fams.map((f) => `<option value="${esc(f.id)}" ${S.family === f.id ? "selected" : ""}>${esc(LANG === "en" ? f.en : f.es)}</option>`).join("")}</select>
    </div>
    <div class="lb-chips">${KINDS.map(([k, es, en]) => `<button class="chip ${S.kind === k ? "on" : ""}" data-kind="${k}">${L(es, en)}</button>`).join("")}
      <span class="lb-sep"></span>${SHOWS.map(([k, es, en]) => `<button class="chip ${S.show === k ? "on" : ""}" data-show="${k}">${L(es, en)}</button>`).join("")}</div>
    <div class="lb-list">${loading ? `<p class="hint">${L("Cargando…", "Loading…")}</p>` : list.length ? list.slice(0, S.limit).map(row).join("")
      + (list.length > S.limit ? `<button class="link lb-more" data-a="more">${L(`Ver ${Math.min(80, list.length - S.limit)} más (de ${list.length - S.limit})`, `Show ${Math.min(80, list.length - S.limit)} more (of ${list.length - S.limit})`)}</button>` : "")
      : `<p class="hint">${L("No hay nada con eso. Prueba otra palabra o añade sonidos nuevos.", "Nothing matches. Try another word or add new sounds.")}</p>`}</div>
    <div class="lb-foot">
      <span class="hint">${L("¿Te falta algo?", "Missing something?")}</span>
      <button data-a="add-samples">${icon("plus", 14)} ${L("Subir, Freesound, packs y loops", "Upload, Freesound, packs and loops")}</button>
      <button data-a="instlib">${icon("speaker", 14)} ${L("Fotos, importar instrumentos y motores", "Photos, import instruments and engines")}</button>
    </div>`;
  wire();
}

function row(e) {
  const busy = S.busy.has(e.key);
  return `<div class="lb-row" data-k="${esc(e.key)}">
    <div class="lb-main"><b>${esc(entryName(e))}</b> <code>${esc(e.ref || e.sound)}</code>
      <div class="lb-meta"><span class="hint">${esc(familyName(e.family))}</span> ${entryBadges(e)}</div></div>
    <div class="lb-acts">
      <button class="icon-btn" data-a="hear" title="${L("Escuchar", "Listen")}">${icon("play", 14)}</button>
      ${e.installed ? "" : `<button data-a="get" ${busy ? "disabled" : ""}>${icon("download", 13)} ${busy ? L("Descargando…", "Downloading…") : L("Descargar", "Download")}</button>`}
      <button class="primary" data-a="add" ${busy ? "disabled" : ""} title="${L("Añadir una pista con este sonido", "Add a track with this sound")}">${icon("plus", 13)} ${L("Añadir", "Add")}</button>
    </div></div>`;
}

function wire() {
  dlg.querySelector(".lb-q").oninput = (ev) => { S.q = ev.target.value; S.limit = 80; renderList(); };
  dlg.querySelector(".lb-fam").onchange = (ev) => { S.family = ev.target.value; S.limit = 80; render(); };
  dlg.onclick = async (ev) => {
    const chip = ev.target.closest("[data-kind],[data-show]");
    if (chip) { if (chip.dataset.kind !== undefined) S.kind = chip.dataset.kind; else S.show = chip.dataset.show; S.limit = 80; return render(); }
    const b = ev.target.closest("button[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "close") return dlg.close();
    if (a === "more") { S.limit += 80; return renderList(); }
    if (a === "add-samples") { dlg.close(); return ctx.openSamples(); }
    if (a === "instlib") { dlg.close(); return ctx.openInstLib(); }
    const k = b.closest(".lb-row")?.dataset.k; const e = (S.items || []).find((x) => x.key === k); if (!e) return;
    if (a === "hear") return ctx.hear(e);
    if (a === "get" || a === "add") {
      if (!e.installed) {
        S.busy.add(e.key); renderList();
        try { await ctx.install(e); e.installed = true; } catch (err) { ctx.toast(err.message || String(err)); }
        S.busy.delete(e.key); renderList();
        if (!e.installed) return;
      }
      if (a === "add") { ctx.add(e); ctx.toast(L(`Pista nueva con «${entryName(e)}»`, `New track with «${entryName(e)}»`)); }
    }
  };
}
function renderList() {
  const el = dlg.querySelector(".lb-list"); if (!el) return;
  const list = visible();
  el.innerHTML = list.length ? list.slice(0, S.limit).map(row).join("")
    + (list.length > S.limit ? `<button class="link lb-more" data-a="more">${L(`Ver más (${list.length - S.limit})`, `Show more (${list.length - S.limit})`)}</button>` : "")
    : `<p class="hint">${L("No hay nada con eso. Prueba otra palabra o añade sonidos nuevos.", "Nothing matches. Try another word or add new sounds.")}</p>`;
}
