// Partitura (Maestro v2, release 0.15): el cuaderno de composición de la canción.
// Cada canción es un bloque .tidal + .musicxml: la melodía, los acordes y el bajo viven en la partitura y la app los
// traduce a Tidal (un compás por ciclo). El ritmo, el groove y los efectos siguen en Tidal puro.
// - Las pistas que salen de la partitura llevan t.fromScore (id de la parte) y t.scoreCode (el código que generó).
// - Si editas a mano una de esas pistas, la app pregunta: llevar el cambio a la partitura o dejarla como «código libre».
// - El diálogo «Partitura» enseña cada parte como un piano roll, y exporta/importa el .musicxml (MuseScore).
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let ctx = { api: null, getState: null, changed: null, sysMsg: null, toast: null, playTrack: null };

export const ROLE_NAME = { melodia: () => L("Melodía", "Melody"), armonia: () => L("Acordes", "Chords"), bajo: () => L("Bajo", "Bass") };
const ROLE_COLOR = { melodia: "var(--accent)", armonia: "#7c5cbf", bajo: "#0f766e" };
const NAMES = ["c", "cs", "d", "ef", "e", "f", "fs", "g", "af", "a", "bf", "b"];
const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12)}`;

export function initScore(opts) {
  ctx = { ...ctx, ...opts };
  const b = $("#btn-score");
  if (b) b.onclick = openScore;
  $("#score")?.addEventListener("click", onDialogClick);
  $("#score-file")?.addEventListener("change", onImportFile);
}

const frac = (d) => {
  if (typeof d === "number") return d;
  const [a, b] = String(d).split("/").map(Number);
  return b ? a / b : a;
};
export const barsLen = (part) => (part && part.bars ? part.bars.length : 0);

/** Une una pista con su parte de la partitura (la crea o la sustituye). */
export function linkPart(state, track, parte) {
  if (!parte) return;
  state.score = state.score && Array.isArray(state.score.parts) ? state.score : { version: 1, key: "C", meter: "4/4", parts: [] };
  const part = { ...parte, track: track.id, name: parte.name || track.name };
  const i = state.score.parts.findIndex((p) => p.id === part.id || p.track === track.id);
  if (i >= 0) state.score.parts[i] = part; else state.score.parts.push(part);
  // dos partes no pueden apuntar a la misma pista
  state.score.parts.forEach((p) => { if (p !== part && p.track === track.id) p.track = null; });
  track.fromScore = part.id;
  track.scoreCode = track.code;
}

/** La pista deja de salir de la partitura (código libre). La parte se queda en la partitura, sin pista. */
export function unlinkTrack(state, t) {
  const part = state.score && state.score.parts.find((p) => p.track === t.id);
  if (part) part.track = null;
  delete t.fromScore; delete t.scoreCode;
}

export const scoreEdited = (t) => !!(t && t.fromScore && t.scoreCode != null && t.code !== t.scoreCode);

export function scoreBadgeHTML(t) {
  if (!t.fromScore) return "";
  return `<span class="sc-badge" title="${esc(L("Esta pista sale de la partitura (melodía, acordes o bajo): ábrela con el botón Partitura", "This track comes from the score (melody, chords or bass): open it with the Score button"))}">${icon("score", 12)} ${L("partitura", "score")}</span>`;
}

/** Aviso debajo de una pista de la partitura editada a mano. */
export function scoreBarHTML(t) {
  if (!scoreEdited(t)) return "";
  return `<div class="sc-bar">${icon("score", 15)}<span>${L("Has cambiado a mano una pista que sale de la partitura.", "You changed by hand a track that comes from the score.")}</span>
    <button data-sc="push" class="primary">${L("Llevar a la partitura", "Send to the score")}</button>
    <button data-sc="free">${L("Dejarla como código libre", "Keep it as free code")}</button></div>`;
}

/** Botones del aviso: llevar el cambio a la partitura o soltar la pista. */
export async function scoreBarAction(state, t, action) {
  if (action === "free") {
    unlinkTrack(state, t);
    ctx.changed();
    ctx.sysMsg(L(`${t.id} es ahora código libre: la partitura ya no la cambia y Maestro la trata como Tidal puro.`,
      `${t.id} is now free code: the score no longer changes it and Maestro treats it as plain Tidal.`));
    return;
  }
  const meter = (state.score && state.score.meter) || "4/4";
  let r;
  try { r = await ctx.api("/api/score/from-tidal", { code: t.code, meter }); } catch (e) { return ctx.toast(e.message); }
  if (!r.bars) {
    return ctx.toast(L("Este código usa trucos de Tidal que no caben en una partitura (every, jux, |+…). Déjala como código libre o vuelve a una forma note \"…\".",
      "This code uses Tidal tricks that don't fit in a score (every, jux, |+…). Keep it as free code or go back to a note \"…\" form."));
  }
  const part = state.score.parts.find((p) => p.id === t.fromScore) || { id: t.fromScore, name: t.name, role: t.kind };
  linkPart(state, t, { ...part, bars: r.bars, sound: r.sound || part.sound, fx: r.fx != null ? r.fx : part.fx });
  ctx.changed();
  ctx.sysMsg(L(`Partitura actualizada con tu cambio en ${t.id} (${r.bars.length} compases).`, `Score updated with your change to ${t.id} (${r.bars.length} bars).`));
}

/**
 * Una partitura nueva (abierta de un .musicxml, de GitHub o editada en MuseScore) manda sobre la melodía, los acordes
 * y el bajo: cada pista que sale de ella se regenera. Devuelve los ids de las pistas que han cambiado.
 */
export async function adoptScore(state, score) {
  if (!score || !Array.isArray(score.parts)) return [];
  const prev = state.score;
  // MuseScore puede perder los datos de la app: se recuperan de la partitura anterior por id o por nombre
  score.parts.forEach((p, i) => {
    const old = prev && prev.parts && (prev.parts.find((x) => x.id === p.id) || prev.parts.find((x) => x.name === p.name) || prev.parts[i]);
    if (old) { p.track = p.track || old.track; p.sound = p.sound || old.sound; p.fx = p.fx || old.fx; p.role = p.role || old.role; }
    if (!p.track) {
      const t = state.tracks.find((x) => x.fromScore === p.id) || state.tracks.find((x) => x.name === p.name);
      if (t) p.track = t.id;
    }
  });
  state.score = score;
  let r;
  try { r = await ctx.api("/api/score/render", { score }); } catch { return []; }
  const changedIds = [];
  for (const x of r.tracks || []) {
    let t = state.tracks.find((y) => y.id === x.id);
    if (!t) {
      t = { id: x.id, name: x.name, kind: x.role, code: x.code, muted: false };
      state.tracks.push(t);
      state.tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
      changedIds.push(x.id);
    } else if (t.code !== x.code) {
      t.code = x.code; t.explain = null;
      changedIds.push(x.id);
    }
    t.fromScore = x.part; t.scoreCode = t.code;
  }
  return changedIds;
}

// ------------------------------------------------------------------ diálogo «Partitura»

function pianoRoll(part, meter) {
  const [a, b] = String(meter || "4/4").split("/").map(Number);
  const per = (a * 4) / (b || 4);
  const bars = part.bars || [];
  const notes = [];
  let t0 = 0;
  for (const bar of bars) {
    let t = t0;
    for (const e of bar) { const d = frac(e.d); for (const p of e.p || []) notes.push({ p, t, d }); t += d; }
    t0 += per;
  }
  const total = Math.max(per, t0);
  if (!notes.length) return `<p class="hint">${L("(solo silencios)", "(only rests)")}</p>`;
  const lo = Math.min(...notes.map((n) => n.p)) - 1, hi = Math.max(...notes.map((n) => n.p)) + 1;
  const W = 720, rowH = Math.max(4, Math.min(9, 150 / (hi - lo + 1))), H = (hi - lo + 1) * rowH + 18;
  const x = (t) => (t / total) * W;
  const y = (p) => (hi - p) * rowH;
  const grid = [];
  for (let k = 0; k <= bars.length; k++) grid.push(`<line x1="${x(k * per)}" x2="${x(k * per)}" y1="0" y2="${H - 18}" class="sc-barline"/>`);
  for (let k = 0; k < bars.length; k++) grid.push(`<text x="${x(k * per) + 3}" y="${H - 5}" class="sc-barnum">${k + 1}</text>`);
  for (let p = lo; p <= hi; p++) if (p % 12 === 0) grid.push(`<line x1="0" x2="${W}" y1="${y(p) + rowH}" y2="${y(p) + rowH}" class="sc-cline"/><text x="${W - 2}" y="${y(p) + rowH - 1}" text-anchor="end" class="sc-cname">${noteName(p)}</text>`);
  const rects = notes.map((n) => `<rect x="${x(n.t) + 0.5}" y="${y(n.p) + 0.5}" width="${Math.max(2, x(n.d) - 1)}" height="${rowH - 1}" rx="2" style="fill:${ROLE_COLOR[part.role] || "var(--accent)"}"><title>${noteName(n.p)} · ${n.d} ${L("tiempos", "beats")}</title></rect>`).join("");
  return `<svg class="sc-roll" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(part.name)}">${grid.join("")}${rects}</svg>`;
}

