import { L } from "./i18n.js";
import { evalTrack, stringLiterals, noteNum } from "./tpat.js";
import { SOUNDS } from "./explain.js";
// Línea de tiempo: DÓNDE suena cada sonido, en vez de «cada cuánto».
// Una fila por sonido (o por nota, en las pistas melódicas), el tiempo de izquierda a derecha:
// cada columna grande es un ciclo (un compás de 4 tiempos). Cada bloque es una nota.
// Las notas las calcula Tidal de verdad (queryArc en el servidor); sin motor, una aproximación en el navegador.
// Cada nota sabe qué trozo del código la produce: al pasar el ratón se ilumina ese trozo, y al revés.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (x) => { const r = Math.round(x); return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) + 5) + (Math.abs(x - r) > 0.01 ? "~" : ""); };
// Sintes de SuperDirt: con ellos «n» es una nota (en los samples, «n» elige el archivo)
const SYNTH = /^(super|soskick|sostoms|sossnare|soshats|sos|in$|inr$|pmsin|cs80|tutorial|stu|imp$|psin|gabor|cyclo|bass[1-3]$|bassy|ping$|harpsi|sax$)/;

const view = { n: 4, from: 0, zoom: 1, ppc: 220, follow: true, pinned: null };
const LAB = 168;
let deps = null;
let data = { key: "", tracks: {} };   // id → { events, rows, source, error, info }
let reqKey = "", reqTimer = null, evList = [];

export function initTimeline(d) {
  deps = d;
  try { const s = JSON.parse(localStorage.getItem("tidal-studio-timeline") || "null"); if (s) Object.assign(view, { n: s.n || 4, zoom: s.zoom || 1, follow: s.follow !== false }); } catch { /* sin almacenamiento */ }
  const box = document.querySelector("#timeline");
  let rz = null;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (active()) draw(); }, 150); });
  box.addEventListener("change", (e) => {
    if (e.target.id === "tl-n") { view.n = +e.target.value; view.from = Math.floor(view.from / view.n) * view.n; }
    if (e.target.id === "tl-follow") view.follow = e.target.checked;
    keep(); renderTimeline();
  });
  box.addEventListener("input", (e) => {
    if (e.target.id !== "tl-zoom") return;
    view.zoom = +e.target.value; keep(); fit();
    const g = box.querySelector(".tl-scroll"); if (g) g.style.setProperty("--ppc", view.ppc + "px");
  });
  box.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) { view.from = Math.max(0, view.from + (+nav.dataset.nav) * view.n); view.follow = false; keep(); return renderTimeline(); }
    const go = e.target.closest("[data-go]");
    if (go) { const [id, a, b] = go.dataset.go.split(":"); return deps.goToCode(id, +a, +b); }
    const ev = e.target.closest(".tl-ev");
    if (ev) { view.pinned = view.pinned === ev.dataset.i ? null : ev.dataset.i; return focusEv(view.pinned !== null ? ev : null, true); }
    const ref = e.target.closest(".tl-ref");
    if (ref) { view.pinned = null; return focusRef(ref, true); }
    if (!e.target.closest(".tl-tip")) { view.pinned = null; focusEv(null, true); }
  });
  box.addEventListener("mouseover", (e) => {
    if (view.pinned !== null) return;
    const ev = e.target.closest(".tl-ev");
    if (ev) return focusEv(ev);
    const ref = e.target.closest(".tl-ref");
    if (ref) return focusRef(ref);
  });
  box.addEventListener("mouseout", (e) => {
    if (view.pinned !== null) return;
    if (e.target.closest(".tl-ev, .tl-ref") && !e.relatedTarget?.closest?.(".tl-tip")) focusEv(null);
  });
}
function keep() { try { localStorage.setItem("tidal-studio-timeline", JSON.stringify({ n: view.n, zoom: view.zoom, follow: view.follow })); } catch { /* nada */ } }
const active = () => document.querySelector("#tab-timeline")?.classList.contains("active");

