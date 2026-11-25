// Ajustes → Límites (0.25.1): todos los topes del estudio, con su valor de serie y «Restablecer».
// Los define server/limits.py; aquí solo se pintan y se recogen.
import { L, LANG } from "./i18n.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let last = null;

export async function renderLimits(el, api) {
  try { last = await api(`/api/limits?lang=${LANG}`); } catch { el.textContent = L("No puedo leer los límites.", "Can't read the limits."); return; }
  el.innerHTML = `<p class="hint">${L("Los valores de serie funcionan bien en casi todos los ordenadores. Subirlos da más margen (archivos más grandes, más contexto para Maestro) a cambio de más memoria, más tokens o respuestas más lentas. Cada número tiene un mínimo y un máximo seguros. Todo se aplica al pulsar Guardar, sin reiniciar la app.",
    "The default values work well on almost any computer. Raising them gives more room (bigger files, more context for Maestro) at the cost of more memory, more tokens or slower answers. Each number has a safe minimum and maximum. Everything applies when you press Save, without restarting the app.")}</p>
    ${last.groups.map((g) => `<h4 class="lm-group">${esc(g.name)}</h4>
      <div class="lm-rows">${last.limits.filter((x) => x.group === g.id).map((x) => `
        <label class="lm-row ${x.value !== x.default ? "changed" : ""}"><span>${esc(x.label)}</span>
          <input type="number" data-lim="${esc(x.key)}" min="${x.min}" max="${x.max}" step="any" value="${x.value}">
          <small>${esc(x.unit)}</small>
          <button type="button" class="lm-reset" data-reset="${esc(x.key)}" title="${L("Volver al valor de serie", "Back to the default")}: ${x.default}">${L("De serie", "Default")}: ${x.default}</button>
        </label>`).join("")}</div>`).join("")}
    <div class="row"><button type="button" id="lm-reset-all">${L("Restablecer todos los límites", "Reset all limits")}</button></div>`;
  const byKey = Object.fromEntries(last.limits.map((x) => [x.key, x]));
  const mark = (inp) => inp.closest(".lm-row").classList.toggle("changed", +inp.value !== byKey[inp.dataset.lim].default);
  el.querySelectorAll("input[data-lim]").forEach((i) => i.addEventListener("input", () => mark(i)));
  el.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => {
    const i = el.querySelector(`input[data-lim="${b.dataset.reset}"]`); i.value = byKey[b.dataset.reset].default; mark(i);
  }));
  el.querySelector("#lm-reset-all").addEventListener("click", () => el.querySelectorAll("input[data-lim]").forEach((i) => { i.value = byKey[i.dataset.lim].default; mark(i); }));
}

// Lo que se manda al guardar: solo lo que no es el valor de serie (el servidor lo vuelve a comprobar)
export function collectLimits(el) {
  if (!last || !el.querySelector("input[data-lim]")) return null;
  const out = {};
  el.querySelectorAll("input[data-lim]").forEach((i) => {
    const d = last.limits.find((x) => x.key === i.dataset.lim);
    let v = +i.value;
    if (!Number.isFinite(v)) return;
    v = Math.max(d.min, Math.min(d.max, v));
    if (v !== d.default) out[d.key] = v;
  });
  return out;
}
