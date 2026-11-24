// Asistente para cambiar un instrumento: seleccionas el nombre de un sonido en el código (doble clic o
// arrastrando) y aparece una tarjeta «Cambiar «superpiano» por…» con sonidos parecidos de tu librería
// (primero los que ya tienes, luego los que se bajan en un clic) y un buscador por si ninguno te convence.
// Cada opción se puede escuchar antes, y se cambia solo ahí, en toda la pista o en toda la canción.
// Las sugerencias vienen de server/library.py (/api/library/similar), sin IA y al momento.
import { L } from "./i18n.js";
import { icon } from "./icons.js";
import { entryName, entryBadges } from "./library.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NAME = /^[A-Za-z][\w.-]*(:\d+)?$/;
let ctx = null, card = null;
const S = { ta: null, start: 0, end: 0, word: "", base: "", idx: "", res: null, found: null, q: "", scope: "here", busy: "" };

export function initReplace(c) {
  ctx = c;
  card = document.createElement("div");
  card.className = "rp-card"; card.hidden = true; card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Replace sound");
  document.body.appendChild(card);
  const check = (e) => setTimeout(() => maybeOpen(e), 0);
  document.addEventListener("mouseup", check);
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") check(e); if (e.key === "Escape") close(); });
  document.addEventListener("mousedown", (e) => { if (!card.hidden && !card.contains(e.target)) close(); });
}