// ---------------------------------------------------------------- calcular las notas
// Cada cadena "…" se manda a Tidal con k saltos de línea delante: así la posición que devuelve Tidal
// (columna, línea) dice de qué cadena viene (línea k+1) y en qué columna, sin ambigüedad.
const NOT_PATTERN = /\b(p[FISNBR]|pF|pS|pI)\s*$/;
function tagged(code) {
  const lits = stringLiterals(code).filter((l) => !NOT_PATTERN.test(l.before) && !l.text.includes("\\"));
  let out = "", last = 0;
  lits.forEach((l, k) => { out += code.slice(last, l.start) + "\\n".repeat(k + 1) + l.text; last = l.end; });
  return { code: out + code.slice(last), lits };
}
function fromTidal(t, res, lits) {
  return res.events.map((e) => ({
    t0: e.t0, t1: e.t1, v: e.v,
    pos: (e.pos || []).map(([c1, l1, c2, l2]) => {
      const lit = lits[l1 - 2];
      if (!lit || l1 !== l2) return null;
      const a = lit.start + c1 - 1, b = lit.start + c2 - 1;
      return a >= lit.start && b <= lit.end && b > a ? [a, b] : null;
    }).filter(Boolean),
  }));
}
const CHANCE_RE = /\b(sometimes\w*|often|rarely|almost\w+|someCycles\w*|degrade\w*|unDegradeBy|rand|irand|perlin|choose\w*|wchoose|shuffle|scramble|randcat|wrandcat|randslice)\b|"[^"]*[?|][^"]*"/;

function compute(tracks) {
  const out = {};
  for (const t of tracks) {
    const r = evalTrack(t.code);
    out[t.id] = { events: r.query(view.from, view.from + view.n), source: "approx", info: r.info, chance: r.info.chance || CHANCE_RE.test(t.code) };
  }
  return out;
}
function request(tracks, key) {
  clearTimeout(reqTimer);
  if (!deps.canQuery()) return;
  reqTimer = setTimeout(async () => {
    reqKey = key;
    const tg = tracks.map((t) => ({ id: t.id, ...tagged(t.code) }));
    let r;
    try { r = await deps.api("/api/timeline", { tracks: tg.map((t) => ({ id: t.id, code: t.code })), from: view.from, to: view.from + view.n }); } catch { return; }
    if (reqKey !== key || !r || !r.available) { if (r && !r.available) deps.noTidal(r.reason || ""); return; }
    for (const t of tg) {
      const res = r.tracks && r.tracks[t.id];
      if (!res) continue;
      const cur = data.tracks[t.id];
      if (res.ok) data.tracks[t.id] = { events: fromTidal(t, res, t.lits), source: "tidal", chance: CHANCE_RE.test(t.code), info: { unknown: new Set() } };
      else if (cur) cur.error = res.error;
    }
    if (active()) draw();
  }, 220);
}

// ---------------------------------------------------------------- filas
function pitchOf(v) {
  const s = String(v.s || "");
  if (v.note !== undefined && typeof v.note === "number") return v.note + (SYNTH.test(s) && typeof v.n === "number" ? v.n : 0);
  if (SYNTH.test(s) && typeof v.n === "number") return v.n;
  return null;
}
function rowsOf(events) {
  const rows = new Map();
  for (const e of events) {
    const p = pitchOf(e.v), s = String(e.v.s ?? "?");
    const key = p !== null ? `p:${p}` : `s:${s}:${e.v.n ?? ""}`;
    if (!rows.has(key)) {
      rows.set(key, { key, pitch: p, s, n: e.v.n, synths: new Set(), first: Math.min(...e.pos.map((x) => x[0]), 1e9), events: [] });
    }
    const row = rows.get(key);
    row.events.push(e); row.synths.add(s);
    row.first = Math.min(row.first, ...e.pos.map((x) => x[0]));
  }
  // Melodía: la nota más aguda arriba (como un piano roll). Percusión: en el orden en que aparecen en el código.
  return [...rows.values()].sort((a, b) => (a.pitch !== null && b.pitch !== null ? b.pitch - a.pitch : a.pitch !== null ? 1 : b.pitch !== null ? -1 : a.first - b.first));
}
function rowLabel(r) {
  if (r.pitch !== null) return `<b>${esc(noteName(r.pitch))}</b><small>${esc([...r.synths].join(", "))}</small>`;
  const what = SOUNDS[r.s] || "";
  return `<b>${esc(r.s)}${r.n !== undefined && r.n !== null && r.n !== 0 ? `<i>:${esc(r.n)}</i>` : ""}</b>${what ? `<small>${esc(what.replace(/\s*\(.*\)$/, ""))}</small>` : ""}`;
}

// ---------------------------------------------------------------- dibujar
export function renderTimeline() {
  if (!active() || !deps) return;
  const st = deps.state();
  const tracks = st.tracks.filter((t) => t.code && t.code.trim());
  const key = JSON.stringify([view.from, view.n, tracks.map((t) => [t.id, t.code])]);
  if (key !== data.key) {
    // primero al momento (aproximado) y luego lo que diga Tidal
    data = { key, tracks: compute(tracks) };
    request(tracks, key);
  }
  draw();
}

function codeHTML(code, refs) {
  // trozos del código que producen notas → <span class="tl-ref">
  const rs = [...refs.values()].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let html = "", last = 0;
  for (const [a, b] of rs) {
    if (a < last) continue;
    html += esc(code.slice(last, a)) + `<span class="tl-ref" data-r="${a}-${b}">${esc(code.slice(a, b))}</span>`;
    last = b;
  }
  return html + esc(code.slice(last));
}

function timeText(t) {
  const bar = Math.floor(t + 1e-9), f = t - bar, beat = f * 4, bi = Math.floor(beat + 1e-9), rest = beat - bi;
  const fr = { 0: "", 0.25: " + ¼", 0.5: " + ½", 0.75: " + ¾" };
  const k = Object.keys(fr).find((x) => Math.abs(rest - x) < 0.01);
  return L(`compás ${bar + 1} · tiempo ${bi + 1}`, `bar ${bar + 1} · beat ${bi + 1}`) + (k !== undefined ? fr[k] : ` + ${rest.toFixed(2)}`);
}
function lenText(d) {
  const fr = [[1, L("un compás entero", "a whole bar")], [0.5, L("medio compás", "half a bar")], [0.25, L("un tiempo (1/4)", "one beat (1/4)")],
    [0.125, L("medio tiempo (1/8)", "half a beat (1/8)")], [1 / 16, L("un cuarto de tiempo (1/16)", "a quarter beat (1/16)")],
    [1 / 3, L("un tercio de compás", "a third of a bar")], [1 / 6, L("1/6 de compás", "1/6 of a bar")], [1 / 12, L("1/12 de compás", "1/12 of a bar")], [2, L("dos compases", "two bars")], [4, L("cuatro compases", "four bars")]];
  const m = fr.find(([x]) => Math.abs(x - d) < 0.002);
  return m ? m[1] : L(`${d.toFixed(3)} compases`, `${d.toFixed(3)} bars`);
}

function draw() {
  const box = document.querySelector("#timeline");
  const st = deps.state();
  const tracks = st.tracks.filter((t) => t.code && t.code.trim());
  const secs = (60 / st.bpm) * 4;
  const N = view.n, A = view.from;
  evList = [];
  let html = `<div class="tl-tools">
    <div class="tl-nav"><button class="icon-btn" data-nav="-1" title="${L("Ciclos anteriores", "Previous cycles")}" ${A <= 0 ? "disabled" : ""}>‹</button>
      <span>${L("Compases", "Bars")} <b>${A + 1}–${A + N}</b></span>
      <button class="icon-btn" data-nav="1" title="${L("Ciclos siguientes", "Next cycles")}">›</button></div>
    <label>${L("Ver", "Show")} <select id="tl-n">${[1, 2, 4, 8, 16].map((x) => `<option value="${x}" ${x === N ? "selected" : ""}>${x} ${x === 1 ? L("ciclo", "cycle") : L("ciclos", "cycles")}</option>`).join("")}</select></label>
    <label>${L("Zoom", "Zoom")} <input id="tl-zoom" type="range" min="1" max="8" step="0.25" value="${view.zoom}"></label>
    <label class="toggle"><input id="tl-follow" type="checkbox" ${view.follow ? "checked" : ""}> ${L("Seguir lo que suena", "Follow the playhead")}</label>
    <span class="tl-legend"><b class="tl-ev demo"></b> ${L("nota", "hit")} <b class="tl-ev demo maybe"></b> ${L("al azar (puede sonar o no)", "chance (may or may not play)")}</span>
  </div>
  <p class="hint tl-scale">${L(`1 ciclo = 1 compás = 4 tiempos = ${secs.toFixed(2)} s a ${st.bpm} BPM. Líneas finas: semicorcheas (1/16).`, `1 cycle = 1 bar = 4 beats = ${secs.toFixed(2)} s at ${st.bpm} BPM. Thin lines: sixteenth notes (1/16).`)}</p>`;
  if (!tracks.length) {
    box.innerHTML = html + `<div class="empty"><p>${L("Añade una pista y aquí verás cuándo suena cada sonido.", "Add a track and you'll see here when each sound plays.")}</p></div>`;
    return;
  }
  fit();
  html += `<div class="tl-scroll" style="--ppc:${view.ppc}px; --n:${N}; --lab:${LAB}px; --vis:${view.vis}px"><div class="tl-grid">`;
  // regla: números de compás y de tiempo
  let ruler = "";
  for (let c = 0; c < N; c++) {
    ruler += `<span class="tl-bar" style="left:calc(var(--ppc) * ${c})">${A + c + 1}</span>`;
    for (let b = 1; b < 4; b++) ruler += `<span class="tl-beat" style="left:calc(var(--ppc) * ${c + b / 4})">${b + 1}</span>`;
  }
  html += `<div class="tl-row tl-ruler"><div class="tl-lab"><small>${L("compás · tiempo", "bar · beat")}</small></div><div class="tl-lane">${ruler}</div></div>`;
  for (const t of tracks) {
    const d = data.tracks[t.id] || { events: [] };
    const rows = rowsOf(d.events);
    const refs = new Map();
    d.events.forEach((e) => e.pos.forEach((p) => refs.set(p.join("-"), p)));
    const color = deps.kindColor(t.kind);
    const muted = !deps.audible(t);
    const badge = d.source === "tidal"
      ? `<span class="tl-src ok" title="${L("Calculado por TidalCycles (queryArc): exacto", "Calculated by TidalCycles (queryArc): exact")}">Tidal</span>`
      : `<span class="tl-src" title="${L("Calculado en el navegador: aproximado. Arranca el motor para que lo calcule Tidal.", "Calculated in the browser: approximate. Start the engine so Tidal calculates it.")}">≈ ${L("aprox.", "approx.")}</span>`;
    const notes = [];
    if (d.chance) notes.push(`<span class="tl-note">${deps.icon("dice", 13)} ${L("Tiene azar: lo que ves es lo que Tidal tocará en estos compases; en otros puede cambiar.", "Has chance: what you see is what Tidal will play in these bars; other bars may differ.")}</span>`);
    if (d.source !== "tidal" && d.info && d.info.unknown && d.info.unknown.size) notes.push(`<span class="tl-note">${L("No sé dibujar", "Can't draw")} <code>${esc([...d.info.unknown].join(", "))}</code>${L(": lo dejo como si no estuviera.", ": shown as if it weren't there.")}</span>`);
    if (d.error) notes.push(`<span class="tl-note err" title="${esc(d.error)}">${L("Tidal no ha podido leer esta pista; te enseño la aproximación.", "Tidal couldn't read this track; showing the approximation.")}</span>`);
    html += `<section class="tl-track${muted ? " muted" : ""}" data-id="${t.id}" style="--k:${color}">
      <div class="tl-thead"><div class="tl-lab"><span class="tl-name">${deps.icon(t.kind, 15)} ${esc(t.name)}</span> <code>${t.id}</code> ${badge}</div>
        <div class="tl-code"><pre>${codeHTML(t.code, refs)}</pre><div class="tl-refinfo"></div>${notes.join("")}</div></div>`;
    if (!rows.length) html += `<div class="tl-row"><div class="tl-lab"><small>${L("(silencio en estos compases)", "(silent in these bars)")}</small></div><div class="tl-lane"></div></div>`;
    for (const r of rows) {
      let evs = "";
      for (const e of r.events) {
        const i = evList.length;
        evList.push({ e, t, row: r });
        const lbl = r.pitch !== null ? "" : "";
        evs += `<b class="tl-ev${e.maybe ? " maybe" : ""}" data-i="${i}" data-refs="${e.pos.map((p) => p.join("-")).join(" ")}" style="left:calc(var(--ppc) * ${(e.t0 - A).toFixed(5)});width:max(4px, calc(var(--ppc) * ${(e.t1 - e.t0).toFixed(5)} - 2px))">${lbl}</b>`;
      }
      html += `<div class="tl-row"><div class="tl-lab" title="${esc(r.s)}">${rowLabel(r)}</div><div class="tl-lane">${evs}</div></div>`;
    }
    html += `</section>`;
  }
  html += `<div class="tl-playhead" hidden></div></div></div><div class="tl-tip" hidden></div>`;
  box.innerHTML = html;
  if (view.pinned !== null) { const el = box.querySelector(`.tl-ev[data-i="${view.pinned}"]`); if (el) focusEv(el, true); else view.pinned = null; }
}
// Zoom 1 = los ciclos elegidos caben justo en el ancho visible
function fit() {
  const w = document.querySelector("#timeline").clientWidth;
  const vis = w > 300 ? w - LAB - 4 : 880;
  view.vis = vis;
  view.ppc = Math.max(30, (vis / view.n) * view.zoom);
}

// ---------------------------------------------------------------- enlazar notas ↔ código
function clearFocus(box) {
  box.querySelectorAll(".tl-ev.hot, .tl-ev.rel, .tl-ref.hot").forEach((x) => x.classList.remove("hot", "rel"));
  box.querySelectorAll(".tl-refinfo").forEach((x) => { x.innerHTML = ""; });
  box.classList.remove("focusing");
}
function focusEv(el, pin = false) {
  const box = document.querySelector("#timeline"), tip = box.querySelector(".tl-tip");
  clearFocus(box);
  if (!el) { if (tip) tip.hidden = true; return; }
  const item = evList[+el.dataset.i]; if (!item) return;
  const { e, t, row } = item;
  const sec = el.closest(".tl-track");
  const refs = (el.dataset.refs || "").split(" ").filter(Boolean);
  box.classList.add("focusing");
  el.classList.add("hot");
  for (const r of refs) sec.querySelector(`.tl-ref[data-r="${r}"]`)?.classList.add("hot");
  // las demás notas que salen del mismo trozo de código
  if (refs[0]) sec.querySelectorAll(".tl-ev").forEach((x) => { if (x !== el && (x.dataset.refs || "").split(" ")[0] === refs[0]) x.classList.add("rel"); });
  const what = row.pitch !== null ? `${noteName(row.pitch)} · ${e.v.s ?? ""}` : `${e.v.s ?? "?"}${e.v.n ? ":" + e.v.n : ""}`;
  const snippet = refs.length ? snippetHTML(t.code, refs.map((r) => r.split("-").map(Number))) : `<i>${L("(no sé qué trozo exacto la produce)", "(can't tell which exact piece makes it)")}</i>`;
  const [a, b] = refs.length ? refs[0].split("-") : [0, 0];
  const others = sec.querySelectorAll(".tl-ev.rel").length;
  tip.innerHTML = `<b>${esc(what)}</b> <span class="hint">${esc(t.name)}</span>
    <div>${timeText(e.t0)} · ${L("dura", "lasts")} ${lenText(e.t1 - e.t0)}</div>
    <div class="tl-snip">${snippet}</div>
    ${others ? `<div class="hint">${L(`Este trozo del código suena ${others + 1} veces en lo que ves (en otro tono).`, `This piece of code plays ${others + 1} times in view (shown lighter).`)}</div>` : ""}
    ${e.maybe ? `<div class="hint">${L("Depende del azar: puede que no suene o que suene cambiada.", "Depends on chance: it may not play, or play changed.")}</div>` : ""}
    ${refs.length ? `<button class="link" data-go="${t.id}:${a}:${b}">${L("Ir a este trozo en Pistas", "Go to this piece in Tracks")} →</button>` : ""}`;
  tip.hidden = false;
  const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
  tip.style.left = Math.max(0, Math.min(br.width - 300, r.left - br.left)) + "px";
  // debajo de la nota; si no cabe en la pantalla, encima
  const below = r.bottom + tip.offsetHeight + 12 < window.innerHeight;
  tip.style.top = (below ? r.bottom - br.top + 6 : r.top - br.top - tip.offsetHeight - 6) + "px";
  tip.classList.toggle("pinned", pin);
}
function focusRef(ref, pin = false) {
  const box = document.querySelector("#timeline");
  clearFocus(box);
  const tip = box.querySelector(".tl-tip"); if (tip) tip.hidden = true;
  const sec = ref.closest(".tl-track"), r = ref.dataset.r;
  box.classList.add("focusing");
  ref.classList.add("hot");
  let n = 0;
  sec.querySelectorAll(".tl-ev").forEach((x) => { if ((x.dataset.refs || "").split(" ").includes(r)) { x.classList.add("hot"); n++; } });
  // cuántas notas salen de este trozo: lo dice debajo del código (sin tapar la rejilla)
  const note = sec.querySelector(".tl-refinfo");
  if (note) note.innerHTML = L(`<code>${esc(ref.textContent)}</code> produce <b>${n}</b> nota${n === 1 ? "" : "s"} en estos compases (iluminadas).`, `<code>${esc(ref.textContent)}</code> makes <b>${n}</b> hit${n === 1 ? "" : "s"} in these bars (highlighted).`);
}
function snippetHTML(code, ranges) {
  const lo = Math.max(0, Math.min(...ranges.map((r) => r[0])) - 28), hi = Math.min(code.length, Math.max(...ranges.map((r) => r[1])) + 28);
  let html = lo > 0 ? "…" : "", last = lo;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    if (a < last) continue;
    html += esc(code.slice(last, a)) + `<mark>${esc(code.slice(a, b))}</mark>`;
    last = b;
  }
  return `<code>${html + esc(code.slice(last, hi)) + (hi < code.length ? "…" : "")}</code>`;
}

