// Escucha (Maestro v2, release 0.14): tu oído es el juez.
// - Cada vez que eliges una opción de Maestro, la deshaces o votas a ciegas, se guarda en tu dataset (SQLite local).
// - «Línea base»: pon nota del 1 al 5 a cómo suena cada género y di qué le falta. Así se mide si una release mejora.
// - El dataset se exporta en JSONL (una línea por voto) para poder entrenar algún día un modelo propio.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let ctx = { api: null, getState: null, genres: [] };

export function initListen(opts) {
  ctx = { ...ctx, ...opts };
  const b = $("#btn-listen");
  if (b) b.onclick = openListen;
}

/** Resumen de la canción que acompaña a cada voto (código, no audio). */
export function songContext(state) {
  return {
    song_id: state.projectId || "", name: state.name || "", bpm: state.bpm, style: state.style || "",
    course: state.course ? { id: state.course.id, step: state.course.i + 1 } : null,
    tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: String(t.code).slice(0, 2000), ...(t.lock ? { lock: t.lock } : {}) })),
  };
}

/** Guarda un voto o elección. No bloquea la interfaz si el servidor no responde. */
export async function recordVote(rec) {
  try { await ctx.api("/api/ab/vote", rec); } catch { /* sin servidor: no pasa nada */ }
}

export async function openListen() {
  const d = $("#listen");
  d.showModal();
  await renderListen();
}

async function renderListen(msg = "") {
  const body = $("#listen-body");
  let st = { counts: {}, total: 0, baseline: {}, index: null };
  try { st = await ctx.api("/api/ab/stats"); } catch { /* sin servidor */ }
  const s = ctx.getState();
  const c = st.counts || {};
  const guess = (s.course && s.course.id) || s.style || "";
  const opts = ctx.genres.map((g) => `<option value="${esc(g.id)}" ${g.id === guess ? "selected" : ""}>${esc(g.name)}</option>`).join("");
  const base = Object.entries(st.baseline || {});
  const kb = st.index ? Math.round((st.index.bytes || 0) / 1024) : 0;
  body.innerHTML = `
    <p class="hint">${L("El análisis automático propone; tu oído decide. Todo lo que eliges se guarda en tu ordenador (nunca audio, solo código y contexto) para medir si Maestro mejora y, algún día, entrenar un modelo propio.",
      "Automatic analysis proposes; your ear decides. Everything you pick is stored on your computer (never audio, only code and context) to measure whether Maestro improves and, one day, train a model of your own.")}</p>
    <section class="ls-sec">
      <h3>${icon("ear", 16)} ${L("A/B a ciegas", "Blind A/B")}</h3>
      <p>${L("Cuando Maestro te dé opciones, pulsa <b>A ciegas</b> en la tarjeta: se esconden los nombres y el código, se barajan como X, Y, Z y votas solo con el oído. Luego te digo cuál era.",
        "When Maestro gives you options, press <b>Blind</b> on the card: names and code are hidden, they're shuffled as X, Y, Z and you vote by ear only. Then I tell you which one it was.")}</p>
      <div class="ls-counts">
        <span><b>${c.ab || 0}</b> ${L("votos a ciegas", "blind votes")}</span>
        <span><b>${c.pick || 0}</b> ${L("opciones elegidas", "options picked")}</span>
        <span><b>${c.undo || 0}</b> ${L("elecciones deshechas", "picks undone")}</span>
        <span><b>${c.rating || 0}</b> ${L("notas de línea base", "baseline ratings")}</span>
      </div>
    </section>
    <section class="ls-sec">
      <h3>${icon("course", 16)} ${L("Línea base: ¿cómo suena cada género?", "Baseline: how does each genre sound?")}</h3>
      <p class="hint">${L("Escucha la canción que tienes abierta (o el curso del género) y ponle nota. Repite tras cada release para ver si mejora.",
        "Listen to the song you have open (or the genre's course) and rate it. Repeat after each release to see if it improves.")}</p>
      <form id="ls-rate" class="ls-rate">
        <label>${L("Género", "Genre")} <select name="genre">${opts}</select></label>
        <span class="ls-stars" role="radiogroup" aria-label="${esc(L("Nota", "Rating"))}">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="score" value="${n}" ${n === 3 ? "checked" : ""}><span>${n}</span></label>`).join("")}</span>
        <input name="missing" placeholder="${esc(L("¿Qué le falta? (p. ej. la tambora suena plana)", "What's missing? (e.g. the tambora sounds flat)"))}">
        <button class="primary" type="submit">${L("Guardar nota", "Save rating")}</button>
      </form>
      ${base.length ? `<table class="ls-base"><thead><tr><th>${L("Género", "Genre")}</th><th>${L("Nota", "Rating")}</th><th>${L("Qué le falta", "What's missing")}</th></tr></thead><tbody>
        ${base.map(([g, v]) => `<tr><td>${esc((ctx.genres.find((x) => x.id === g) || {}).name || g)}</td><td>${esc(v.score)}/5</td><td>${esc(v.missing || "")}</td></tr>`).join("")}</tbody></table>` : ""}
      ${msg ? `<p class="ok-msg">${esc(msg)}</p>` : ""}
    </section>
    <section class="ls-sec">
      <h3>${icon("download", 16)} ${L("Tu dataset", "Your dataset")}</h3>
      <p>${L(`${st.total || 0} registros. Índice de canciones: ${st.index ? st.index.songs : 0} canciones, ${st.index ? st.index.tracks : 0} pistas (${kb} KB).`,
        `${st.total || 0} records. Song index: ${st.index ? st.index.songs : 0} songs, ${st.index ? st.index.tracks : 0} tracks (${kb} KB).`)}</p>
      <a class="btn" href="/api/ab/export" download="tidal-studio-dataset.jsonl">${icon("download", 14)} ${L("Exportar JSONL", "Export JSONL")}</a>
    </section>`;
  $("#ls-rate").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await recordVote({ kind: "rating", genre: f.get("genre"), score: +f.get("score"), missing: String(f.get("missing") || "").slice(0, 500), song: songContext(ctx.getState()) });
    renderListen(L("Nota guardada.", "Rating saved."));
  };
}
