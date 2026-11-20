import { L } from "./i18n.js";
// Biblioteca de samples: tipos, sonidos que ya vienen con SuperDirt (Dirt-Samples) y cómo usarlos en una pista.

export const TYPES = [
  { id: "bombo", es: "Bombos", en: "Kicks", kind: "percusion" },
  { id: "caja", es: "Cajas y palmas", en: "Snares & claps", kind: "percusion" },
  { id: "platos", es: "Platos y hi-hats", en: "Hats & cymbals", kind: "percusion" },
  { id: "percusion", es: "Percusión", en: "Percussion", kind: "percusion" },
  { id: "loop", es: "Breaks y loops", en: "Breaks & loops", kind: "percusion" },
  { id: "bajo", es: "Bajos", en: "Basses", kind: "bajo" },
  { id: "melodico", es: "Melódicos", en: "Melodic", kind: "melodia" },
  { id: "pad", es: "Pads y ambiente", en: "Pads & ambience", kind: "textura" },
  { id: "voz", es: "Voces", en: "Voices", kind: "textura" },
  { id: "fx", es: "FX y ruidos", en: "FX & noises", kind: "textura" },
  { id: "synth", es: "Sintetizadores", en: "Synths", kind: "melodia" },
  { id: "otro", es: "Otros", en: "Other", kind: "textura" },
];
export const typeName = (id) => { const t = TYPES.find((x) => x.id === id); return t ? L(t.es, t.en) : id; };
export const typeKind = (id) => (TYPES.find((x) => x.id === id) || {}).kind || "textura";

