// Plan por pasos: cuando pides algo grande, Maestro primero diseña un plan (como una lluvia de ideas con un
// productor), te lo enseña para que lo apruebes o lo cambies, y luego lo hace paso a paso. Cada paso se
// aplica y se guarda al terminar: si la IA tarda demasiado en uno, lo ya hecho no se pierde y se
// reintenta solo ese paso.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const KEY = "tidal-studio-plan";

// Activado por defecto; se puede apagar con el interruptor sobre el chat
export function planEnabled() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setPlanEnabled(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* sin almacenamiento */ }
}

// Respuestas rápidas que acompañan a un plan recién propuesto
export const PLAN_START = () => L("Empezar el plan", "Start the plan");
export const PLAN_STEPWISE = () => L("Paso a paso (parar en cada uno)", "Step by step (stop after each)");
export const PLAN_ALL = () => L("Hazlo todo de golpe", "Do it all at once");
export const PLAN_SPLIT = () => L("Hazlo por pasos", "Do it in steps");
export const PLAN_CONTINUE = () => L("Seguir con el plan", "Continue the plan");
export const PLAN_RETRY = () => L("Reintentar el paso", "Retry the step");

// Barra fija arriba del chat mientras un plan está en marcha o en pausa: se ve el progreso aunque el plan
// haya quedado más arriba en la conversación
export function planBarHTML(m, mi, running) {
  const p = m.plan;
  const done = p.pasos.filter((x) => x.estado === "hecho").length;
  const i = nextStep(p);
  const err = i >= 0 && p.pasos[i].estado === "error";
  const now = running && i >= 0 ? L(`Paso ${i + 1}: ${p.pasos[i].titulo}`, `Step ${i + 1}: ${p.pasos[i].titulo}`)
    : err ? L(`El paso ${i + 1} no salió: reinténtalo`, `Step ${i + 1} didn't work: retry it`)
      : i >= 0 ? L(`En pausa · sigue el paso ${i + 1}`, `Paused · step ${i + 1} is next`) : "";
  return `<div class="pl-sticky${err ? " err" : ""}" data-pl="goto" data-mi="${mi}" title="${esc(L("Ver el plan", "See the plan"))}">
    ${icon("steps", 13)} <b>${esc(p.titulo)}</b> <span class="pl-count">${done}/${p.pasos.length}</span>
    <span class="pl-now">${esc(now)}</span>
    <span class="pl-bar"><i style="width:${Math.round((done / p.pasos.length) * 100)}%"></i></span>
  </div>`;
}

export function newPlan(p, peticion) {
  return { ...p, peticion, estado: "propuesto", auto: true, pasos: p.pasos.map((x) => ({ ...x, estado: "pendiente" })) };
}

export function nextStep(plan) {
  return plan.pasos.findIndex((x) => x.estado === "pendiente" || x.estado === "error" || x.estado === "haciendo");
}

export function planDone(plan) {
  return plan.pasos.every((x) => x.estado === "hecho" || x.estado === "saltado");
}

// Para el historial que se manda a la IA: qué plan propuso y cómo va
export function planContext(m) {
  if (!m.plan) return "";
  const list = m.plan.pasos.map((p, k) => `${k + 1}. [${p.estado}] ${p.titulo}`).join("\n");
  return `\n[${L("Plan que propuse", "Plan I proposed")} «${m.plan.titulo}» (${m.plan.estado}):\n${list}]`;
}

const STATE_ICON = { hecho: "check", haciendo: "brain", error: "close", saltado: "arrow" };

