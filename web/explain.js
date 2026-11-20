// Explicador local del código Tidal (funciona sin IA).
// Recorre el código, reconoce funciones, efectos y la "mini-notación" de dentro de las comillas,
// y devuelve una lista de { fragmento, explicacion } para un principiante.

const SOUNDS = {
  bd: "bombo", kick: "bombo", clubkick: "bombo de club", "808bd": "bombo de caja de ritmos 808",
  sn: "caja (el 'chas')", "808sd": "caja de 808", cp: "palmada", hh: "hi-hat cerrado (platillo corto)",
  hh27: "hi-hat suave", oh: "hi-hat abierto (platillo largo)", ho: "hi-hat abierto", "808oh": "hi-hat abierto de 808",
  "808hc": "hi-hat cerrado de 808", cr: "platillo crash", rm: "rimshot (golpe en el aro)",
  lt: "tom grave", mt: "tom medio", ht: "tom agudo", perc: "percusión variada", tabla: "tabla india",
  amencutup: "el break 'amen' cortado en 32 trozos", breaks125: "un break de batería a 125 BPM",
  bass: "sample de bajo", bass1: "sample de bajo", bass3: "sample de bajo", jvbass: "bajo de sintetizador",
  arpy: "sonido de arpa/pluck afinado", pluck: "cuerda pulsada", gtr: "guitarra", casio: "teclado Casio",
  pad: "pad (sonido largo)", padlong: "pad muy largo", wind: "viento", birds: "pájaros", space: "sonidos espaciales",
  glitch: "ruidos digitales", noise: "ruido", industrial: "golpes metálicos",
  superpiano: "sintetizador de piano", supersaw: "sintetizador 'sierra' (brillante y gordo)",
  superpwm: "sintetizador de onda cuadrada variable (bajos redondos)", supersquare: "sintetizador de onda cuadrada",
  superhammond: "órgano Hammond", superchip: "sonido de videoconsola de 8 bits", supergong: "gong / campana",
  superfm: "sintetizador FM", superhoover: "sintetizador 'hoover' rave", supermandolin: "mandolina",
};

const FUNCS = [
  [/^s$|^sound$/, "elige QUÉ suena: el nombre del sonido o sample que va entre comillas."],
  [/^n$/, "elige la NOTA (en sintetizadores) o la variante del sample (n 0, n 1…)."],
  [/^note$/, "cambia la afinación del sonido a la nota indicada."],
  [/^stack$/, "pone varios patrones a sonar a la vez, uno encima de otro."],
  [/^every$/, "cada N ciclos (compases) aplica la transformación de los paréntesis."],
  [/^whenmod$/, "cuenta en bloques: 'whenmod 8 6' = en los compases 6 y 7 de cada 8 aplica el cambio."],
  [/^fast$/, "acelera el patrón (fast 2 = el doble de rápido)."],
  [/^slow$/, "ralentiza el patrón (slow 2 = dura el doble)."],
  [/^jux$/, "aplica un cambio solo en el altavoz derecho; el izquierdo queda igual. Crea estéreo."],
  [/^rev$/, "da la vuelta al patrón: suena de atrás hacia delante."],
  [/^degradeBy$/, "quita notas al azar (0.3 = quita un 30 %)."],
  [/^sometimesBy$/, "a veces, con la probabilidad indicada, aplica el cambio."],
  [/^sometimes$/, "la mitad de las veces aplica el cambio."],
  [/^rarely$/, "pocas veces aplica el cambio."],
  [/^often$/, "muchas veces aplica el cambio."],
  [/^arp$/, "arpegia: toca las notas de cada acorde una detrás de otra ('up' sube, 'down' baja, 'updown' sube y baja)."],
  [/^scale$/, "convierte números en notas de una escala (minPent, major, minor…), así nunca desafina."],
  [/^irand$/, "un número entero al azar entre 0 y el número indicado."],
  [/^segment$/, "divide el ciclo en N trozos iguales (para que lo aleatorio tenga ritmo)."],
  [/^range$/, "convierte una onda que va de 0 a 1 en valores entre los dos números."],
  [/^sine$/, "una onda suave que sube y baja (para movimientos lentos)."],
  [/^rand$/, "un valor al azar diferente en cada golpe."],
  [/^echo$/, "repite cada sonido: cuántas veces, cada cuánto y cuánto baja el volumen."],
  [/^off$/, "copia el patrón desplazado un poco en el tiempo, y le aplica un cambio."],
  [/^const$/, "sustituye el patrón por otra cosa; 'const silence' = silencio."],
  [/^silence$/, "nada, silencio."],
  [/^chop$/, "corta cada sonido en trocitos."],
  [/^striate$/, "corta y entrelaza los sonidos."],
];

