import { L } from "./i18n.js";
// Explicador local del código Tidal (funciona sin IA).
// Recorre el código, reconoce funciones, efectos y la "mini-notación" de dentro de las comillas,
// y devuelve una lista de { fragmento, explicacion } para un principiante.

export const SOUNDS = {
  bd: L("bombo", "kick drum"), kick: L("bombo", "kick drum"), clubkick: L("bombo de club", "club kick"), "808bd": L("bombo de caja de ritmos 808", "808 drum machine kick"),
  sn: L("caja (el 'chas')", "snare (the 'crack')"), "808sd": L("caja de 808", "808 snare"), cp: L("palmada", "handclap"), hh: L("hi-hat cerrado (platillo corto)", "closed hi-hat (short cymbal)"),
  hh27: L("hi-hat suave", "soft hi-hat"), oh: L("hi-hat abierto (platillo largo)", "open hi-hat (long cymbal)"), ho: L("hi-hat abierto", "open hi-hat"), "808oh": L("hi-hat abierto de 808", "808 open hi-hat"),
  "808hc": L("hi-hat cerrado de 808", "808 closed hi-hat"), cr: L("platillo crash", "crash cymbal"), rm: L("rimshot (golpe en el aro)", "rimshot (hit on the rim)"),
  lt: L("tom grave", "low tom"), mt: L("tom medio", "mid tom"), ht: L("tom agudo", "high tom"), perc: L("percusión variada", "assorted percussion"), tabla: L("tabla india", "Indian tabla"),
  amencutup: L("el break 'amen' cortado en 32 trozos", "the 'amen' break cut into 32 pieces"), breaks125: L("un break de batería a 125 BPM", "a drum break at 125 BPM"),
  bass: L("sample de bajo", "bass sample"), bass1: L("sample de bajo", "bass sample"), bass3: L("sample de bajo", "bass sample"), jvbass: L("bajo de sintetizador", "synth bass"),
  arpy: L("sonido de arpa/pluck afinado", "tuned harp/pluck sound"), pluck: L("cuerda pulsada", "plucked string"), gtr: L("guitarra", "guitar"), casio: L("teclado Casio", "Casio keyboard"),
  pad: L("pad (sonido largo)", "pad (long sound)"), padlong: L("pad muy largo", "very long pad"), wind: L("viento", "wind"), birds: L("pájaros", "birds"), space: L("sonidos espaciales", "space sounds"),
  glitch: L("ruidos digitales", "digital noises"), noise: L("ruido", "noise"), industrial: L("golpes metálicos", "metallic hits"),
  superpiano: L("sintetizador de piano", "piano synth"), supersaw: L("sintetizador 'sierra' (brillante y gordo)", "'saw' synth (bright and fat)"),
  superpwm: L("sintetizador de onda cuadrada variable (bajos redondos)", "variable square-wave synth (round basses)"), supersquare: L("sintetizador de onda cuadrada", "square-wave synth"),
  superhammond: L("órgano Hammond", "Hammond organ"), superchip: L("sonido de videoconsola de 8 bits", "8-bit video game sound"), supergong: L("gong / campana", "gong / bell"),
  superfm: L("sintetizador FM", "FM synth"), superhoover: L("sintetizador 'hoover' rave", "rave 'hoover' synth"), supermandolin: L("mandolina", "mandolin"),
  supertrumpet: L("trompeta (sintetizador de Tidal Studio)", "trumpet (Tidal Studio synth)"),
  sawtooth: L("onda de diente de sierra (brillante, zumbona)", "sawtooth wave (bright, buzzy)"), saw: L("onda de diente de sierra", "sawtooth wave"),
  square: L("onda cuadrada (hueca, de videojuego)", "square wave (hollow, video-game)"), triangle: L("onda triangular (suave)", "triangle wave (soft)"),
  tri: L("onda triangular (suave)", "triangle wave (soft)"), pulse: L("onda de pulso (voice cambia la anchura)", "pulse wave (voice sets the width)"),
  sinewave: L("onda senoidal pura (la más suave)", "pure sine wave (the softest)"),
};