export function planHTML(m, mi, running) {
  const p = m.plan;
  const total = p.pasos.length;
  const done = p.pasos.filter((x) => x.estado === "hecho").length;
  const editable = p.estado === "propuesto";
  const steps = p.pasos.map((s, k) => {
    const st = s.estado || "pendiente";
    const mark = STATE_ICON[st] ? icon(STATE_ICON[st], 12) : String(k + 1);
    return `<li class="pl-step ${st}">
      <span class="pl-n">${mark}</span>
      <div class="pl-body"><div class="pl-title">${esc(s.titulo)}${s.pistas && s.pistas.length ? ` <span class="pl-tracks">${esc(s.pistas.join(" · "))}</span>` : ""}</div>
        ${s.que ? `<div class="pl-what">${esc(s.que)}</div>` : ""}
        ${st === "error" ? `<div class="pl-err">${esc(s.error || L("No ha salido", "It didn't work"))}</div>` : ""}
        ${st === "haciendo" ? `<div class="pl-doing">${L("Maestro está con este paso…", "Maestro is working on this step…")}</div>` : ""}
      </div>
      ${editable && total > 2 ? `<button class="link pl-x" data-pl="drop" data-mi="${mi}" data-k="${k}" title="${esc(L("Quitar este paso", "Remove this step"))}">${icon("close", 12)}</button>` : ""}
      ${!editable && !running && (st === "pendiente" || st === "error") ? `<button class="link pl-x" data-pl="skip" data-mi="${mi}" data-k="${k}" title="${esc(L("Saltar este paso", "Skip this step"))}">${L("Saltar", "Skip")}</button>` : ""}
    </li>`;
  }).join("");
  let foot = "";
  if (p.estado === "propuesto") {
    foot = `<div class="pl-foot">
      <button class="primary" data-pl="start" data-mi="${mi}">${icon("play", 12)} ${L("Empezar", "Start")}</button>
      <button data-pl="stepwise" data-mi="${mi}" title="${esc(L("Hace un paso y se para para que lo escuches; sigues cuando quieras", "Does one step and stops so you can listen; continue when you like"))}">${icon("steps", 13)} ${L("Paso a paso", "Step by step")}</button>
      <span class="pl-sp"></span>
      <button class="link" data-pl="change" data-mi="${mi}">${L("Cambiar el plan…", "Change the plan…")}</button>
      <button class="link" data-pl="all" data-mi="${mi}">${L("Todo de golpe", "All at once")}</button>
    </div>
    <form class="pl-change" data-mi="${mi}" hidden><input placeholder="${esc(L("Ej.: añade un puente antes del final y quita la trompeta", "E.g.: add a bridge before the end and drop the trumpet"))}"><button class="primary" type="submit">${L("Pedir", "Ask")}</button></form>`;
  } else if (running) {
    foot = `<div class="pl-foot"><button data-pl="pause" data-mi="${mi}">${icon("stop", 12)} ${L("Pausar al acabar este paso", "Pause after this step")}</button></div>`;
  } else if (p.estado === "pausado") {
    const i = nextStep(p);
    const err = i >= 0 && p.pasos[i].estado === "error";
    foot = `<div class="pl-foot">
      <button class="primary" data-pl="${err ? "retry" : "next"}" data-mi="${mi}">${icon(err ? "undo" : "play", 12)} ${err ? L(`Reintentar el paso ${i + 1}`, `Retry step ${i + 1}`) : L(`Seguir: paso ${i + 1}`, `Continue: step ${i + 1}`)}</button>
      ${err ? "" : `<button data-pl="rest" data-mi="${mi}">${L("Hacer el resto seguido", "Do the rest in one go")}</button>`}
      <span class="pl-sp"></span>
      <button class="link" data-pl="stop" data-mi="${mi}">${L("Dejar el plan aquí", "Stop the plan here")}</button>
    </div>`;
  }
  const head = {
    propuesto: L("Plan propuesto · revísalo antes de empezar: puedes quitar pasos o pedir cambios", "Proposed plan · review it before starting: you can remove steps or ask for changes"),
    en_marcha: L(`En marcha · ${done} de ${total} pasos hechos`, `Running · ${done} of ${total} steps done`),
    pausado: L(`En pausa · ${done} de ${total} pasos hechos y guardados`, `Paused · ${done} of ${total} steps done and saved`),
    terminado: L(`Plan terminado · ${done} de ${total} pasos`, `Plan finished · ${done} of ${total} steps`),
    parado: L(`Plan parado · ${done} de ${total} pasos hechos`, `Plan stopped · ${done} of ${total} steps done`),
    reemplazado: L("Plan sustituido por uno nuevo", "Plan replaced by a new one"),
  }[p.estado] || "";
  const pct = Math.round((done / total) * 100);
  return `<div class="plan ${esc(p.estado)}">
    <div class="pl-head">${icon("steps", 14)} <b>${esc(p.titulo)}</b><span class="pl-state">${esc(head)}</span></div>
    ${p.resumen ? `<div class="pl-sum">${esc(p.resumen)}</div>` : ""}
    ${p.estado !== "propuesto" ? `<div class="pl-bar"><i style="width:${pct}%"></i></div>` : ""}
    <ol class="pl-steps">${steps}</ol>
    ${foot}
  </div>`;
}