const PARAMS = {
  gain: "volumen (1 es normal; más de 1 más fuerte).", room: "reverb: cuánto espacio/sala tiene (0 a 1).",
  size: "tamaño de la sala de la reverb (0 a 1).", sz: "tamaño de la sala de la reverb.",
  delay: "cantidad de eco.", delaytime: "tiempo entre ecos (en fracciones de compás).",
  delayfeedback: "cuántas veces se repite el eco (0 a 1).", lpf: "filtro paso bajo: quita los agudos por encima de esa frecuencia (Hz). Menos número = más apagado.",
  cutoff: "filtro paso bajo.", hpf: "filtro paso alto: quita los graves por debajo de esa frecuencia (Hz).",
  resonance: "resalta la frecuencia del filtro (silbido).", crush: "reduce los bits: suena a 8 bits (menos número = más sucio).",
  coarse: "baja la calidad de muestreo: más robótico.", shape: "distorsión (0 a 1).",
  pan: "posición izquierda-derecha (0 izquierda, 0.5 centro, 1 derecha).", speed: "velocidad de reproducción del sample (2 = una octava más agudo y más corto).",
  legato: "cuánto dura cada nota respecto a su hueco (1 = hasta la siguiente).", vowel: "filtro que imita vocales (a, e, i, o, u).",
  orbit: "canal de efectos.", accelerate: "cambia la afinación mientras suena.",
};

function explainMini(str) {
  const bits = [];
  const words = [...new Set(str.replace(/[\[\]<>{}(),|*\/!?.:~@]/g, " ").split(/\s+/).filter(Boolean))];
  const sounds = words.filter((w) => SOUNDS[w.split(":")[0]]).map((w) => `«${w}» = ${SOUNDS[w.split(":")[0]]}`);
  if (sounds.length) bits.push(sounds.join("; "));
  const chords = str.match(/[a-g][sf]?\d?'[a-z0-9]+(?:'\d+)?/g);
  if (chords) bits.push(`acordes: ${[...new Set(chords)].map(describeChord).join(", ")}`);
  if (str.includes("~")) bits.push("«~» es un silencio");
  const mult = str.match(/\*(\d+)/);
  if (mult) bits.push(`«*${mult[1]}» repite ${mult[1]} veces en ese hueco`);
  if (str.includes("[")) bits.push("«[ ]» mete varias cosas en un solo tiempo");
  if (str.includes("<")) bits.push("«< >» alterna: una opción en cada ciclo");
  if (str.includes("?")) bits.push("«?» hace que a veces no suene");
  if (str.includes(",")) bits.push("la coma «,» hace sonar varias capas a la vez");
  if (str.includes("..")) bits.push("«a .. b» cuenta de a hasta b");
  const steps = str.trim().split(/\s+(?![^\[]*\])(?![^<]*>)/).filter(Boolean).length;
  if (!str.includes(",") && steps > 1) bits.push(`el compás se divide en ${steps} partes iguales`);
  return bits.join(". ");
}

function describeChord(c) {
  const [root, type, count] = c.split("'");
  const names = { min7: "menor con séptima", maj7: "mayor con séptima", min: "menor", maj: "mayor",
    dom7: "de séptima (dominante)", maj9: "mayor con novena", min9: "menor con novena" };
  return `${root.toUpperCase()} ${names[type] || type}${count ? ` (${count} notas)` : ""}`;
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
    if (val.startsWith("(")) extra = " El valor cambia solo con el tiempo: " + explainExpr(val);
    partes.push({ fragmento: frag.trim(), explicacion: cap(PARAMS[p] || `efecto «${p}».`) + extra });
  }
  // 3. Funciones que transforman el patrón (antes de $ o entre paréntesis)
  for (const m of code.matchAll(/\b(every|whenmod|fast|slow|jux|degradeBy|sometimesBy|sometimes|rarely|often|arp|echo|off|stack|segment|chop|striate)\b[^$#"]*/g)) {
    const frag = m[0].trim().replace(/\s*\$$/, "");
    if (seen.has(m[1] + frag)) continue; seen.add(m[1] + frag);
    const f = FUNCS.find(([re]) => re.test(m[1]));
    partes.push({ fragmento: frag.length > 40 ? m[1] + " …" : frag, explicacion: cap(f[1]) });
  }
  if (/\$/.test(code)) partes.push({ fragmento: "$", explicacion: "Significa «aplica lo de la izquierda a todo lo de la derecha». Evita tener que poner paréntesis." });
  if (/#/.test(code)) partes.push({ fragmento: "#", explicacion: "Añade un ajuste (efecto, volumen, nota…) al patrón que tiene a la izquierda." });
  const resumen = partes.length ? "Esto es lo que hace cada parte:" : "No reconozco este código; conecta una IA para una explicación completa.";
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
