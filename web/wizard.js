// Wizard de lluvia de ideas: preguntas abiertas con ejemplos, y al final un plan de canción
// con cambios concretos para probar. Esta parte funciona sin IA; con IA, los ejemplos y el plan se adaptan a ti.
import { STYLES, byId } from "./catalog.js";
import { L, EN } from "./i18n.js";

export const QUESTIONS = [
  { id: "sensacion", pregunta: L("¿Qué quieres que sienta quien escuche tu canción?", "What do you want listeners to feel?"),
    ayuda: L("No pienses en técnica: piensa en emociones. Puedes elegir varias.", "Don't think about technique: think about emotions. You can pick several."), multi: true,
    ejemplos: EN ? ["Wanting to dance", "Calm", "Nostalgia", "Mystery and tension", "Euphoria", "Melancholy", "Focus"]
      : ["Ganas de bailar", "Calma", "Nostalgia", "Misterio y tensión", "Euforia", "Melancolía", "Concentración"] },
  { id: "imagen", pregunta: L("Si tu canción fuera un lugar o un momento, ¿cuál sería?", "If your song were a place or a moment, what would it be?"),
    ayuda: L("Una imagen ayuda muchísimo a elegir sonidos. Inventa la tuya si quieres.", "An image helps a lot when choosing sounds. Make up your own if you like."),
    ejemplos: EN ? ["A club at 3 in the morning", "Rain on the window", "Sunrise at the beach", "Driving through the city at night", "A misty forest", "A spaceship", "A quiet café"]
      : ["Una discoteca a las 3 de la mañana", "Lluvia en la ventana", "Amanecer en la playa", "Conducir de noche por la ciudad", "Un bosque con niebla", "Una nave espacial", "Una cafetería tranquila"] },
  { id: "energia", pregunta: L("¿Cómo cambia la energía a lo largo de la canción?", "How does the energy change through the song?"),
    ayuda: L("Es el 'viaje': lo que hace que una canción no sea siempre igual.", "It's the 'journey': what keeps a song from always being the same."),
    ejemplos: EN ? ["Steady, always high", "Builds up little by little", "Calm, explosion and calm", "In waves: up and down", "Starts strong and fades out"]
      : ["Constante, siempre arriba", "Sube poco a poco", "Calma, explosión y calma", "En olas: sube y baja", "Empieza fuerte y se va apagando"] },
  { id: "paso", pregunta: L("¿A qué paso va? Imagina que te mueves con ella.", "What pace is it? Imagine moving to it."),
    ayuda: L("Esto decide el tempo (los BPM).", "This sets the tempo (the BPM)."),
    ejemplos: EN ? ["Strolling calmly", "Walking in a hurry", "Dancing", "Running", "No pulse, floating"]
      : ["Paseando tranquilo", "Caminando con prisa", "Bailando", "Corriendo", "Sin pulso, flotando"] },
  { id: "sonidos", pregunta: L("¿Qué sonidos te imaginas?", "What sounds do you imagine?"), ayuda: L("Elige los que te llamen, aunque no sepas cómo se hacen.", "Pick the ones that call to you, even if you don't know how they're made."), multi: true,
    ejemplos: EN ? ["Piano", "Bright synths", "Deep bass", "Powerful drums", "Soft percussion", "Nature", "Digital noises", "Bells", "Organ"]
      : ["Piano", "Sintes brillantes", "Bajo profundo", "Batería potente", "Percusión suave", "Naturaleza", "Ruidos digitales", "Campanas", "Órgano"] },
  { id: "referencia", pregunta: L("¿Alguna canción, artista o película que te inspire para esto?", "Any song, artist or film that inspires you for this?"),
    ayuda: L("Opcional. Maestro la usa como pista del ambiente, no para copiarla.", "Optional. Maestro uses it as a hint for the mood, not to copy it."),
    ejemplos: EN ? ["No references", "Video game music", "Film soundtrack", "Something like 80s radio", "Study music to focus"]
      : ["Sin referencias", "Música de videojuego", "Banda sonora de película", "Algo tipo radio de los 80", "Música de estudio para concentrarse"] },
  { id: "sorpresa", pregunta: L("¿Qué momento especial te gustaría que tuviera?", "What special moment would you like it to have?"),
    ayuda: L("Los momentos que recuerdas de una canción suelen ser cambios inesperados.", "The moments you remember in a song are usually unexpected changes."), multi: true,
    ejemplos: EN ? ["A sudden silence before everything comes back", "A drum fill announcing the change", "A melody that appears at the end", "Everything fades out with a filter and comes back", "A repeating echo", "Sounds moving from side to side"]
      : ["Un silencio de golpe antes de que todo vuelva", "Un redoble que anuncie el cambio", "Una melodía que aparece al final", "Que todo se apague con un filtro y vuelva", "Un eco que se repite", "Sonidos que van de un lado a otro"] },
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
};const REACTIONS_EN = {
  "Wanting to dance": "For dancing, the secret is a steady pulse and a bass that 'answers' the kick.",
  "Calm": "Calm lives in the spaces: few notes, long and soft sounds.",
  "Nostalgia": "Nostalgia often comes from seventh chords and a slightly 'worn' sound, like vinyl.",
  "Mystery and tension": "Tension appears with notes that don't resolve and dark, filtered sounds.",
  "Euphoria": "Euphoria needs contrast: take things out before everything comes back at once.",
  "Melancholy": "Minor chords are the language of melancholy.",
  "Focus": "For focus, repetitive patterns without sudden surprises work best.",
  "Builds up little by little": "That's called a 'build-up': we add layers every 8 bars.",
  "Calm, explosion and calm": "Classic structure: intro, drop and outro. The silence before the drop is your best friend.",
  "In waves: up and down": "Waves come from filters that open and close slowly.",
  "No pulse, floating": "Without a pulse, the rhythm comes from slow sound changes: that's ambient.",
};
if (EN) Object.assign(REACTIONS, REACTIONS_EN);
export function reactLocal(q, answer) {
  const parts = String(answer).split(" · ");
  for (const a of parts) if (REACTIONS[a]) return REACTIONS[a];
  if (q.id === "imagen") return L(`«${answer}»: me ayuda a imaginar los sonidos. ¡Buena imagen!`, `«${answer}»: that helps me imagine the sounds. Great image!`);
  if (q.id === "sonidos") return L("Apuntado. Al final te propongo cómo hacer cada uno en Tidal.", "Noted. At the end I'll suggest how to make each one in Tidal.");
  return L("¡Anotado!", "Got it!");
}