export const FUNCS = [
  [/^s$|^sound$/, L("elige QUÉ suena: el nombre del sonido o sample que va entre comillas.", "chooses WHAT plays: the name of the sound or sample in quotes.")],
  [/^n$/, L("elige la NOTA (en sintetizadores) o la variante del sample (n 0, n 1…).", "chooses the NOTE (on synths) or the sample variant (n 0, n 1…).")],
  [/^note$/, L("cambia la afinación del sonido a la nota indicada.", "tunes the sound to the given note.")],
  [/^stack$/, L("pone varios patrones a sonar a la vez, uno encima de otro.", "plays several patterns at once, one on top of another.")],
  [/^every$/, L("cada N ciclos (compases) aplica la transformación de los paréntesis.", "every N cycles (bars) applies the transformation in brackets.")],
  [/^whenmod$/, L("cuenta en bloques: 'whenmod 8 6' = en los compases 6 y 7 de cada 8 aplica el cambio.", "counts in blocks: 'whenmod 8 6' = applies the change on bars 6 and 7 of every 8.")],
  [/^fast$/, L("acelera el patrón (fast 2 = el doble de rápido).", "speeds up the pattern (fast 2 = twice as fast).")],
  [/^slow$/, L("ralentiza el patrón (slow 2 = dura el doble).", "slows down the pattern (slow 2 = lasts twice as long).")],
  [/^jux$/, L("aplica un cambio solo en el altavoz derecho; el izquierdo queda igual. Crea estéreo.", "applies a change only to the right speaker; the left stays the same. Creates stereo.")],
  [/^rev$/, L("da la vuelta al patrón: suena de atrás hacia delante.", "reverses the pattern: it plays back to front.")],
  [/^degradeBy$/, L("quita notas al azar (0.3 = quita un 30 %).", "removes notes at random (0.3 = removes 30%).")],
  [/^sometimesBy$/, L("a veces, con la probabilidad indicada, aplica el cambio.", "sometimes, with the given probability, applies the change.")],
  [/^sometimes$/, L("la mitad de las veces aplica el cambio.", "applies the change half of the time.")],
  [/^rarely$/, L("pocas veces aplica el cambio.", "rarely applies the change.")],
  [/^often$/, L("muchas veces aplica el cambio.", "often applies the change.")],
  [/^arp$/, L("arpegia: toca las notas de cada acorde una detrás de otra ('up' sube, 'down' baja, 'updown' sube y baja).", "arpeggiates: plays each chord's notes one after another ('up' rises, 'down' falls, 'updown' rises and falls).")],
  [/^scale$/, L("convierte números en notas de una escala (minPent, major, minor…), así nunca desafina.", "turns numbers into notes of a scale (minPent, major, minor…), so it never sounds off.")],
  [/^irand$/, L("un número entero al azar entre 0 y el número indicado.", "a random whole number between 0 and the given number.")],
  [/^segment$/, L("divide el ciclo en N trozos iguales (para que lo aleatorio tenga ritmo).", "splits the cycle into N equal pieces (so randomness has a rhythm).")],
  [/^range$/, L("convierte una onda que va de 0 a 1 en valores entre los dos números.", "turns a wave going from 0 to 1 into values between the two numbers.")],
  [/^sine$/, L("una onda suave que sube y baja (para movimientos lentos).", "a smooth wave that rises and falls (for slow movements).")],
  [/^rand$/, L("un valor al azar diferente en cada golpe.", "a different random value on each hit.")],
  [/^echo$/, L("repite cada sonido: cuántas veces, cada cuánto y cuánto baja el volumen.", "repeats each sound: how many times, how often and how much quieter.")],
  [/^off$/, L("copia el patrón desplazado un poco en el tiempo, y le aplica un cambio.", "copies the pattern shifted a little in time, and applies a change to it.")],
  [/^const$/, L("sustituye el patrón por otra cosa; 'const silence' = silencio.", "replaces the pattern with something else; 'const silence' = silence.")],
  [/^silence$/, L("nada, silencio.", "nothing, silence.")],
  [/^chop$/, L("corta cada sonido en trocitos.", "cuts each sound into little pieces.")],
  [/^mask$/, L("es un interruptor por compás: donde pone t (verdadero) la pista suena, donde pone f (falso) se calla.", "works as a switch per bar: where it says t (true) the track plays, where it says f (false) it goes silent.")],
  [/^swingBy$/, L("da swing: retrasa un poco una de cada dos notas para que el ritmo 'cojee' con gracia.", "adds swing: delays every other note a little so the rhythm 'limps' gracefully.")],
  [/^striate$/, L("corta y entrelaza los sonidos.", "cuts and interleaves the sounds.")],
  [/^loopAt$/, L("estira o encoge un loop largo para que dure justo ese número de ciclos (1 ciclo = 1 compás): así va al tempo de tu canción.", "stretches or squeezes a long loop so it lasts exactly that many cycles (1 cycle = 1 bar): that way it follows your song's tempo.")],
  [/^splice$/, L("parte el sample en N trozos iguales y los toca en el orden de la lista, cada uno ajustado a su hueco (para reordenar un loop y hacer variaciones).", "cuts the sample into N equal slices and plays them in the order of the list, each one fitted to its slot (to rearrange a loop and make variations).")],
];

