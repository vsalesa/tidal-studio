import { L } from "./i18n.js";
// Historial de la canción para volver atrás (rollback): deshacer, rehacer y saltar a cualquier versión.
// Guarda fotos de la canción (BPM, pistas, mezcla), no del chat. Se guarda por proyecto en el navegador.

const KEY = "tidal-studio-history-v1";
const MAX = 80;
let H = { projectId: null, list: [], idx: -1 };
let timer = null, paused = false;

export const songOf = (state) => JSON.stringify({
  bpm: state.bpm, master: state.master || null, name: state.name || "",
  tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, kind: t.kind, code: t.code, muted: !!t.muted, solo: !!t.solo, mix: t.mix || null })),
});

function persist() { try { localStorage.setItem(KEY, JSON.stringify(H)); } catch { /* sin espacio: solo en memoria */ } }
export function initHistory(state) {
  try { const h = JSON.parse(localStorage.getItem(KEY) || "null"); if (h && h.projectId === state.projectId && Array.isArray(h.list)) H = h; } catch { /* nada */ }
  if (H.projectId !== state.projectId) H = { projectId: state.projectId, list: [], idx: -1 };
  const now = songOf(state);
  if (!H.list.length || H.list[H.idx]?.song !== now) push(now, L("Estado al abrir", "State when opened"));
}
function push(song, label) {
  H.list = H.list.slice(0, H.idx + 1);
  H.list.push({ song, label, at: Date.now() });
  if (H.list.length > MAX) H.list = H.list.slice(-MAX);
  H.idx = H.list.length - 1;
  persist();
}

// Qué ha cambiado entre dos fotos, en pocas palabras
export function describe(prevS, nextS) {
  const a = JSON.parse(prevS), b = JSON.parse(nextS);
  const out = [];
  if (a.bpm !== b.bpm) out.push(`${a.bpm} → ${b.bpm} BPM`);
  const A = Object.fromEntries(a.tracks.map((t) => [t.id, t]));
  const B = Object.fromEntries(b.tracks.map((t) => [t.id, t]));
  for (const t of b.tracks) {
    const o = A[t.id];
    if (!o) { out.push(L(`nueva ${t.id} ${t.name}`, `new ${t.id} ${t.name}`)); continue; }
    if (o.code !== t.code) out.push(L(`${t.id} ${t.name}: código`, `${t.id} ${t.name}: code`));
    if (JSON.stringify(o.mix) !== JSON.stringify(t.mix)) out.push(L(`${t.id}: mezcla`, `${t.id}: mix`));
    if (o.muted !== t.muted) out.push(t.muted ? L(`${t.id} silenciada`, `${t.id} muted`) : L(`${t.id} activada`, `${t.id} unmuted`));
    if (o.solo !== t.solo) out.push(`${t.id} solo`);
    if (o.name !== t.name && o.code === t.code) out.push(L(`${t.id} renombrada`, `${t.id} renamed`));
  }
  for (const t of a.tracks) if (!B[t.id]) out.push(L(`borrada ${t.id} ${t.name}`, `deleted ${t.id} ${t.name}`));
  if (JSON.stringify(a.master) !== JSON.stringify(b.master)) out.push(L("mezcla general", "master mix"));
  if (a.name !== b.name && !out.length) out.push(L("nombre", "name"));
  return out.slice(0, 3).join(" · ") + (out.length > 3 ? " …" : "") || L("cambio", "change");
}

// Llamar cada vez que se guarda: agrupa los cambios rápidos (mover un deslizador) en una sola entrada
export function record(state, onChange) {
  if (paused) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (H.projectId !== state.projectId) { H = { projectId: state.projectId, list: [], idx: -1 }; }
    const now = songOf(state), cur = H.list[H.idx];
    if (cur && cur.song === now) return;
    push(now, cur ? describe(cur.song, now) : L("Inicio", "Start"));
    if (onChange) onChange();
  }, 700);
}
export function flushPending(state) { if (timer) { clearTimeout(timer); timer = null; if (H.projectId !== state.projectId) H = { projectId: state.projectId, list: [], idx: -1 }; const now = songOf(state), cur = H.list[H.idx]; if (!cur || cur.song !== now) push(now, cur ? describe(cur.song, now) : L("Inicio", "Start")); } }

export const canUndo = () => H.idx > 0 || !!timer;
export const canRedo = () => H.idx < H.list.length - 1;
export const entries = () => H.list.map((e, i) => ({ ...e, i, current: i === H.idx }));
// Devuelve la foto a la que hay que volver (o null)
export function go(i) {
  if (i < 0 || i >= H.list.length) return null;
  H.idx = i; persist();
  return JSON.parse(H.list[i].song);
}
export function undo(state) { flushPending(state); return canUndo() ? go(H.idx - 1) : null; }
export function redo(state) { flushPending(state); return canRedo() ? go(H.idx + 1) : null; }
export function withoutRecording(fn) { paused = true; try { fn(); } finally { paused = false; } }
export function resetHistory(state) { H = { projectId: state.projectId, list: [], idx: -1 }; push(songOf(state), L("Inicio", "Start")); }