function compactText(part) {
  const fmt = (d) => { const v = frac(d); return Number.isInteger(v) ? String(v) : String(d); };
  return (part.bars || []).map((bar) => bar.map((e) => {
    const p = e.p || [];
    const n = !p.length ? "~" : p.length === 1 ? noteName(p[0]) : `[${p.map(noteName).join(",")}]`;
    return `${n}:${fmt(e.d)}`;
  }).join(" ")).join(" | ");
}

function renderScore(msg = "") {
  const s = ctx.getState();
  const sc = s.score;
  const body = $("#score-body");
  const parts = (sc && sc.parts) || [];
  body.innerHTML = `
    <p class="hint">${L("La melodía, los acordes y el bajo de tu canción, como partitura. La app la traduce a Tidal (un compás por ciclo); el ritmo y los efectos siguen en Tidal. Ábrela en MuseScore, cámbiala y vuelve a importarla: las pistas se regeneran.",
      "Your song's melody, chords and bass, as a score. The app translates it to Tidal (one bar per cycle); rhythm and effects stay in Tidal. Open it in MuseScore, change it and import it back: the tracks are regenerated.")}</p>
    ${parts.length ? `<div class="sc-meta"><span><b>${esc(sc.key)}</b> ${L("tonalidad", "key")}</span><span><b>${esc(sc.meter)}</b> ${L("compás", "time")}</span><span><b>${parts.length}</b> ${parts.length === 1 ? L("parte", "part") : L("partes", "parts")}</span></div>
      ${parts.map((p) => `<section class="sc-part" style="--k:${ROLE_COLOR[p.role] || "var(--accent)"}">
        <div class="sc-phead"><b>${esc(p.name)}</b><span class="sc-role">${esc((ROLE_NAME[p.role] || ROLE_NAME.melodia)())}</span>
          <span class="sc-trk">${p.track ? `→ <code>${esc(p.track)}</code>` : L("sin pista (código libre)", "no track (free code)")}</span>
          <span class="sc-n">${barsLen(p)} ${L("compases", "bars")} · <code>${esc(p.sound || "")}</code></span></div>
        ${pianoRoll(p, sc.meter)}
        <details><summary>${L("Notas en texto", "Notes as text")}</summary><pre class="sc-text">${esc(compactText(p))}</pre></details>
      </section>`).join("")}`
      : `<div class="sc-empty">${icon("score", 28)}<p>${L("Aún no hay partitura. Pide a Maestro una melodía, unos acordes o un bajo (o usa «Otra versión» en un curso) y aparecerá aquí. También puedes importar un .musicxml.",
        "No score yet. Ask Maestro for a melody, chords or a bass (or use «Another version» in a course) and it will appear here. You can also import a .musicxml.")}</p></div>`}
    <div class="row end sc-actions">
      ${msg ? `<span class="ok-msg">${esc(msg)}</span>` : ""}
      <button data-sca="import">${icon("upload", 14)} ${L("Importar .musicxml", "Import .musicxml")}</button>
      <button class="primary" data-sca="export" ${parts.length ? "" : "disabled"}>${icon("download", 14)} ${L("Descargar .musicxml", "Download .musicxml")}</button>
    </div>`;
}

