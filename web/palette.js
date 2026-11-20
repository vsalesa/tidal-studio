// Paleta de código: bloques de Tidal organizados por lo que quieres conseguir, de fácil (1) a avanzado (3).
// Cada bloque transforma el código de la pista seleccionada. Pensada para que más adelante
// cada bloque tenga deslizadores y selectores (ver ROADMAP.md).
import { L } from "./i18n.js";

// Aplica una función al contenido de la primera mini-notación de sonido o notas: s "…", n "…", note "…"
const firstMini = (code) => code.match(/\b(s|sound|n|note)\s+"([^"]*)"/);
function onMini(fn) {
  return (code) => {
    const m = firstMini(code);
    if (!m) return null;
    const out = fn(m[2].trim());
    return out == null ? null : code.replace(m[0], `${m[1]} "${out}"`);
  };
}
// Separa la mini-notación en pasos de primer nivel (sin romper [ ] ni < >)
function steps(str) {
  const out = []; let depth = 0, cur = "";
  for (const ch of str) {
    if ("[<{(".includes(ch)) depth++;
    if ("]>})".includes(ch)) depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const plainWord = (w) => /^[a-z0-9:'.~-]+([*\/]\d+)?$/i.test(w);
const base = (w) => w.replace(/[*\/]\d+$/, "");
const firstPlain = (st) => st.findIndex(plainWord);
const lastPlain = (st) => { for (let i = st.length - 1; i >= 0; i--) if (plainWord(st[i]) && st[i] !== "~") return i; return -1; };
const editStep = (pick, f) => onMini((s) => { const st = steps(s); const i = pick(st); if (i < 0) return null; st[i] = f(st[i]); return st.join(" "); });

const suffix = (sfx) => (code) => {
  let c = code;
  for (const m of sfx.matchAll(/#\s*(\w+)\s/g)) c = c.replace(new RegExp(`\\s*#\\s*${m[1]}\\s+(-?[\\d.]+|"[^"]*"|\\([^)]*\\)|\\w+)(?![\\w(])`, "g"), "");
  return c + sfx;
};
const wrap = (w) => (code) => `${w} $ ${code}`;

export const GROUPS = [
  { id: "ritmo", es: "Ritmo", en: "Rhythm", hint: ["Dentro de las comillas: la mini-notación.", "Inside the quotes: the mini-notation."] },
  { id: "sonido", es: "Sonido", en: "Sound", hint: ["Qué suena y cómo se reproduce.", "What plays and how it's played back."] },
  { id: "notas", es: "Notas y armonía", en: "Notes and harmony", hint: ["Alturas, escalas y acordes.", "Pitches, scales and chords."] },
  { id: "efectos", es: "Efectos", en: "Effects", hint: ["Con «#»: cambian el carácter del sonido.", "With «#»: they change the sound's character."] },
  { id: "tiempo", es: "Tiempo y estructura", en: "Time and structure", hint: ["Con «$»: transforman el patrón entero.", "With «$»: they transform the whole pattern."] },
  { id: "azar", es: "Azar y variación", en: "Chance and variation", hint: ["Para que no se repita siempre igual.", "So it doesn't always repeat the same way."] },
];

// lvl: 1 = primeros pasos, 2 = intermedio, 3 = avanzado
export const BLOCKS = [
  // ---- Ritmo (mini-notación)
  { g: "ritmo", lvl: 1, code: "~", es: ["Silencio", "Añade un hueco al final del patrón."], en: ["Rest", "Adds a gap at the end of the pattern."], apply: onMini((s) => `${s} ~`) },
  { g: "ritmo", lvl: 1, code: "bd*2", es: ["Repetir", "El primer sonido suena dos veces en su hueco."], en: ["Repeat", "The first sound plays twice in its slot."], apply: editStep(firstPlain, (w) => /\*\d+$/.test(w) ? w.replace(/\*(\d+)$/, (_, n) => `*${n * 2}`) : `${w}*2`) },
  { g: "ritmo", lvl: 1, code: "[bd bd]", es: ["Subdividir", "Mete dos golpes donde antes había uno."], en: ["Subdivide", "Fits two hits where there was one."], apply: editStep(firstPlain, (w) => `[${w} ${w}]`) },
  { g: "ritmo", lvl: 2, code: "<sn cp>", es: ["Alternar", "El último sonido cambia en cada ciclo."], en: ["Alternate", "The last sound changes every cycle."], apply: editStep(lastPlain, (w) => `<${w} ${base(w).includes(":") ? base(w).split(":")[0] : base(w) + ":1"}>`) },
  { g: "ritmo", lvl: 2, code: "bd bd", es: ["Duplicar paso", "Repite el primer paso a su lado: el compás se divide en más partes."], en: ["Duplicate step", "Repeats the first step next to it: the bar splits into more parts."], apply: editStep(firstPlain, (w) => `${w} ${w}`) },
  { g: "ritmo", lvl: 2, code: "hh*8, …", es: ["Capa encima", "Añade hi-hats a la vez con una coma."], en: ["Layer on top", "Adds hi-hats at the same time with a comma."], only: /\b(s|sound)\s+"/, apply: onMini((s) => `[${s}, hh*8]`) },
  { g: "ritmo", lvl: 3, code: "bd(3,8)", es: ["Ritmo euclídeo", "Reparte 3 golpes en 8 huecos lo más igualados posible."], en: ["Euclidean rhythm", "Spreads 3 hits over 8 slots as evenly as possible."], apply: editStep(firstPlain, (w) => `${base(w)}(3,8)`) },
  // ---- Sonido
  { g: "sonido", lvl: 1, code: "bd:3", es: ["Otra variante", "Cada sonido tiene variantes numeradas: :0, :1, :2…"], en: ["Another variant", "Each sound has numbered variants: :0, :1, :2…"], only: /\b(s|sound)\s+"/, apply: editStep(firstPlain, (w) => w.includes(":") ? w.replace(/:(\d+)/, (_, n) => `:${+n + 1}`) : `${w}:3`) },
  { g: "sonido", lvl: 1, code: "# speed 2", es: ["Más agudo", "Reproduce el sample al doble de velocidad: una octava arriba."], en: ["Higher", "Plays the sample at double speed: an octave up."], apply: suffix(" # speed 2") },
  { g: "sonido", lvl: 2, code: "# speed -1", es: ["Al revés", "Velocidad negativa: el sample suena hacia atrás."], en: ["Backwards", "Negative speed: the sample plays in reverse."], apply: suffix(" # speed -1") },
  { g: "sonido", lvl: 2, code: "# legato 0.3", es: ["Notas cortas", "Cada nota dura un 30 % de su hueco: más seco y rítmico."], en: ["Short notes", "Each note lasts 30% of its slot: drier and more rhythmic."], apply: suffix(" # legato 0.3") },
  { g: "sonido", lvl: 3, code: "# cut 1", es: ["Cortar la cola", "Cada golpe corta al anterior, como un hi-hat que se cierra."], en: ["Cut the tail", "Each hit cuts off the previous one, like a closing hi-hat."], apply: suffix(" # cut 1") },
  // ---- Notas y armonía
  { g: "notas", lvl: 1, code: "|+ n 12", es: ["Una octava arriba", "Suma 12 semitonos a todas las notas."], en: ["An octave up", "Adds 12 semitones to every note."], only: /\b(n|note)\s+/, apply: wrap("(|+ n 12)") },
  { g: "notas", lvl: 1, code: "|- n 12", es: ["Una octava abajo", "Resta 12 semitonos: más grave."], en: ["An octave down", "Subtracts 12 semitones: lower."], only: /\b(n|note)\s+/, apply: wrap("(|- n 12)") },
  { g: "notas", lvl: 2, code: "|+ n 5", es: ["Transportar", "Sube todo 5 semitonos: la misma melodía en otra tonalidad."], en: ["Transpose", "Raises everything 5 semitones: same melody in another key."], only: /\b(n|note)\s+/, apply: wrap("(|+ n 5)") },
  { g: "notas", lvl: 2, code: "arp \"updown\"", es: ["Arpegiar", "Toca las notas de cada acorde una detrás de otra."], en: ["Arpeggiate", "Plays each chord's notes one after another."], only: /'/, apply: wrap('arp "<up updown>"') },
  { g: "notas", lvl: 3, code: "off 0.25 (|+ n 7)", es: ["Eco armónico", "Una copia un poco después y una quinta arriba."], en: ["Harmonic echo", "A copy a little later and a fifth up."], only: /\b(n|note)\s+/, apply: wrap("off 0.25 (|+ n 7)") },
  // ---- Efectos
  { g: "efectos", lvl: 1, code: "# gain 0.8", es: ["Volumen", "1 es normal: menos, más flojo; más, más fuerte."], en: ["Volume", "1 is normal: lower is quieter, higher is louder."], apply: suffix(" # gain 0.8") },
  { g: "efectos", lvl: 1, code: "# room 0.5", es: ["Reverb", "Lo coloca en una sala."], en: ["Reverb", "Places it in a room."], apply: suffix(" # room 0.5 # size 0.8") },
  { g: "efectos", lvl: 1, code: "# lpf 1000", es: ["Filtro grave", "Quita agudos: más apagado."], en: ["Low-pass filter", "Removes highs: more muffled."], apply: suffix(" # lpf 1000") },
  { g: "efectos", lvl: 2, code: "# delay 0.4", es: ["Eco", "Repite cada nota más flojito."], en: ["Echo", "Repeats each note more softly."], apply: suffix(" # delay 0.4 # delaytime 0.375 # delayfeedback 0.4") },
  { g: "efectos", lvl: 2, code: "# hpf 600", es: ["Filtro agudo", "Quita graves: suena fino."], en: ["High-pass filter", "Removes lows: sounds thin."], apply: suffix(" # hpf 600") },
  { g: "efectos", lvl: 2, code: "# pan sine", es: ["Paneo que se mueve", "Viaja de un altavoz al otro."], en: ["Moving pan", "Travels from one speaker to the other."], apply: suffix(" # pan sine") },
  { g: "efectos", lvl: 3, code: "# crush 6", es: ["8 bits", "Reduce la calidad: suena a videoconsola."], en: ["8-bit", "Lowers the quality: sounds like a video game."], apply: suffix(" # crush 6") },
  { g: "efectos", lvl: 3, code: "# lpf (range …)", es: ["Filtro que se mueve", "El filtro se abre y cierra solo cada 8 compases."], en: ["Moving filter", "The filter opens and closes by itself every 8 bars."], apply: suffix(" # lpf (range 300 3000 $ slow 8 sine)") },
  // ---- Tiempo y estructura
  { g: "tiempo", lvl: 1, code: "fast 2", es: ["Más rápido", "El patrón suena dos veces por compás."], en: ["Faster", "The pattern plays twice per bar."], apply: wrap("fast 2") },
  { g: "tiempo", lvl: 1, code: "slow 2", es: ["Más lento", "El patrón dura dos compases."], en: ["Slower", "The pattern lasts two bars."], apply: wrap("slow 2") },
  { g: "tiempo", lvl: 2, code: "every 4 (fast 2)", es: ["Redoble cada 4", "Cada 4 compases va el doble de rápido."], en: ["Fill every 4", "Every 4 bars it goes twice as fast."], apply: wrap("every 4 (fast 2)") },
  { g: "tiempo", lvl: 2, code: "mask \"<t f>\"", es: ["Un compás sí, otro no", "t suena, f calla: un interruptor por compás."], en: ["One bar on, one off", "t plays, f is silent: a switch per bar."], apply: wrap('mask "<t f>"') },
  { g: "tiempo", lvl: 2, code: "swingBy (1/3) 4", es: ["Swing", "Retrasa una de cada dos notas: el ritmo «cojea» con gracia."], en: ["Swing", "Delays every other note: the rhythm «limps» gracefully."], apply: wrap("swingBy (1/3) 4") },
  { g: "tiempo", lvl: 3, code: "whenmod 8 6 rev", es: ["Final al revés", "En los compases 6 y 7 de cada 8 suena al revés."], en: ["Reversed ending", "On bars 6 and 7 of every 8 it plays backwards."], apply: wrap("whenmod 8 6 rev") },
  { g: "tiempo", lvl: 3, code: "iter 4", es: ["Rotar", "Cada compás empieza un paso más tarde."], en: ["Rotate", "Each bar starts one step later."], apply: wrap("iter 4") },
  { g: "tiempo", lvl: 3, code: "ply 2", es: ["Duplicar cada golpe", "Cada evento se repite dentro de su hueco."], en: ["Double each hit", "Each event repeats inside its slot."], apply: wrap("ply 2") },
  // ---- Azar
  { g: "azar", lvl: 1, code: "?", es: ["A veces no", "El último sonido sonará solo la mitad de las veces."], en: ["Sometimes not", "The last sound will play only half the time."], apply: editStep(lastPlain, (w) => `${w}?`) },
  { g: "azar", lvl: 1, code: "# gain (range …)", es: ["Fuerza humana", "Cada golpe con un volumen un poco distinto."], en: ["Human feel", "Each hit with a slightly different volume."], apply: suffix(" # gain (range 0.8 1 rand)") },
  { g: "azar", lvl: 2, code: "degradeBy 0.3", es: ["Quitar al azar", "Quita un 30 % de las notas al azar."], en: ["Remove at random", "Removes 30% of the notes at random."], apply: wrap("degradeBy 0.3") },
  { g: "azar", lvl: 2, code: "sometimes (# speed 2)", es: ["Sorpresa aguda", "A veces suena una octava arriba."], en: ["High surprise", "Sometimes it plays an octave up."], apply: wrap("sometimes (# speed 2)") },
  { g: "azar", lvl: 3, code: "jux rev", es: ["Estéreo al revés", "Un oído normal y el otro al revés."], en: ["Reversed stereo", "One ear normal, the other backwards."], apply: wrap("jux rev") },
  { g: "azar", lvl: 3, code: "rarely (fast 2)", es: ["Redoble raro", "De vez en cuando (pocas veces) se acelera."], en: ["Rare fill", "Once in a while it speeds up."], apply: wrap("rarely (fast 2)") },
].map((b, i) => ({ ...b, id: "b" + i }));

export const blockName = (b) => L(b.es[0], b.en[0]);
export const blockDesc = (b) => L(b.es[1], b.en[1]);
export const groupName = (g) => L(g.es, g.en);
export const LEVELS = [null, L("Primeros pasos", "First steps"), L("Intermedio", "Intermediate"), L("Avanzado", "Advanced")];

// Devuelve el código nuevo o un motivo por el que no se puede aplicar
export function applyBlock(block, code) {
  if (block.only && !block.only.test(code)) return { error: L("Este bloque necesita una pista con notas o sonidos que encajen (por ejemplo, para notas, una pista con n \"…\").", "This block needs a track with matching notes or sounds (for notes, e.g., a track with n \"…\").") };
  const out = block.apply(code);
  if (!out || out === code) return { error: L("No he encontrado dónde aplicarlo en esta pista: necesita unas comillas con sonidos o notas.", "I couldn't find where to apply it on this track: it needs quotes with sounds or notes.") };
  return { code: out };
}
