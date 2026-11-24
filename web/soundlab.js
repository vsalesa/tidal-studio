// Laboratorio de sonido (Maestro v2, release 0.16): sonidos que aprenden.
// - Analizar: eliges qué medir (biblioteca, descargas, packs comprados, pistas separadas) y se guardan ataque,
//   caída, brillo, altura y ruido. También se ven los 4 estados de tus sonidos (catálogo → suena).
// - Recetas: un sonido con su tratamiento. Escúchalas, úsalas en una pista nueva y combínalas (capa, mezcla, intermedia).
// - Aprender: el crítico automático (apagado por defecto), cuánto te pregunta Maestro, lo aprendido de tus
//   elecciones y el complemento CLaMP 3 por género.
import { L } from "./i18n.js";
import { icon } from "./icons.js";
import { STATE_NAME, stateBadge } from "./library.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let ctx = null, dlg = null, data = null, tab = "analyze", poll = null;
const S = { pick: new Set(), a: null, b: null, mode: "layer", combo: null };
const ROLE = { percusion: ["percusión", "drums"], bajo: ["bajo", "bass"], armonia: ["acordes", "chords"], melodia: ["melodía", "melody"], textura: ["textura", "texture"] };

export function initSoundLab(c) {
  ctx = c;
  dlg = document.querySelector("#soundlab");
  const b = document.querySelector("#btn-soundlab");
  if (b) b.onclick = () => openSoundLab();
  if (dlg) dlg.addEventListener("close", () => { clearTimeout(poll); });
}

export async function openSoundLab(which) {
  if (which) tab = which;
  if (!dlg.open) dlg.showModal();
  await load();
}

async function load() {
  try { data = await (await fetch("/api/soundlab")).json(); } catch (e) { data = { error: String(e) }; }
  if (!S.pick.size && data.sources) data.sources.filter((s) => s.n && !s.local_only && s.id !== "builtin").forEach((s) => S.pick.add(s.id));
  render();
  clearTimeout(poll);
  if (data.job && data.job.state === "running") poll = setTimeout(load, 900);
  if (data.clamp && data.clamp.install && data.clamp.install.state === "running") poll = setTimeout(load, 2000);
}

const allRecipes = () => [...((data && data.recipes && data.recipes.builtin) || []), ...((data && data.recipes && data.recipes.mine) || [])];
const rname = (r) => L(r.name_es, r.name_en) || r.id;

function render() {
  const body = dlg.querySelector("#sl-body");
  if (!data || data.error) { body.innerHTML = `<p class="hint">${esc((data && data.error) || "…")}</p>`; return; }
  const tabs = [["analyze", "wave", L("Analizar", "Analyze")], ["recipes", "flask", L("Recetas", "Recipes")], ["learn", "brain", L("Aprender", "Learning")]];
  body.innerHTML = `<div class="sl-tabs">${tabs.map(([id, ic, t]) => `<button class="sl-tab ${tab === id ? "on" : ""}" data-tab="${id}">${icon(ic, 15)} ${t}</button>`).join("")}</div>
    <div class="sl-pane">${tab === "analyze" ? analyzeHTML() : tab === "recipes" ? recipesHTML() : learnHTML()}</div>`;
  body.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });
  body.onclick = onClick;
  body.onchange = onChange;
  body.querySelectorAll("[data-hear]").forEach((b) => ctx.wireHear(b, () => hearChanges(b.dataset.hear)));
}

