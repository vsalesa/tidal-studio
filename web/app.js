import { STYLES, CATEGORIES, COMPONENTS, byId } from "./catalog.js";

const $ = (s) => document.querySelector(s);
const MAX_TRACKS = 12;
const STORE_KEY = "tidal-studio-session-v1";

// ------------------------------------------------------------------ estado
let state = {
  bpm: 120,
  tracks: [],           // {id, name, kind, code, muted}
  selected: null,
  style: "",
  step: "estilo",
  chat: [],             // {role, content, changes?}
  options: [],
  lastError: "",
};
let server = { llm: false, engine: {} };
let busy = false;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && Array.isArray(s.tracks)) state = { ...state, ...s };
  } catch { /* sesión corrupta: empezamos de cero */ }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
}

// ------------------------------------------------------------------ API
async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  };
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

// ------------------------------------------------------------------ código Tidal
const cps = (bpm) => `setcps (${bpm}/60/4)`;

function buildCode() {
  const lines = [`-- Tidal Studio · ${state.bpm} BPM${state.style ? " · " + STYLES[state.style].nombre : ""}`,
                 cps(state.bpm), ""];
  for (const t of state.tracks) {
    const body = `${t.id} $ ${t.code}`;
    if (t.muted) {
      lines.push(`-- [silenciada] ${t.name} · ${t.kind}`);
      lines.push(body.split("\n").map((l) => "-- " + l).join("\n"));
    } else {
      lines.push(`-- ${t.name} · ${t.kind}`);
      lines.push(body);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function parseCode(text) {
  const out = { bpm: state.bpm, tracks: [] };
  const m = text.match(/setcps\s*\(\s*([\d.]+)\s*\/\s*60\s*\/\s*4\s*\)/);
  if (m) out.bpm = Math.round(parseFloat(m[1]));
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    let name = "", kind = "fx", muted = false, codeLines = [];
    for (const l of lines) {
      const header = l.match(/^--\s*(\[silenciada\]\s*)?(.+?)\s*·\s*(\w+)\s*$/);
      if (header && !codeLines.length && !/^--\s*d\d+\s*\$/.test(l)) {
        muted = !!header[1]; name = header[2]; kind = header[3]; continue;
      }
      if (/^--\s*Tidal Studio/.test(l) || /setcps/.test(l)) continue;
      if (muted && l.startsWith("-- ")) codeLines.push(l.slice(3));
      else if (!l.trim().startsWith("--")) codeLines.push(l);
    }
    const code = codeLines.join("\n");
    const tm = code.match(/^\s*(d\d+)\s*\$\s*([\s\S]+)$/);
    if (tm) out.tracks.push({ id: tm[1], name: name || tm[1], kind, code: tm[2].trim(), muted });
  }
  return out;
}

// ------------------------------------------------------------------ sonido
async function evalCode(code, track) {
  try {
    const r = await api("/api/eval", { code });
    if (track) track.error = r.errors && r.errors.length ? r.errors.join("\n") : "";
    state.lastError = r.errors && r.errors.length ? r.errors.slice(0, 6).join(" ") : "";
    if (!r.ok && !track) toast("⚠️ Tidal dio un error. Mira la pestaña Registro o pide ayuda a Maestro.");
    return r;
  } catch (e) {
    toast("No se pudo enviar el código: " + e.message);
  } finally {
    renderTracks();
  }
}
const trackLine = (t) => (t.muted ? `${t.id} silence` : `${t.id} $ ${t.code}`);
const playTrack = (t) => evalCode(trackLine(t), t);
const silenceId = (id) => evalCode(`${id} silence`);
function playAll() {
  const code = [cps(state.bpm), ...state.tracks.map(trackLine)].join("\n\n");
  return evalCode(code);
}
const live = () => $("#autoplay").checked;

// ------------------------------------------------------------------ pistas
function freeId() {
  for (let i = 1; i <= MAX_TRACKS; i++) if (!state.tracks.find((t) => t.id === "d" + i)) return "d" + i;
  return null;
}
function selectedTrack() {
  return state.tracks.find((t) => t.id === state.selected) || state.tracks[state.tracks.length - 1];
}
function addTrack(name, kind, code) {
  const id = freeId();
  if (!id) { toast("Máximo 12 pistas. Borra alguna primero."); return null; }
  const t = { id, name, kind, code, muted: false };
  state.tracks.push(t);
  state.selected = id;
  changed();
  if (live()) playTrack(t);
  return t;
}
function applyModifier(comp, target) {
  const t = target || selectedTrack();
  if (!t) { toast("Primero añade una pista para aplicarle esto."); return null; }
  if (comp.sufijo) {
    // Si la pista ya tenía ese parámetro con un valor simple, lo sustituimos en vez de repetirlo
    let code = t.code;
    for (const m of comp.sufijo.matchAll(/#\s*(\w+)\s/g)) {
      code = code.replace(new RegExp(`\\s*#\\s*${m[1]}\\s+-?[\\d.]+(?![\\w(])`, "g"), "");
    }
    t.code = code + comp.sufijo;
  } else t.code = comp.envoltura + t.code;
  changed();
  if (live()) playTrack(t);
  return t;
}
function addComponent(comp) {
  if (comp.cat === "efecto" || comp.cat === "estructura") return applyModifier(comp);
  return addTrack(comp.nombre, comp.cat, comp.codigo);
}
function removeTrack(id) {
  state.tracks = state.tracks.filter((t) => t.id !== id);
  if (state.selected === id) state.selected = null;
  silenceId(id);
  changed();
}

function changed() {
  save();
  renderTracks();
  if (!$("#tab-code").classList.contains("active")) $("#code").value = buildCode();
}

function renderTracks() {
  const box = $("#tracks");
  box.innerHTML = "";
  $("#empty").style.display = state.tracks.length ? "none" : "block";
  for (const t of state.tracks) {
    const cat = CATEGORIES.find((c) => c.id === t.kind);
    const el = document.createElement("div");
    el.className = "track" + (t.id === state.selected ? " selected" : "") + (t.muted ? " muted" : "");
    el.dataset.kind = t.kind;
    el.innerHTML = `
      <div class="head">
        <span>${cat ? cat.emoji : "🔊"}</span>
        <span class="id">${t.id}</span>
        <input class="tname" value="">
        <span class="actions">
          <button data-a="play" title="Hacer sonar esta pista">▶</button>
          <button data-a="mute" title="Silenciar / activar">${t.muted ? "🔈 Activar" : "🔇"}</button>
          <button data-a="del" title="Borrar pista">🗑</button>
        </span>
      </div>
      <textarea rows="${Math.min(6, t.code.split("\n").length + 1)}" spellcheck="false" title="Ctrl+Enter para escuchar"></textarea>
      ${t.error ? `<div class="err"></div>` : ""}`;
    el.querySelector(".tname").value = t.name;
    el.querySelector("textarea").value = t.code;
    if (t.error) el.querySelector(".err").textContent = t.error;
    el.addEventListener("click", (e) => {
      if (state.selected !== t.id) { state.selected = t.id; save();
        document.querySelectorAll(".track").forEach((x) => x.classList.toggle("selected", x === el)); }
      const a = e.target.dataset.a;
      if (a === "play") playTrack(t);
      if (a === "mute") { t.muted = !t.muted; changed(); playTrack(t); }
      if (a === "del") removeTrack(t.id);
    });
    el.querySelector(".tname").addEventListener("change", (e) => { t.name = e.target.value; changed(); });
    const ta = el.querySelector("textarea");
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); t.code = ta.value; changed(); playTrack(t); }
    });
    ta.addEventListener("change", () => { t.code = ta.value; changed(); if (live()) playTrack(t); });
    box.appendChild(el);
  }
}

