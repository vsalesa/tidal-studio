// Skills y plugins de Maestro: ver cuáles hay, activarlos, fijarlos, instalar nuevos desde GitHub
// y saber cuáles se cargaron y cuáles usó Maestro en cada respuesta.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const USE_KEY = "tidal-studio-skill-use-v1";

export function useCounts() { try { return JSON.parse(localStorage.getItem(USE_KEY)) || {}; } catch { return {}; } }
export function countUse(report) {
  if (!report) return;
  const c = useCounts();
  for (const l of report.loaded || []) { c[l.name] = c[l.name] || { loaded: 0, used: 0 }; c[l.name].loaded++; }
  for (const n of report.used || []) { c[n] = c[n] || { loaded: 0, used: 0 }; c[n].used++; }
  try { localStorage.setItem(USE_KEY, JSON.stringify(c)); } catch { /* sin almacenamiento */ }
}

// Línea bajo cada respuesta de Maestro: qué skills se cargaron y cuáles usó
export function skillsLineHTML(report) {
  if (report && report.command) {
    const c = report.command;
    const line = `<div class="skills-line" data-skills>${icon("plugin", 13)} <span>${L("Comando", "Command")}</span><button class="sk-chip used" data-plugin="${esc(c.plugin)}">/${esc(c.plugin)}:${esc(c.command)}<em>${L("plugin", "plugin")}</em></button></div>`;
    return line + skillsLineHTML({ ...report, command: null });
  }
  if (!report || !report.active) return "";
  const used = new Set(report.used || []);
  const loaded = report.loaded || [];
  if (!loaded.length && !used.size) {
    return `<div class="skills-line quiet" data-skills>${icon("skill", 13)} ${L(`Ninguna de tus ${report.active} skills encajaba con este mensaje`, `None of your ${report.active} skills matched this message`)}</div>`;
  }
  const chips = loaded.map((l) => {
    const u = used.has(l.name);
    const refs = (l.refs || []).length ? ` + ${l.refs.map((r) => r.split("/").pop()).join(", ")}` : "";
    return `<button class="sk-chip ${u ? "used" : "loaded"}" data-skill="${esc(l.name)}" title="${esc(u ? L("Cargada y usada en esta respuesta", "Loaded and used in this answer") : L("Cargada, pero Maestro no la ha usado", "Loaded, but Maestro didn't use it"))}">${u ? icon("check", 12) : ""}${esc(l.name)}<small>${esc(refs)}</small><em>${u ? L("usada", "used") : L("cargada", "loaded")}</em></button>`;
  });
  for (const n of used) if (!loaded.some((l) => l.name === n)) chips.push(`<button class="sk-chip used" data-skill="${esc(n)}">${icon("check", 12)}${esc(n)}<em>${L("usada", "used")}</em></button>`);
  return `<div class="skills-line" data-skills>${icon("skill", 13)} <span>${L("Skills", "Skills")}</span>${chips.join("")}</div>`;
}