// ---------------------------------------------------------------- Analizar
function analyzeHTML() {
  const st = data.states || {};
  const job = data.job || {};
  const running = job.state === "running";
  const pct = job.total ? Math.round((job.done + job.skipped) / job.total * 100) : 0;
  const stats = (data.stats && data.stats.features) || {};
  const nStats = Object.values(stats).reduce((a, b) => a + b, 0);
  return `<p class="sl-lead">${L("Mide cómo suena cada sonido (ataque, caída, brillo, altura y ruido) para que Maestro y el selector de instrumentos elijan por cómo suenan, no solo por el nombre. Solo cuando tú lo pidas, y todo en este ordenador.",
      "Measures how each sound sounds (attack, decay, brightness, pitch and noise) so Maestro and the instrument picker choose by sound, not just by name. Only when you ask, and all on this computer.")}</p>
    <div class="sl-states">${["catalog", "downloaded", "loaded", "playable"].map((k) => `<div class="sl-state">${stateBadge(k)}<b>${st[k] || 0}</b></div>`).join("")}
      <p class="hint">${data.engine_ok ? L("Maestro solo propone lo que suena.", "Maestro only suggests what plays.") : L("El motor de sonido no está listo: nada «suena» todavía.", "The sound engine isn't ready: nothing «plays» yet.")}</p></div>
    <h4>${L("¿Qué quieres analizar?", "What do you want to analyze?")}</h4>
    <div class="sl-sources">${(data.sources || []).map((s) => `<label class="sl-src ${s.n ? "" : "off"}">
        <input type="checkbox" data-src="${esc(s.id)}" ${S.pick.has(s.id) ? "checked" : ""} ${s.n && !running ? "" : "disabled"}>
        <span>${esc(L(s.es, s.en))}${s.local_only ? ` <span class="lb-badge warn">${L("solo local", "local only")}</span>` : ""}</span>
        <em>${s.n}</em>${s.id.startsWith("pack:") ? `<button class="icon-btn" data-a="pack-rm" data-path="${esc(s.id.slice(5))}" title="${esc(L("Quitar esta carpeta", "Remove this folder"))}">${icon("close", 13)}</button>` : ""}</label>`).join("")}</div>
    <details class="sl-pack"><summary>${icon("folder", 14)} ${L("Añadir un pack comprado (carpeta)", "Add a bought pack (folder)")}</summary>
      <p class="hint">${L("Se analiza donde está: no se copia, no se sube a GitHub y no sale en el dataset exportado.", "It's analyzed where it is: not copied, never uploaded to GitHub and left out of the exported dataset.")}</p>
      <div class="row"><input id="sl-pack-path" placeholder="${esc(L("/ruta/a/mi/pack", "/path/to/my/pack"))}"><input id="sl-pack-name" placeholder="${esc(L("Nombre (opcional)", "Name (optional)"))}"><button data-a="pack-add">${L("Añadir", "Add")}</button></div></details>
    <div class="sl-run">
      ${running ? `<div class="sl-bar"><i style="width:${pct}%"></i></div><span>${job.done + job.skipped} / ${job.total} · ${esc(job.msg || "")}</span><button data-a="stop">${icon("stop", 12)} ${L("Parar", "Stop")}</button>`
        : `<button class="primary" data-a="analyze" ${S.pick.size ? "" : "disabled"}>${icon("wave", 14)} ${L("Analizar lo marcado", "Analyze the selection")}</button>
           ${job.state === "done" ? `<span class="hint">${L(`Hecho: ${job.done} medidos`, `Done: ${job.done} measured`)}${job.skipped ? L(`, ${job.skipped} saltados`, `, ${job.skipped} skipped`) : ""}.</span>` : ""}`}
    </div>
    ${!data.audio_tools ? `<p class="hint">${L("Los WAV se miden sin instalar nada. Para mp3, ogg, flac o aiff hacen falta las herramientas de audio (se instalan al importar un audio).", "WAV files are measured with nothing to install. mp3, ogg, flac or aiff need the audio tools (installed when you import an audio file).")}</p>` : ""}
    <p class="hint">${L(`Medidos hasta ahora: ${nStats}`, `Measured so far: ${nStats}`)}${Object.keys(stats).length ? ` (${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}.</p>`;
}

// ---------------------------------------------------------------- Recetas
function recipeCard(r, mine) {
  const role = ROLE[r.role] || ["", ""];
  const sel = S.a === r.id ? "A" : S.b === r.id ? "B" : "";
  return `<div class="sl-rec ${sel ? "sel" : ""}" data-id="${esc(r.id)}">
    <div class="sl-rec-top"><b>${esc(rname(r))}</b>${role[0] ? `<span class="tag">${L(role[0], role[1])}</span>` : ""}${mine ? `<span class="lb-badge o-mine">${r.by === "maestro" ? "Maestro" : L("tuya", "yours")}</span>` : ""}${sel ? `<span class="sl-ab">${sel}</span>` : ""}</div>
    <code class="sl-code">${esc(r.code || "")}</code>
    <div class="sl-rec-row"><button class="prehear" data-hear="${esc(r.id)}">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button>
      <button data-a="use" data-id="${esc(r.id)}">${icon("plus", 13)} ${L("Pista nueva", "New track")}</button>
      <button data-a="ab" data-id="${esc(r.id)}" title="${esc(L("Elígela como A o B para combinarla", "Pick it as A or B to combine it"))}">A/B</button>
      ${mine ? `<button class="icon-btn" data-a="del" data-id="${esc(r.id)}" title="${esc(L("Borrar", "Delete"))}">${icon("trash", 13)}</button>` : ""}</div></div>`;
}
function recipesHTML() {
  const builtin = (data.recipes && data.recipes.builtin) || [], mine = (data.recipes && data.recipes.mine) || [];
  const a = allRecipes().find((r) => r.id === S.a), b = allRecipes().find((r) => r.id === S.b);
  const modes = [["layer", L("Capa", "Layer"), L("suenan las dos a la vez", "both play at once")], ["blend", L("Mezcla", "Blend"), L("sonido de A, efectos de B", "A's sound, B's effects")], ["morph", L("Intermedia", "Morph"), L("parámetros a medio camino", "parameters halfway")]];
  return `<p class="sl-lead">${L("Una receta es un sonido con su tratamiento. Escúchalas sobre tu canción, llévalas a una pista nueva o combina dos para crear un sonido que no existía. Maestro también las conoce y puede combinarlas.",
      "A recipe is a sound with its processing. Listen to them over your song, take one to a new track or combine two into a sound that didn't exist. Maestro knows them too and can combine them.")}</p>
    <div class="sl-combo">
      <div class="sl-combo-ab"><span><b>A</b> ${a ? esc(rname(a)) : `<em>${L("elige una con A/B", "pick one with A/B")}</em>`}</span><span><b>B</b> ${b ? esc(rname(b)) : `<em>${L("elige otra", "pick another")}</em>`}</span></div>
      <div class="sl-modes">${modes.map(([id, t, d]) => `<label><input type="radio" name="sl-mode" value="${id}" ${S.mode === id ? "checked" : ""}> <b>${t}</b> <span class="hint">${d}</span></label>`).join("")}</div>
      ${S.combo ? `<code class="sl-code">${esc(S.combo.code)}</code>` : ""}
      <div class="sl-rec-row"><button data-a="combine" ${a && b ? "" : "disabled"}>${icon("wand", 14)} ${L("Combinar", "Combine")}</button>
        ${S.combo ? `<button class="prehear" data-hear="__combo">${icon("speaker", 13)} ${L("Escuchar", "Listen")}</button><button class="primary" data-a="save-combo">${icon("check", 13)} ${L("Guardar en mis recetas", "Save to my recipes")}</button>` : ""}</div>
    </div>
    ${mine.length ? `<h4>${L("Mis recetas", "My recipes")}</h4><div class="sl-recs">${mine.map((r) => recipeCard(r, true)).join("")}</div>` : ""}
    <h4>${L("Recetas incluidas", "Built-in recipes")}</h4><div class="sl-recs">${builtin.map((r) => recipeCard(r, false)).join("")}</div>`;
}
async function hearChanges(id) {
  let code;
  if (id === "__combo") code = S.combo && S.combo.code;
  else code = (allRecipes().find((r) => r.id === id) || {}).code;
  if (!code) throw new Error("…");
  return { pistas: [{ id: ctx.freeId() || "d12", nombre: "recipe", tipo: "fx", codigo: code }] };
}

// ---------------------------------------------------------------- Aprender
function learnHTML() {
  const s = data.settings || {};
  const c = data.clamp || {};
  const inst = c.install || {};
  const st = data.stats || {};
  return `<div class="sl-learn">
    <section><h4>${icon("ear", 15)} ${L("Crítico automático", "Automatic critic")} <span class="tag">${L("opcional", "optional")}</span></h4>
      <label class="sl-switch"><input type="checkbox" data-set="critic" ${s.critic ? "checked" : ""}> ${L("Puntuar groove, armonía y forma de cada opción", "Score groove, harmony and form of each option")}</label>
      <p class="hint">${L("Aparece como una pista al lado de cada opción de Maestro y de «Otra versión». Es un extra: tu oído sigue siendo el juez.", "It shows as a hint next to each Maestro option and «Another version». It's an extra: your ear stays the judge.")}</p></section>
    <section><h4>${icon("maestro", 15)} ${L("¿Cuánto te pregunta Maestro?", "How often does Maestro ask you?")}</h4>
      <select data-set="questions">${[["never", L("Nunca: decide él", "Never: it decides")], ["sometimes", L("Cuando dude de verdad", "When it really hesitates")], ["often", L("A menudo: quiero decidir yo", "Often: I want to decide")]].map(([v, t]) => `<option value="${v}" ${s.questions === v ? "selected" : ""}>${t}</option>`).join("")}</select></section>
    <section><h4>${icon("brain", 15)} ${L("Lo aprendido de tus elecciones", "Learned from your choices")}</h4>
      <p>${L(`${st.picks || 0} elecciones de sonido en ${st.choices || 0} combinaciones de sonido, papel y género. Se usan para ordenar los candidatos sin IA.`, `${st.picks || 0} sound picks across ${st.choices || 0} sound, role and genre combinations. They rank the candidates without AI.`)}</p>
      <p class="hint">${L("Selecciona el nombre de un sonido en el código y pulsa «Comparar los 3 mejores de oído».", "Select a sound name in the code and press «Compare the best 3 by ear».")}</p></section>
    <section><h4>${icon("search", 15)} CLaMP 3 <span class="tag">${L("experimental", "experimental")}</span></h4>
      <p class="hint">${L(`Busca entre tus canciones del mismo género las que más se parecen, aunque no compartan palabras. Se activa solo en un género cuando tiene ${c.min_examples || 10} canciones o más; si no, Maestro usa la búsqueda de texto y las medidas de sonido.`, `Finds your songs of the same genre that sound most alike, even with no words in common. It turns on by itself in a genre once it has ${c.min_examples || 10} songs or more; otherwise Maestro uses text search and sound measurements.`)}</p>
      <div class="row"><span class="lb-badge ${c.installed ? "o-library" : ""}">${c.installed ? L("instalado", "installed") : L("no instalado", "not installed")}</span>
        ${c.installed ? "" : `<button data-a="clamp" ${inst.state === "running" ? "disabled" : ""}>${icon("download", 13)} ${inst.state === "running" ? L("Instalando…", "Installing…") : L("Instalar en las herramientas de audio", "Install into the audio tools")}</button>`}
        <label class="sl-switch"><input type="checkbox" data-set="clamp_auto" ${s.clamp_auto ? "checked" : ""}> ${L("Activar sola por género", "Turn on by itself per genre")}</label>
        <label>${L("desde", "from")} <input type="number" min="2" max="200" data-set="clamp_min" value="${esc(s.clamp_min || 10)}" style="width:64px"> ${L("ejemplos", "examples")}</label></div>
      ${inst.msg ? `<p class="hint">${esc(L(...String(inst.msg).split("|").concat([""]).slice(0, 2)))}</p>` : ""}
      ${(c.genres || []).length ? `<table class="sl-genres"><tr><th>${L("Género", "Genre")}</th><th>${L("Canciones", "Songs")}</th><th>CLaMP 3</th></tr>${c.genres.map((g) => `<tr><td>${esc(g.style)}</td><td>${g.examples}</td><td>${g.active ? `<b class="ok">${L("activo", "on")}</b>` : `<span class="hint">${L(`faltan ${Math.max(0, (c.min_examples || 10) - g.examples)}`, `${Math.max(0, (c.min_examples || 10) - g.examples)} to go`)}</span>`}</td></tr>`).join("")}</table>`
        : `<p class="hint">${L("Aún no hay canciones guardadas con género.", "No songs saved with a genre yet.")}</p>`}
    </section></div>`;
}

// ---------------------------------------------------------------- acciones
async function post(path, body) {
  return ctx.api(path, body);
}
async function onClick(e) {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const a = b.dataset.a;
  try {
    if (a === "analyze") { data.job = await post("/api/soundlab/analyze", { sources: [...S.pick] }); return load(); }
    if (a === "stop") { await post("/api/soundlab/stop", {}); return setTimeout(load, 400); }
    if (a === "pack-add") {
      const path = dlg.querySelector("#sl-pack-path").value.trim(); if (!path) return;
      data = { ...data, ...(await post("/api/soundlab/packs", { path, name: dlg.querySelector("#sl-pack-name").value.trim() })) };
      return render();
    }
    if (a === "pack-rm") { data = { ...data, ...(await post("/api/soundlab/packs", { path: b.dataset.path, remove: true })) }; S.pick.delete("pack:" + b.dataset.path); return render(); }
    if (a === "ab") {
      const id = b.dataset.id;
      if (S.a === id) S.a = null; else if (S.b === id) S.b = null; else if (!S.a) S.a = id; else S.b = id;
      S.combo = null; return render();
    }
    if (a === "combine") { S.combo = await post("/api/recipes/combine", { a: S.a, b: S.b, mode: S.mode }); return render(); }
    if (a === "save-combo") {
      await post("/api/recipes/save", { recipe: S.combo.recipe });
      ctx.toast(L(`Receta «${rname(S.combo.recipe)}» guardada.`, `Recipe «${rname(S.combo.recipe)}» saved.`));
      S.combo = null; S.a = S.b = null; return load();
    }
    if (a === "use") {
      const r = allRecipes().find((x) => x.id === b.dataset.id); if (!r) return;
      const kind = r.role === "textura" ? "fx" : r.role || "fx";
      if (ctx.addTrack(rname(r), kind, r.code)) { ctx.toast(L(`«${rname(r)}» está en una pista nueva.`, `«${rname(r)}» is on a new track.`)); dlg.close(); }
      return;
    }
    if (a === "del") { await post("/api/recipes/delete", { id: b.dataset.id }); return load(); }
    if (a === "clamp") { await post("/api/clamp/install", {}); return load(); }
  } catch (err) { ctx.toast(err.message || String(err)); }
}
async function onChange(e) {
  const t = e.target;
  if (t.dataset.src) { if (t.checked) S.pick.add(t.dataset.src); else S.pick.delete(t.dataset.src); return render(); }
  if (t.name === "sl-mode") { S.mode = t.value; S.combo = null; return render(); }
  if (t.dataset.set) {
    const k = t.dataset.set;
    const v = t.type === "checkbox" ? t.checked : k === "clamp_min" ? +t.value : t.value;
    try { data = { ...data, ...(await post("/api/soundlab/settings", { [k]: v })) }; render(); } catch (err) { ctx.toast(err.message); }
  }
}
export { STATE_NAME };
