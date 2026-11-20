import { L } from "./i18n.js";
// Wizard «Nuevo proyecto»: vas pulsando opciones predefinidas y se construye tu proyecto base.
// compose() es una función pura: a partir de tus elecciones devuelve el BPM y las pistas.
import { STYLES, COMPONENTS, byId } from "./catalog.js";

// Cada tipo de pista tiene su "hueco" fijo, así es fácil oírlo mientras eliges
export const SLOTS = { percusion: ["d1", "d2", "d3"], bajo: "d4", armonia: "d5", melodia: "d6", textura: "d7" };

const comps = (cat) => COMPONENTS.filter((c) => c.cat === cat);
const sortFit = (list, style) => [...list].sort((a, b) => (b.estilos?.includes(style) ? 1 : 0) - (a.estilos?.includes(style) ? 1 : 0));
const compOptions = (cat, style, noneLabel) => {
  const opts = sortFit(comps(cat), style).map((c) => ({ id: c.id, titulo: c.nombre, desc: c.desc, codigo: c.codigo, fit: c.estilos?.includes(style) }));
  return noneLabel ? [...opts, { id: "none", titulo: noneLabel, desc: L("Puedes añadirlo más tarde.", "You can add it later."), codigo: "" }] : opts;
};

export const EFFECTS = [
  { id: "espacio", titulo: L("Espacio en acordes y melodía", "Space on chords and melody"), desc: L("Reverb: suenan como en una sala grande.", "Reverb: they sound like in a big room."), codigo: '# room 0.5 # size 0.8', kinds: ["armonia", "melodia"], params: { room: 0.5, size: 0.8 } },
  { id: "eco", titulo: L("Eco en la melodía", "Echo on the melody"), desc: L("Delay: cada nota se repite más flojito.", "Delay: each note repeats more softly."), codigo: "# delay 0.4 # delaytime 0.375 # delayfeedback 0.4", kinds: ["melodia"], params: { delay: 0.4, delaytime: 0.375, delayfeedback: 0.4 } },
  { id: "bajo_redondo", titulo: L("Bajo más redondo", "Rounder bass"), desc: L("Filtro grave: quita brillo al bajo para que no choque con lo demás.", "Low-pass filter: takes brightness off the bass so it doesn't clash with the rest."), codigo: "# lpf 700", kinds: ["bajo"], params: { lpf: 700 } },
  { id: "vida", titulo: L("Batería con vida", "Drums with life"), desc: L("Cada golpe con fuerza distinta, como un batería de verdad.", "Each hit with a different strength, like a real drummer."), codigo: "# gain (range 0.8 1.05 rand)", kinds: ["percusion"], params: { gain: "(range 0.8 1.05 rand)" } },
  { id: "lofi", titulo: L("Sonido lo-fi", "Lo-fi sound"), desc: L("Menos agudos y calidad 'de cinta' en acordes y melodía.", "Fewer highs and 'tape' quality on chords and melody."), codigo: "# lpf 2200 # crush 7", kinds: ["armonia", "melodia"], params: { lpf: 2200, crush: 7 } },
  { id: "movimiento", titulo: L("Sonido que se mueve", "Moving sound"), desc: L("La textura y la melodía viajan de un altavoz a otro.", "The texture and melody travel from one speaker to the other."), codigo: "# pan sine", kinds: ["textura", "melodia"], params: { pan: "sine" } },
];

export const STRUCTURES = [
  { id: "bucle", titulo: L("Bucle sencillo", "Simple loop"), desc: L("Todo suena desde el principio. Ideal para empezar a experimentar.", "Everything plays from the start. Ideal to start experimenting."), codigo: "" },
  { id: "capas", titulo: L("Entra poco a poco", "Builds up little by little"), desc: L("Bloques de 16 compases: primero acordes, luego el bombo, después bajo y percusión, y al final la melodía.", "16-bar blocks: first chords, then the kick, then bass and drums, and finally the melody."), codigo: 'mask "<f!8 t!8>" $ …' },
  { id: "drop", titulo: L("Con 'drop'", "With a 'drop'"), desc: L("8 compases tranquilos solo con acordes y textura, y de golpe entra todo.", "8 calm bars with only chords and texture, then everything comes in at once."), codigo: 'mask "<f!8 t!8>" $ …' },
  { id: "olas", titulo: L("En olas", "In waves"), desc: L("Un filtro abre y cierra acordes y bajo cada 16 compases: la energía sube y baja.", "A filter opens and closes chords and bass every 16 bars: the energy rises and falls."), codigo: "# lpf (range 300 3000 $ slow 16 sine)" },
];

