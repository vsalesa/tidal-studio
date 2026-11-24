// Aviso de audio: si cambian las salidas de sonido del ordenador (enchufas un piano USB, unos auriculares…)
// o el motor de audio se cae, Tidal Studio lo dice y ofrece «Reconectar audio», con la salida que quieras.
// La canción sigue en Tidal: en cuanto el audio vuelve, suena sola. Ver Engine.audio_state() en server/engine.py.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let bar = null, last = null, dismissed = "", timer = null, busy = false;

function message(a) {
  const added = (a.added || []).join(", "), removed = (a.removed || []).join(", ");
  switch (a.problem) {
    case "devices-changed":
      return added
        ? L(`Ha aparecido una salida de audio nueva (${added}). Si dejas de oír la música, reconecta el audio.`, `A new audio output appeared (${added}). If the music stops, reconnect the audio.`)
        : L(`Se ha quitado una salida de audio (${removed}). Si dejas de oír la música, reconecta el audio.`, `An audio output was removed (${removed}). If the music stops, reconnect the audio.`);
    case "server-lost": return L("El motor de audio se ha parado (suele pasar al cambiar de salida de sonido).", "The audio engine stopped (this usually happens when the sound output changes).");
    case "sc-exit": return L("SuperCollider se ha cerrado y no hay sonido.", "SuperCollider closed and there is no sound.");
    case "rate-mismatch": return L("La entrada y la salida de audio van a frecuencias distintas y el motor no arranca.", "The audio input and output run at different sample rates and the engine can't start.");
    case "boot-failed": return L("El motor de audio no ha podido arrancar con esta salida de sonido.", "The audio engine couldn't start with this sound output.");
    default: return "";
  }
}

function render(a) {
  if (!bar) return;
  const key = `${a.problem}|${(a.added || []).join()}|${(a.removed || []).join()}`;
  if (!a.problem || dismissed === key) { bar.hidden = true; return; }
  const opts = [`<option value="">${L("Salida del sistema", "System output")}</option>`]
    .concat((a.devices || []).map((d) => `<option ${d === a.chosen ? "selected" : ""}>${esc(d)}</option>`)).join("");
  bar.innerHTML = `${icon("speaker", 16)} <span class="as-msg">${esc(message(a))}</span>
    ${(a.devices || []).length ? `<label class="as-out">${L("Salida", "Output")} <select>${opts}</select></label>` : ""}
    <button class="primary as-go">${L("Reconectar audio", "Reconnect audio")}</button>
    <button class="link as-no">${L("Ahora no", "Not now")}</button>`;
  bar.hidden = false;
  bar.querySelector(".as-no").onclick = () => { dismissed = key; bar.hidden = true; };
  bar.querySelector(".as-go").onclick = () => reconnect(bar.querySelector("select")?.value);
}

export async function reconnect(out) {
  if (busy) return;
  busy = true;
  if (bar) bar.innerHTML = `${icon("speaker", 16)} <span class="as-msg">${L("Reconectando el audio… la canción volverá a sonar sola.", "Reconnecting audio… the song will come back on its own.")}</span>`;
  try {
    await fetch("/api/audio/restart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(out === undefined ? {} : { out }) });
  } catch { /* el servidor se está reiniciando */ }
  setTimeout(() => { busy = false; check(); }, 6000);
}

async function check() {
  clearTimeout(timer);
  try {
    const a = await (await fetch("/api/audio")).json();
    last = a;
    if (!busy) render(a);
  } catch { /* sin servidor */ }
  timer = setTimeout(check, 4000);
}

export const audioState = () => last;

export function initAudioStatus() {
  bar = document.createElement("div");
  bar.id = "audio-bar";
  bar.className = "audio-bar";
  bar.setAttribute("role", "status");
  bar.hidden = true;
  document.body.appendChild(bar);
  check();
}