// ------------------------------------------------------------------ catálogo
function renderCatalog() {
  const sel = $("#style-filter");
  if (sel.options.length === 1)
    for (const [k, s] of Object.entries(STYLES)) sel.add(new Option(`${s.emoji} ${s.nombre}`, k));
  sel.value = state.style || "";
  const style = sel.value;
  const box = $("#catalog");
  box.innerHTML = "";
  for (const cat of CATEGORIES) {
    let items = COMPONENTS.filter((c) => c.cat === cat.id);
    if (style && items[0] && items[0].estilos) {
      items = [...items].sort((a, b) => (b.estilos.includes(style) ? 1 : 0) - (a.estilos.includes(style) ? 1 : 0));
    }
    const d = document.createElement("details");
    d.className = "cat";
    d.open = ["percusion", "bajo"].includes(cat.id) || !!style;
    d.innerHTML = `<summary>${cat.emoji} ${cat.nombre}</summary><p class="help">${cat.ayuda}</p>`;
    for (const c of items) {
      const fits = style && c.estilos && c.estilos.includes(style);
      const row = document.createElement("div");
      row.className = "comp";
      row.innerHTML = `<div class="txt"><div class="name"></div><div class="desc"></div></div>
        <button title="${c.cat === "efecto" || c.cat === "estructura" ? "Aplicar a la pista seleccionada" : "Añadir pista"}">+</button>`;
      row.querySelector(".name").textContent = c.nombre;
      if (fits) row.querySelector(".name").insertAdjacentHTML("beforeend", `<span class="star">★ encaja</span>`);
      row.querySelector(".desc").textContent = c.desc;
      row.querySelector("button").onclick = () => {
        const t = addComponent(c);
        if (t) sysMsg(c.sufijo || c.envoltura ? `«${c.nombre}» aplicado a ${t.id} (${t.name})` : `Añadida pista ${t.id}: ${c.nombre}`);
      };
      d.appendChild(row);
    }
    box.appendChild(d);
  }
}