function pluginCardHTML(p, focus) {
  const src = p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${icon("link", 12)} ${L("origen", "source")}</a>` : "";
  const parts = [];
  if (p.skills.length) parts.push(`<span><b>${p.skills.length}</b> ${L("skills", "skills")}</span>`);
  if (p.commands.length) parts.push(`<span><b>${p.commands.length}</b> ${L("comandos", "commands")}</span>`);
  if (p.agents.length) parts.push(`<span><b>${p.agents.length}</b> ${L("agentes", "agents")}</span>`);
  const cmds = p.commands.length ? `<div class="pl-cmds"><span>${L("Escríbelos en el chat de Maestro:", "Type them in Maestro's chat:")}</span>${p.commands.map((c) =>
    `<button class="sk-chip" data-a="cmd" data-cmd="/${esc(p.name)}:${esc(c.name)}" title="${esc(c.description)}">/${esc(c.name)}${c.hint ? `<small>${esc(c.hint)}</small>` : ""}</button>`).join("")}</div>` : "";
  const unused = [...(p.agents.length ? [L("agentes", "agents")] : []), ...p.other];
  const note = unused.length ? `<p class="pl-note">${esc(L(`Este plugin también trae ${unused.join(", ")}: son piezas para Claude Code y Tidal Studio no las usa.`, `This plugin also brings ${unused.join(", ")}: those are for Claude Code and Tidal Studio doesn't use them.`))}</p>` : "";
  return `<article class="sk-card pl-card ${p.enabled ? "" : "off"} ${focus === p.name ? "focus" : ""}" data-plugin="${esc(p.name)}">
      <header>
        ${icon("plugin", 16)}<b>${esc(p.title)}</b>
        ${p.default ? `<span class="sk-tag lic">${L("Por defecto", "Default")}</span>` : ""}
        ${p.version ? `<span class="sk-tag">v${esc(p.version)}</span>` : ""}
        ${p.license ? `<span class="sk-tag lic">${esc(p.license)}</span>` : `<span class="sk-tag warn">${L("sin licencia", "no license")}</span>`}
      </header>
      <p>${esc(p.description)}</p>
      <div class="sk-meta">${parts.join("")}${p.author ? `<span>${esc(L("por ", "by ") + p.author)}</span>` : ""}${p.marketplace ? `<span>${L("marketplace", "marketplace")} ${esc(p.marketplace)}</span>` : ""}${src}</div>
      ${cmds}${note}
      ${p.notice ? `<p class="pl-note">${L("Trae un aviso (NOTICE) con condiciones de uso: está en su carpeta, léelo antes de compartir su contenido.", "It ships a NOTICE with terms of use: it's in its folder, read it before sharing its content.")}</p>` : ""}
      <footer>
        <label class="toggle"><input type="checkbox" data-a="plugin-enable" ${p.enabled ? "checked" : ""}> ${L("Activo", "On")}</label>
        <label class="toggle" title="${esc(L("Maestro carga su skill principal en cada mensaje y prefiere sus skills cuando encajan", "Maestro loads its main skill with every message and prefers its skills when they match"))}"><input type="checkbox" data-a="plugin-prefer" ${p.preferred ? "checked" : ""} ${p.enabled ? "" : "disabled"}> ${L("Usar siempre", "Always use")}</label>
        <button class="sk-btn danger" data-a="plugin-remove">${icon("trash", 14)} ${L("Quitar plugin", "Remove plugin")}</button>
      </footer>
    </article>`;
}

// Elegir qué plugins de un marketplace instalar
export function chooseHTML(r, url) {
  return `<div class="pl-choose" data-url="${esc(url)}">
    <b>${esc(L(`El marketplace «${r.marketplace}» tiene ${r.choose.length} plugins. Elige cuáles instalar:`, `The «${r.marketplace}» marketplace has ${r.choose.length} plugins. Pick which to install:`))}</b>
    ${r.choose.map((p) => `<label class="pl-opt ${p.installable ? "" : "off"}"><input type="checkbox" value="${esc(p.name)}" ${p.installable ? "checked" : "disabled"}>
      <span><b>${esc(p.name)}</b> <small>${[p.skills ? `${p.skills} skills` : "", p.commands ? `${p.commands} ${L("comandos", "commands")}` : ""].filter(Boolean).join(" · ")}</small><br>${esc(p.installable ? (p.description || "") + (p.repo ? ` (github.com/${p.repo})` : "") : L("Tidal Studio no sabe descargar este origen", "Tidal Studio can't download this source"))}</span></label>`).join("")}
    <button type="button" class="primary" data-a="install-chosen">${L("Instalar los elegidos", "Install selected")}</button>
  </div>`;
}

export function skillsDialogHTML(list, opts = {}) {
  const counts = useCounts();
  const focus = opts.focus || "";
  const plugins = opts.plugins || [];
  const card = (s) => {
    const c = counts[s.name] || { loaded: 0, used: 0 };
    const src = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${icon("link", 12)} ${L("origen", "source")}</a>` : "";
    return `<article class="sk-card ${s.enabled ? "" : "off"} ${focus === s.name ? "focus" : ""}" data-name="${esc(s.name)}">
      <header>
        <b>${esc(s.name)}</b>
        <span class="sk-tag">${s.origin === "plugin" ? `${icon("plugin", 11)} ${esc(s.plugin)}` : s.origin === "user" ? L("Instalada por ti", "Installed by you") : L("Incluida", "Included")}</span>
        ${s.license ? `<span class="sk-tag lic">${esc(s.license)}</span>` : `<span class="sk-tag warn">${L("sin licencia", "no license")}</span>`}
        ${s.language === "strudel" ? `<span class="sk-tag" title="${esc(L("Escrita para Strudel (JavaScript): Maestro traduce sus ideas a Tidal", "Written for Strudel (JavaScript): Maestro translates its ideas to Tidal"))}">Strudel</span>` : ""}
      </header>
      <p>${esc(s.description)}</p>
      <div class="sk-meta">
        <span>${(s.chars / 1000).toFixed(1)}k ${L("caracteres", "chars")}</span>
        ${s.refs.length ? `<span title="${esc(s.refs.join("\n"))}">${s.refs.length} ${L("referencias", "references")}: ${s.refs.slice(0, 4).map((r) => esc(r.split("/").pop())).join(", ")}${s.refs.length > 4 ? "…" : ""}</span>` : ""}
        ${src}
      </div>
      <div class="sk-use"><span class="sk-count">${L("Cargada", "Loaded")} <b>${c.loaded}</b></span><span class="sk-count used">${L("Usada", "Used")} <b>${c.used}</b></span></div>
      <footer>
        <label class="toggle"><input type="checkbox" data-a="enable" ${s.enabled ? "checked" : ""}> ${L("Activa", "On")}</label>
        <label class="toggle" title="${esc(L("Cargarla siempre, aunque el mensaje no encaje", "Always load it, even when the message doesn't match"))}"><input type="checkbox" data-a="pin" ${s.pinned ? "checked" : ""} ${s.enabled ? "" : "disabled"}> ${L("Cargar siempre", "Always load")}</label>
        <button class="sk-btn" data-a="view">${icon("code", 14)} ${L("Ver", "View")}</button>
        ${s.origin === "user" ? `<button class="sk-btn danger" data-a="remove">${icon("trash", 14)} ${L("Quitar", "Remove")}</button>` : ""}
      </footer>
      <pre class="sk-body" hidden></pre>
    </article>`;
  };
  const own = list.filter((s) => s.origin !== "plugin");
  const cards = own.map(card).join("");
  const pluginBlocks = plugins.map((p) => {
    const sk = list.filter((s) => s.plugin === p.name);
    const open = focus === p.name || sk.some((s) => s.name === focus);
    return pluginCardHTML(p, focus) + (sk.length ? `<details class="pl-skills" ${open ? "open" : ""}><summary>${esc(L(`Skills de ${p.title} (${sk.length})`, `${p.title} skills (${sk.length})`))}</summary><div class="sk-grid">${sk.map(card).join("")}</div></details>` : "");
  }).join("");
  return `<div class="sk-intro">
      <h2>${L("Skills de Maestro", "Maestro's skills")}</h2>
      <p>${L("Una skill es un SKILL.md con conocimiento experto (el mismo formato que las Agent Skills de Claude). En cada mensaje Maestro ve la lista; las que encajan con lo que pides se cargan enteras, y debajo de cada respuesta ves cuáles se cargaron y cuáles usó de verdad.",
        "A skill is a SKILL.md with expert knowledge (the same format as Claude's Agent Skills). With every message Maestro sees the list; the ones that match your request are loaded in full, and under each answer you see which were loaded and which it actually used.")}</p>
    </div>
    <h3 class="sk-h">${icon("skill", 15)} ${L("Skills", "Skills")}</h3>
    <div class="sk-grid">${cards || `<p class="hint">${L("No hay skills instaladas.", "No skills installed.")}</p>`}</div>
    <h3 class="sk-h">${icon("plugin", 15)} ${L("Plugins", "Plugins")}</h3>
    <p class="hint pl-intro">${L("Un plugin es un paquete de Claude Code (.claude-plugin/plugin.json) que puede traer muchas skills y comandos. Maestro usa sus skills como las demás y sus comandos los escribes en el chat (/nombre). Se instalan solo en tu ordenador.",
      "A plugin is a Claude Code package (.claude-plugin/plugin.json) that can bring many skills and commands. Maestro uses its skills like any other and you type its commands in the chat (/name). They're installed only on your computer.")}</p>
    ${opts.defaultState === "installing" ? `<p class="hint">${L("Descargando el plugin de composición musical que viene por defecto…", "Downloading the default music composition plugin…")}</p>` : ""}
    ${pluginBlocks || `<p class="hint">${L("Aún no hay plugins instalados.", "No plugins installed yet.")}</p>`}
    <form class="sk-install" id="sk-install">
      <label>${icon("plus", 14)} ${L("Instalar una skill o un plugin desde GitHub", "Install a skill or a plugin from GitHub")}</label>
      <div class="row"><input name="url" placeholder="https://github.com/user/repo" autocomplete="off"><button class="primary" type="submit">${L("Instalar", "Install")}</button></div>
      <p class="hint">${L(`Pega el enlace de un repositorio de plugin o marketplace (https://github.com/usuario/repo) o el de la carpeta de una skill (…/tree/main/skills/nombre). También puedes copiar carpetas en ${esc(opts.folder || "my-skills/")} o ${esc(opts.pluginFolder || "my-plugins/")}. Antes de instalar, mira su licencia y su contenido: Maestro solo sigue sus consejos de música y de Tidal.`,
        `Paste the link to a plugin or marketplace repository (https://github.com/user/repo) or to a skill folder (…/tree/main/skills/name). You can also copy folders into ${esc(opts.folder || "my-skills/")} or ${esc(opts.pluginFolder || "my-plugins/")}. Before installing, check its license and content: Maestro only follows its music and Tidal advice.`)}</p>
      <div class="pl-choose-slot"></div>
    </form>`;
}

// «Cómo lo he decidido»: cada decisión musical con la skill que consultó Maestro y la regla que aplicó
const ASPECT = {
  estilo: ["Estilo", "Style", "wand"], ritmo: ["Ritmo", "Rhythm", "percusion"], tempo: ["Tempo", "Tempo", "steps"],
  bajo: ["Bajo", "Bass", "bajo"], armonia: ["Armonía", "Harmony", "armonia"], melodia: ["Melodía", "Melody", "melodia"],
  instrumentos: ["Instrumentos", "Instruments", "speaker"], efectos: ["Efectos", "Effects", "fx"],
  mezcla: ["Mezcla", "Mix", "mixer"], estructura: ["Estructura", "Structure", "estructura"], otro: ["Idea", "Idea", "skill"],
};
export function decisionsHTML(decisions, open = true) {
  const rows = decisions.map((d) => {
    const a = ASPECT[d.aspect] || ASPECT.otro;
    return `<li class="dec">
      <div class="dec-head"><span class="dec-asp">${icon(a[2], 14)} ${esc(L(a[0], a[1]))}</span>
        <button class="sk-chip used" data-skill="${esc(d.skill)}" title="${esc(L("Abrir la skill", "Open the skill"))}">${icon("skill", 12)}${esc(d.skill)}</button></div>
      <div class="dec-body">
        ${d.rule ? `<blockquote>${esc(d.rule)}</blockquote>` : ""}
        ${d.applied ? `<p>${icon("check", 12)} ${esc(d.applied)}</p>` : ""}
      </div>
    </li>`;
  }).join("");
  return `<details class="decisions" ${open ? "open" : ""}><summary>${icon("skill", 14)} ${L("Cómo lo he decidido", "How I decided")} <small>${esc(L(`${decisions.length} ${decisions.length === 1 ? "decisión" : "decisiones"} con skills`, `${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"} from skills`))}</small></summary><ol>${rows}</ol></details>`;
}

// Razonamiento de Maestro, estilo harness: pasos y pensamiento en gris tenue, dentro de un desplegable
export function traceHTML(trace, { live = false, open = false } = {}) {
  const evs = (trace && trace.events) || [];
  const last = evs.length ? evs[evs.length - 1] : null;
  const peek = last ? (last.kind === "thinking" ? last.text.replace(/\s+/g, " ").slice(-110) : last.text) : L("empezando…", "starting…");
  const secs = trace && trace.seconds ? `${Math.round(trace.seconds)} s` : "";
  const thought = evs.some((e) => e.kind === "thinking");
  const body = evs.map((e) => e.kind === "thinking"
    ? `<div class="tr-think">${esc(e.text)}</div>`
    : `<div class="tr-step"><span>${e.t != null ? `${e.t.toFixed ? e.t.toFixed(1) : e.t}s` : ""}</span>${esc(e.text)}</div>`).join("");
  const title = live ? L("Pensando", "Thinking") : L("Razonamiento", "Reasoning");
  const note = !live && !thought ? `<div class="tr-step tr-note">${esc(L("Este proveedor no comparte su razonamiento: solo se ven los pasos.", "This provider doesn't share its reasoning: only the steps are shown."))}</div>` : "";
  return `<details class="trace ${live ? "live" : ""}" ${open ? "open" : ""}><summary><span class="tr-title">${title}${secs ? ` · ${secs}` : ""}</span>${live || !open ? `<span class="tr-peek">${esc(peek)}</span>` : ""}</summary><div class="tr-body">${body}${note}</div></details>`;
}
