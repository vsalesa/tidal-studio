import { L } from "./i18n.js";
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
    titulo: L("Yo empezaría por el pulso: un bombo que marque el paso", "I'd start with the pulse: a kick that sets the pace"),
    porque: L("El pulso es el reloj de la canción: todo lo demás se apoya en él, y es lo que hace mover el pie.", "The pulse is the song's clock: everything else leans on it, and it's what makes your foot tap."),
    concepto: L("Pulso", "Pulse"), cambios: addComp(s.tracks, pick(s.style, ["kick4", "kickhh", "dembow", "amen"])) },
  (s) => kindOf(s.tracks, "percusion").length && !has(s.tracks, /\b(cp|sn|808sd)\b/) && {
    titulo: L("Yo le añadiría palmas en el 2 y el 4", "I'd add claps on 2 and 4"),
    porque: L("Contestan al bombo: uno cae en el 'un', las palmas en el 'dos'. Ese diálogo es el backbeat, la base de casi toda la música popular.", "They answer the kick: the kick lands on 'one', the claps on 'two'. That conversation is the backbeat, the base of almost all pop music."),
    concepto: L("Backbeat", "Backbeat"), cambios: addComp(s.tracks, ["hiphop", "lofi", "dnb"].includes(s.style) ? "snare" : "clap") },
  (s) => kindOf(s.tracks, "percusion").length && !has(s.tracks, /\b(hh|oh|hh27|808hc|808oh)\b/) && {
    titulo: L("Yo metería unos hi-hats para rellenar huecos", "I'd put in some hi-hats to fill the gaps"),
    porque: L("Dividen cada tiempo en partes más pequeñas (subdivisión) y dan sensación de velocidad sin cambiar el tempo.", "They split each beat into smaller parts (subdivision) and feel faster without changing the tempo."),
    concepto: L("Subdivisión", "Subdivision"), cambios: addComp(s.tracks, pick(s.style, ["hatsoff", "hats8", "hatstrap"])) },
  (s) => kindOf(s.tracks, "percusion").length && !kindOf(s.tracks, "bajo").length && {
    titulo: L("Le falta peso: yo pondría un bajo", "It needs weight: I'd add a bass"),
    porque: L("El bajo une el ritmo con la armonía. Si suena entre los bombos, no chocan y se reparten el espacio grave.", "The bass ties rhythm to harmony. If it plays between the kicks, they don't clash and they share the low end."),
    concepto: L("Graves y groove", "Low end and groove"), cambios: addComp(s.tracks, pick(s.style, ["bass_off", "bass_roll", "bass_hh", "bass_sub"])) },
  (s) => kindOf(s.tracks, "bajo").length && !kindOf(s.tracks, "armonia").length && {
    titulo: L("Yo le daría emoción con unos acordes", "I'd give it emotion with some chords"),
    porque: L("Los acordes deciden el 'color': los menores suenan melancólicos o misteriosos; los mayores, alegres y luminosos.", "Chords decide the 'color': minor ones sound melancholic or mysterious; major ones, happy and bright."),
    concepto: L("Armonía", "Harmony"), cambios: addComp(s.tracks, pick(s.style, ["chords_min", "stabs", "rhodes", "pad", "reggae_chords"])) },
  (s) => { const c = kindOf(s.tracks, "armonia").find((t) => /'min/.test(t.code));
    return c && { titulo: L("Prueba a cambiar los acordes a mayores, a ver qué te parece", "Try switching the chords to major and see what you think"),
      porque: L("Mismo ritmo, otro color: escucha cómo pasa de melancólico a alegre. Es la diferencia entre modo menor y mayor.", "Same rhythm, different color: hear how it goes from melancholic to happy. That's the difference between minor and major."),
      concepto: L("Mayor y menor", "Major and minor"), cambios: modify(c, c.code.replace(/'min7/g, "'maj7").replace(/'min9/g, "'maj9").replace(/'min\b/g, "'maj")) }; },
  (s) => kindOf(s.tracks, "armonia").length && !kindOf(s.tracks, "melodia").length && {
    titulo: L("Ahora una melodía que se quede en la cabeza", "Now a melody that sticks in your head"),
    porque: L("La melodía es lo que se tararea. Si usa las notas de los acordes, siempre encaja.", "The melody is what you hum. If it uses the notes of the chords, it always fits."),
    concepto: L("Melodía", "Melody"), cambios: addComp(s.tracks, pick(s.style, ["arpy", "arp", "pent", "bell"])) },
  (s) => { const m = kindOf(s.tracks, "melodia").find((t) => /\bn\b|note/.test(t.code) && !/\boff\b/.test(t.code));
    return m && { titulo: L("Yo le pondría una respuesta: la misma melodía, una octava arriba y un poco después", "I'd give it an answer: the same melody, an octave up and a little later"),
      porque: L("Es la técnica de pregunta y respuesta: una frase llama y otra contesta. Da conversación a la música.", "It's call and response: one phrase calls, another answers. It gives the music a conversation."),
      concepto: L("Pregunta y respuesta", "Call and response"), cambios: modify(m, `off 0.25 (|+ n 12) $ ${m.code}`) }; },
  (s) => { const k = s.tracks.find((t) => t.kind === "percusion" && /\bbd\b|amencutup|kick/.test(t.code) && !/whenmod|every/.test(t.code));
    return s.tracks.length >= 3 && k && { titulo: L("Yo quitaría el bombo 8 compases de cada 16", "I'd drop the kick for 8 bars out of every 16"),
      porque: L("Cuando vuelve, pega el doble. Quitar y devolver cosas es el truco más usado para crear partes y 'drops'.", "When it comes back, it hits twice as hard. Taking things out and bringing them back is the most used trick for sections and 'drops'."),
      concepto: L("Contraste y estructura", "Contrast and structure"), cambios: modify(k, `whenmod 16 8 (const silence) $ ${k.code}`) }; },
  (s) => { const t = s.tracks.find((x) => ["armonia", "melodia"].includes(x.kind) && !/room/.test(x.code));
    return t && { titulo: L(`A ${t.name.toLowerCase()} le pondría reverb para darle espacio`, `I'd put reverb on ${t.name.toLowerCase()} to give it space`),
      porque: L("La reverb coloca el sonido 'más lejos', como en una sala. Lo seco queda delante y lo húmedo detrás: así se crea profundidad.", "Reverb puts the sound 'further away', like in a room. Dry sits in front and wet sits behind: that's how you create depth."),
      concepto: L("Profundidad", "Depth"), cambios: modify(t, `${t.code} # room 0.5 # size 0.8`) }; },
  (s) => { const h = s.tracks.find((t) => /\b(hh|oh)\b/.test(t.code) && !/rand|sine/.test(t.code));
    return h && { titulo: L("Yo variaría la fuerza de cada golpe de hi-hat", "I'd vary the strength of each hi-hat hit"),
      porque: L("Un batería real nunca golpea igual dos veces. Esa variación de volumen (dinámica) hace que suene humano.", "A real drummer never hits the same way twice. That volume variation (dynamics) makes it sound human."),
      concepto: L("Dinámica", "Dynamics"), cambios: modify(h, `${h.code.replace(/\s*#\s*gain\s+[\d.]+/g, "")} # gain (range 0.7 1 rand)`) }; },
  (s) => { const b = kindOf(s.tracks, "bajo").find((t) => !/lpf/.test(t.code));
    return b && { titulo: L("Yo le quitaría brillo al bajo con un filtro", "I'd take some brightness off the bass with a filter"),
      porque: L("Así no compite con los acordes y la melodía en los agudos: cada instrumento en su rango de frecuencias.", "That way it doesn't fight the chords and melody in the highs: each instrument in its own frequency range."),
      concepto: L("Espacio en frecuencias", "Frequency space"), cambios: modify(b, `${b.code} # lpf 700`) }; },
  (s) => s.tracks.length >= 4 && !s.tracks.some((t) => kindOf(s.tracks, "textura").length) && {
    titulo: L("Le añadiría una textura de fondo", "I'd add a background texture"),
    porque: L("Los sonidos de ambiente rellenan el silencio entre notas y dan una 'atmósfera' que se siente más que se oye.", "Ambient sounds fill the silence between notes and give an 'atmosphere' you feel more than hear."),
    concepto: L("Atmósfera", "Atmosphere"), cambios: addComp(s.tracks, pick(s.style, ["vinyl", "wind", "birds", "glitch"])) },
  (s) => { const p = s.tracks.find((t) => t.kind === "percusion" && !/every|whenmod/.test(t.code) && /\b(sn|cp|hh)\b/.test(t.code));
    return s.tracks.length >= 3 && p && { titulo: L("Yo metería un redoble cada 4 compases", "I'd add a drum fill every 4 bars"),
      porque: L("Avisa al oído de que empieza una nueva frase. La música suele ir en bloques de 4 y 8 compases.", "It tells the ear a new phrase is starting. Music usually comes in blocks of 4 and 8 bars."),
      concepto: L("Frases de 4 compases", "4-bar phrases"), cambios: modify(p, `every 4 (fast 2) $ ${p.code}`) }; },
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
  { id: "s", nombre: L('Sonidos: s "..."', 'Sounds: s "..."'), re: /\bs\s+"/ },
  { id: "silencio", nombre: L("Silencios: ~", "Rests: ~"), re: /"[^"]*~/ },
  { id: "repetir", nombre: L("Repetir: *", "Repeat: *"), re: /"[^"]*\*\d/ },
  { id: "subdividir", nombre: L("Subdividir: [ ]", "Subdivide: [ ]"), re: /"[^"]*\[/ },
  { id: "alternar", nombre: L("Alternar: < >", "Alternate: < >"), re: /"[^"]*</ },
  { id: "notas", nombre: L("Notas: n", "Notes: n"), re: /\b(n|note)\s+[("]/ },
  { id: "acordes", nombre: L("Acordes: c'min7", "Chords: c'min7"), re: /'(min|maj|dom)/ },
  { id: "efectos", nombre: L("Efectos: #", "Effects: #"), re: /#\s*\w/ },
  { id: "dolar", nombre: L("Aplicar: $", "Apply: $"), re: /\$/ },
  { id: "tiempo", nombre: L("Cuándo: every / whenmod / mask", "When: every / whenmod / mask"), re: /\b(every|whenmod|mask)\b/ },
  { id: "azar", nombre: L("Azar: ? rand sometimes", "Randomness: ? rand sometimes"), re: /\?|\brand\b|irand|sometimes|degradeBy/ },
  { id: "capas", nombre: L("Capas: stack y ,", "Layers: stack and ,"), re: /\bstack\b|"[^"]*,/ },
];
export const MUSIC_CONCEPTS = [L("Pulso", "Pulse"), L("Backbeat", "Backbeat"), L("Subdivisión", "Subdivision"), L("Graves y groove", "Low end and groove"), L("Armonía", "Harmony"), L("Mayor y menor", "Major and minor"), L("Melodía", "Melody"),
  L("Pregunta y respuesta", "Call and response"), L("Contraste y estructura", "Contrast and structure"), L("Profundidad", "Depth"), L("Dinámica", "Dynamics"), L("Espacio en frecuencias", "Frequency space"), L("Atmósfera", "Atmosphere"), L("Frases de 4 compases", "4-bar phrases")];

export function retoFor(comp) {
  const r = {
    percusion: L("Reto: cambia un número después de * (por ejemplo *4 por *8) y escucha cómo cambia el ritmo.", "Challenge: change a number after * (for example *4 to *8) and hear how the rhythm changes."),
    bajo: L("Reto: cambia una nota del bajo (c3 por e3 o g2) y escucha si suena más alegre o más oscuro.", "Challenge: change a bass note (c3 to e3 or g2) and hear whether it sounds happier or darker."),
    armonia: L("Reto: cambia un acorde 'min7 por 'maj7 y compara cómo cambia la emoción.", "Challenge: change a 'min7 chord to 'maj7 and compare how the emotion changes."),
    melodia: L("Reto: cambia el orden de las notas y escucha si te gusta más.", "Challenge: change the order of the notes and hear if you like it more."),
    textura: L("Reto: sube o baja el número de # gain para que se oiga más o menos.", "Challenge: raise or lower the # gain number so it's louder or quieter."),
    efecto: L("Reto: cambia el número del efecto (por ejemplo 0.4 por 0.8) y escucha la diferencia.", "Challenge: change the effect's number (for example 0.4 to 0.8) and hear the difference."),
    estructura: L("Reto: cambia el primer número (4 u 8) por otro y fíjate cuándo ocurre el cambio.", "Challenge: change the first number (4 or 8) to another and notice when the change happens."),
  };
  return r[comp.cat] || "";
}
export { COMPONENTS };