// ------------------------------------------------------------------ chat
function renderChat() {
  const box = $("#chat");
  box.innerHTML = "";
  for (const m of state.chat) {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    el.textContent = m.content;
    if (m.changes) {
      const c = document.createElement("div");
      c.className = "changes";
      c.textContent = m.changes;
      el.appendChild(c);
    }
    box.appendChild(el);
  }
  if (busy) box.insertAdjacentHTML("beforeend", `<div class="msg assistant typing">Maestro está pensando…</div>`);
  box.scrollTop = box.scrollHeight;
  const chips = $("#chips");
  chips.innerHTML = "";
  for (const o of state.options || []) {
    const b = document.createElement("button");
    b.textContent = o;
    b.onclick = () => send(o);
    chips.appendChild(b);
  }
}
function say(content, options = [], changes = "") {
  state.chat.push({ role: "assistant", content, ...(changes ? { changes } : {}) });
  state.options = options;
  save(); renderChat();
}
function sysMsg(text) { state.chat.push({ role: "system", content: text }); save(); renderChat(); }
function toast(text) { sysMsg(text); }

function greet() {
  state.step = "estilo";
  say("¡Hola! Soy Maestro, tu compositor en casa 🎶\n\nVamos a crear una canción paso a paso: primero el estilo, luego el ritmo, el bajo, los acordes, la melodía, los efectos y cuándo cambia cada cosa.\n\nNo hace falta saber música. ¿Qué estilo te apetece?",
    [...Object.values(STYLES).map((s) => `${s.emoji} ${s.nombre}`), "🎲 Sorpréndeme"]);
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  state.chat.push({ role: "user", content: text });
  state.options = [];
  save(); renderChat();
  if (server.llm && !state.offline) return askLLM(text);
  offlineGuide(text);
}

async function askLLM() {
  busy = true; renderChat();
  try {
    const history = state.chat.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    const session = {
      bpm: state.bpm, step: state.step, lastError: state.lastError,
      tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: t.muted })),
    };
    const r = await api("/api/chat", { messages: history, session });
    busy = false;
    if (r.paso) state.step = r.paso;
    const summary = applyChanges(r.cambios || {});
    say(r.mensaje || "…", r.opciones || [], summary);
  } catch (e) {
    busy = false;
    say("Uy, no he podido hablar con la IA: " + e.message + "\n\nRevisa ⚙️ Ajustes. Mientras tanto te sigo guiando con el modo sin IA.",
      ["Seguir sin IA"]);
  }
}