export const PARAMS = {
  gain: L("volumen (1 es normal; más de 1 más fuerte).", "volume (1 is normal; above 1 is louder)."), room: L("reverb: cuánto espacio/sala tiene (0 a 1).", "reverb: how much room/space it has (0 to 1)."),
  size: L("tamaño de la sala de la reverb (0 a 1).", "size of the reverb room (0 to 1)."), sz: L("tamaño de la sala de la reverb.", "size of the reverb room."),
  delay: L("cantidad de eco.", "amount of echo."), delaytime: L("tiempo entre ecos (en fracciones de compás).", "time between echoes (in fractions of a bar)."),
  delayfeedback: L("cuántas veces se repite el eco (0 a 1).", "how many times the echo repeats (0 to 1)."), lpf: L("filtro paso bajo: quita los agudos por encima de esa frecuencia (Hz). Menos número = más apagado.", "low-pass filter: removes the highs above that frequency (Hz). Lower number = more muffled."),
  cutoff: L("filtro paso bajo.", "low-pass filter."), hpf: L("filtro paso alto: quita los graves por debajo de esa frecuencia (Hz).", "high-pass filter: removes the lows below that frequency (Hz)."),
  resonance: L("resalta la frecuencia del filtro (silbido).", "boosts the filter frequency (whistle)."), crush: L("reduce los bits: suena a 8 bits (menos número = más sucio).", "reduces the bits: sounds 8-bit (lower number = dirtier)."),
  coarse: L("baja la calidad de muestreo: más robótico.", "lowers the sample rate: more robotic."), shape: L("distorsión (0 a 1).", "distortion (0 to 1)."),
  pan: L("posición izquierda-derecha (0 izquierda, 0.5 centro, 1 derecha).", "left-right position (0 left, 0.5 center, 1 right)."), speed: L("velocidad de reproducción del sample (2 = una octava más agudo y más corto).", "sample playback speed (2 = an octave higher and shorter)."),
  legato: L("cuánto dura cada nota respecto a su hueco (1 = hasta la siguiente).", "how long each note lasts relative to its slot (1 = until the next one)."), vowel: L("filtro que imita vocales (a, e, i, o, u).", "filter that imitates vowels (a, e, i, o, u)."),
  orbit: L("canal de efectos.", "effects channel."), cut: L("grupo de corte: un sonido nuevo del mismo grupo corta al anterior (así un loop no se pisa consigo mismo).", "cut group: a new sound in the same group cuts off the previous one (so a loop never overlaps itself)."),
  begin: L("desde dónde empieza a sonar el sample (0 = principio, 0.5 = la mitad).", "where the sample starts playing (0 = start, 0.5 = halfway)."), end: L("dónde deja de sonar el sample (1 = el final).", "where the sample stops playing (1 = the end)."), accelerate: L("cambia la afinación mientras suena.", "changes the pitch while it plays."),
};

function explainMini(str) {
  const bits = [];
  const words = [...new Set(str.replace(/[\[\]<>{}(),|*\/!?.:~@]/g, " ").split(/\s+/).filter(Boolean))];
  const sounds = words.filter((w) => SOUNDS[w.split(":")[0]]).map((w) => `«${w}» = ${SOUNDS[w.split(":")[0]]}`);
  if (sounds.length) bits.push(sounds.join("; "));
  const chords = str.match(/[a-g][sf]?\d?'[a-z0-9]+(?:'\d+)?/g);
  if (chords) bits.push(`${L("acordes", "chords")}: ${[...new Set(chords)].map(describeChord).join(", ")}`);
  if (str.includes("~")) bits.push(L("«~» es un silencio", "«~» is a rest"));
  const mult = str.match(/\*(\d+)/);
  if (mult) bits.push(L(`«*${mult[1]}» repite ${mult[1]} veces en ese hueco`, `«*${mult[1]}» repeats ${mult[1]} times in that slot`));
  if (str.includes("[")) bits.push(L("«[ ]» mete varias cosas en un solo tiempo", "«[ ]» fits several things into one beat"));
  if (str.includes("<")) bits.push(L("«< >» alterna: una opción en cada ciclo", "«< >» alternates: one option per cycle"));
  if (str.includes("?")) bits.push(L("«?» hace que a veces no suene", "«?» makes it sometimes not play"));
  if (str.includes(",")) bits.push(L("la coma «,» hace sonar varias capas a la vez", "the comma «,» plays several layers at once"));
  if (str.includes("..")) bits.push(L("«a .. b» cuenta de a hasta b", "«a .. b» counts from a to b"));
  const bang = str.match(/!(\d+)/);
  if (bang) bits.push(L(`«!${bang[1]}» repite el elemento anterior ${bang[1]} veces seguidas (aquí, ${bang[1]} compases)`, `«!${bang[1]}» repeats the previous element ${bang[1]} times in a row (here, ${bang[1]} bars)`));
  if (/\b[tf]!/.test(str)) bits.push(L("t = suena, f = calla", "t = plays, f = silent"));
  const steps = str.trim().split(/\s+(?![^\[]*\])(?![^<]*>)/).filter(Boolean).length;
  if (!str.includes(",") && steps > 1) bits.push(L(`el compás se divide en ${steps} partes iguales`, `the bar is split into ${steps} equal parts`));
  return bits.join(". ");
}