export function steps(sel) {
  const style = sel.estilo || "house";
  const bpm = STYLES[style].bpm;
  return [
    { id: "estilo", titulo: L("¿Qué estilo quieres?", "What style do you want?"), ayuda: L("Decide el tempo y qué componentes te recomiendo después. Podrás cambiarlo todo.", "It sets the tempo and which components I recommend next. You can change everything."),
      opciones: Object.entries(STYLES).map(([k, s]) => ({ id: k, titulo: s.nombre, desc: `${s.desc} (${s.bpm} BPM)`, codigo: `setcps (${s.bpm}/60/4)` })) },
    { id: "tempo", titulo: L("¿A qué velocidad?", "How fast?"), ayuda: L("BPM = pulsos por minuto. En Tidal se escribe con setcps (ciclos por segundo).", "BPM = beats per minute. In Tidal you write it with setcps (cycles per second)."),
      opciones: [
        { id: String(Math.round(bpm * 0.9)), titulo: L("Más tranquilo", "Calmer"), desc: `${Math.round(bpm * 0.9)} BPM`, codigo: `setcps (${Math.round(bpm * 0.9)}/60/4)` },
        { id: String(bpm), titulo: L("La típica del estilo", "Typical for the style"), desc: `${bpm} BPM`, codigo: `setcps (${bpm}/60/4)`, fit: true },
        { id: String(Math.round(bpm * 1.1)), titulo: L("Con más energía", "More energy"), desc: `${Math.round(bpm * 1.1)} BPM`, codigo: `setcps (${Math.round(bpm * 1.1)}/60/4)` },
      ] },
    { id: "ritmo", titulo: L("Elige tu ritmo", "Choose your beat"), ayuda: L("Hasta 3 capas de percusión. Prueba a combinar bombo, caja o palmas y platillos.", "Up to 3 drum layers. Try combining kick, snare or claps, and cymbals."), multi: 3,
      opciones: compOptions("percusion", style) },
    { id: "bajo", titulo: L("Elige el bajo", "Choose the bass"), ayuda: L("Las notas graves: dan peso y groove.", "The low notes: they bring weight and groove."), opciones: compOptions("bajo", style, L("Sin bajo", "No bass")) },
    { id: "armonia", titulo: L("Elige los acordes", "Choose the chords"), ayuda: L("Deciden la emoción: menores = melancólico, mayores = alegre.", "They set the emotion: minor = melancholic, major = happy."), opciones: compOptions("armonia", style, L("Sin acordes", "No chords")) },
    { id: "melodia", titulo: L("Elige una melodía", "Choose a melody"), ayuda: L("La parte que se tararea.", "The part you hum."), opciones: compOptions("melodia", style, L("Sin melodía", "No melody")) },
    { id: "textura", titulo: L("¿Una textura de fondo?", "A background texture?"), ayuda: L("Detalles de ambiente: se sienten más que se oyen.", "Ambient details: you feel them more than hear them."), opciones: compOptions("textura", style, L("Sin textura", "No texture")) },
    { id: "efectos", titulo: L("Elige efectos", "Choose effects"), ayuda: L("Puedes elegir varios. Se aplican a las pistas indicadas.", "You can choose several. They apply to the tracks shown."), multi: 6,
      opciones: EFFECTS.map((e) => ({ id: e.id, titulo: e.titulo, desc: e.desc, codigo: e.codigo })) },
    { id: "estructura", titulo: L("¿Cómo se organiza en el tiempo?", "How is it organized over time?"), ayuda: L("La estructura hace que la canción evolucione en vez de repetirse igual.", "Structure makes the song evolve instead of repeating the same way."),
      opciones: STRUCTURES.map((s) => ({ id: s.id, titulo: s.titulo, desc: s.desc, codigo: s.codigo })) },
  ];
}