function applyChanges(c) {
  const notes = [];
  if (c.bpm && Math.round(c.bpm) !== state.bpm) {
    state.bpm = Math.round(c.bpm); $("#bpm").value = state.bpm;
    notes.push(`⏱ ${state.bpm} BPM`);
    if (live()) evalCode(cps(state.bpm));
  }
  for (const id of c.eliminar || []) {
    if (state.tracks.find((t) => t.id === id)) { removeTrack(id); notes.push(`🗑 ${id}`); }
  }
  for (const p of c.pistas || []) {
    let t = state.tracks.find((x) => x.id === p.id);
    if (t) { t.code = p.codigo; t.name = p.nombre || t.name; t.kind = p.tipo || t.kind; t.muted = false; notes.push(`✏️ ${p.id} ${t.name}`); }
    else { t = { id: p.id, name: p.nombre, kind: p.tipo, code: p.codigo, muted: false }; state.tracks.push(t); notes.push(`➕ ${p.id} ${t.name}`); }
    state.tracks.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    state.selected = p.id;
    if (live()) playTrack(t);
  }
  changed();
  return notes.length ? "Cambios: " + notes.join(" · ") : "";
}

// ------------------------------------------------------------------ guía sin IA
const NEXT = "Siguiente paso ➡";
const FLOW = ["estilo", "percusion", "tempo", "bajo", "armonia", "melodia", "textura", "efecto", "estructura", "libre"];
const STEP_TEXT = {
  percusion: "Empezamos por el ritmo 🥁. La percusión es el esqueleto de la canción. Te propongo estas opciones (las marcadas encajan con tu estilo). Puedes añadir varias.",
  tempo: "¿Qué tal la velocidad? Ahora mismo está a {bpm} BPM (golpes por minuto). Más BPM = más energía.",
  bajo: "Ahora el bajo 🎸: las notas graves que dan peso y hacen mover la cabeza. ¿Cuál probamos?",
  armonia: "Turno de los acordes 🎹: varias notas a la vez que dan la emoción (alegre, triste, misteriosa).",
  melodia: "Ahora una melodía 🎵, la parte que se te quedará en la cabeza.",
  textura: "¿Añadimos alguna textura de fondo 🌫️? Son detalles que dan ambiente.",
  efecto: "Hora de los efectos ✨. Se aplican a la pista seleccionada ({track}). Pulsa otra pista en la columna central para cambiarla.",
  estructura: "Por último: ¿cuándo pasan las cosas? ⏱️ Esto hace que la canción cambie con el tiempo en vez de repetirse igual. Se aplica a {track}.",
  libre: "¡Ya tienes una canción completa! 🎉\n\nPuedes seguir añadiendo cosas desde el catálogo, editar el código en la pestaña ⌨️, o silenciar pistas para crear partes.\n\nPara que te dé ideas a tu medida y entienda lo que escribes, conecta una IA en ⚙️ Ajustes.",
};

function compsFor(cat) {
  const list = COMPONENTS.filter((c) => c.cat === cat);
  if (!state.style || !list[0] || !list[0].estilos) return list.slice(0, 6);
  const fit = list.filter((c) => c.estilos.includes(state.style));
  return (fit.length ? fit : list).slice(0, 6);
}

function goStep(step) {
  state.step = step;
  const t = selectedTrack();
  const text = (STEP_TEXT[step] || "").replace("{bpm}", state.bpm).replace("{track}", t ? `${t.id} · ${t.name}` : "ninguna");
  if (step === "tempo") return say(text, ["🐢 Más lento", "🐇 Más rápido", "👌 Así está perfecto"]);
  if (step === "libre") return say(text, ["🔁 Empezar otra canción"]);
  if (step === "efecto" || step === "estructura") {
    const tracks = state.tracks.slice(-4).map((x) => `🎯 Usar ${x.id} · ${x.name}`);
    return say(text, [...compsFor(step).slice(0, 5).map((c) => c.nombre), ...tracks.slice(0, 2), NEXT]);
  }
  say(text, [...compsFor(step).map((c) => c.nombre), NEXT]);
}
function nextStep() {
  const i = FLOW.indexOf(state.step);
  goStep(FLOW[Math.min(FLOW.length - 1, i + 1)]);
}