function describeChord(c) {
  const [root, type, count] = c.split("'");
  const names = { min7: L("menor con séptima", "minor seventh"), maj7: L("mayor con séptima", "major seventh"), min: L("menor", "minor"), maj: L("mayor", "major"),
    dom7: L("de séptima (dominante)", "dominant seventh"), maj9: L("mayor con novena", "major ninth"), min9: L("menor con novena", "minor ninth") };
  return `${root.toUpperCase()} ${names[type] || type}${count ? L(` (${count} notas)`, ` (${count} ${L("notas", "notes")})`) : ""}`;
}

export function explainLocal(code) {
  const partes = [];
  const seen = new Set();
  // 1. Texto entre comillas: mini-notación
  for (const m of code.matchAll(/(\b[\w]+)\s+"([^"]*)"/g)) {
    const [frag, fn, inner] = m;
    const f = FUNCS.find(([re]) => re.test(fn));
    const pr = PARAMS[fn];
    const base = f ? f[1] : pr ? pr : "";
    const mini = explainMini(inner);
    if (seen.has(frag)) continue; seen.add(frag);
    partes.push({ fragmento: frag, explicacion: [cap(base), mini && cap(mini) + "."].filter(Boolean).join(" ") });
  }
  // 2. Efectos con #
  for (const m of code.matchAll(/#\s*(\w+)\s+(\([^)]*\)|"[^"]*"|-?[\d.]+)/g)) {
    const [frag, p, val] = m;
    if (seen.has(frag) || p === "s" || p === "n" || p === "note" || p === "sound") continue; seen.add(frag);
    let extra = "";
    if (val.startsWith("(")) extra = L(" El valor cambia solo con el tiempo: ", " The value changes by itself over time: ") + explainExpr(val);
    partes.push({ fragmento: frag.trim(), explicacion: cap(PARAMS[p] || L(`efecto «${p}».`, `${L("efecto", "effect")} «${p}».`)) + extra });
  }
  // 3. Funciones que transforman el patrón (antes de $ o entre paréntesis)
  for (const m of code.matchAll(/\b(every|whenmod|fast|slow|jux|degradeBy|sometimesBy|sometimes|rarely|often|arp|echo|off|stack|segment|chop|striate|swingBy|loopAt|splice)\b[^$#"]*/g)) {
    const frag = m[0].trim().replace(/\s*\$$/, "");
    if (seen.has(m[1] + frag)) continue; seen.add(m[1] + frag);
    const f = FUNCS.find(([re]) => re.test(m[1]));
    partes.push({ fragmento: frag.length > 40 ? m[1] + " …" : frag, explicacion: cap(f[1]) });
  }
  if (/\$/.test(code)) partes.push({ fragmento: "$", explicacion: L("Significa «aplica lo de la izquierda a todo lo de la derecha». Evita tener que poner paréntesis.", "Means «apply what's on the left to everything on the right». Saves you from writing brackets.") });
  if (/#/.test(code)) partes.push({ fragmento: "#", explicacion: L("Añade un ajuste (efecto, volumen, nota…) al patrón que tiene a la izquierda.", "Adds a setting (effect, volume, note…) to the pattern on its left.") });
  const resumen = partes.length ? L("Esto es lo que hace cada parte:", "This is what each part does:") : L("No reconozco este código; conecta una IA para una explicación completa.", "I don't recognize this code; connect an AI for a full explanation.");
  return { resumen, partes };
}

function explainExpr(expr) {
  const out = [];
  for (const m of expr.matchAll(/\b([a-zA-Z]+)\b/g)) {
    const f = FUNCS.find(([re]) => re.test(m[1]));
    if (f) out.push(`«${m[1]}» ${f[1]}`);
  }
  return out.join(" ");
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
