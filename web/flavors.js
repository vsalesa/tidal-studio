import { L } from "./i18n.js";
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
    nombre: "Jazz", bpm: 100, concepto: L("Swing y acordes extendidos", "Swing and extended chords"),
    pregunta: L("¿Quieres que suene tipo jazz?", "Want it to sound like jazz?"),
    porque: L("El jazz se reconoce por tres cosas: el swing (notas 'cojeando' con gracia), acordes con muchas notas y un bajo que camina.", "Jazz is recognized by three things: swing (notes 'limping' gracefully), chords with lots of notes and a walking bass."),
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) {
        let c = unwrap(t.code, "swingBy").replace(/bd\*4/g, "bd ~ [~ bd] ~");
        steps.push(step(t, `swingBy (1/3) 4 $ ${c}`, L("«swingBy (1/3) 4» retrasa un poco cada segunda nota de cada tiempo: eso es el swing. Si había un bombo en cada tiempo, lo he hecho más suelto: en jazz el bombo apenas se nota.", "«swingBy (1/3) 4» delays every second note of each beat a little: that's swing. If there was a kick on every beat, I loosened it: in jazz the kick is barely noticeable.")));
      }
      for (const t of byKind(tracks, "armonia")) {
        steps.push(step(t, `swingBy (1/3) 4 $ ${setSynth(jazzChords(unwrap(t.code, "swingBy")), "superpiano")}`,
          L("He cambiado los acordes por versiones con más notas: 'min7 pasa a 'min9 y 'maj7 a 'maj9 (más color, más 'jazz'). Y suena con piano.", "I swapped the chords for versions with more notes: 'min7 becomes 'min9 and 'maj7 becomes 'maj9 (more color, more 'jazz'). And it plays on piano.")));
      }
      const bass = byKind(tracks, "bajo")[0];
      const walking = 'n "<[c2 e2 g2 a2] [f2 a2 c3 a2]>" # s "superpwm" # lpf 500 # legato 0.9 # gain 0.9';
      if (bass) steps.push(step(bass, walking, L("Bajo «caminante»: una nota en cada tiempo, subiendo por las notas del acorde. Es el bajo típico del contrabajo de jazz.", "«Walking» bass: one note per beat, climbing through the chord notes. It's the typical jazz double bass line.")));
      else { const id = free(tracks); if (id) steps.push(newTrack(id, L("Bajo caminante", "Walking bass"), "bajo", walking, L("Añado un bajo «caminante»: una nota por tiempo recorriendo el acorde, como un contrabajo.", "I'm adding a «walking» bass: one note per beat moving through the chord, like a double bass."))); }
      if (!byKind(tracks, "armonia").length) {
        const id = free(tracks, steps.map((s) => s.pista.id));
        if (id) steps.push(newTrack(id, L("Acordes jazz", "Jazz chords"), "armonia", `swingBy (1/3) 4 $ n "<d'min9 g'dom7 c'maj9 c'maj9>" # s "superpiano" # legato 0.8 # room 0.3 # gain 0.75`,
          L("Añado la progresión más famosa del jazz: II-V-I (Re menor, Sol séptima, Do mayor).", "I'm adding the most famous jazz progression: II-V-I (D minor, G seventh, C major).")));
      }
      for (const t of byKind(tracks, "melodia")) steps.push(step(t, `swingBy (1/3) 4 $ ${unwrap(t.code, "swingBy")}`, L("La melodía también con swing, para que todo 'cojee' a la vez.", "The melody swings too, so everything 'limps' together.")));
      return steps;
    },
  },
  latino: {
    nombre: L("Latino (bossa)", "Latin (bossa)"), bpm: 110, concepto: L("Clave y síncopa", "Clave and syncopation"),
    pregunta: L("¿Y si le damos un aire latino, tipo bossa nova?", "What if we give it a Latin feel, like bossa nova?"),
    porque: L("La música latina se apoya en la «clave»: un patrón de 5 golpes que organiza todo el ritmo. Y en un bajo que alterna la nota principal y su quinta.", "Latin music rests on the «clave»: a 5-hit pattern that organizes the whole rhythm. And on a bass that alternates the root and its fifth."),
    recipe(tracks) {
      const steps = [];
      const id = free(tracks);
      if (id) steps.push(newTrack(id, L("Clave 3-2", "3-2 clave"), "percusion", 's "rm ~ ~ rm ~ ~ rm ~ ~ ~ rm ~ rm ~ ~ ~" # gain 0.9',
        L("La clave 3-2: tres golpes en la primera mitad y dos en la segunda. Cuenta los ~ (silencios): hay 16 huecos por compás.", "The 3-2 clave: three hits in the first half and two in the second. Count the ~ (rests): there are 16 slots per bar.")));
      for (const t of byKind(tracks, "percusion").slice(0, 1)) steps.push(step(t, 's "bd ~ ~ bd bd ~ ~ bd" # gain 0.9', L("El bombo de la bossa: «pum… pum-pum… pum», un patrón que se balancea.", "The bossa kick: «boom… boom-boom… boom», a swaying pattern.")));
      const bass = byKind(tracks, "bajo")[0];
      const bossaBass = 'n "<[c2 ~ ~ g1 c2 ~ ~ g1] [f1 ~ ~ c2 f1 ~ ~ c2]>" # s "superpwm" # lpf 500 # legato 0.8';
      if (bass) steps.push(step(bass, bossaBass, L("Bajo de bossa: alterna la nota del acorde (c) con su quinta (g). Es la base de la bossa nova.", "Bossa bass: alternates the chord's root (c) with its fifth (g). It's the foundation of bossa nova.")));
      for (const t of byKind(tracks, "armonia")) {
        const m = t.code.match(/\bn\s+"([^"]*)"/);
        const offbeat = m && !m[1].startsWith("[~") ? t.code.replace(m[0], `n "[~ ${m[1]}]*2"`) : t.code;
        steps.push(step(t, setSynth(jazzChords(offbeat), "superpiano"),
          L("Acordes a contratiempo (después del ~) y con más notas: así suenan sincopados, como una guitarra de bossa.", "Off-beat chords (after the ~) with more notes: that makes them syncopated, like a bossa guitar.")));
      }
      return steps;
    },
  },
  techno: {
    nombre: "Techno", bpm: 130, concepto: L("Repetición hipnótica", "Hypnotic repetition"),
    pregunta: L("¿Probamos a hacerla más techno, oscura y repetitiva?", "Shall we make it more techno, dark and repetitive?"),
    porque: L("El techno hipnotiza repitiendo casi lo mismo y cambiando poco a poco el sonido (filtros), no las notas.", "Techno hypnotizes by repeating almost the same thing and slowly changing the sound (filters), not the notes."),
    recipe(tracks) {
      const steps = [];
      const kick = byKind(tracks, "percusion")[0];
      if (kick) steps.push(step(kick, 's "bd*4" # gain 1.15 # shape 0.3', L("Bombo en cada tiempo, con un poco de distorsión (# shape) para que pegue más.", "A kick on every beat, with a bit of distortion (# shape) so it hits harder.")));
      const id = free(tracks);
      if (id) steps.push(newTrack(id, L("Hi-hat abierto", "Open hi-hat"), "percusion", 's "[~ ho]*4" # gain 0.8 # hpf 6000', L("Hi-hat entre bombos: «pum-tss-pum-tss», el motor del techno.", "Hi-hat between kicks: «boom-tss-boom-tss», the engine of techno.")));
      const bass = byKind(tracks, "bajo")[0];
      if (bass) steps.push(step(bass, 'n "c2*16" # s "supersaw" # lpf (range 200 1200 $ slow 8 sine) # legato 0.3 # gain 0.75',
        L("Bajo rodante: la misma nota 16 veces, y un filtro (lpf) que se abre y se cierra cada 8 compases con «slow 8 sine». La nota no cambia; cambia el brillo.", "Rolling bass: the same note 16 times, and a filter (lpf) that opens and closes every 8 bars with «slow 8 sine». The note doesn't change; the brightness does.")));
      for (const t of byKind(tracks, "armonia")) steps.push(step(t, setParam(setParam(t.code, "lpf", "(range 300 2500 $ slow 16 sine)"), "room", 0.5),
        L("Los acordes se filtran muy despacio (16 compases): parece que se acercan y se alejan.", "The chords are filtered very slowly (16 bars): they seem to come closer and move away.")));
      return steps;
    },
  },
  lofi: {
    nombre: "Lo-fi", bpm: 80, concepto: L("Textura y calidez", "Texture and warmth"),
    pregunta: L("¿Te apetece una versión lo-fi, tranquila y con sonido de vinilo?", "Fancy a lo-fi version, chill and with a vinyl sound?"),
    porque: L("El lo-fi es sonido 'imperfecto' a propósito: menos agudos, un poco de ruido y un ritmo relajado que arrastra.", "Lo-fi is 'imperfect' sound on purpose: fewer highs, a little noise and a laid-back, dragging beat."),
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) steps.push(step(t, `swingBy (1/6) 4 $ ${setParam(unwrap(t.code, "swingBy"), "lpf", 2500)}`,
        L("Un poco de swing (1/6, más sutil que en jazz) y menos agudos con # lpf: la batería suena 'detrás de una manta'.", "A bit of swing (1/6, subtler than jazz) and fewer highs with # lpf: the drums sound 'behind a blanket'.")));
      for (const t of [...byKind(tracks, "armonia"), ...byKind(tracks, "melodia")]) steps.push(step(t, setParam(setParam(t.code, "lpf", 2000), "crush", 7),
        L("# crush 7 baja la calidad del sonido (como una cinta vieja) y # lpf 2000 lo hace más cálido.", "# crush 7 lowers the sound quality (like an old tape) and # lpf 2000 makes it warmer.")));
      const id = free(tracks);
      if (id) steps.push(newTrack(id, L("Vinilo", "Vinyl"), "textura", 's "noise*16?" # hpf 6000 # gain 0.5 # legato 0.05', L("Crujido de vinilo: ruido muy corto y agudo que aparece al azar (el «?»).", "Vinyl crackle: very short, high noise that appears at random (the «?»).")));
      return steps;
    },
  },
  ambient: {
    nombre: "Ambient", bpm: 70, concepto: L("Espacio y lentitud", "Space and slowness"),
    pregunta: L("¿Y si la convertimos en algo ambient, lento y espacioso?", "What if we turn it into something ambient, slow and spacious?"),
    porque: L("En el ambient el ritmo casi desaparece: lo importante son los sonidos largos, el espacio (reverb) y los cambios muy lentos.", "In ambient the beat almost disappears: what matters are long sounds, space (reverb) and very slow changes."),
    recipe(tracks) {
      const steps = [];
      for (const t of byKind(tracks, "percusion")) steps.push(step(t, `degradeBy 0.7 $ slow 2 $ ${setParam(setParam(t.code, "room", 0.7), "gain", 0.6)}`,
        L("La percusión casi desaparece: «slow 2» la hace el doble de lenta y «degradeBy 0.7» quita el 70 % de los golpes al azar.", "The drums almost vanish: «slow 2» makes them twice as slow and «degradeBy 0.7» removes 70% of the hits at random.")));
      for (const t of byKind(tracks, "armonia")) steps.push(step(t, setParam(setParam(setParam(t.code, "legato", 2), "room", 0.9), "size", 0.95),
        L("Acordes larguísimos (# legato 2: cada uno se solapa con el siguiente) en una sala enorme (# room y # size).", "Very long chords (# legato 2: each overlaps the next) in a huge room (# room and # size).")));
      for (const t of byKind(tracks, "melodia")) steps.push(step(t, `slow 2 $ ${setParam(setParam(t.code, "room", 0.8), "delay", 0.5)}`, L("Melodía más lenta y con eco: las notas flotan.", "A slower melody with echo: the notes float.")));
      for (const t of byKind(tracks, "bajo")) steps.push(step(t, 'n "<c2 a1 f1 g1>" # s "supersquare" # lpf 200 # legato 1 # gain 0.8', L("Bajo de una sola nota larga por compás: un suelo suave, sin ritmo.", "A bass of one long note per bar: a soft floor, no rhythm.")));
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
