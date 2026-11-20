// Idioma de la interfaz: español (por defecto) o inglés.
// Se guarda en localStorage; al cambiarlo se recarga la página para que todo se vuelva a construir.
const KEY = "tidal-studio-lang";
function detect() {
  try { const v = localStorage.getItem(KEY); if (v === "es" || v === "en") return v; } catch {}
  return /^es\b/i.test(navigator.language || "es") ? "es" : "en";
}
export const LANG = detect();
document.documentElement.lang = LANG;
export const EN = LANG === "en";
// L("texto en español", "English text"): devuelve el del idioma activo.
export const L = (es, en) => (EN && en != null ? en : es);
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch {}
  location.reload();
}
// Sobrescribe campos de una lista de objetos con su traducción: apply(list, { id: { campo: "…" } })
export function applyEN(list, table, key = "id") {
  if (!EN) return;
  for (const o of list) Object.assign(o, table[o[key]] || {});
}
