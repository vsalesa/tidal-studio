// Wizard de lluvia de ideas: preguntas abiertas con ejemplos, y al final un plan de canción
// con cambios concretos para probar. Esta parte funciona sin IA; con IA, los ejemplos y el plan se adaptan a ti.
import { STYLES, byId } from "./catalog.js";

export const QUESTIONS = [
  { id: "sensacion", pregunta: "¿Qué quieres que sienta quien escuche tu canción?",
    ayuda: "No pienses en técnica: piensa en emociones. Puedes elegir varias.", multi: true,
    ejemplos: ["Ganas de bailar", "Calma", "Nostalgia", "Misterio y tensión", "Euforia", "Melancolía", "Concentración"] },
  { id: "imagen", pregunta: "Si tu canción fuera un lugar o un momento, ¿cuál sería?",
    ayuda: "Una imagen ayuda muchísimo a elegir sonidos. Inventa la tuya si quieres.",
    ejemplos: ["Una discoteca a las 3 de la mañana", "Lluvia en la ventana", "Amanecer en la playa", "Conducir de noche por la ciudad",
      "Un bosque con niebla", "Una nave espacial", "Una cafetería tranquila"] },
  { id: "energia", pregunta: "¿Cómo cambia la energía a lo largo de la canción?",
    ayuda: "Es el 'viaje': lo que hace que una canción no sea siempre igual.",
    ejemplos: ["Constante, siempre arriba", "Sube poco a poco", "Calma, explosión y calma", "En olas: sube y baja", "Empieza fuerte y se va apagando"] },
  { id: "paso", pregunta: "¿A qué paso va? Imagina que te mueves con ella.",
    ayuda: "Esto decide el tempo (los BPM).",
    ejemplos: ["Paseando tranquilo", "Caminando con prisa", "Bailando", "Corriendo", "Sin pulso, flotando"] },
  { id: "sonidos", pregunta: "¿Qué sonidos te imaginas?", ayuda: "Elige los que te llamen, aunque no sepas cómo se hacen.", multi: true,
    ejemplos: ["Piano", "Sintes brillantes", "Bajo profundo", "Batería potente", "Percusión suave", "Naturaleza", "Ruidos digitales", "Campanas", "Órgano"] },
  { id: "referencia", pregunta: "¿Alguna canción, artista o película que te inspire para esto?",
    ayuda: "Opcional. Maestro la usa como pista del ambiente, no para copiarla.",
    ejemplos: ["Sin referencias", "Música de videojuego", "Banda sonora de película", "Algo tipo radio de los 80", "Música de estudio para concentrarse"] },
  { id: "sorpresa", pregunta: "¿Qué momento especial te gustaría que tuviera?",
    ayuda: "Los momentos que recuerdas de una canción suelen ser cambios inesperados.", multi: true,
    ejemplos: ["Un silencio de golpe antes de que todo vuelva", "Un redoble que anuncie el cambio", "Una melodía que aparece al final",
      "Que todo se apague con un filtro y vuelva", "Un eco que se repite", "Sonidos que van de un lado a otro"] },
];

// Comentario breve de Maestro tras cada respuesta (modo sin IA)
const REACTIONS = {
  "Ganas de bailar": "Para bailar, el secreto es un pulso constante y un bajo que 'conteste' al bombo.",
  "Calma": "La calma vive en los espacios: pocas notas, sonidos largos y suaves.",
  "Nostalgia": "La nostalgia suele venir de acordes con séptima y un sonido un poco 'gastado', como un vinilo.",
  "Misterio y tensión": "La tensión aparece con notas que no resuelven y sonidos oscuros con filtro.",
  "Euforia": "La euforia necesita contraste: quitar cosas antes de que todo vuelva a la vez.",
  "Melancolía": "Los acordes menores son el idioma de la melancolía.",
  "Concentración": "Para concentrarse funcionan los patrones repetitivos sin sorpresas bruscas.",
  "Sube poco a poco": "Eso se llama 'build-up': vamos añadiendo capas cada 8 compases.",
  "Calma, explosión y calma": "Estructura clásica: intro, drop y outro. El silencio antes del drop es tu mejor amigo.",
  "En olas: sube y baja": "Las olas se consiguen con filtros que se abren y se cierran despacio.",
  "Sin pulso, flotando": "Sin pulso, el ritmo lo marcan los cambios lentos de sonido: eso es ambient.",
};
export function reactLocal(q, answer) {
  const parts = String(answer).split(" · ");
  for (const a of parts) if (REACTIONS[a]) return REACTIONS[a];
  if (q.id === "imagen") return `«${answer}»: me ayuda a imaginar los sonidos. ¡Buena imagen!`;
  if (q.id === "sonidos") return "Apuntado. Al final te propongo cómo hacer cada uno en Tidal.";
  return "¡Anotado!";
}