// ---------------------------------------------------------------- plan local
const includes = (txt, ...words) => words.some((w) => txt.toLowerCase().includes(w.toLowerCase()));

function pickStyle(a) {
  const all = Object.values(a).join(" ");
  if (includes(a.paso || "", "flotando", "floating") || includes(all, "nave espacial", "bosque", "spaceship", "forest")) return "ambient";
  if (includes(a.paso || "", "corriendo", "running")) return "dnb";
  if (includes(all, "tensión", "misterio", "conducir de noche", "tension", "mystery", "driving")) return "techno";
  if (includes(all, "bailar", "euforia", "discoteca", "danc", "euphoria", "club")) return includes(all, "playa", "beach") ? "reggaeton" : "house";
  if (includes(all, "nostalgia", "lluvia", "cafetería", "concentr", "melancol", "rain", "café", "focus")) return "lofi";
  if (includes(a.paso || "", "paseando", "strolling")) return "hiphop";
  return "house";
}
function pickBpm(a, style) {
  const p = a.paso || "";
  if (includes(p, "flotando", "floating")) return 70;
  if (includes(p, "paseando", "strolling")) return style === "lofi" ? 80 : 88;
  if (includes(p, "prisa", "hurry")) return 110;
  if (includes(p, "bailando", "dancing")) return style === "techno" ? 130 : 124;
  if (includes(p, "corriendo", "running")) return 172;
  return STYLES[style].bpm;
}
function sections(energia) {
  const e = energia || "";
  if (includes(e, "poco a poco", "little by little")) return [
    { nombre: "Intro", compases: 8, que: L("Solo textura y acordes, muy suave.", "Only texture and chords, very soft.") },
    { nombre: L("Crece", "Grows"), compases: 16, que: L("Entra la percusión, luego el bajo.", "Drums come in, then the bass.") },
    { nombre: L("Plena", "Full"), compases: 16, que: L("Todo sonando, con la melodía.", "Everything playing, with the melody.") },
    { nombre: L("Final", "Ending"), compases: 8, que: L("Se van quitando capas.", "Layers drop out one by one.") }];
  if (includes(e, "explosión", "explosion")) return [
    { nombre: L("Intro calmada", "Calm intro"), compases: 16, que: L("Acordes y textura, sin bombo.", "Chords and texture, no kick.") },
    { nombre: L("Subida", "Build-up"), compases: 8, que: L("Filtro que se abre y redoble.", "An opening filter and a drum fill.") },
    { nombre: L("Silencio", "Silence"), compases: 1, que: L("Un compás casi vacío: el oído se prepara.", "An almost empty bar: the ear gets ready.") },
    { nombre: L("Explosión (drop)", "Explosion (drop)"), compases: 16, que: L("Bombo, bajo y todo a la vez.", "Kick, bass and everything at once.") },
    { nombre: L("Calma final", "Calm ending"), compases: 8, que: L("Vuelven solo los acordes.", "Only the chords come back.") }];
  if (includes(e, "olas", "waves")) return [
    { nombre: L("Ola 1", "Wave 1"), compases: 16, que: L("El filtro se abre y se cierra.", "The filter opens and closes.") },
    { nombre: L("Respiro", "Breather"), compases: 8, que: L("Sin percusión.", "No drums.") },
    { nombre: L("Ola 2", "Wave 2"), compases: 16, que: L("Igual, con melodía nueva.", "Same, with a new melody.") }];
  if (includes(e, "apagando", "fades")) return [
    { nombre: L("Todo arriba", "All up"), compases: 16, que: L("Empieza con todo sonando.", "Starts with everything playing.") },
    { nombre: L("Se apaga", "Fading"), compases: 16, que: L("Cada 4 compases se va una capa.", "Every 4 bars a layer leaves.") },
    { nombre: L("Eco final", "Final echo"), compases: 8, que: L("Solo un eco de la melodía.", "Just an echo of the melody.") }];
  return [
    { nombre: L("Bloque A", "Block A"), compases: 16, que: L("El patrón principal.", "The main pattern.") },
    { nombre: L("Bloque B", "Block B"), compases: 16, que: L("Variación: cambian los acordes o entra la melodía.", "Variation: the chords change or the melody comes in.") },
    { nombre: L("Bloque A'", "Block A'"), compases: 16, que: L("Vuelve A con un detalle nuevo.", "A returns with a new detail.") }];
}

