// Memoria de Maestro, «Mis estilos» y casos musicales (Maestro v2, release 0.18).
// - Memorias: lo que Maestro recuerda de ti, por ámbito (esta canción, este curso, el género, siempre).
// - Bandeja: lo dudoso espera aquí a que lo apruebes (lo muy claro se aprueba solo si lo dejas activado).
// - Registro: todo lo que se ha añadido, cambiado o borrado, y cada cosa se puede deshacer.
// - Casos: un problema, el antes y el después, y por qué lo aceptaste. Maestro los usa como ejemplos.
// - Mis estilos: el groove, los papeles, los instrumentos y el tempo de una canción (no las notas). Úsalos como
//   inspiración, transfórmalos (otra tonalidad, tempo o instrumentos, con escucha previa) o cópialos tal cual.
//   Se comparten por GitHub y se importan desde un enlace.
// - Ajustes: aprobar solo lo claro, apuntar lo que dices en el chat, aprender de tus elecciones y copia en GitHub.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const two = (s) => { const [es, en] = String(s || "").split("|"); return L(es, en || es); };
let ctx = null, dlg = null, data = null, styles = null, log = null, tab = "memories";
const T = { style: null, mode: null, result: null, seed: 1, form: {}, caseDraft: null, edit: null, shared: {} };
const SCOPE = { song: () => L("Esta canción", "This song"), course: () => L("Este curso", "This course"), genre: () => L("Género", "Genre"), global: () => L("Siempre", "Always") };
const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROLE = { percusion: ["percusión", "drums"], bajo: ["bajo", "bass"], armonia: ["acordes", "chords"], melodia: ["melodía", "melody"], textura: ["textura", "texture"], efecto: ["efecto", "effect"] };
const roleName = (r) => (ROLE[r] ? L(...ROLE[r]) : r);

export function initMemory(c) {
  ctx = c;
  dlg = document.querySelector("#memory");
  const b = document.querySelector("#btn-memory");
  if (b) b.onclick = () => openMemory();
}

export async function openMemory(which, opts = {}) {
  if (which) tab = which;
  if (opts.caseDraft) T.caseDraft = opts.caseDraft;
  if (!dlg.open) dlg.showModal();
  await load();
}

async function load() {
  try {
    data = await (await fetch("/api/memory")).json();
    if (tab === "styles" || !styles) styles = (await (await fetch("/api/styles")).json()).styles || [];
    if (tab === "log") log = (await (await fetch("/api/memory/log")).json()).log || [];
  } catch (e) { data = { error: String(e) }; }
  render();
  ctx.badge && ctx.badge(data && data.stats ? data.stats.pending : 0);
}

function render() {
  const body = dlg.querySelector("#mem-body");
  if (!data || data.error) { body.innerHTML = `<p class="hint">${esc(two((data && data.error) || "…"))}</p>`; return; }
  const st = data.stats || {};
  const tabs = [["memories", "brain", L("Memorias", "Memories"), st.approved], ["inbox", "check", L("Bandeja", "Inbox"), st.pending],
    ["styles", "palette", L("Mis estilos", "My styles"), st.styles], ["cases", "score", L("Casos", "Cases"), st.cases],
    ["log", "history", L("Registro", "Log"), null], ["settings", "settings", L("Ajustes", "Settings"), null]];
  body.innerHTML = `<div class="sl-tabs">${tabs.map(([id, ic, t, n]) => `<button class="sl-tab ${tab === id ? "on" : ""}" data-tab="${id}">${icon(ic, 15)} ${t}${n ? ` <span class="mem-n ${id === "inbox" ? "hot" : ""}">${n}</span>` : ""}</button>`).join("")}</div>
    <div class="sl-pane mem-pane">${({ memories: memoriesHTML, inbox: inboxHTML, styles: stylesHTML, cases: casesHTML, log: logHTML, settings: settingsHTML })[tab]()}</div>`;
  body.querySelectorAll("[data-tab]").forEach((b) => b.onclick = async () => { tab = b.dataset.tab; T.edit = null; await load(); });
  body.onclick = onClick;
  body.onchange = onChange;
}

