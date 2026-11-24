// Candados (Maestro v2, release 0.14): bloquea una pista entera o solo una parte (ritmo, notas, sonido, efectos,
// mezcla) y el BPM. Maestro, las ideas, las opciones y los cursos NO pueden cambiar lo bloqueado: la app lo comprueba
// aquí antes de aplicar nada (el servidor también quita lo que toca pistas bloqueadas enteras). Tú sí puedes editar a
// mano lo bloqueado: el candado protege tu decisión de los cambios automáticos, no de ti.
import { L } from "./i18n.js";

export const PARTS = ["ritmo", "notas", "sonido", "efectos", "mezcla"];
export const partName = (p) => ({
  all: L("Todo", "All"), ritmo: L("Ritmo", "Rhythm"), notas: L("Notas", "Notes"), sonido: L("Sonido", "Sound"),
  efectos: L("Efectos", "Effects"), mezcla: L("Mezcla", "Mix"), bpm: "BPM",
})[p] || p;

// ---------------------------------------------------------------- análisis del código de Tidal (sin IA)
const SOUND_PARAMS = new Set(["s", "sound", "vowel"]);
const NOTE_PARAMS = new Set(["n", "note", "up"]);

// Divide «a # b |+ n 12» en trozos de primer nivel (fuera de comillas y paréntesis)
function topLevelSplit(code) {
  const out = []; let depth = 0, q = false, cur = "";
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (!q && "([{".includes(ch)) depth++;
    if (!q && ")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (!q && depth === 0 && ch === "#") { out.push(cur); cur = ""; continue; }
    if (!q && depth === 0 && ch === "|" && "+-*/<>%".includes(code[i + 1] || "")) { out.push(cur); cur = "|"; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const PARAM_RE = /^(?:\|[+\-*/<>]\||[|+\-*/<>]+)?\s*([a-zA-Z_][a-zA-Z0-9_']*)\s+([\s\S]*)$/;
const STR_RE = /"([^"]*)"/g;
const WORD_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

function rhythmOf(pat) {
  // El esqueleto rítmico: cada valor (sonido o nota) se cambia por «x», se conservan silencios, *, /, [], <>, ~
  // (los números tras *, /, !, @ o dentro de (3,8) son ritmo y se quedan)
  return pat.replace(/:\d+/g, "").replace(/'[a-z0-9]+/gi, "")
    .replace(/(^|[\s[<{|.])(-?[A-Za-z0-9_#]+(?:\.\d+)?)/g, "$1x").replace(/\s+/g, " ").trim();
}

/** Partes de una pista: { ritmo, notas, sonido, efectos } como textos comparables. */
export function partsOf(code) {
  const src = String(code || "").replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const chunks = topLevelSplit(src);
  let head = chunks.shift() || "";
  // Lo que va antes del primer s/n/note… son transformaciones de tiempo (fast 2, every 4 (…), sometimes…): ritmo
  const m = head.match(/^(.*?)\b(s|sound|n|note|up)\s+"/);
  const transform = m ? m[1].replace(/\$\s*$/, "").trim() : "";
  const rest = m ? head.slice(m[1].length) : head;
  const params = [rest, ...chunks];
  const sounds = new Set(), notes = [], rhythm = [transform], fx = [];
  for (const p of params) {
    const pm = p.match(PARAM_RE);
    if (!pm) { if (p.trim()) fx.push(p.trim()); continue; }
    const name = pm[1], val = pm[2].trim();
    if (SOUND_PARAMS.has(name)) {
      for (const s of val.matchAll(STR_RE)) {
        for (const w of s[1].replace(/:\d+/g, "").matchAll(WORD_RE)) sounds.add(w[0].toLowerCase());
        rhythm.push(rhythmOf(s[1]));
      }
      if (!/"/.test(val)) sounds.add(val);
    } else if (NOTE_PARAMS.has(name)) {
      for (const s of val.matchAll(STR_RE)) { notes.push(s[1].replace(/\s+/g, " ").trim()); rhythm.push(rhythmOf(s[1])); }
      if (!/"/.test(val)) notes.push(val);
    } else {
      fx.push(`${name} ${val.replace(/\s+/g, " ")}`);
    }
  }
  return {
    ritmo: rhythm.filter(Boolean).join(" | "),
    notas: notes.join(" | "),
    sonido: [...sounds].sort().join(" "),
    efectos: fx.sort().join(" # "),
  };
}

/** Qué partes cambian entre dos versiones del código. */
export function changedParts(before, after) {
  const a = partsOf(before), b = partsOf(after);
  return ["ritmo", "notas", "sonido", "efectos"].filter((k) => a[k] !== b[k]);
}

export const isLocked = (t) => !!(t && t.lock && (t.lock.all || PARTS.some((p) => t.lock[p])));
export const lockedParts = (t) => (t && t.lock ? (t.lock.all ? ["all"] : PARTS.filter((p) => t.lock[p])) : []);

/**
 * Filtra unos «cambios» de Maestro (o de un curso, una idea, una opción) según los candados.
 * Devuelve { cambios, blocked: [{id, parts}] }. No modifica el objeto que recibe.
 */
export function guardChanges(state, c) {
  const out = { ...(c || {}) }, blocked = [];
  if (out.bpm && state.bpmLock && Math.round(out.bpm) !== state.bpm) { delete out.bpm; blocked.push({ id: "bpm", parts: ["bpm"] }); }
  if (Array.isArray(out.eliminar)) {
    out.eliminar = out.eliminar.filter((id) => {
      const t = state.tracks.find((x) => x.id === id);
      if (t && isLocked(t)) { blocked.push({ id, parts: lockedParts(t) }); return false; }
      return true;
    });
  }
  if (Array.isArray(out.pistas)) {
    out.pistas = out.pistas.filter((p) => {
      const t = state.tracks.find((x) => x.id === p.id);
      if (!t || !t.lock) return true;
      if (t.lock.all) { blocked.push({ id: p.id, parts: ["all"] }); return false; }
      const hit = changedParts(t.code, p.codigo).filter((k) => t.lock[k]);
      if (hit.length) { blocked.push({ id: p.id, parts: hit }); return false; }
      return true;
    });
  }
  return { cambios: out, blocked };
}

/** «d2 (ritmo, sonido) · BPM» para avisar de lo que no se ha aplicado. */
export function blockedText(blocked) {
  return blocked.map((b) => (b.id === "bpm" ? "BPM" : `${b.id} (${b.parts.map(partName).join(", ").toLowerCase()})`)).join(" · ");
}

/** ¿Se puede tocar la mezcla de esta pista desde un curso o una propuesta? */
export const mixLocked = (t) => !!(t && t.lock && (t.lock.all || t.lock.mezcla));

/** Fila de candados debajo de la pista. */
export function lockRowHTML(t, icon) {
  if (!t.lockOpen) return "";
  const on = (p) => (p === "all" ? !!(t.lock && t.lock.all) : !!(t.lock && (t.lock.all || t.lock[p])));
  const chip = (p) => `<button class="lk-chip${on(p) ? " on" : ""}" data-lock="${p}" ${p !== "all" && t.lock && t.lock.all ? "disabled" : ""}>${partName(p)}</button>`;
  return `<div class="lock-row"><span class="lk-ico">${icon("lock", 14)}</span><span class="lk-lbl">${L("Bloquear para Maestro:", "Lock for Maestro:")}</span>${chip("all")}${PARTS.map(chip).join("")}</div>`;
}

export function toggleLock(t, part) {
  t.lock = { ...(t.lock || {}) };
  t.lock[part] = !t.lock[part];
  if (!Object.values(t.lock).some(Boolean)) delete t.lock;
}