const SOUND_TO_COMP = {
  "Piano": ["chords_min", "rhodes"], "Sintes brillantes": ["arp", "stabs"], "Bajo profundo": ["bass_sub", "bass_off"],
  "Batería potente": null, "Bright synths": ["arp", "stabs"], "Deep bass": ["bass_sub", "bass_off"], "Powerful drums": null,
  "Soft percussion": ["shaker"], "Nature": ["birds", "wind"], "Digital noises": ["glitch"], "Bells": ["bell"], "Organ": ["stabs"], "Percusión suave": ["shaker"], "Naturaleza": ["birds", "wind"], "Ruidos digitales": ["glitch"],
  "Campanas": ["bell"], "Órgano": ["stabs"],
};
const DRUMS = { house: "kick4", techno: "kick4", hiphop: "kickhh", lofi: "lofidrums", ambient: "shaker", reggaeton: "dembow", dnb: "amen" };
const WHY = {
  percusion: [L("Pulso", "Pulse"), L("Es la base: marca el paso que has elegido.", "It's the foundation: it sets the pace you chose.")],
  bajo: [L("Graves y groove", "Low end and groove"), L("Le da peso y movimiento a la canción.", "It gives the song weight and movement.")],
  armonia: [L("Armonía", "Harmony"), L("Pone el color emocional que buscas.", "It sets the emotional color you're after.")],
  melodia: [L("Melodía", "Melody"), L("Es lo que se te quedará en la cabeza.", "It's what will stick in your head.")],
  textura: [L("Atmósfera", "Atmosphere"), L("Pinta la imagen que me has descrito.", "It paints the image you described.")],
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
    const s = { titulo: titulo || L(`Yo empezaría con «${c.nombre}»`, `I'd start with «${c.nombre}»`), porque: `${c.desc} ${porque}`, concepto,
      cambios: { pistas: [{ id, nombre: c.nombre, tipo: c.cat, codigo: extraWrap + c.codigo }] } };
    sugerencias.push(s); return s;
  };

  const sounds = String(a.sonidos || "").split(" · ").filter(Boolean);
  const sorpresa = String(a.sorpresa || "");
  const drumComp = DRUMS[style];
  // La sorpresa elegida se aplica sobre la percusión principal
  let wrap = "";
  let surpriseTitle = "";
  if (includes(sorpresa, "silencio", "silence")) { wrap = "whenmod 16 15 (const silence) $ "; surpriseTitle = L("Yo pondría el ritmo con un silencio de golpe cada 16 compases", "I'd set the beat with a sudden silence every 16 bars"); }
  else if (includes(sorpresa, "redoble", "fill")) { wrap = "every 8 (fast 2) $ "; surpriseTitle = L("Yo pondría el ritmo con un redoble cada 8 compases", "I'd set the beat with a drum fill every 8 bars"); }
  if (style !== "ambient" || (sounds.includes("Batería potente") || sounds.includes("Powerful drums"))) {
    const s = addComp(drumComp, surpriseTitle || L("Yo empezaría por el ritmo", "I'd start with the beat"), wrap);
    if (s && wrap) { s.concepto = L("Sorpresa y estructura", "Surprise and structure"); s.porque += L(" Y el cambio que pediste hace que el oído se sorprenda y vuelva a prestar atención.", " And the change you asked for surprises the ear and makes it pay attention again."); }
  }
  for (const snd of sounds) {
    const opts = SOUND_TO_COMP[snd];
    if (!opts) continue;
    const comp = opts.find((id) => byId[id].estilos.includes(style)) || opts[0];
    if (sugerencias.some((x) => x.cambios.pistas[0].nombre === byId[comp].nombre)) continue;
    addComp(comp, L(`Para «${snd}», yo probaría «${byId[comp].nombre}»`, `For «${snd}», I'd try «${byId[comp].nombre}»`));
  }
  if (!sugerencias.some((s) => s.cambios.pistas[0].tipo === "bajo") && style !== "ambient")
    addComp(["dnb", "ambient"].includes(style) ? "bass_sub" : style === "techno" ? "bass_roll" : style === "house" ? "bass_off" : "bass_hh", L("Le pondría un bajo que acompañe", "I'd add a bass to go along"));
  if (includes(Object.values(a).join(" "), "melancol", "nostalgia", "lluvia", "rain") && !sugerencias.some((s) => s.cambios.pistas[0].tipo === "armonia"))
    addComp("chords_min", L("Yo usaría acordes menores para esa emoción", "I'd use minor chords for that emotion"));
  if (includes(sorpresa, "melodía", "melody")) addComp("arpy", L("Una melodía que solo aparezca en los últimos 4 de cada 16 compases", "A melody that only appears in the last 4 of every 16 bars"), 'mask "<f!12 t!4>" $ ');
  if (includes(sorpresa, "filtro", "filter") || includes(a.energia || "", "olas", "waves")) {
    const s = sugerencias.find((x) => ["armonia", "melodia", "bajo"].includes(x.cambios.pistas[0].tipo));
    if (s) { s.cambios.pistas[0].codigo += " # lpf (range 300 5000 $ slow 16 sine)"; s.porque += L(" Le he puesto un filtro que se abre y se cierra en 16 compases: así sube y baja la energía.", " I added a filter that opens and closes over 16 bars: that's how the energy rises and falls."); s.concepto = L("Dinámica", "Dynamics"); }
  }
  if (includes(sorpresa, "eco", "echo")) {
    const s = sugerencias.find((x) => ["melodia", "armonia"].includes(x.cambios.pistas[0].tipo));
    if (s) { s.cambios.pistas[0].codigo += " # delay 0.5 # delaytime 0.375 # delayfeedback 0.5"; s.porque += L(" Con un eco que se repite.", " With a repeating echo."); }
  }
  if (includes(sorpresa, "lado", "side")) {
    const s = sugerencias[sugerencias.length - 1];
    if (s) { s.cambios.pistas[0].codigo += " # pan sine"; s.porque += L(" Y viaja de un altavoz al otro.", " And it travels from one speaker to the other."); }
  }
  const st = STYLES[style];
  const imagen = a.imagen ? L(` Me imagino ${a.imagen.toLowerCase()}.`, ` I picture ${a.imagen.toLowerCase()}.`) : "";
  return {
    titulo: a.imagen ? capitalize(a.imagen) : L(`Tu canción ${st.nombre}`, `Your ${st.nombre} song`),
    resumen: L(`Una canción ${st.nombre.toLowerCase()} a ${bpm} BPM pensada para transmitir ${String(a.sensacion || "lo que sientes").toLowerCase().replaceAll(" · ", ", ")}.${imagen}`, `A ${st.nombre.toLowerCase()} song at ${bpm} BPM designed to convey ${String(a.sensacion || "what you feel").toLowerCase().replaceAll(" · ", ", ")}.${imagen}`),
    estilo: style, bpm, partes: sections(a.energia), sugerencias: sugerencias.slice(0, 6),
  };
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
