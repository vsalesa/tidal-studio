// Monitor RAG (Maestro v2, release 0.14): la arquitectura por capas dibujada como un diagrama en vivo.
// Cada petición al chat ilumina su recorrido: qué capa respondió, cuánto tardó cada una, aciertos, tokens y caché.
// Debajo, los límites del enrutador (tokens, tiempo, opciones, capas activas) para ajustarlos sin tocar config.json.
import { L, EN } from "./i18n.js";
import { icon } from "./icons.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let api = null, data = null, sel = null, selLayer = null, timer = null;

const STATUS = {
  hit: () => L("respondió", "answered"), pass: () => L("consultada", "checked"), skip: () => L("no hizo falta", "not needed"),
  off: () => L("desactivada", "off"), error: () => L("error", "error"), blocked: () => L("bloqueó algo", "blocked something"),
  running: () => L("trabajando…", "working…"), idle: () => "—",
};
const LAYER_TIP = {
  rules: () => L("Respuestas sin IA con tus datos: «¿qué canciones mías usan güira?», «mis canciones».", "Answers without AI from your data: «which of my songs use guira?», «my songs»."),
  index: () => L("Busca en tus canciones guardadas (copia de solo lectura en SQLite) pistas relacionadas para dar contexto.", "Searches your saved songs (read-only copy in SQLite) for related tracks as context."),
  library: () => L("Lo que hay de verdad en tu ordenador: samples, instrumentos y loops.", "What's really on your computer: samples, instruments and loops."),
  skills: () => L("Conocimiento experto (skills y plugins) que encaja con la petición.", "Expert knowledge (skills and plugins) that matches the request."),
  llm: () => L("El modelo de IA: solo para lo creativo o ambiguo.", "The AI model: only for creative or ambiguous work."),
  validate: () => L("Candados y límites: quita lo que toca algo bloqueado antes de que llegue a tu canción.", "Locks and limits: drops whatever touches something locked before it reaches your song."),
};

export function initMonitor(opts) {
  api = opts.api;
  const b = $("#btn-monitor");
  if (b) b.onclick = openMonitor;
  $("#monitor").addEventListener("close", () => { clearTimeout(timer); timer = null; });
  $("#monitor").addEventListener("click", onClick);
  $("#monitor").addEventListener("submit", onSave);
}

export async function openMonitor() {
  $("#monitor").showModal();
  sel = null; selLayer = null;
  await refresh(true);
}

async function refresh(first = false) {
  try { data = await api("/api/monitor"); } catch { data = data || { layers: [], requests: [], summary: {} }; }
  const reqs = data.requests || [];
  if (!sel || !reqs.find((r) => r.id === sel)) sel = reqs.length ? reqs[reqs.length - 1].id : null;
  paint(first);
  clearTimeout(timer);
  if ($("#monitor").open) timer = setTimeout(refresh, 1500);
}

