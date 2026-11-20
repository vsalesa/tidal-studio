// Wizard «Nuevo proyecto»: vas pulsando opciones predefinidas y se construye tu proyecto base.
// compose() es una función pura: a partir de tus elecciones devuelve el BPM y las pistas.
import { STYLES, COMPONENTS, byId } from "./catalog.js";

// Cada tipo de pista tiene su "hueco" fijo, así es fácil oírlo mientras eliges
export const SLOTS = { percusion: ["d1", "d2", "d3"], bajo: "d4", armonia: "d5", melodia: "d6", textura: "d7" };

const comps = (cat) => COMPONENTS.filter((c) => c.cat === cat);
const sortFit = (list, style) => [...list].sort((a, b) => (b.estilos?.includes(style) ? 1 : 0) - (a.estilos?.includes(style) ? 1 : 0));
const compOptions = (cat, style, noneLabel) => {
  const opts = sortFit(comps(cat), style).map((c) => ({ id: c.id, titulo: c.nombre, desc: c.desc, codigo: c.codigo, fit: c.estilos?.includes(style) }));
  return noneLabel ? [...opts, { id: "none", titulo: noneLabel, desc: "Puedes añadirlo más tarde.", codigo: "" }] : opts;
};

export const EFFECTS = [
  { id: "espacio", titulo: "Espacio en acordes y melodía", desc: "Reverb: suenan como en una sala grande.", codigo: '# room 0.5 # size 0.8', kinds: ["armonia", "melodia"], params: { room: 0.5, size: 0.8 } },
  { id: "eco", titulo: "Eco en la melodía", desc: "Delay: cada nota se repite más flojito.", codigo: "# delay 0.4 # delaytime 0.375 # delayfeedback 0.4", kinds: ["melodia"], params: { delay: 0.4, delaytime: 0.375, delayfeedback: 0.4 } },
  { id: "bajo_redondo", titulo: "Bajo más redondo", desc: "Filtro grave: quita brillo al bajo para que no choque con lo demás.", codigo: "# lpf 700", kinds: ["bajo"], params: { lpf: 700 } },
  { id: "vida", titulo: "Batería con vida", desc: "Cada golpe con fuerza distinta, como un batería de verdad.", codigo: "# gain (range 0.8 1.05 rand)", kinds: ["percusion"], params: { gain: "(range 0.8 1.05 rand)" } },
  { id: "lofi", titulo: "Sonido lo-fi", desc: "Menos agudos y calidad 'de cinta' en acordes y melodía.", codigo: "# lpf 2200 # crush 7", kinds: ["armonia", "melodia"], params: { lpf: 2200, crush: 7 } },
  { id: "movimiento", titulo: "Sonido que se mueve", desc: "La textura y la melodía viajan de un altavoz a otro.", codigo: "# pan sine", kinds: ["textura", "melodia"], params: { pan: "sine" } },
];

export const STRUCTURES = [
  { id: "bucle", titulo: "Bucle sencillo", desc: "Todo suena desde el principio. Ideal para empezar a experimentar.", codigo: "" },
  { id: "capas", titulo: "Entra poco a poco", desc: "Bloques de 16 compases: primero acordes, luego el bombo, después bajo y percusión, y al final la melodía.", codigo: 'mask "<f!8 t!8>" $ …' },
  { id: "drop", titulo: "Con 'drop'", desc: "8 compases tranquilos solo con acordes y textura, y de golpe entra todo.", codigo: 'mask "<f!8 t!8>" $ …' },
  { id: "olas", titulo: "En olas", desc: "Un filtro abre y cierra acordes y bajo cada 16 compases: la energía sube y baja.", codigo: "# lpf (range 300 3000 $ slow 16 sine)" },
];

export function steps(sel) {
  const style = sel.estilo || "house";
  const bpm = STYLES[style].bpm;
  return [
    { id: "estilo", titulo: "¿Qué estilo quieres?", ayuda: "Decide el tempo y qué componentes te recomiendo después. Podrás cambiarlo todo.",
      opciones: Object.entries(STYLES).map(([k, s]) => ({ id: k, titulo: s.nombre, desc: `${s.desc} (${s.bpm} BPM)`, codigo: `setcps (${s.bpm}/60/4)` })) },
    { id: "tempo", titulo: "¿A qué velocidad?", ayuda: "BPM = pulsos por minuto. En Tidal se escribe con setcps (ciclos por segundo).",
      opciones: [
        { id: String(Math.round(bpm * 0.9)), titulo: "Más tranquilo", desc: `${Math.round(bpm * 0.9)} BPM`, codigo: `setcps (${Math.round(bpm * 0.9)}/60/4)` },
        { id: String(bpm), titulo: "La típica del estilo", desc: `${bpm} BPM`, codigo: `setcps (${bpm}/60/4)`, fit: true },
        { id: String(Math.round(bpm * 1.1)), titulo: "Con más energía", desc: `${Math.round(bpm * 1.1)} BPM`, codigo: `setcps (${Math.round(bpm * 1.1)}/60/4)` },
      ] },
    { id: "ritmo", titulo: "Elige tu ritmo", ayuda: "Hasta 3 capas de percusión. Prueba a combinar bombo, caja o palmas y platillos.", multi: 3,
      opciones: compOptions("percusion", style) },
    { id: "bajo", titulo: "Elige el bajo", ayuda: "Las notas graves: dan peso y groove.", opciones: compOptions("bajo", style, "Sin bajo") },
    { id: "armonia", titulo: "Elige los acordes", ayuda: "Deciden la emoción: menores = melancólico, mayores = alegre.", opciones: compOptions("armonia", style, "Sin acordes") },
    { id: "melodia", titulo: "Elige una melodía", ayuda: "La parte que se tararea.", opciones: compOptions("melodia", style, "Sin melodía") },
    { id: "textura", titulo: "¿Una textura de fondo?", ayuda: "Detalles de ambiente: se sienten más que se oyen.", opciones: compOptions("textura", style, "Sin textura") },
    { id: "efectos", titulo: "Elige efectos", ayuda: "Puedes elegir varios. Se aplican a las pistas indicadas.", multi: 6,
      opciones: EFFECTS.map((e) => ({ id: e.id, titulo: e.titulo, desc: e.desc, codigo: e.codigo })) },
    { id: "estructura", titulo: "¿Cómo se organiza en el tiempo?", ayuda: "La estructura hace que la canción evolucione en vez de repetirse igual.",
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
  bucle: "Todas las pistas suenan siempre. Es un bucle: perfecto para aprender y luego ir quitando y poniendo cosas.",
  capas: '«mask "<f!8 t!8>"» funciona como un interruptor por compás: f (falso) = calla, t (verdadero) = suena. «f!8» significa 8 compases callado y «t!8», 8 sonando. Cada pista tiene su propio interruptor, así entran una detrás de otra.',
  drop: '«mask "<f!8 t!8>"» deja calladas la percusión, el bajo y la melodía durante 8 compases; luego entran todas de golpe: eso es un drop.',
  olas: "«# lpf (range 300 3000 $ slow 16 sine)» es un filtro que abre y cierra el sonido muy despacio (una onda «sine» que tarda 16 compases).",
};