// ---------------------------------------------------------------- memorias
const scopeLabel = (m) => {
  const k = m.scope_key;
  const extra = m.scope === "genre" ? ` · ${genreName(k)}` : m.scope === "course" ? ` · ${k}` : m.scope === "song" ? (k === ctx.state().projectId ? ` · ${L("la abierta", "the open one")}` : "") : "";
  return SCOPE[m.scope]() + extra;
};
function curGenre() {
  // El género de lo que haces: el del curso, o el estilo de la canción si es uno de los géneros del estudio
  const s = ctx.state();
  if (s.course && s.course.id) return s.course.id;
  const t = String(s.style || "").toLowerCase();
  const g = ((data && data.styles_list) || []).find((x) => t === x.id || t.includes(x.name.toLowerCase()));
  return g ? g.id : "";
}
const genreName = (g) => ((data.styles_list || []).find((x) => x.id === g) || {}).name || g;
const mtext = (m) => (L(m.text, m.text_en || m.text));
const srcName = (s) => ({ chat: L("lo dijiste en el chat", "you said it in the chat"), picks: L("tus elecciones de oído", "your picks by ear"), manual: L("lo escribiste tú", "you wrote it") })[s] || s;

function memRow(m, inbox) {
  if (T.edit === m.id) {
    return `<div class="mem-row edit" data-id="${m.id}"><textarea data-f="text" rows="2">${esc(m.text)}</textarea>${scopeSelect(m.scope)}
      <button class="primary" data-a="edit-save">${icon("check", 13)} ${L("Guardar", "Save")}</button><button data-a="edit-cancel">${L("Cancelar", "Cancel")}</button></div>`;
  }
  const note = m.note ? `<span class="mem-note">${icon("explain", 12)} ${esc(two(m.note))}</span>` : "";
  return `<div class="mem-row ${m.status}" data-id="${m.id}">
    <div class="mem-txt"><b>${esc(mtext(m))}</b>
      <span class="hint">${esc(scopeLabel(m))} · ${esc(srcName(m.source))}${m.evidence > 1 ? ` · ${m.evidence} ${L("veces", "times")}` : ""}${m.auto ? ` · ${L("aprobada sola", "auto-approved")}` : ""}</span>${note}</div>
    <div class="mem-acts">${inbox ? `<button class="primary" data-a="approve">${icon("check", 13)} ${L("Aprobar", "Approve")}</button><button data-a="reject">${L("Descartar", "Discard")}</button>` : ""}
      <button class="icon-btn" data-a="edit" title="${L("Cambiar", "Edit")}">${icon("sliders", 15)}</button>
      <button class="icon-btn" data-a="delete" title="${L("Borrar (se puede deshacer en el Registro)", "Delete (can be undone in the Log)")}">${icon("trash", 15)}</button></div></div>`;
}
function scopeSelect(cur) {
  const s = ctx.state();
  const opts = [["song", SCOPE.song(), !!s.projectId], ["course", SCOPE.course(), !!(s.course && s.course.id)], ["genre", SCOPE.genre() + (curGenre() ? ` (${genreName(curGenre())})` : ""), !!curGenre()], ["global", SCOPE.global(), true]];
  return `<select data-f="scope">${opts.filter((o) => o[2] || o[0] === cur).map(([v, t]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${t}</option>`).join("")}</select>`;
}
function memoriesHTML() {
  const ms = (data.memories || []).filter((m) => m.status === "approved");
  const groups = ["song", "course", "genre", "global"].map((sc) => [sc, ms.filter((m) => m.scope === sc)]).filter((g) => g[1].length);
  return `<p class="sl-lead">${L("Lo que Maestro recuerda de ti. Antes de contestar lee lo que vale para lo que estás haciendo: primero esta canción, luego el curso, el género y lo de siempre.", "What Maestro remembers about you. Before answering it reads what applies to what you're doing: this song first, then the course, the genre and what's always true.")}</p>
    <div class="mem-add"><input data-f="new" placeholder="${L("Ej.: en cumbia quiero el güiro más bajo", "E.g. in cumbia I want the güiro quieter")}" maxlength="300">${scopeSelect(curGenre() ? "genre" : "global")}
      <button class="primary" data-a="add">${icon("plus", 13)} ${L("Recordar", "Remember")}</button></div>
    <p class="hint">${L("También puedes decírselo en el chat: «recuerda que…». Las que añades tú se aprueban al momento.", "You can also tell it in the chat: «remember that…». The ones you add yourself are approved right away.")}</p>
    ${groups.length ? groups.map(([sc, list]) => `<h4>${SCOPE[sc]()} <span class="hint">${list.length}</span></h4>${list.map((m) => memRow(m)).join("")}`).join("")
      : `<p class="hint mem-empty">${L("Aún no hay memorias aprobadas.", "No approved memories yet.")}</p>`}`;
}
function inboxHTML() {
  const ms = (data.memories || []).filter((m) => m.status === "pending");
  const s = data.settings || {};
  return `<p class="sl-lead">${L("Aquí espera lo que no está claro: una preferencia dicha de pasada, algo que contradice otra memoria o el tempo del género, o un sonido que elegiste pero con otro favorito cerca. Maestro no lo usa hasta que lo apruebes.", "What isn't clear waits here: a preference said in passing, something that contradicts another memory or the genre's tempo, or a sound you picked with another favourite close behind. Maestro doesn't use it until you approve it.")}</p>
    <p class="hint">${s.auto_approve ? L("Lo muy claro (lo pediste con «recuerda…», o elegiste el mismo sonido de oído 3 veces o más sin dudar) se aprueba solo.", "What's very clear (you asked with «remember…», or picked the same sound by ear 3+ times without doubt) is approved by itself.") : L("Aprobar solo lo claro está desactivado: todo pasa por aquí.", "Auto-approve is off: everything comes through here.")}</p>
    ${ms.length ? ms.map((m) => memRow(m, true)).join("") : `<p class="hint mem-empty">${L("La bandeja está vacía.", "The inbox is empty.")}</p>`}
    ${(data.memories || []).some((m) => m.status === "rejected") ? `<details class="mem-rej"><summary>${L("Descartadas", "Discarded")}</summary>${data.memories.filter((m) => m.status === "rejected").map((m) => `<div class="mem-row rejected" data-id="${m.id}"><div class="mem-txt"><span>${esc(mtext(m))}</span></div><div class="mem-acts"><button data-a="approve">${L("Aprobar", "Approve")}</button></div></div>`).join("")}</details>` : ""}`;
}

// ---------------------------------------------------------------- registro
const OBJ = { memory: () => L("memoria", "memory"), style: () => L("estilo", "style"), case: () => L("caso", "case") };
const ACT = { add: () => L("añadida", "added"), reinforce: () => L("reforzada", "reinforced"), approve: () => L("aprobada", "approved"), reject: () => L("descartada", "discarded"), pending: () => L("a la bandeja", "to the inbox"), edit: () => L("cambiada", "changed"), delete: () => L("borrada", "deleted"), revert: () => L("deshecho", "undone"), literal: () => L("copia literal usada", "literal copy used") };
const BY = { user: () => L("tú", "you"), auto: () => L("solo", "automatic"), maestro: () => L("Maestro", "Maestro") };
function logLabel(e) {
  const o = e.after || e.before || {};
  if (e.obj === "memory") return L(o.text || "", o.text_en || o.text || "");
  if (e.obj === "style") return o.name || (o.song ? L(`en «${o.song}»`, `in «${o.song}»`) : e.obj_id);
  if (e.obj === "case") { try { const d = JSON.parse(o.data || "{}"); return d.title || d.problem || ""; } catch { return ""; } }
  return "";
}
function logHTML() {
  const rows = log || [];
  return `<p class="sl-lead">${L("Todo lo que se ha añadido, cambiado o borrado en tu memoria, tus estilos y tus casos, con quién lo hizo. Cada línea se puede deshacer: vuelve a dejarlo como estaba justo antes.", "Everything added, changed or deleted in your memory, styles and cases, and who did it. Each line can be undone: it goes back to how it was just before.")}</p>
    ${rows.length ? `<div class="mem-log">${rows.map((e) => `<div class="mem-lrow ${e.reverted ? "undone" : ""}" data-log="${e.id}">
      <span class="hint">${new Date(e.ts * 1000).toLocaleString(L("es-ES", "en-GB"), { dateStyle: "short", timeStyle: "short" })}</span>
      <span><b>${OBJ[e.obj]()}</b> ${ACT[e.action] ? ACT[e.action]() : esc(e.action)} · ${BY[e.by] ? BY[e.by]() : esc(e.by)}</span>
      <span class="mem-ltxt">${esc(logLabel(e)).slice(0, 140)}</span>
      ${e.reverted ? `<span class="hint">${L("deshecho", "undone")}</span>` : e.action === "revert" || e.action === "literal" ? "<span></span>" : `<button data-a="revert">${icon("undo", 13)} ${L("Deshacer", "Undo")}</button>`}</div>`).join("")}</div>`
      : `<p class="hint mem-empty">${L("Todavía no hay nada en el registro.", "Nothing in the log yet.")}</p>`}`;
}

// ---------------------------------------------------------------- casos
function casesHTML() {
  const cs = data.cases || [];
  const d = T.caseDraft;
  const form = d ? `<div class="mem-case-form">
      <h4>${icon("plus", 14)} ${L("Nuevo caso musical", "New musical case")}</h4>
      <label>${L("Problema", "Problem")} <input data-c="problem" value="${esc(d.problem || "")}" maxlength="400"></label>
      <div class="mem-ab"><label>${L("Antes", "Before")}<textarea data-c="before" rows="4">${esc(d.before || "")}</textarea></label>
        <label>${L("Después", "After")}<textarea data-c="after" rows="4">${esc(d.after || "")}</textarea></label></div>
      <label>${L("¿Por qué lo aceptaste?", "Why did you accept it?")} <input data-c="why" value="${esc(d.why || "")}" maxlength="400" placeholder="${L("Ej.: el bajo ya no pisa al bombo", "E.g. the bass no longer steps on the kick")}"></label>
      <div class="row"><button class="primary" data-a="case-save">${icon("save", 13)} ${L("Guardar el caso", "Save the case")}</button><button data-a="case-cancel">${L("Cancelar", "Cancel")}</button></div></div>` : "";
  return `<p class="sl-lead">${L("Un caso es un problema que resolviste, con el código de antes y el de después y por qué te convenció. Cuando pides algo parecido, Maestro lee tus casos y resuelve a tu manera.", "A case is a problem you solved, with the code before and after and why it convinced you. When you ask for something similar, Maestro reads your cases and solves it your way.")}</p>
    ${form || `<p class="hint">${L("Al elegir una opción de Maestro aparece «Guardar como caso». También puedes crear uno a mano.", "When you pick one of Maestro's options, «Save as a case» shows up. You can also create one by hand.")} <button data-a="case-new">${icon("plus", 13)} ${L("Caso nuevo", "New case")}</button></p>`}
    ${cs.length ? cs.map((c) => `<div class="mem-case" data-case="${c.id}"><div class="mem-case-top"><b>${esc(c.title || c.problem)}</b>${c.genre ? `<span class="tag">${esc(genreName(c.genre))}</span>` : ""}
        <button class="icon-btn" data-a="case-del" title="${L("Borrar", "Delete")}">${icon("trash", 15)}</button></div>
        ${c.title ? `<p>${esc(c.problem)}</p>` : ""}<div class="mem-ab"><pre>${esc(c.before)}</pre><pre>${esc(c.after)}</pre></div>
        ${c.why ? `<p class="hint">${L("Por qué", "Why")}: ${esc(c.why)}</p>` : ""}</div>`).join("") : `<p class="hint mem-empty">${L("Aún no hay casos.", "No cases yet.")}</p>`}`;
}

// ---------------------------------------------------------------- mis estilos
function stylesHTML() {
  const s = ctx.state();
  const list = styles || [];
  if (T.style && T.mode === "transformation") return transformHTML(list.find((x) => x.id === T.style));
  return `<p class="sl-lead">${L("Un estilo guarda el groove (las pistas de ritmo), los papeles, los instrumentos, los efectos y el tempo de una canción. No guarda las notas: así puedes hacer canciones nuevas con tu sello sin repetirte.", "A style keeps a song's groove (the rhythm tracks), roles, instruments, effects and tempo. It doesn't keep the notes: that way you can make new songs with your touch without repeating yourself.")}</p>
    <div class="mem-add"><input data-f="sname" placeholder="${L("Nombre del estilo", "Style name")}" value="${esc(s.name ? s.name : "")}" maxlength="80">
      <button class="primary" data-a="style-save" ${s.tracks && s.tracks.length ? "" : "disabled"}>${icon("save", 13)} ${L("Guardar mi canción como estilo", "Save my song as a style")}</button></div>
    <div class="mem-add"><input data-f="link" placeholder="${L("Enlace de GitHub: usuario/repo, …/styles/estilo.json", "GitHub link: user/repo, …/styles/style.json")}">
      <button data-a="style-import">${icon("link", 13)} ${L("Importar desde un enlace", "Import from a link")}</button></div>
    ${list.length ? `<div class="mem-styles">${list.map((st) => `<div class="mem-style" data-sid="${esc(st.id)}">
      <div class="mem-case-top"><b>${esc(st.name)}</b>${st.genre ? `<span class="tag">${esc(genreName(st.genre))}</span>` : ""}<span class="tag">${st.bpm} BPM</span>${st.key ? `<span class="tag">${esc(st.key)}</span>` : ""}${st.source === "imported" ? `<span class="tag">${L("importado", "imported")}</span>` : ""}
        <button class="icon-btn" data-a="style-del" title="${L("Borrar (se puede deshacer en el Registro)", "Delete (can be undone in the Log)")}">${icon("trash", 15)}</button></div>
      <p class="hint">${st.roles.map((r) => `${esc(r.name)} (${esc(roleName(r.role))}${r.sounds.length ? ": " + esc(r.sounds.slice(0, 2).join(", ")) : ""})`).join(" · ")}</p>
      <div class="mem-modes">
        <button data-a="mode-inspiration" title="${L("Material nuevo con sus mismas relaciones: Maestro compone otra canción con ese groove, esos papeles y ese tempo", "New material with the same relations: Maestro writes another song with that groove, those roles and that tempo")}">${icon("wand", 14)} ${L("Inspiración", "Inspiration")}</button>
        <button data-a="mode-transformation" title="${L("Su estructura, groove y papeles en otra tonalidad, tempo o conjunto de instrumentos; lo escuchas antes", "Its structure, groove and roles in another key, tempo or ensemble; you listen first")}">${icon("sliders", 14)} ${L("Transformación", "Transformation")}</button>
        <button data-a="mode-literal" ${st.literal && st.literal.length ? "" : "disabled"} title="${L("Las pistas tal cual, con sus notas. Solo si lo eliges, y queda en el Registro", "The tracks as they are, with their notes. Only if you choose it, and it goes in the Log")}">${icon("copy", 14)} ${L("Copia literal", "Literal copy")}</button>
        <button data-a="style-share" title="${L("Sube el estilo a tu repositorio de GitHub (styles/) y te da un enlace para compartirlo", "Uploads the style to your GitHub repository (styles/) and gives you a link to share it")}">${icon("share", 14)} ${L("Compartir", "Share")}</button></div>
      ${T.shared[st.id] ? `<p class="hint mem-shared">${icon("link", 12)} <a href="${esc(T.shared[st.id])}" target="_blank" rel="noopener">${esc(T.shared[st.id])}</a></p>` : ""}</div>`).join("")}</div>`
      : `<p class="hint mem-empty">${L("Aún no tienes estilos. Abre una canción que te guste y guárdala como estilo.", "No styles yet. Open a song you like and save it as a style.")}</p>`}
    ${data.github ? "" : `<p class="hint">${L("Para compartir estilos y hacer copia de la memoria conecta GitHub en Ajustes.", "To share styles and back up your memory, connect GitHub in Settings.")}</p>`}`;
}
function transformHTML(st) {
  if (!st) { T.style = null; return stylesHTML(); }
  const f = T.form;
  const melodic = st.roles.filter((r) => ["bajo", "armonia", "melodia"].includes(r.role));
  const res = T.result;
  return `<button data-a="back">${icon("back", 13)} ${L("Mis estilos", "My styles")}</button>
    <h4>${icon("sliders", 15)} ${L("Transformar", "Transform")} «${esc(st.name)}»</h4>
    <p class="sl-lead">${L("El groove se queda; el bajo, los acordes y la melodía se escriben de nuevo en la tonalidad y con los instrumentos que elijas (con el generador del estudio, sin IA). Escúchalo antes de usarlo.", "The groove stays; bass, chords and melody are written again in the key and with the instruments you pick (with the studio's generator, no AI). Listen before using it.")}</p>
    <div class="mem-tform">
      <label>${L("Género de las partes", "Genre of the parts")} <select data-t="genre">${(data.styles_list || []).map((g) => `<option value="${g.id}" ${(f.genre || st.genre) === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
      <label>${L("Tonalidad", "Key")} <select data-t="key"><option value="">${L("la del género", "the genre's")}</option>${KEYS.flatMap((k) => [k, k + "m"]).map((k) => `<option ${f.key === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label>BPM <input type="number" data-t="bpm" min="40" max="220" value="${esc(f.bpm || st.bpm)}"></label>
      ${melodic.map((r) => `<label>${esc(r.name)} (${esc(roleName(r.role))}) <input data-ens="${esc(r.name)}" value="${esc((f.ens || {})[r.name] || r.sounds[0] || "")}" placeholder="${L("sonido", "sound")}"></label>`).join("")}
    </div>
    <div class="row"><button class="primary" data-a="t-gen">${icon("wand", 13)} ${res ? L("Otra versión", "Another version") : L("Generar", "Generate")}</button>
      ${res ? `<button data-a="t-hear">${icon("play", 13)} ${L("Escuchar", "Listen")}</button><button data-a="t-stop">${icon("stop", 13)} ${L("Parar", "Stop")}</button>
      <button class="primary" data-a="t-use">${icon("check", 13)} ${L("Usar en una canción nueva", "Use in a new song")}</button>` : ""}</div>
    ${res ? `<p class="hint">${esc(genreName(res.genre))} · ${esc(res.key)} · ${res.bpm} BPM</p><div class="mem-tracks">${res.tracks.map((t) => `<div><b>${esc(t.id)} · ${esc(t.name)}</b><pre>${esc(t.code)}</pre></div>`).join("")}</div>` : ""}`;
}

// ---------------------------------------------------------------- ajustes
function settingsHTML() {
  const s = data.settings || {};
  const bk = data.backup || {};
  const sw = (k, es, en, hes, hen) => `<label class="sl-switch"><input type="checkbox" data-set="${k}" ${s[k] ? "checked" : ""}> ${L(es, en)}</label><p class="hint">${L(hes, hen)}</p>`;
  return `<div class="sl-learn">
    <section><h4>${icon("check", 15)} ${L("Validación", "Validation")}</h4>
      ${sw("auto_approve", "Aprobar solo lo muy claro", "Approve what's very clear by itself", "«Recuerda que…» en el chat, o 3+ elecciones de oído del mismo sonido sin otro favorito. Lo que contradiga otra memoria o el tempo del género siempre va a la bandeja.", "«Remember that…» in the chat, or 3+ picks by ear of the same sound with no other favourite. Anything that contradicts another memory or the genre's tempo always goes to the inbox.")}
      ${sw("observe_chat", "Apuntar lo que digo en el chat", "Note what I say in the chat", "Frases como «recuerda…», «nunca…», «prefiero…», «no me gusta…».", "Phrases like «remember…», «never…», «I prefer…», «I don't like…».")}
      ${sw("learn_picks", "Aprender de mis elecciones de oído", "Learn from my picks by ear", "Al comparar sonidos de oído (laboratorio, cursos, tarjeta de cambiar sonido).", "When comparing sounds by ear (Sound lab, courses, replace card).")}</section>
    <section><h4>${icon("cloud", 15)} ${L("Copia en GitHub", "GitHub backup")}</h4>
      ${sw("backup", "Copiar lo aprobado en mi repositorio", "Copy what's approved to my repository", "Memorias aprobadas, tus estilos y tus casos, en la carpeta tidal-studio/ (un commit unos segundos después de cada cambio). Nunca la bandeja, ni votos, ni audio.", "Approved memories, your styles and your cases, in the tidal-studio/ folder (one commit a few seconds after each change). Never the inbox, votes or audio.")}
      <div class="row">${data.github ? `<span class="lb-badge o-library">${esc((data.github_where || {}).repo || "GitHub")}</span><button data-a="backup" ${s.backup ? "" : "disabled"}>${icon("cloud", 13)} ${L("Copiar ahora", "Back up now")}</button>` : `<span class="hint">${L("GitHub no está conectado (Ajustes → GitHub).", "GitHub isn't connected (Settings → GitHub).")}</span>`}</div>
      ${bk.last ? `<p class="hint">${L("Última copia", "Last backup")}: ${new Date(bk.last * 1000).toLocaleString(L("es-ES", "en-GB"))}${bk.commit_url ? ` · <a href="${esc(bk.commit_url)}" target="_blank" rel="noopener">commit</a>` : ""}</p>` : ""}
      ${bk.state === "error" ? `<p class="hint bad">${esc(two(bk.error))}</p>` : ""}</section>
    <section><h4>${icon("disk", 15)} ${L("Almacenamiento", "Storage")}</h4>
      <p class="hint">${L("Qué ocupa sitio en tu ordenador y qué pasa si lo borras.", "What takes space on your computer and what happens if you delete it.")} <button data-a="storage">${icon("disk", 13)} ${L("Abrir el panel", "Open the panel")}</button></p></section></div>`;
}

// ---------------------------------------------------------------- acciones
const post = (path, body) => ctx.api(path, body);
async function onClick(e) {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const a = b.dataset.a;
  const row = b.closest("[data-id]");
  const id = row ? +row.dataset.id : null;
  const sid = b.closest("[data-sid]")?.dataset.sid;
  const body = dlg.querySelector("#mem-body");
  try {
    if (a === "add") {
      const t = body.querySelector('[data-f="new"]').value.trim(); if (!t) return;
      const sc = body.querySelector('.mem-add [data-f="scope"]').value;
      data = await post("/api/memory/add", { text: t, scope: sc, scope_key: scopeKey(sc) });
    }
    if (a === "approve" || a === "reject") data = await post("/api/memory/status", { id, status: a === "approve" ? "approved" : "rejected" });
    if (a === "delete") data = await post("/api/memory/delete", { id });
    if (a === "edit") { T.edit = id; return render(); }
    if (a === "edit-cancel") { T.edit = null; return render(); }
    if (a === "edit-save") {
      const sc = row.querySelector('[data-f="scope"]').value;
      data = await post("/api/memory/edit", { id, text: row.querySelector('[data-f="text"]').value, scope: sc, scope_key: scopeKey(sc) });
      T.edit = null;
    }
    if (a === "revert") {
      const r = await post("/api/memory/revert", { log_id: +b.closest("[data-log]").dataset.log });
      data = r; log = r.log; styles = null; ctx.toast(L("Deshecho.", "Undone."));
      styles = (await (await fetch("/api/styles")).json()).styles || [];
    }
    if (a === "backup") { b.disabled = true; data = await post("/api/memory/backup", {}); ctx.toast(L("Copia hecha en GitHub.", "Backup done on GitHub.")); }
    if (a === "storage") { dlg.close(); return ctx.openStorage(); }
    if (a === "case-new") { T.caseDraft = { problem: "", before: "", after: "", why: "" }; return render(); }
    if (a === "case-cancel") { T.caseDraft = null; return render(); }
    if (a === "case-save") {
      const v = (k) => body.querySelector(`[data-c="${k}"]`).value;
      const s = ctx.state();
      data = await post("/api/cases/add", { ...T.caseDraft, problem: v("problem"), before: v("before"), after: v("after"), why: v("why"), genre: curGenre(), song: s.name || "", song_id: s.projectId || "" });
      T.caseDraft = null; ctx.toast(L("Caso guardado: Maestro lo usará cuando pidas algo parecido.", "Case saved: Maestro will use it when you ask for something similar."));
    }
    if (a === "case-del") data = await post("/api/cases/delete", { id: +b.closest("[data-case]").dataset.case });
    if (a === "style-save") {
      const s = ctx.state();
      const r = await post("/api/styles/save", { song: ctx.songForStyle(), name: body.querySelector('[data-f="sname"]').value || s.name, genre: curGenre() });
      styles = r.styles; ctx.toast(L(`Estilo «${r.style.name}» guardado.`, `Style «${r.style.name}» saved.`));
      data = await (await fetch("/api/memory")).json();
    }
    if (a === "style-import") {
      const link = body.querySelector('[data-f="link"]').value.trim(); if (!link) return;
      b.disabled = true;
      const r = await post("/api/styles/import", { link });
      styles = r.styles; ctx.toast(L(`Importado: ${r.imported.map((x) => x.name).join(", ")}`, `Imported: ${r.imported.map((x) => x.name).join(", ")}`));
      data = await (await fetch("/api/memory")).json();
    }
    if (a === "style-del") { styles = (await post("/api/styles/delete", { id: sid })).styles; data = await (await fetch("/api/memory")).json(); }
    if (a === "style-share") {
      b.disabled = true;
      // Se comparte el estilo, nunca la copia literal (las notas son de tu canción)
      const r = await post("/api/styles/share", { id: sid, literal: false });
      T.shared[sid] = r.url;
      try { await navigator.clipboard.writeText(r.url); ctx.toast(L("Enlace copiado: cualquiera lo puede importar en su Tidal Studio.", "Link copied: anyone can import it in their Tidal Studio.")); } catch { /* sin portapapeles */ }
    }
    if (a === "mode-inspiration") { const st = styles.find((x) => x.id === sid); dlg.close(); return ctx.useStyle(st, "inspiration"); }
    if (a === "mode-literal") {
      const st = styles.find((x) => x.id === sid);
      const r = await post("/api/styles/literal", { id: sid });
      dlg.close();
      return ctx.adoptStyleTracks(st, r.tracks, r.bpm, "literal");
    }
    if (a === "mode-transformation") { T.style = sid; T.mode = "transformation"; T.result = null; T.seed = 1; T.form = {}; return render(); }
    if (a === "back") { ctx.hush(); T.style = null; T.mode = null; T.result = null; return render(); }
    if (a === "t-gen") {
      readForm();
      if (T.result) T.seed += 1;
      T.result = await post("/api/styles/transform", { id: T.style, genre: T.form.genre, key: T.form.key, bpm: +T.form.bpm || undefined, ensemble: T.form.ens, seed: T.seed });
      return render();
    }
    if (a === "t-hear") return ctx.listen(T.result.tracks, T.result.bpm);
    if (a === "t-stop") return ctx.hush();
    if (a === "t-use") {
      const st = styles.find((x) => x.id === T.style);
      const res = T.result;
      ctx.hush(); dlg.close(); T.style = null; T.result = null;
      return ctx.adoptStyleTracks(st, res.tracks, res.bpm, "transformation", res);
    }
  } catch (err) { ctx.toast(two(err.message)); b.disabled = false; return; }
  render();
  ctx.badge && ctx.badge(data && data.stats ? data.stats.pending : 0);
}
function readForm() {
  const body = dlg.querySelector("#mem-body");
  const g = (k) => body.querySelector(`[data-t="${k}"]`)?.value;
  T.form = { genre: g("genre"), key: g("key"), bpm: g("bpm"), ens: Object.fromEntries([...body.querySelectorAll("[data-ens]")].map((i) => [i.dataset.ens, i.value.trim()])) };
}
function scopeKey(sc) {
  const s = ctx.state();
  return sc === "song" ? s.projectId : sc === "course" ? (s.course && s.course.id) || "" : sc === "genre" ? curGenre() : "";
}
async function onChange(e) {
  const k = e.target.dataset.set;
  if (!k) return;
  try { data = await post("/api/memory/settings", { [k]: e.target.checked }); } catch (err) { ctx.toast(two(err.message)); }
  render();
}
