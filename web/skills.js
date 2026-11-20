// Skills de Maestro: ver cuáles hay, activarlas, fijarlas, instalar nuevas desde GitHub
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

export function skillsDialogHTML(list, opts = {}) {
  const counts = useCounts();
  const focus = opts.focus || "";
  const cards = list.map((s) => {
    const c = counts[s.name] || { loaded: 0, used: 0 };
    const src = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${icon("link", 12)} ${L("origen", "source")}</a>` : "";
    return `<article class="sk-card ${s.enabled ? "" : "off"} ${focus === s.name ? "focus" : ""}" data-name="${esc(s.name)}">
      <header>
        <b>${esc(s.name)}</b>
        <span class="sk-tag">${s.origin === "user" ? L("Instalada por ti", "Installed by you") : L("Incluida", "Included")}</span>
        ${s.license ? `<span class="sk-tag lic">${esc(s.license)}</span>` : `<span class="sk-tag warn">${L("sin licencia", "no license")}</span>`}
        ${s.language === "strudel" ? `<span class="sk-tag" title="${esc(L("Escrita para Strudel (JavaScript): Maestro traduce sus ideas a Tidal", "Written for Strudel (JavaScript): Maestro translates its ideas to Tidal"))}">Strudel</span>` : ""}
      </header>
      <p>${esc(s.description)}</p>
      <div class="sk-meta">
        <span>${(s.chars / 1000).toFixed(1)}k ${L("caracteres", "chars")}</span>
        ${s.refs.length ? `<span>${s.refs.length} ${L("referencias", "references")}: ${s.refs.map((r) => esc(r.split("/").pop())).join(", ")}</span>` : ""}
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
  }).join("");
  return `<div class="sk-intro">
      <h2>${L("Skills de Maestro", "Maestro's skills")}</h2>
      <p>${L("Una skill es un SKILL.md con conocimiento experto (el mismo formato que las Agent Skills de Claude). En cada mensaje Maestro ve la lista; las que encajan con lo que pides se cargan enteras, y debajo de cada respuesta ves cuáles se cargaron y cuáles usó de verdad.",
        "A skill is a SKILL.md with expert knowledge (the same format as Claude's Agent Skills). With every message Maestro sees the list; the ones that match your request are loaded in full, and under each answer you see which were loaded and which it actually used.")}</p>
    </div>
    <div class="sk-grid">${cards || `<p class="hint">${L("No hay skills instaladas.", "No skills installed.")}</p>`}</div>
    <form class="sk-install" id="sk-install">
      <label>${icon("plus", 14)} ${L("Instalar una skill desde GitHub", "Install a skill from GitHub")}</label>
      <div class="row"><input name="url" placeholder="https://github.com/user/repo/tree/main/skills/name" autocomplete="off"><button class="primary" type="submit">${L("Instalar", "Install")}</button></div>
      <p class="hint">${L(`También puedes copiar una carpeta con su SKILL.md en ${esc(opts.folder || "my-skills/")}. Antes de instalar, mira su licencia y su contenido: Maestro solo sigue sus consejos de música y de Tidal.`,
        `You can also copy a folder with its SKILL.md into ${esc(opts.folder || "my-skills/")}. Before installing, check its license and content: Maestro only follows its music and Tidal advice.`)}</p>
    </form>`;
}