const fmtMs = (ms) => (ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

function diagramSVG(req) {
  const layers = data.layers || [];
  const W = 560, boxW = 300, boxH = 46, gap = 18, x = (W - boxW) / 2, top = 56;
  const H = top + layers.length * (boxH + gap) + 64;
  const parts = [];
  // petición
  parts.push(`<g class="mn-node mn-io"><rect x="${x}" y="8" width="${boxW}" height="34" rx="10"/><text x="${W / 2}" y="30" text-anchor="middle">${esc(L("Tu petición", "Your request"))}</text></g>`);
  layers.forEach((ly, i) => {
    const y = top + i * (boxH + gap);
    const info = (req && req.layers && req.layers[ly.id]) || { status: "idle" };
    const st = info.status || "idle";
    const answered = req && req.answered_by === ly.id;
    const meta = [fmtMs(info.ms), info.hits != null ? `${info.hits} ${L("aciertos", "hits")}` : "",
      info.tokens_in || info.tokens_out ? `${info.tokens_in || 0}→${info.tokens_out || 0} tok` : "", info.cached ? `${info.cached} ${L("en caché", "cached")}` : "",
      ly.id === "skills" && info.chars ? `${fmtK(info.chars)} ${L("car.", "chars")}${info.whole_chars ? ` (${L("enteras", "whole")}: ${fmtK(info.whole_chars)})` : ""}` : ""].filter(Boolean).join(" · ");
    const yPrev = i === 0 ? 42 : y - gap;
    parts.push(`<line class="mn-edge mn-${st}" x1="${W / 2}" y1="${yPrev}" x2="${W / 2}" y2="${y}"/>`);
    parts.push(`<g class="mn-node mn-${st}${answered ? " mn-answer" : ""}${selLayer === ly.id ? " mn-sel" : ""}" data-layer="${ly.id}" tabindex="0">
      <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="10"/>
      <text x="${x + 14}" y="${y + 19}" class="mn-name">${i + 1} · ${esc(EN ? ly.en : ly.es)}</text>
      <text x="${x + 14}" y="${y + 36}" class="mn-meta">${esc(STATUS[st] ? STATUS[st]() : st)}${meta ? " · " + esc(meta) : ""}</text>
      ${answered ? `<text x="${x + boxW - 12}" y="${y + 19}" text-anchor="end" class="mn-tag">${esc(L("respuesta", "answer"))}</text>` : ""}
    </g>`);
  });
  const yEnd = top + layers.length * (boxH + gap);
  parts.push(`<line class="mn-edge" x1="${W / 2}" y1="${yEnd - gap}" x2="${W / 2}" y2="${yEnd + 4}"/>`);
  parts.push(`<g class="mn-node mn-io"><rect x="${x}" y="${yEnd + 4}" width="${boxW}" height="34" rx="10"/><text x="${W / 2}" y="${yEnd + 26}" text-anchor="middle">${esc(L("Tu canción (aplicas o eliges tú)", "Your song (you apply or pick)"))}</text></g>`);
  return `<svg class="mn-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L("Diagrama de capas de Maestro", "Maestro's layer diagram"))}">${parts.join("")}</svg>`;
}

const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));