// ¿La selección es el nombre de un sonido, dentro de s "…" o sound "…"?
export function soundAt(code, start, end) {
  let a = start, b = end;
  const raw = code.slice(a, b);
  const lead = raw.length - raw.trimStart().length, trail = raw.length - raw.trimEnd().length;
  a += lead; b -= trail;
  const word = code.slice(a, b);
  if (!NAME.test(word)) return null;
  if (/[\w.:-]/.test(code[a - 1] || "") || /[\w.-]/.test(code[b] || "")) return null;   // media palabra
  const before = code.slice(0, a);
  const open = before.lastIndexOf('"');
  if (open < 0 || (before.slice(open + 1).includes('"'))) return null;
  const quotes = (before.match(/"/g) || []).length;
  if (quotes % 2 === 0) return null;                    // no estamos dentro de comillas
  if (!/(?:^|[\s(#$])(?:s|sound)\s+$/.test(before.slice(0, open))) return null;
  const [base, idx] = word.split(":");
  return { start: a, end: b, word, base, idx: idx || "" };
}

// Cambia el sonido `from` por `to` en los s "…" / sound "…" del código (solo palabras enteras)
export function replaceSound(code, from, to, keepIdx = true) {
  return code.replace(/(\b(?:s|sound)\s+")([^"]*)(")/g, (all, pre, pat, post) =>
    pre + pat.replace(new RegExp(`(^|[^\\w.:-])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(:\\d+)?(?![\\w.-])`, "g"),
      (m, p1, idx) => p1 + to + (keepIdx && idx ? idx : "")) + post);
}

function maybeOpen(e) {
  const ta = document.activeElement;
  if (!ta || ta.tagName !== "TEXTAREA" || !(ta.id === "code" || ta.closest(".track"))) return;
  if (ta.selectionStart === ta.selectionEnd) return;
  const hit = soundAt(ta.value, ta.selectionStart, ta.selectionEnd);
  if (!hit) return;
  if (!card.hidden && S.ta === ta && S.start === hit.start) return;
  Object.assign(S, { ta, ...hit, res: null, found: null, q: "", scope: "here", busy: "" });
  const r = ta.getBoundingClientRect();
  const x = e && e.clientX ? e.clientX : r.left + 40, y = e && e.clientY ? e.clientY : r.top + 20;
  card.style.left = Math.max(16, Math.min(window.innerWidth - 400, x - 20)) + "px";
  card.style.top = Math.max(16, Math.min(window.innerHeight - 440, y + 16)) + "px";
  card.hidden = false;
  render();
  load();
}
function close() { if (card) card.hidden = true; }

async function load() {
  try { S.res = await (await fetch(`/api/library/similar?sound=${encodeURIComponent(S.base)}&n=6`)).json(); }
  catch { S.res = { have: [], download: [] }; }
  render();
}
let qTimer = null;
function search(q) {
  S.q = q; clearTimeout(qTimer);
  if (!q.trim()) { S.found = null; return render(); }
  qTimer = setTimeout(async () => {
    try { S.found = (await (await fetch(`/api/library/search?q=${encodeURIComponent(q)}&limit=12`)).json()).items; }
    catch { S.found = []; }
    renderList();
  }, 180);
}

function option(e) {
  return `<div class="rp-opt" data-k="${esc(e.key)}">
    <button class="icon-btn" data-a="hear" title="${L("Escuchar", "Listen")}">${icon("play", 13)}</button>
    <button class="rp-pick" data-a="pick" ${S.busy ? "disabled" : ""}><b>${esc(entryName(e))}</b> <code>${esc(e.sound)}</code>
      <span class="rp-badges">${entryBadges(e)}</span></button></div>`;
}
function listHTML() {
  if (S.found) return S.found.length ? S.found.map(option).join("") : `<p class="hint">${L("Nada con esa palabra.", "Nothing with that word.")}</p>`;
  if (!S.res) return `<p class="hint">${L("Buscando sonidos parecidos…", "Looking for similar sounds…")}</p>`;
  const have = S.res.have || [], dl = S.res.download || [];
  if (!have.length && !dl.length) return `<p class="hint">${L("No encuentro nada parecido. Prueba el buscador.", "I can't find anything similar. Try the search.")}</p>`;
  return (have.length ? `<div class="rp-sub">${L("Ya los tienes", "You already have")}</div>${have.map(option).join("")}` : "")
    + (dl.length ? `<div class="rp-sub">${L("Se descargan en un clic", "One click to download")}</div>${dl.map(option).join("")}` : "");
}
function render() {
  const inTrack = S.ta && S.ta.id !== "code";
  card.innerHTML = `<div class="rp-head"><b>${icon("wand", 14)} ${L(`Cambiar «${esc(S.word)}» por…`, `Replace «${esc(S.word)}» with…`)}</b>
      <button class="icon-btn" data-a="close" title="${L("Cerrar", "Close")}">${icon("close", 16)}</button></div>
    <input class="rp-q" type="search" placeholder="${L("¿Otro? Busca: piano, bombo, pad…", "Something else? Search: piano, kick, pad…")}" value="${esc(S.q)}">
    <div class="rp-list">${listHTML()}</div>
    <div class="rp-scope">
      <label><input type="radio" name="rp-scope" value="here" ${S.scope === "here" ? "checked" : ""}> ${L("Solo aquí", "Just here")}</label>
      ${inTrack ? `<label><input type="radio" name="rp-scope" value="track" ${S.scope === "track" ? "checked" : ""}> ${L("En esta pista", "In this track")}</label>` : ""}
      <label><input type="radio" name="rp-scope" value="song" ${S.scope === "song" ? "checked" : ""}> ${L("En toda la canción", "In the whole song")}</label>
    </div>
    ${inTrack && ctx.compare ? `<button class="rp-compare" data-a="compare" title="${esc(L("Los 3 que mejor encajan y ya suenan, sobre la misma frase de tu pista: eliges de oído y el estudio aprende de tu elección", "The 3 best matches that already play, on the same phrase of your track: you pick by ear and the studio learns from your choice"))}">${icon("ear", 14)} ${L("Comparar los 3 mejores de oído", "Compare the best 3 by ear")}</button>` : ""}
    <div class="rp-foot"><span class="hint rp-msg">${esc(S.busy)}</span>${ctx.canAsk() ? `<button class="link" data-a="ask">${icon("brain", 13)} ${L("Más ideas de Maestro", "More ideas from Maestro")}</button>` : ""}</div>`;
  const q = card.querySelector(".rp-q");
  q.oninput = () => search(q.value);
  card.querySelectorAll("[name=rp-scope]").forEach((r) => r.onchange = () => { S.scope = r.value; });
  card.onclick = onClick;
}
function renderList() { const el = card.querySelector(".rp-list"); if (el) el.innerHTML = listHTML(); }
const all = () => [...(S.found || []), ...((S.res && S.res.have) || []), ...((S.res && S.res.download) || [])];

async function onClick(ev) {
  const b = ev.target.closest("button[data-a]"); if (!b) return;
  const a = b.dataset.a;
  if (a === "close") return close();
  if (a === "compare") { close(); return ctx.compare(S.base, S.ta); }
  if (a === "ask") {
    close();
    return ctx.ask(L(`Quiero cambiar el sonido «${S.base}» de mi canción por otro. Propón 3 alternativas que existan en mi librería y di en una frase qué aporta cada una.`,
      `I want to replace the sound «${S.base}» in my song. Suggest 3 alternatives that exist in my library and say in one sentence what each one brings.`));
  }
  const k = b.closest(".rp-opt")?.dataset.k; const e = all().find((x) => x.key === k); if (!e) return;
  if (a === "hear") return ctx.hear(e);
  if (a === "pick") return apply(e);
}

async function apply(e) {
  if (!e.installed) {
    S.busy = L(`Descargando «${entryName(e)}»…`, `Downloading «${entryName(e)}»…`); render();
    try { await ctx.install(e); e.installed = true; } catch (err) { S.busy = err.message || String(err); return render(); }
  }
  const base = S.res && S.res.base;
  // un golpe tiene muchas variantes (bd:3); un instrumento afinado no: el número solo se queda entre golpes
  const keepIdx = !!S.idx && e.kind === "hit" && (!base || base.kind === "hit");
  const to = e.sound;
  const ta = S.ta;
  if (S.scope === "here") {
    ta.value = ta.value.slice(0, S.start) + to + (keepIdx ? ":" + S.idx : "") + ta.value.slice(S.end);
    ctx.commit(ta);
  } else if (S.scope === "track") {
    ta.value = replaceSound(ta.value, S.base, to, keepIdx);
    ctx.commit(ta);
  } else {
    ctx.replaceEverywhere(S.base, to, keepIdx);
  }
  close();
  const warn = base && base.kind === "hit" && ["pitched", "synth", "engine"].includes(e.kind)
    ? L(" Era un golpe y ahora es un instrumento afinado: si solo oyes una nota, ponle notas con n \"c e g\".", " It was a hit and now it's a tuned instrument: if you only hear one note, give it notes with n \"c e g\".")
    : base && ["pitched", "synth"].includes(base.kind) && e.kind === "hit"
      ? L(" Era un instrumento afinado y ahora es un golpe: las notas (n) pasan a elegir variantes del golpe.", " It was a tuned instrument and now it's a hit: the notes (n) now pick variants of the hit.") : "";
  ctx.toast(L(`«${S.base}» → «${to}». Si no te gusta, pulsa Deshacer.`, `«${S.base}» → «${to}». Don't like it? Press Undo.`) + warn);
}
