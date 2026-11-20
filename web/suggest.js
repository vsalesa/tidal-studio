// Ideas de Maestro sin IA: miran tu canción y proponen algo, como un productor a tu lado.
// Cada idea enseña un concepto musical. Devuelven cambios en el mismo formato que la IA.
import { COMPONENTS, byId } from "./catalog.js";

const has = (tracks, re) => tracks.some((t) => re.test(t.code));
const kindOf = (tracks, k) => tracks.filter((t) => t.kind === k);
const freeId = (tracks) => { for (let i = 1; i <= 12; i++) if (!tracks.find((t) => t.id === "d" + i)) return "d" + i; return null; };

function addComp(tracks, compId, style) {
  const c = byId[compId];
  const id = freeId(tracks);
  if (!c || !id) return null;
  return { pistas: [{ id, nombre: c.nombre, tipo: c.cat, codigo: c.codigo }] };
}
function modify(track, code) { return { pistas: [{ id: track.id, nombre: track.name, tipo: track.kind, codigo: code }] }; }
const pick = (style, ids) => ids.find((id) => byId[id].estilos.includes(style)) || ids[0];

const RULES = [
  (s) => !kindOf(s.tracks, "percusion").length && {
    titulo: "Yo empezaría por el pulso: un bombo que marque el paso",
    porque: "El pulso es el reloj de la canción: todo lo demás se apoya en él, y es lo que hace mover el pie.",
    concepto: "Pulso", cambios: addComp(s.tracks, pick(s.style, ["kick4", "kickhh", "dembow", "amen"])) },
  (s) => kindOf(s.tracks, "percusion").length && !has(s.tracks, /\b(cp|sn|808sd)\b/) && {
    titulo: "Yo le añadiría palmas en el 2 y el 4",
    porque: "Contestan al bombo: uno cae en el 'un', las palmas en el 'dos'. Ese diálogo es el backbeat, la base de casi toda la música popular.",
    concepto: "Backbeat", cambios: addComp(s.tracks, ["hiphop", "lofi", "dnb"].includes(s.style) ? "snare" : "clap") },
  (s) => kindOf(s.tracks, "percusion").length && !has(s.tracks, /\b(hh|oh|hh27|808hc|808oh)\b/) && {
    titulo: "Yo metería unos hi-hats para rellenar huecos",
    porque: "Dividen cada tiempo en partes más pequeñas (subdivisión) y dan sensación de velocidad sin cambiar el tempo.",
    concepto: "Subdivisión", cambios: addComp(s.tracks, pick(s.style, ["hatsoff", "hats8", "hatstrap"])) },
  (s) => kindOf(s.tracks, "percusion").length && !kindOf(s.tracks, "bajo").length && {
    titulo: "Le falta peso: yo pondría un bajo",
    porque: "El bajo une el ritmo con la armonía. Si suena entre los bombos, no chocan y se reparten el espacio grave.",
    concepto: "Graves y groove", cambios: addComp(s.tracks, pick(s.style, ["bass_off", "bass_roll", "bass_hh", "bass_sub"])) },
  (s) => kindOf(s.tracks, "bajo").length && !kindOf(s.tracks, "armonia").length && {
    titulo: "Yo le daría emoción con unos acordes",
    porque: "Los acordes deciden el 'color': los menores suenan melancólicos o misteriosos; los mayores, alegres y luminosos.",
    concepto: "Armonía", cambios: addComp(s.tracks, pick(s.style, ["chords_min", "stabs", "rhodes", "pad", "reggae_chords"])) },
  (s) => { const c = kindOf(s.tracks, "armonia").find((t) => /'min/.test(t.code));
    return c && { titulo: "Prueba a cambiar los acordes a mayores, a ver qué te parece",
      porque: "Mismo ritmo, otro color: escucha cómo pasa de melancólico a alegre. Es la diferencia entre modo menor y mayor.",
      concepto: "Mayor y menor", cambios: modify(c, c.code.replace(/'min7/g, "'maj7").replace(/'min9/g, "'maj9").replace(/'min\b/g, "'maj")) }; },
  (s) => kindOf(s.tracks, "armonia").length && !kindOf(s.tracks, "melodia").length && {
    titulo: "Ahora una melodía que se quede en la cabeza",
    porque: "La melodía es lo que se tararea. Si usa las notas de los acordes, siempre encaja.",
    concepto: "Melodía", cambios: addComp(s.tracks, pick(s.style, ["arpy", "arp", "pent", "bell"])) },
  (s) => { const m = kindOf(s.tracks, "melodia").find((t) => /\bn\b|note/.test(t.code) && !/\boff\b/.test(t.code));
    return m && { titulo: "Yo le pondría una respuesta: la misma melodía, una octava arriba y un poco después",
      porque: "Es la técnica de pregunta y respuesta: una frase llama y otra contesta. Da conversación a la música.",
      concepto: "Pregunta y respuesta", cambios: modify(m, `off 0.25 (|+ n 12) $ ${m.code}`) }; },
  (s) => { const k = s.tracks.find((t) => t.kind === "percusion" && /\bbd\b|amencutup|kick/.test(t.code) && !/whenmod|every/.test(t.code));
    return s.tracks.length >= 3 && k && { titulo: "Yo quitaría el bombo 8 compases de cada 16",
      porque: "Cuando vuelve, pega el doble. Quitar y devolver cosas es el truco más usado para crear partes y 'drops'.",
      concepto: "Contraste y estructura", cambios: modify(k, `whenmod 16 8 (const silence) $ ${k.code}`) }; },
  (s) => { const t = s.tracks.find((x) => ["armonia", "melodia"].includes(x.kind) && !/room/.test(x.code));
    return t && { titulo: `A ${t.name.toLowerCase()} le pondría reverb para darle espacio`,
      porque: "La reverb coloca el sonido 'más lejos', como en una sala. Lo seco queda delante y lo húmedo detrás: así se crea profundidad.",
      concepto: "Profundidad", cambios: modify(t, `${t.code} # room 0.5 # size 0.8`) }; },
  (s) => { const h = s.tracks.find((t) => /\b(hh|oh)\b/.test(t.code) && !/rand|sine/.test(t.code));
    return h && { titulo: "Yo variaría la fuerza de cada golpe de hi-hat",
      porque: "Un batería real nunca golpea igual dos veces. Esa variación de volumen (dinámica) hace que suene humano.",
      concepto: "Dinámica", cambios: modify(h, `${h.code.replace(/\s*#\s*gain\s+[\d.]+/g, "")} # gain (range 0.7 1 rand)`) }; },
  (s) => { const b = kindOf(s.tracks, "bajo").find((t) => !/lpf/.test(t.code));
    return b && { titulo: "Yo le quitaría brillo al bajo con un filtro",
      porque: "Así no compite con los acordes y la melodía en los agudos: cada instrumento en su rango de frecuencias.",
      concepto: "Espacio en frecuencias", cambios: modify(b, `${b.code} # lpf 700`) }; },
  (s) => s.tracks.length >= 4 && !s.tracks.some((t) => kindOf(s.tracks, "textura").length) && {
    titulo: "Le añadiría una textura de fondo",
    porque: "Los sonidos de ambiente rellenan el silencio entre notas y dan una 'atmósfera' que se siente más que se oye.",
    concepto: "Atmósfera", cambios: addComp(s.tracks, pick(s.style, ["vinyl", "wind", "birds", "glitch"])) },
  (s) => { const p = s.tracks.find((t) => t.kind === "percusion" && !/every|whenmod/.test(t.code) && /\b(sn|cp|hh)\b/.test(t.code));
    return s.tracks.length >= 3 && p && { titulo: "Yo metería un redoble cada 4 compases",
      porque: "Avisa al oído de que empieza una nueva frase. La música suele ir en bloques de 4 y 8 compases.",
      concepto: "Frases de 4 compases", cambios: modify(p, `every 4 (fast 2) $ ${p.code}`) }; },
];

let rotation = 0;
export function localSuggestions(state, count = 2, next = false) {
  if (next) rotation++;
  const s = { tracks: state.tracks, style: state.style || "house" };
  const all = RULES.map((r) => r(s)).filter((x) => x && x.cambios);
  if (!all.length) return [];
  const out = [];
  for (let i = 0; i < Math.min(count, all.length); i++) out.push(all[(rotation + i) % all.length]);
  return out;
}

// Conceptos que el alumno va aprendiendo (se detectan en su código)
export const CODE_CONCEPTS = [
  { id: "s", nombre: 'Sonidos: s "..."', re: /\bs\s+"/ },
  { id: "silencio", nombre: "Silencios: ~", re: /"[^"]*~/ },
  { id: "repetir", nombre: "Repetir: *", re: /"[^"]*\*\d/ },
  { id: "subdividir", nombre: "Subdividir: [ ]", re: /"[^"]*\[/ },
  { id: "alternar", nombre: "Alternar: < >", re: /"[^"]*</ },
  { id: "notas", nombre: "Notas: n", re: /\b(n|note)\s+[("]/ },
  { id: "acordes", nombre: "Acordes: c'min7", re: /'(min|maj|dom)/ },
  { id: "efectos", nombre: "Efectos: #", re: /#\s*\w/ },
  { id: "dolar", nombre: "Aplicar: $", re: /\$/ },
  { id: "tiempo", nombre: "Cuándo: every / whenmod / mask", re: /\b(every|whenmod|mask)\b/ },
  { id: "azar", nombre: "Azar: ? rand sometimes", re: /\?|\brand\b|irand|sometimes|degradeBy/ },
  { id: "capas", nombre: "Capas: stack y ,", re: /\bstack\b|"[^"]*,/ },
];
export const MUSIC_CONCEPTS = ["Pulso", "Backbeat", "Subdivisión", "Graves y groove", "Armonía", "Mayor y menor", "Melodía",
  "Pregunta y respuesta", "Contraste y estructura", "Profundidad", "Dinámica", "Espacio en frecuencias", "Atmósfera", "Frases de 4 compases"];

export function retoFor(comp) {
  const r = {
    percusion: "Reto: cambia un número después de * (por ejemplo *4 por *8) y escucha cómo cambia el ritmo.",
    bajo: "Reto: cambia una nota del bajo (c3 por e3 o g2) y escucha si suena más alegre o más oscuro.",
    armonia: "Reto: cambia un acorde 'min7 por 'maj7 y compara cómo cambia la emoción.",
    melodia: "Reto: cambia el orden de las notas y escucha si te gusta más.",
    textura: "Reto: sube o baja el número de # gain para que se oiga más o menos.",
    efecto: "Reto: cambia el número del efecto (por ejemplo 0.4 por 0.8) y escucha la diferencia.",
    estructura: "Reto: cambia el primer número (4 u 8) por otro y fíjate cuándo ocurre el cambio.",
  };
  return r[comp.cat] || "";
}
export { COMPONENTS };