function offlineGuide(text) {
  const low = text.toLowerCase();
  if (low.includes("empezar otra") || low.includes("reiniciar")) { evalCode("hush"); state.tracks = []; state.style = ""; changed(); renderCatalog(); return greet(); }
  if (low.includes("seguir sin ia")) { state.offline = true; return goStep(state.step); }
  if (text === NEXT || low.includes("siguiente") || low.includes("perfecto")) return nextStep();

  if (state.step === "estilo") {
    let key = Object.keys(STYLES).find((k) => low.includes(STYLES[k].nombre.toLowerCase()) || low.includes(k));
    if (!key && (low.includes("sorpr") || low.includes("no sé") || low.includes("no se"))) {
      const ks = Object.keys(STYLES); key = ks[Math.floor(Math.random() * ks.length)];
    }
    if (!key) return say("No conozco ese estilo todavía 😅. Elige uno de estos y lo adaptamos después:",
      Object.values(STYLES).map((s) => `${s.emoji} ${s.nombre}`));
    const s = STYLES[key];
    state.style = key; state.bpm = s.bpm; $("#bpm").value = s.bpm; renderCatalog();
    if (live()) evalCode(cps(s.bpm));
    say(`¡${s.nombre}! ${s.desc}\nLo pongo a ${s.bpm} BPM, que es lo típico.`);
    return goStep("percusion");
  }
  if (state.step === "tempo") {
    if (low.includes("lento")) state.bpm = Math.max(40, state.bpm - 10);
    else if (low.includes("rápido") || low.includes("rapido")) state.bpm = Math.min(220, state.bpm + 10);
    else { const n = parseInt(low.match(/\d+/)?.[0]); if (n) state.bpm = Math.max(40, Math.min(220, n)); }
    $("#bpm").value = state.bpm; evalCode(cps(state.bpm)); save();
    return say(`Ahora a ${state.bpm} BPM. ¿Mejor así?`, ["🐢 Más lento", "🐇 Más rápido", "👌 Así está perfecto"]);
  }
  const target = text.match(/Usar (d\d+)/);
  if (target) { state.selected = target[1]; save(); renderTracks(); return goStep(state.step); }

  const comp = COMPONENTS.find((c) => low === c.nombre.toLowerCase()) ||
               COMPONENTS.find((c) => low.includes(c.nombre.toLowerCase()));
  if (comp) {
    const t = addComponent(comp);
    if (!t) return say("Primero necesitas alguna pista para aplicarle eso.", [NEXT]);
    const what = comp.sufijo || comp.envoltura ? `He aplicado «${comp.nombre}» a ${t.id} (${t.name}).` : `He añadido «${comp.nombre}» en la pista ${t.id}.`;
    const opts = state.step === "efecto" || state.step === "estructura"
      ? [...compsFor(state.step).slice(0, 5).map((c) => c.nombre), NEXT]
      : [...compsFor(state.step).filter((c) => c.id !== comp.id).map((c) => c.nombre), NEXT];
    return say(`${what} ${comp.desc}\n\n¿Añadimos algo más aquí o pasamos al siguiente paso?`, opts);
  }
  say("Sin una IA conectada solo entiendo las opciones de los botones 🙂. Conecta una en ⚙️ Ajustes para hablar libremente.",
    state.options.length ? state.options : [NEXT]);
}

// ------------------------------------------------------------------ estado del servidor
async function refreshStatus() {
  try {
    const s = await api("/api/status");
    server.llm = s.llm_configured; server.engine = s.engine;
    const e = s.engine, pe = $("#st-engine");
    if (e.tidal_running && e.superdirt_ready) { pe.textContent = "🔊 Sonido listo"; pe.className = "pill ok"; }
    else if (e.tidal_running || e.sc_running) { pe.textContent = "⏳ Arrancando sonido…"; pe.className = "pill warn"; }
    else if (!e.ghci_path || !e.sclang_path) { pe.textContent = "🔇 Simulación (falta instalar)"; pe.className = "pill bad"; }
    else { pe.textContent = "🔇 Motor parado"; pe.className = "pill warn"; }
    const pl = $("#st-llm");
    pl.textContent = s.llm_configured ? `🧠 IA: ${s.provider === "anthropic" ? "Claude" : "OpenAI-compatible"}` : "🧠 IA sin conectar";
    pl.className = "pill " + (s.llm_configured ? "ok" : "warn");
    $("#assistant-mode").textContent = s.llm_configured ? "" : "(modo guiado sin IA)";
  } catch {
    $("#st-engine").textContent = "❌ Servidor apagado"; $("#st-engine").className = "pill bad";
  }
}
async function refreshLog() {
  if (!$("#tab-log").classList.contains("active")) return;
  try { const r = await api("/api/log"); const el = $("#log");
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.textContent = r.log.join("\n"); if (atBottom) el.scrollTop = el.scrollHeight; } catch { /* ignorar */ }
}