export function openScore() {
  $("#score").showModal();
  renderScore();
}

async function onDialogClick(e) {
  const b = e.target.closest("[data-sca]");
  if (!b) return;
  if (b.dataset.sca === "import") return $("#score-file").click();
  if (b.dataset.sca === "export") {
    const s = ctx.getState();
    try {
      const r = await ctx.api("/api/score/xml", { score: s.score, title: s.name || "" });
      const blob = new Blob([r.xml], { type: "application/vnd.recordare.musicxml+xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.name || L("cancion", "song")).replace(/[\\/:*?"<>|]+/g, "-")}.musicxml`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { ctx.toast(err.message); }
  }
}

async function onImportFile(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const xml = await f.text();
    const r = await ctx.api("/api/score/parse", { xml });
    const s = ctx.getState();
    const ids = await adoptScore(s, r.score);
    ctx.changed();
    ids.forEach((id) => { const t = s.tracks.find((x) => x.id === id); if (t && ctx.playTrack) ctx.playTrack(t); });
    renderScore(ids.length ? L(`Partitura importada: he regenerado ${ids.join(", ")}.`, `Score imported: I regenerated ${ids.join(", ")}.`)
      : L("Partitura importada. Las partes sin pista se quedan en la partitura hasta que les asignes una.", "Score imported. Parts without a track stay in the score until you give them one."));
  } catch (err) { ctx.toast(L("No he podido leer la partitura: ", "Couldn't read the score: ") + err.message); }
}