// ---------------------------------------------------------------- plan local
const includes = (txt, ...words) => words.some((w) => txt.toLowerCase().includes(w.toLowerCase()));

function pickStyle(a) {
  const all = Object.values(a).join(" ");
  if (includes(a.paso || "", "flotando") || includes(all, "nave espacial", "bosque")) return "ambient";
  if (includes(a.paso || "", "corriendo")) return "dnb";
  if (includes(all, "tensión", "misterio", "conducir de noche")) return "techno";
  if (includes(all, "bailar", "euforia", "discoteca")) return includes(all, "playa") ? "reggaeton" : "house";
  if (includes(all, "nostalgia", "lluvia", "cafetería", "concentr", "melancol")) return "lofi";
  if (includes(a.paso || "", "paseando")) return "hiphop";
  return "house";
}
function pickBpm(a, style) {
  const p = a.paso || "";
  if (includes(p, "flotando")) return 70;
  if (includes(p, "paseando")) return style === "lofi" ? 80 : 88;
  if (includes(p, "prisa")) return 110;
  if (includes(p, "bailando")) return style === "techno" ? 130 : 124;
  if (includes(p, "corriendo")) return 172;
  return STYLES[style].bpm;
}
function sections(energia) {
  const e = energia || "";
  if (includes(e, "poco a poco")) return [
    { nombre: "Intro", compases: 8, que: "Solo textura y acordes, muy suave." },
    { nombre: "Crece", compases: 16, que: "Entra la percusión, luego el bajo." },
    { nombre: "Plena", compases: 16, que: "Todo sonando, con la melodía." },
    { nombre: "Final", compases: 8, que: "Se van quitando capas." }];
  if (includes(e, "explosión")) return [
    { nombre: "Intro calmada", compases: 16, que: "Acordes y textura, sin bombo." },
    { nombre: "Subida", compases: 8, que: "Filtro que se abre y redoble." },
    { nombre: "Silencio", compases: 1, que: "Un compás casi vacío: el oído se prepara." },
    { nombre: "Explosión (drop)", compases: 16, que: "Bombo, bajo y todo a la vez." },
    { nombre: "Calma final", compases: 8, que: "Vuelven solo los acordes." }];
  if (includes(e, "olas")) return [
    { nombre: "Ola 1", compases: 16, que: "El filtro se abre y se cierra." },
    { nombre: "Respiro", compases: 8, que: "Sin percusión." },
    { nombre: "Ola 2", compases: 16, que: "Igual, con melodía nueva." }];
  if (includes(e, "apagando")) return [
    { nombre: "Todo arriba", compases: 16, que: "Empieza con todo sonando." },
    { nombre: "Se apaga", compases: 16, que: "Cada 4 compases se va una capa." },
    { nombre: "Eco final", compases: 8, que: "Solo un eco de la melodía." }];
  return [
    { nombre: "Bloque A", compases: 16, que: "El patrón principal." },
    { nombre: "Bloque B", compases: 16, que: "Variación: cambian los acordes o entra la melodía." },
    { nombre: "Bloque A'", compases: 16, que: "Vuelve A con un detalle nuevo." }];
}

const SOUND_TO_COMP = {
  "Piano": ["chords_min", "rhodes"], "Sintes brillantes": ["arp", "stabs"], "Bajo profundo": ["bass_sub", "bass_off"],
  "Batería potente": null, "Percusión suave": ["shaker"], "Naturaleza": ["birds", "wind"], "Ruidos digitales": ["glitch"],
  "Campanas": ["bell"], "Órgano": ["stabs"],
};
const DRUMS = { house: "kick4", techno: "kick4", hiphop: "kickhh", lofi: "lofidrums", ambient: "shaker", reggaeton: "dembow", dnb: "amen" };
const WHY = {
  percusion: ["Pulso", "Es la base: marca el paso que has elegido."],
  bajo: ["Graves y groove", "Le da peso y movimiento a la canción."],
  armonia: ["Armonía", "Pone el color emocional que buscas."],
  melodia: ["Melodía", "Es lo que se te quedará en la cabeza."],
  textura: ["Atmósfera", "Pinta la imagen que me has descrito."],
};