// Sonidos incluidos con SuperDirt (carpeta Dirt-Samples) y sus sintetizadores
const B = (type, name, es, en) => ({ type, name, desc: L(es, en) });
export const BUILTIN = [
  B("bombo", "bd", "Bombo clásico, muchas variantes (bd:0…)", "Classic kick, many variants (bd:0…)"),
  B("bombo", "808bd", "Bombo de la caja de ritmos 808", "808 drum machine kick"),
  B("bombo", "clubkick", "Bombo de club, con pegada", "Punchy club kick"),
  B("bombo", "hardkick", "Bombo duro (hardcore, techno)", "Hard kick (hardcore, techno)"),
  B("bombo", "popkick", "Bombo pop", "Pop kick"),
  B("bombo", "reverbkick", "Bombo con reverb", "Kick with reverb"),
  B("bombo", "kicklinn", "Bombo de la LinnDrum (años 80)", "LinnDrum kick (80s)"),
  B("caja", "sn", "Caja", "Snare"),
  B("caja", "sd", "Caja de caja de ritmos", "Drum machine snare"),
  B("caja", "808sd", "Caja de 808", "808 snare"),
  B("caja", "cp", "Palmada", "Handclap"),
  B("caja", "realclaps", "Palmas reales", "Real claps"),
  B("caja", "rm", "Rimshot (golpe en el aro)", "Rimshot"),
  B("platos", "hh", "Hi-hat cerrado", "Closed hi-hat"),
  B("platos", "hh27", "Hi-hat suave", "Soft hi-hat"),
  B("platos", "oh", "Hi-hat abierto", "Open hi-hat"),
  B("platos", "808hc", "Hi-hat cerrado de 808", "808 closed hi-hat"),
  B("platos", "808oh", "Hi-hat abierto de 808", "808 open hi-hat"),
  B("platos", "linnhats", "Hi-hats de LinnDrum", "LinnDrum hats"),
  B("platos", "cr", "Platillo crash", "Crash cymbal"),
  B("percusion", "drum", "Kit de batería variado", "Assorted drum kit"),
  B("percusion", "lt", "Tom grave", "Low tom"),
  B("percusion", "mt", "Tom medio", "Mid tom"),
  B("percusion", "ht", "Tom agudo", "High tom"),
  B("percusion", "perc", "Percusión variada", "Assorted percussion"),
  B("percusion", "tabla", "Tabla india", "Indian tabla"),
  B("percusion", "hand", "Golpes con la mano", "Hand hits"),
  B("loop", "amencutup", "El break «amen» en 32 trozos", "The «amen» break in 32 slices"),
  B("loop", "breaks125", "Break de batería a 125 BPM", "Drum break at 125 BPM"),
  B("loop", "breaks152", "Break a 152 BPM", "Break at 152 BPM"),
  B("loop", "breaks165", "Break a 165 BPM", "Break at 165 BPM"),
  B("loop", "jungle", "Golpes de jungle", "Jungle hits"),
  B("bajo", "bass", "Bajo", "Bass"),
  B("bajo", "bass1", "Bajo (otra colección)", "Bass (another set)"),
  B("bajo", "bass3", "Bajo grave", "Deep bass"),
  B("bajo", "jvbass", "Bajo de sintetizador", "Synth bass"),
  B("bajo", "bassdm", "Bajo de caja de ritmos", "Drum machine bass"),
  B("melodico", "arpy", "Arpa / pluck afinado", "Tuned harp / pluck"),
  B("melodico", "pluck", "Cuerda pulsada", "Plucked string"),
  B("melodico", "casio", "Teclado Casio", "Casio keyboard"),
  B("melodico", "gtr", "Guitarra", "Guitar"),
  B("melodico", "sax", "Saxofón", "Saxophone"),
  B("melodico", "sitar", "Sitar", "Sitar"),
  B("melodico", "moog", "Moog", "Moog"),
  B("pad", "pad", "Pad (sonido largo)", "Pad (long sound)"),
  B("pad", "padlong", "Pad muy largo", "Very long pad"),
  B("pad", "wind", "Viento", "Wind"),
  B("pad", "birds", "Pájaros", "Birds"),
  B("pad", "space", "Sonidos espaciales", "Space sounds"),
  B("pad", "fire", "Fuego", "Fire"),
  B("voz", "numbers", "Números hablados", "Spoken numbers"),
  B("voz", "alphabet", "Letras habladas", "Spoken letters"),
  B("voz", "speech", "Frases", "Speech"),
  B("voz", "mouth", "Sonidos de boca", "Mouth sounds"),
  B("voz", "yeah", "«Yeah»", "«Yeah»"),
  B("fx", "glitch", "Ruidos digitales", "Digital noises"),
  B("fx", "noise", "Ruido", "Noise"),
  B("fx", "industrial", "Golpes metálicos", "Metallic hits"),
  B("fx", "metal", "Metal", "Metal"),
  B("fx", "stab", "Golpes de acorde (stabs)", "Chord stabs"),
  B("synth", "superpiano", "Piano (sintetizado: toca cualquier nota)", "Piano (synth: plays any note)"),
  B("synth", "supersaw", "Sierra brillante y gorda", "Bright, fat saw"),
  B("synth", "superpwm", "Onda cuadrada variable (bajos redondos)", "Variable square (round basses)"),
  B("synth", "superhammond", "Órgano Hammond", "Hammond organ"),
  B("synth", "superchip", "Videoconsola de 8 bits", "8-bit video game"),
  B("synth", "superfm", "Sintetizador FM", "FM synth"),
  B("synth", "supergong", "Gong / campana", "Gong / bell"),
  B("synth", "supermandolin", "Mandolina", "Mandolin"),
];

// Código de partida para una pista nueva según el tipo
export function starterCode(name, type) {
  const v = name;
  switch (type) {
    case "bombo": return `s "${v}*4"`;
    case "caja": return `s "~ ${v}"`;
    case "platos": return `s "${v}*8" # gain 0.8`;
    case "percusion": return `s "${v}(3,8)"`;
    case "loop": return `loopAt 2 $ chop 8 $ s "${v}"`;
    case "bajo": return `note "0 ~ 0 3" # s "${v}" # legato 1`;
    case "melodico": return `note "0 3 7 5" # s "${v}"`;
    case "synth": return `n "0 3 7 5" # s "${v}"`;
    case "pad": return `s "${v}" # legato 1 # room 0.4`;
    case "voz": return `s "~ ${v}" # room 0.3`;
    default: return `s "${v}/2"`;
  }
}

// Cambia el sonido de una pista manteniendo su ritmo: s "bd*4 ~ bd" → s "kick*4 ~ kick"
export function swapSound(code, name, variant = null) {
  const re = /\b(s|sound)\s+"([^"]*)"/;
  const m = code.match(re);
  if (!m) return null;
  const word = variant != null && variant > 0 ? `${name}:${variant}` : name;
  const pat = m[2].replace(/(^|[\s\[<{,])([A-Za-z][\w]*)(:\d+)?/g, (all, pre) => pre + word);
  return code.replace(re, `${m[1]} "${pat}"`);
}