function paint() {
  const reqs = (data.requests || []).slice().reverse();
  const req = reqs.find((r) => r.id === sel);
  const sm = data.summary || {};
  const rc = data.router || {};
  const ly = rc.layers || {};
  const det = selLayer && req ? req.layers[selLayer] : null;
  const box = $("#monitor-body");
  const keepForm = box.querySelector("#mn-limits");
  const formOpen = keepForm && keepForm.closest("details")?.open;
  box.innerHTML = `
    <div class="mn-sum">
      <span><b>${sm.requests || 0}</b> ${L("peticiones", "requests")}</span>
      <span><b>${Math.round((sm.share_without_llm || 0) * 100)}%</b> ${L("sin LLM", "without the LLM")}</span>
      <span><b>${sm.tokens || 0}</b> ${L("tokens", "tokens")}</span>
      ${sm.skills_whole ? `<span title="${L("Caracteres de skills enviados frente a los que habría costado mandarlas enteras", "Skill characters sent versus what sending them whole would have cost")}"><b>${fmtK(sm.skills_chars)}</b> ${L("de skills", "of skills")} · <b>−${Math.round(sm.skills_saved * 100)}%</b> ${L("frente a enteras", "vs whole")}</span>` : ""}
      ${data.index ? `<span><b>${data.index.songs}</b> ${L("canciones en el índice", "songs in the index")}${data.index.fts ? " (FTS5)" : ""}</span>` : ""}
    </div>
    <div class="mn-main">
      <div class="mn-list">
        <h4>${L("Últimas peticiones", "Latest requests")}</h4>
        ${reqs.length ? reqs.map((r) => `<button class="mn-req${r.id === sel ? " on" : ""}" data-req="${r.id}">
          <span class="mn-req-t">${esc(r.text || "…")}</span>
          <span class="mn-req-m">${r.done ? esc(fmtMs(r.total_ms)) : L("en curso…", "running…")} · ${esc(r.answered_by ? (EN ? (data.layers.find((x) => x.id === r.answered_by) || {}).en : (data.layers.find((x) => x.id === r.answered_by) || {}).es) : "—")}</span></button>`).join("")
          : `<p class="hint">${L("Escribe algo a Maestro y aquí verás por qué capas pasa.", "Write something to Maestro and you'll see which layers it goes through here.")}</p>`}
      </div>
      <div class="mn-diagram">${diagramSVG(req)}
        <div class="mn-detail">${selLayer ? `<b>${esc(EN ? (data.layers.find((x) => x.id === selLayer) || {}).en : (data.layers.find((x) => x.id === selLayer) || {}).es)}</b><p>${esc(LAYER_TIP[selLayer] ? LAYER_TIP[selLayer]() : "")}</p>
          ${det ? `<pre>${esc(JSON.stringify(det, null, 1))}</pre>` : ""}` : `<p class="hint">${L("Pulsa una capa para ver qué hace y el detalle de esta petición.", "Click a layer to see what it does and this request's detail.")}</p>`}</div>
      </div>
    </div>
    <details class="mn-limits-box" ${formOpen ? "open" : ""}>
      <summary>${icon("sliders", 14)} ${L("Límites del enrutador", "Router limits")}</summary>
      <form id="mn-limits" class="mn-limits">
        <label class="check"><input type="checkbox" name="local_answers" ${rc.local_answers ? "checked" : ""}> ${L("Responder sin IA lo que se pueda (capa 1)", "Answer without AI whatever possible (layer 1)")}</label>
        <label class="check"><input type="checkbox" name="ly_index" ${ly.index ? "checked" : ""}> ${L("Usar el índice de canciones (capa 2)", "Use the song index (layer 2)")}</label>
        <label class="check"><input type="checkbox" name="ly_library" ${ly.library ? "checked" : ""}> ${L("Leer tu biblioteca (capa 3)", "Read your library (layer 3)")}</label>
        <label class="check"><input type="checkbox" name="ly_loops" ${ly.loops ? "checked" : ""}> ${L("Pasar tus loops largos", "Pass your long loops")}</label>
        <label class="check"><input type="checkbox" name="ly_skills" ${ly.skills ? "checked" : ""}> ${L("Cargar skills (capa 4)", "Load skills (layer 4)")}</label>
        <label>${L("Cómo cargar las skills", "How to load skills")} <select name="skills_mode"><option value="smart" ${data.skills_mode !== "whole" ? "selected" : ""}>${L("A la carta: solo las secciones que encajan", "À la carte: only the sections that fit")}</option><option value="whole" ${data.skills_mode === "whole" ? "selected" : ""}>${L("Enteras (como antes de la 0.20)", "Whole (as before 0.20)")}</option></select></label>
        <label>${L("Tokens máximos por respuesta (0 = automático)", "Max tokens per answer (0 = automatic)")} <input type="number" name="max_tokens" min="0" max="16000" step="100" value="${rc.max_tokens || 0}"></label>
        <label>${L("Opciones como mucho", "Options at most")} <input type="number" name="max_candidates" min="1" max="4" value="${rc.max_candidates || 4}"></label>
        <label>${L("Pistas de tus canciones como contexto", "Tracks from your songs as context")} <input type="number" name="index_hits" min="0" max="10" value="${rc.index_hits ?? 3}"></label>
        <label>${L("Confianza mínima de una respuesta local (0-1)", "Minimum confidence of a local answer (0-1)")} <input type="number" name="confidence" min="0" max="1" step="0.05" value="${rc.confidence ?? 0.8}"></label>
        <label>${L("Segundos sin respuesta antes de cortar la IA", "Seconds without output before cutting the AI")} <input type="number" name="ai_timeout" min="30" max="1800" step="10" value="${data.ai_timeout || 300}"></label>
        <div class="row end"><span class="hint mn-saved"></span><button class="primary" type="submit">${L("Guardar límites", "Save limits")}</button></div>
      </form>
    </details>`;
}

function onClick(e) {
  const r = e.target.closest("[data-req]");
  if (r) { sel = r.dataset.req; return paint(); }
  const n = e.target.closest("[data-layer]");
  if (n) { selLayer = selLayer === n.dataset.layer ? null : n.dataset.layer; return paint(); }
}

async function onSave(e) {
  if (e.target.id !== "mn-limits") return;
  e.preventDefault();
  const f = new FormData(e.target);
  const on = (k) => f.get(k) === "on";
  const router = {
    local_answers: on("local_answers"),
    layers: { index: on("ly_index"), library: on("ly_library"), loops: on("ly_loops"), skills: on("ly_skills") },
    max_tokens: +f.get("max_tokens") || 0, max_candidates: +f.get("max_candidates") || 4,
    index_hits: +f.get("index_hits") || 0, confidence: +f.get("confidence"),
  };
  try {
    await api("/api/config", { router, ai_timeout: +f.get("ai_timeout") || 300, skills_mode: f.get("skills_mode") });
    await refresh();
    const s = $("#monitor .mn-saved"); if (s) s.textContent = L("Guardado.", "Saved.");
  } catch (err) {
    const s = $("#monitor .mn-saved"); if (s) s.textContent = "Error: " + err.message;
  }
}