export function buildLocalPlan(a, tracks) {
  const style = pickStyle(a);
  const bpm = pickBpm(a, style);
  const used = new Set(tracks.map((t) => t.id));
  const nextId = () => { for (let i = 1; i <= 12; i++) if (!used.has("d" + i)) { used.add("d" + i); return "d" + i; } return null; };
  const sugerencias = [];
  const addComp = (compId, titulo, extraWrap = "") => {
    const c = byId[compId]; const id = nextId();
    if (!c || !id) return null;
    const [concepto, porque] = WHY[c.cat] || ["Idea", c.desc];
    const s = { titulo: titulo || `Yo empezaría con «${c.nombre}»`, porque: `${c.desc} ${porque}`, concepto,
      cambios: { pistas: [{ id, nombre: c.nombre, tipo: c.cat, codigo: extraWrap + c.codigo }] } };
    sugerencias.push(s); return s;
  };

  const sounds = String(a.sonidos || "").split(" · ").filter(Boolean);
  const sorpresa = String(a.sorpresa || "");
  const drumComp = DRUMS[style];
  // La sorpresa elegida se aplica sobre la percusión principal
  let wrap = "";
  let surpriseTitle = "";
  if (includes(sorpresa, "silencio")) { wrap = "whenmod 16 15 (const silence) $ "; surpriseTitle = "Yo pondría el ritmo con un silencio de golpe cada 16 compases"; }
  else if (includes(sorpresa, "redoble")) { wrap = "every 8 (fast 2) $ "; surpriseTitle = "Yo pondría el ritmo con un redoble cada 8 compases"; }
  if (style !== "ambient" || sounds.includes("Batería potente")) {
    const s = addComp(drumComp, surpriseTitle || "Yo empezaría por el ritmo", wrap);
    if (s && wrap) { s.concepto = "Sorpresa y estructura"; s.porque += " Y el cambio que pediste hace que el oído se sorprenda y vuelva a prestar atención."; }
  }
  for (const snd of sounds) {
    const opts = SOUND_TO_COMP[snd];
    if (!opts) continue;
    const comp = opts.find((id) => byId[id].estilos.includes(style)) || opts[0];
    if (sugerencias.some((x) => x.cambios.pistas[0].nombre === byId[comp].nombre)) continue;
    addComp(comp, `Para «${snd}», yo probaría «${byId[comp].nombre}»`);
  }
  if (!sugerencias.some((s) => s.cambios.pistas[0].tipo === "bajo") && style !== "ambient")
    addComp(["dnb", "ambient"].includes(style) ? "bass_sub" : style === "techno" ? "bass_roll" : style === "house" ? "bass_off" : "bass_hh", "Le pondría un bajo que acompañe");
  if (includes(Object.values(a).join(" "), "melancol", "nostalgia", "lluvia") && !sugerencias.some((s) => s.cambios.pistas[0].tipo === "armonia"))
    addComp("chords_min", "Yo usaría acordes menores para esa emoción");
  if (includes(sorpresa, "melodía")) addComp("arpy", "Una melodía que solo aparezca en los últimos 4 de cada 16 compases", 'mask "<f!12 t!4>" $ ');
  if (includes(sorpresa, "filtro") || includes(a.energia || "", "olas")) {
    const s = sugerencias.find((x) => ["armonia", "melodia", "bajo"].includes(x.cambios.pistas[0].tipo));
    if (s) { s.cambios.pistas[0].codigo += " # lpf (range 300 5000 $ slow 16 sine)"; s.porque += " Le he puesto un filtro que se abre y se cierra en 16 compases: así sube y baja la energía."; s.concepto = "Dinámica"; }
  }
  if (includes(sorpresa, "eco")) {
    const s = sugerencias.find((x) => ["melodia", "armonia"].includes(x.cambios.pistas[0].tipo));
    if (s) { s.cambios.pistas[0].codigo += " # delay 0.5 # delaytime 0.375 # delayfeedback 0.5"; s.porque += " Con un eco que se repite."; }
  }
  if (includes(sorpresa, "lado")) {
    const s = sugerencias[sugerencias.length - 1];
    if (s) { s.cambios.pistas[0].codigo += " # pan sine"; s.porque += " Y viaja de un altavoz al otro."; }
  }
  const st = STYLES[style];
  const imagen = a.imagen ? ` Me imagino ${a.imagen.toLowerCase()}.` : "";
  return {
    titulo: a.imagen ? capitalize(a.imagen) : `Tu canción ${st.nombre}`,
    resumen: `Una canción ${st.nombre.toLowerCase()} a ${bpm} BPM pensada para transmitir ${String(a.sensacion || "lo que sientes").toLowerCase().replaceAll(" · ", ", ")}.${imagen}`,
    estilo: style, bpm, partes: sections(a.energia), sugerencias: sugerencias.slice(0, 6),
  };
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