// ------------------------------------------------------------------ ajustes
async function openSettings() {
  const c = await api("/api/config");
  const dlg = $("#settings");
  dlg.querySelector(`input[name=provider][value=${c.provider}]`).checked = true;
  $("#oa-url").value = c.openai.base_url; $("#oa-model").value = c.openai.model;
  $("#oa-key").value = c.openai.api_key; $("#an-key").value = c.anthropic.api_key; $("#an-model").value = c.anthropic.model;
  const preset = [...$("#oa-preset").options].find((o) => o.value.split("|")[0] === c.openai.base_url);
  $("#oa-preset").value = preset ? preset.value : "custom";
  toggleProvider(); $("#test-msg").textContent = "";
  dlg.showModal();
}
function toggleProvider() {
  const p = document.querySelector("input[name=provider]:checked").value;
  $("#fs-openai").hidden = p !== "openai"; $("#fs-anthropic").hidden = p !== "anthropic";
}
function settingsPayload() {
  return {
    provider: document.querySelector("input[name=provider]:checked").value,
    openai: { base_url: $("#oa-url").value, api_key: $("#oa-key").value, model: $("#oa-model").value },
    anthropic: { api_key: $("#an-key").value, model: $("#an-model").value },
  };
}
async function saveSettings() {
  await api("/api/config", settingsPayload());
  state.offline = false; save();
  await refreshStatus();
}

// ------------------------------------------------------------------ arranque
function init() {
  load();
  $("#bpm").value = state.bpm;
  renderCatalog(); renderTracks(); $("#code").value = buildCode();
  if (!state.chat.length) greet(); else renderChat();

  $("#bpm").addEventListener("change", (e) => {
    state.bpm = Math.max(40, Math.min(220, parseInt(e.target.value) || 120)); e.target.value = state.bpm;
    changed(); evalCode(cps(state.bpm));
  });
  $("#btn-play").onclick = playAll;
  $("#btn-hush").onclick = () => evalCode("hush");
  $("#style-filter").onchange = (e) => { state.style = e.target.value; save(); renderCatalog(); };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); const i = $("#chat-input"); send(i.value); i.value = ""; };

  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "code") $("#code").value = buildCode();
    if (b.dataset.tab === "log") refreshLog();
  });
  $("#btn-apply-code").onclick = async () => {
    const parsed = parseCode($("#code").value);
    const keep = new Set(parsed.tracks.map((t) => t.id));
    const removed = state.tracks.filter((t) => !keep.has(t.id)).map((t) => t.id);
    state.bpm = parsed.bpm; $("#bpm").value = state.bpm; state.tracks = parsed.tracks;
    save(); renderTracks();
    for (const id of removed) await silenceId(id);
    const r = await playAll();
    $("#code-msg").textContent = r && r.ok ? `✔ Aplicado (${parsed.tracks.length} pistas)` : "⚠️ Hay errores: mira el Registro";
  };
  $("#code").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#btn-apply-code").click(); }
    if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
  });
  $("#btn-copy-code").onclick = () => navigator.clipboard.writeText($("#code").value).then(() => $("#code-msg").textContent = "Copiado");
  $("#btn-engine-start").onclick = async () => { await api("/api/engine/start", {}); refreshStatus(); };
  $("#btn-engine-stop").onclick = async () => { await api("/api/engine/stop", {}); refreshStatus(); };

  $("#btn-settings").onclick = openSettings;
  document.querySelectorAll("input[name=provider]").forEach((r) => r.onchange = toggleProvider);
  $("#oa-preset").onchange = (e) => {
    if (e.target.value === "custom") return;
    const [url, model] = e.target.value.split("|"); $("#oa-url").value = url; $("#oa-model").value = model;
  };
  $("#btn-save").onclick = async () => { await saveSettings(); $("#settings").close(); };
  $("#btn-test").onclick = async () => {
    $("#test-msg").textContent = "Probando…";
    try { await saveSettings(); const r = await api("/api/llm/test", {}); $("#test-msg").textContent = "✔ Conectado: " + r.reply; }
    catch (e) { $("#test-msg").textContent = "✖ " + e.message; }
  };

  refreshStatus();
  setInterval(refreshStatus, 3000);
  setInterval(refreshLog, 1500);
}

init();
