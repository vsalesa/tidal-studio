// "Recetas de estilo": transforman TU canción para que suene a otro género, paso a paso.
// Cada paso dice qué pista cambia y por qué, para que aprendas a hacerlo tú.

const free = (tracks, extra = []) => {
  const used = new Set([...tracks.map((t) => t.id), ...extra]);
  for (let i = 1; i <= 12; i++) if (!used.has("d" + i)) return "d" + i;
  return null;
};
const byKind = (tracks, k) => tracks.filter((t) => t.kind === k && !t.muted);
// Quita una envoltura previa del mismo tipo para no acumularlas
const unwrap = (code, fn) => code.replace(new RegExp(`^${fn}[^$]*\\$\\s*`), "");
const setParam = (code, p, v) => (new RegExp(`#\\s*${p}\\s+[-\\d.]+(?![\\w(])`).test(code)
  ? code.replace(new RegExp(`#\\s*${p}\\s+[-\\d.]+(?![\\w(])`), `# ${p} ${v}`) : `${code} # ${p} ${v}`);
const setSynth = (code, synth) => /#\s*s\s+"[^"]*"/.test(code) ? code.replace(/#\s*s\s+"[^"]*"/, `# s "${synth}"`) : `${code} # s "${synth}"`;
const jazzChords = (code) => code.replace(/'min7(?!')/g, "'min9").replace(/'maj7(?!')/g, "'maj9").replace(/'min(?![0-9a-z])/g, "'min7").replace(/'maj(?![0-9a-z])/g, "'maj7");

function step(t, code, explicacion) { return { pista: { id: t.id, nombre: t.name, tipo: t.kind, codigo: code }, explicacion }; }
function newTrack(id, nombre, tipo, code, explicacion) { return { pista: { id, nombre, tipo, codigo: code }, explicacion }; }

export const FLAVORS = {
  jazz: {
    nombre: "Jazz", bpm: 100, concepto: "Swing y acordes extendidos",
    pregunta: "¿Quieres que suene tipo jazz?",
    porque: "El jazz se reconoce por tres cosas: el swing (notas 'cojeando' con gracia), acordes con muchas notas y un bajo que camina.",
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) {
        let c = unwrap(t.code, "swingBy").replace(/bd\*4/g, "bd ~ [~ bd] ~");
        steps.push(step(t, `swingBy (1/3) 4 $ ${c}`, "«swingBy (1/3) 4» retrasa un poco cada segunda nota de cada tiempo: eso es el swing. Si había un bombo en cada tiempo, lo he hecho más suelto: en jazz el bombo apenas se nota."));
      }
      for (const t of byKind(tracks, "armonia")) {
        steps.push(step(t, `swingBy (1/3) 4 $ ${setSynth(jazzChords(unwrap(t.code, "swingBy")), "superpiano")}`,
          "He cambiado los acordes por versiones con más notas: 'min7 pasa a 'min9 y 'maj7 a 'maj9 (más color, más 'jazz'). Y suena con piano."));
      }
      const bass = byKind(tracks, "bajo")[0];
      const walking = 'n "<[c2 e2 g2 a2] [f2 a2 c3 a2]>" # s "superpwm" # lpf 500 # legato 0.9 # gain 0.9';
      if (bass) steps.push(step(bass, walking, "Bajo «caminante»: una nota en cada tiempo, subiendo por las notas del acorde. Es el bajo típico del contrabajo de jazz."));
      else { const id = free(tracks); if (id) steps.push(newTrack(id, "Bajo caminante", "bajo", walking, "Añado un bajo «caminante»: una nota por tiempo recorriendo el acorde, como un contrabajo.")); }
      if (!byKind(tracks, "armonia").length) {
        const id = free(tracks, steps.map((s) => s.pista.id));
        if (id) steps.push(newTrack(id, "Acordes jazz", "armonia", `swingBy (1/3) 4 $ n "<d'min9 g'dom7 c'maj9 c'maj9>" # s "superpiano" # legato 0.8 # room 0.3 # gain 0.75`,
          "Añado la progresión más famosa del jazz: II-V-I (Re menor, Sol séptima, Do mayor)."));
      }
      for (const t of byKind(tracks, "melodia")) steps.push(step(t, `swingBy (1/3) 4 $ ${unwrap(t.code, "swingBy")}`, "La melodía también con swing, para que todo 'cojee' a la vez."));
      return steps;
    },
  },
  latino: {
    nombre: "Latino (bossa)", bpm: 110, concepto: "Clave y síncopa",
    pregunta: "¿Y si le damos un aire latino, tipo bossa nova?",
    porque: "La música latina se apoya en la «clave»: un patrón de 5 golpes que organiza todo el ritmo. Y en un bajo que alterna la nota principal y su quinta.",
    recipe(tracks) {
      const steps = [];
      const id = free(tracks);
      if (id) steps.push(newTrack(id, "Clave 3-2", "percusion", 's "rm ~ ~ rm ~ ~ rm ~ ~ ~ rm ~ rm ~ ~ ~" # gain 0.9',
        "La clave 3-2: tres golpes en la primera mitad y dos en la segunda. Cuenta los ~ (silencios): hay 16 huecos por compás."));
      for (const t of byKind(tracks, "percusion").slice(0, 1)) steps.push(step(t, 's "bd ~ ~ bd bd ~ ~ bd" # gain 0.9', "El bombo de la bossa: «pum… pum-pum… pum», un patrón que se balancea."));
      const bass = byKind(tracks, "bajo")[0];
      const bossaBass = 'n "<[c2 ~ ~ g1 c2 ~ ~ g1] [f1 ~ ~ c2 f1 ~ ~ c2]>" # s "superpwm" # lpf 500 # legato 0.8';
      if (bass) steps.push(step(bass, bossaBass, "Bajo de bossa: alterna la nota del acorde (c) con su quinta (g). Es la base de la bossa nova."));
      for (const t of byKind(tracks, "armonia")) {
        const m = t.code.match(/\bn\s+"([^"]*)"/);
        const offbeat = m && !m[1].startsWith("[~") ? t.code.replace(m[0], `n "[~ ${m[1]}]*2"`) : t.code;
        steps.push(step(t, setSynth(jazzChords(offbeat), "superpiano"),
          "Acordes a contratiempo (después del ~) y con más notas: así suenan sincopados, como una guitarra de bossa."));
      }
      return steps;
    },
  },
  techno: {
    nombre: "Techno", bpm: 130, concepto: "Repetición hipnótica",
    pregunta: "¿Probamos a hacerla más techno, oscura y repetitiva?",
    porque: "El techno hipnotiza repitiendo casi lo mismo y cambiando poco a poco el sonido (filtros), no las notas.",
    recipe(tracks) {
      const steps = [];
      const kick = byKind(tracks, "percusion")[0];
      if (kick) steps.push(step(kick, 's "bd*4" # gain 1.15 # shape 0.3', "Bombo en cada tiempo, con un poco de distorsión (# shape) para que pegue más."));
      const id = free(tracks);
      if (id) steps.push(newTrack(id, "Hi-hat abierto", "percusion", 's "[~ oh]*4" # gain 0.8 # hpf 6000', "Hi-hat entre bombos: «pum-tss-pum-tss», el motor del techno."));
      const bass = byKind(tracks, "bajo")[0];
      if (bass) steps.push(step(bass, 'n "c2*16" # s "supersaw" # lpf (range 200 1200 $ slow 8 sine) # legato 0.3 # gain 0.75',
        "Bajo rodante: la misma nota 16 veces, y un filtro (lpf) que se abre y se cierra cada 8 compases con «slow 8 sine». La nota no cambia; cambia el brillo."));
      for (const t of byKind(tracks, "armonia")) steps.push(step(t, setParam(setParam(t.code, "lpf", "(range 300 2500 $ slow 16 sine)"), "room", 0.5),
        "Los acordes se filtran muy despacio (16 compases): parece que se acercan y se alejan."));
      return steps;
    },
  },
  lofi: {
    nombre: "Lo-fi", bpm: 80, concepto: "Textura y calidez",
    pregunta: "¿Te apetece una versión lo-fi, tranquila y con sonido de vinilo?",
    porque: "El lo-fi es sonido 'imperfecto' a propósito: menos agudos, un poco de ruido y un ritmo relajado que arrastra.",
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) steps.push(step(t, `swingBy (1/6) 4 $ ${setParam(unwrap(t.code, "swingBy"), "lpf", 2500)}`,
        "Un poco de swing (1/6, más sutil que en jazz) y menos agudos con # lpf: la batería suena 'detrás de una manta'."));
      for (const t of [...byKind(tracks, "armonia"), ...byKind(tracks, "melodia")]) steps.push(step(t, setParam(setParam(t.code, "lpf", 2000), "crush", 7),
        "# crush 7 baja la calidad del sonido (como una cinta vieja) y # lpf 2000 lo hace más cálido."));
      const id = free(tracks);
      if (id) steps.push(newTrack(id, "Vinilo", "textura", 's "noise*16?" # hpf 6000 # gain 0.5 # legato 0.05', "Crujido de vinilo: ruido muy corto y agudo que aparece al azar (el «?»)."));
      return steps;
    },
  },
  ambient: {
    nombre: "Ambient", bpm: 70, concepto: "Espacio y lentitud",
    pregunta: "¿Y si la convertimos en algo ambient, lento y espacioso?",
    porque: "En el ambient el ritmo casi desaparece: lo importante son los sonidos largos, el espacio (reverb) y los cambios muy lentos.",
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) steps.push(step(t, `degradeBy 0.7 $ slow 2 $ ${setParam(setParam(t.code, "room", 0.7), "gain", 0.6)}`,
        "La percusión casi desaparece: «slow 2» la hace el doble de lenta y «degradeBy 0.7» quita el 70 % de los golpes al azar."));
      for (const t of byKind(tracks, "armonia")) steps.push(step(t, setParam(setParam(setParam(t.code, "legato", 2), "room", 0.9), "size", 0.95),
        "Acordes larguísimos (# legato 2: cada uno se solapa con el siguiente) en una sala enorme (# room y # size)."));
      for (const t of byKind(tracks, "melodia")) steps.push(step(t, `slow 2 $ ${setParam(setParam(t.code, "room", 0.8), "delay", 0.5)}`, "Melodía más lenta y con eco: las notas flotan."));
      for (const t of byKind(tracks, "bajo")) steps.push(step(t, 'n "<c2 a1 f1 g1>" # s "supersquare" # lpf 200 # legato 1 # gain 0.8', "Bajo de una sola nota larga por compás: un suelo suave, sin ritmo."));
      return steps;
    },
  },
};

export function flavorIdea(key, tracks) {
  const f = FLAVORS[key];
  const steps = f.recipe(tracks);
  if (!steps.length) return null;
  return {
    titulo: f.pregunta, porque: f.porque, concepto: f.concepto, flavor: key,
    cambios: { bpm: f.bpm, pistas: steps.map((s) => s.pista) },
    pasos: Object.fromEntries(steps.map((s) => [s.pista.id, s.explicacion])),
  };
}