// ---------------------------------------------------------------- cursor de reproducción
let lastNow = "";
export function paintTimeline(cycle) {
  if (!active()) return;
  const box = document.querySelector("#timeline");
  const ph = box.querySelector(".tl-playhead");
  if (cycle === null || cycle === undefined) {
    if (ph && !ph.hidden) { ph.hidden = true; box.querySelectorAll(".tl-ev.now").forEach((x) => x.classList.remove("now")); lastNow = ""; }
    return;
  }
  if (view.follow && (cycle < view.from || cycle >= view.from + view.n)) {
    view.from = Math.max(0, Math.floor(cycle / view.n) * view.n);
    renderTimeline();
    return;
  }
  if (!ph) return;
  const x = cycle - view.from;
  if (x < 0 || x >= view.n) { ph.hidden = true; return; }
  ph.hidden = false;
  ph.style.left = `calc(var(--lab) + var(--ppc) * ${x.toFixed(4)})`;
  // las notas que suenan ahora mismo
  const now = [];
  evList.forEach((it, i) => { if (it.e.t0 <= cycle && cycle < Math.min(it.e.t1, it.e.t0 + 0.12)) now.push(i); });
  const sig = now.join(",");
  if (sig === lastNow) return;
  lastNow = sig;
  box.querySelectorAll(".tl-ev.now").forEach((x) => x.classList.remove("now"));
  for (const i of now) box.querySelector(`.tl-ev[data-i="${i}"]`)?.classList.add("now");
}
export { noteNum };