// Valores por defecto recomendados al elegir un estilo
export function defaultsFor(style) {
  const first = (cat) => sortFit(comps(cat), style)[0]?.id;
  const perc = sortFit(comps("percusion"), style).filter((c) => c.estilos.includes(style)).slice(0, 2).map((c) => c.id);
  return {
    estilo: style, tempo: String(STYLES[style].bpm), ritmo: style === "ambient" ? ["shaker"] : perc,
    bajo: first("bajo"), armonia: first("armonia"), melodia: style === "ambient" || style === "lofi" ? first("melodia") : "none",
    textura: ["ambient", "lofi"].includes(style) ? first("textura") : "none",
    efectos: style === "lofi" ? ["lofi", "vida"] : style === "ambient" ? ["espacio", "movimiento"] : ["espacio"], estructura: "bucle",
  };
}

const PARAM_RE = (p) => new RegExp(`\\s*#\\s*${p}\\s+(?:-?[\\d.]+|\\([^)]*\\)|"[^"]*"|\\w+)(?=\\s*(#|$))`, "g");
function setParams(code, params) {
  let c = code;
  for (const [p, v] of Object.entries(params)) c = c.replace(PARAM_RE(p), "") + ` # ${p} ${v}`;
  return c;
}

export function compose(sel) {
  const tracks = [];
  const add = (id, compId) => {
    const c = byId[compId];
    if (c) tracks.push({ id, name: c.nombre, kind: c.cat, code: c.codigo, muted: false });
  };
  (sel.ritmo || []).slice(0, 3).forEach((cid, i) => add(SLOTS.percusion[i], cid));
  for (const k of ["bajo", "armonia", "melodia", "textura"]) if (sel[k] && sel[k] !== "none") add(SLOTS[k], sel[k]);
  for (const eid of sel.efectos || []) {
    const e = EFFECTS.find((x) => x.id === eid);
    for (const t of tracks) if (e && e.kinds.includes(t.kind)) t.code = setParams(t.code, e.params);
  }
  const mask = (t, m) => { t.code = `mask "${m}" $ ${t.code}`; };
  const perc = tracks.filter((t) => t.kind === "percusion");
  if (sel.estructura === "capas") {
    perc.forEach((t, i) => mask(t, i === 0 ? "<f!4 t!12>" : "<f!8 t!8>"));
    tracks.filter((t) => t.kind === "bajo").forEach((t) => mask(t, "<f!8 t!8>"));
    tracks.filter((t) => t.kind === "melodia").forEach((t) => mask(t, "<f!12 t!4>"));
  } else if (sel.estructura === "drop") {
    tracks.filter((t) => ["percusion", "bajo", "melodia"].includes(t.kind)).forEach((t) => mask(t, "<f!8 t!8>"));
  } else if (sel.estructura === "olas") {
    tracks.filter((t) => ["armonia", "bajo"].includes(t.kind)).forEach((t) => { t.code = setParams(t.code, { lpf: "(range 300 3000 $ slow 16 sine)" }); });
  }
  const bpm = parseInt(sel.tempo) || STYLES[sel.estilo || "house"].bpm;
  return { bpm, tracks };
}

export const STRUCTURE_EXPLAIN = {
  bucle: L("Todas las pistas suenan siempre. Es un bucle: perfecto para aprender y luego ir quitando y poniendo cosas.", "All tracks always play. It's a loop: perfect for learning and then taking things out and putting them back."),
  capas: L('«mask "<f!8 t!8>"» funciona como un interruptor por compás: f (falso) = calla, t (verdadero) = suena. «f!8» significa 8 compases callado y «t!8», 8 sonando. Cada pista tiene su propio interruptor, así entran una detrás de otra.', '«mask "<f!8 t!8>"» works like a switch per bar: f (false) = silent, t (true) = plays. «f!8» means 8 bars silent and «t!8», 8 playing. Each track has its own switch, so they come in one after another.'),
  drop: L('«mask "<f!8 t!8>"» deja calladas la percusión, el bajo y la melodía durante 8 compases; luego entran todas de golpe: eso es un drop.', '«mask "<f!8 t!8>"» keeps drums, bass and melody silent for 8 bars; then they all come in at once: that\'s a drop.'),
  olas: L("«# lpf (range 300 3000 $ slow 16 sine)» es un filtro que abre y cierra el sonido muy despacio (una onda «sine» que tarda 16 compases).", "«# lpf (range 300 3000 $ slow 16 sine)» is a filter that opens and closes the sound very slowly (a «sine» wave that takes 16 bars)."),
};
