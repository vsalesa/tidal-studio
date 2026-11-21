// "Doctor" de código: cuando el alumno edita una pista y no suena como quiere (o da error),
// Maestro revisa el código sin IA, explica qué pasa y propone un arreglo.
// diagnose(code, ctx) -> lista de problemas; fixLocal(code, wish, ctx) -> { diagnostico, explicacion[], codigo }
import { L } from "./i18n.js";
import { SOUNDS, FUNCS, PARAMS } from "./explain.js";
import { fixNegatives } from "./controls.js";

// Bancos de sonidos habituales de SuperDirt (Dirt-Samples) y sintes incluidos
const BANKS = (
  "808 808bd 808cy 808hc 808ht 808lc 808lt 808mc 808mt 808oh 808sd 909 ab ade ades2 ades3 ades4 alex alphabet amencutup " +
  "armora arp arpy auto baa baa2 bass bass0 bass1 bass2 bass3 bassdm bassfoo battles bd bend bev bin birds birds3 bleep " +
  "blip blue bottle breaks125 breaks152 breaks157 breaks165 breath bubble can casio cb cc chin circus clak click clubkick " +
  "co coins control cosmicg cp cr crow d db diphone diphone2 dist dork2 dorkbot dr dr2 dr55 dr_few drum drumtraks e east " +
  "electro1 em2 erk f feel feelfx fest fire flick fm foo future gab gabba gabbaloud gabbalouder glasstap glitch glitch2 " +
  "gretsch gtr h hand hardcore hardkick haw hc hh hh27 hit hmm ho hoover house ht if ifdrums incoming industrial insect " +
  "invaders jazz jungbass jungle juno jvbass kicklinn koy kurt latibro led less lighter linnhats lt made made2 mash mash2 " +
  "metal miniyeah monsterb moog mouth mp3 msg mt mute newnotes noise noise2 notes num numbers oc odx off outdoor pad " +
  "padlong pebbles perc peri pluck popkick print proc procshort psr rave rave2 ravemono realclaps reverbkick rm rs sax sd " +
  "seawolf sequential sf sheffield short sid simplesine sitar sn space speakspell speech speechless speedupdown stab stomp " +
  "subroc3d sugar sundance tabla tabla2 tablex tacscan tech techno tink tok toys trump ul ulgab uxay v voodoo wind wobble " +
  "world xmas yeah sosbass soskick super808 superchip superclap supercomparator superfm supergong superhammond superhat " +
  "superhoover superkick supermandolin superpiano superpwm supersaw supersiren supersnare supersquare superstatic " +
  "supertrumpet superzow sawtooth saw square triangle tri pulse sine sinewave").split(" ");
const SOUND_SET = new Set([...BANKS, ...Object.keys(SOUNDS)]);
const PARAM_SET = new Set([...Object.keys(PARAMS), "s", "n", "note", "sound", "orbit", "cut", "begin", "end", "loop", "squiz", "lpq",
  "hpq", "bandf", "bandq", "djf", "dry", "up", "attack", "release", "hold", "sustain", "voice", "detune", "octave", "amp", "velocity",
  "unit", "nudge", "cps", "lock", "dist", "triode", "krush", "kcutoff", "ring", "ringf", "comb", "smear", "scram", "binshift", "hbrick",
  "lbrick", "waveloss", "enhance", "octer", "fshift", "phaserrate", "phaserdepth", "tremolorate", "tremolodepth", "leslie", "lrate", "lsize"]);
const FUNC_NAMES = [...new Set([...FUNCS.map(([re]) => re.source.replace(/[\^$]/g, "").split("|")[0]), "silence", "id", "hurry",
  "rot", "ply", "iter", "palindrome", "brak", "stut", "inside", "outside", "within", "euclid", "euclidFull", "range", "rangex", "perlin",
  "square", "tri", "saw", "isaw", "cosine", "choose", "cycleChoose", "wchoose", "someCycles", "someCyclesBy", "almostNever", "almostAlways",
  "never", "always", "toScale", "chunk", "linger", "trunc", "superimpose", "layer", "overlay", "cat", "fastcat", "slowcat", "randcat",
  "while", "struct", "sew", "stitch", "fix", "unfix", "contrast", "squeeze", "ur", "loopAt", "splice", "slice", "randslice", "bite",
  "chew", "nTake", "fastGap", "compress", "zoom", "swing", "ghost", "inv", "degrade", "unDegradeBy", "sometimesBy'", "whenT", "fastSqueeze",
  "arpeggiate", "rolled", "rolledBy", "plyWith", "stutWith", "echoWith", "jux", "juxBy", "pan", "every'", "foldEvery", "when", "ifp",
  "number", "quantise", "smooth", "discretise", "irand", "rand", "segment", "sine", "scale", "arp", "off", "mask", "swingBy", "slow", "fast",
  "every", "whenmod", "rev", "chop", "striate", "degradeBy", "sometimesBy", "sometimes", "rarely", "often", "stack", "const", "echo"])];
const WRAPPERS = /^(every|whenmod|fast|slow|hurry|jux|degradeBy|sometimesBy|sometimes|rarely|often|mask|swingBy|off|rev|chop|striate|iter|ply|palindrome|superimpose|within|chunk|linger|segment)\b/;

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function closest(word, list, max = 2) {
  let best = null, bd = max + 1;
  for (const w of list) { const x = lev(word.toLowerCase(), w.toLowerCase()); if (x < bd) { bd = x; best = w; } }
  return bd <= max ? best : null;
}
// Quita el contenido de las comillas para analizar solo el "código de fuera"
const outside = (code) => code.replace(/"[^"]*"/g, '""');
const strings = (code) => [...code.matchAll(/"([^"]*)"/g)].map((m) => m[1]);

function balance(text, open, close) {
  let n = 0;
  for (const ch of text) { if (ch === open) n++; else if (ch === close) { n--; if (n < 0) return -1; } }
  return n;
}

// ------------------------------------------------------------------ diagnóstico
export function diagnose(code, ctx = {}) {
  const out = [];
  const add = (nivel, titulo, explicacion, arreglo) => out.push({ nivel, titulo, explicacion, arreglo });
  let fixed = code;

  // 0. "d1 $" escrito dentro de la pista
  if (/^\s*d\d+\s*\$/.test(code)) {
    fixed = code.replace(/^\s*d\d+\s*\$\s*/, "");
    add("error", L("Sobra el «dN $» del principio", "The leading «dN $» is extra"),
      L("Cada pista ya pone su «dN $» automáticamente. Escribe solo lo que va después.", "Each track already adds its «dN $» automatically. Write only what comes after it."), fixed);
  }
  // 1. Comillas
  if ((code.match(/"/g) || []).length % 2) {
    add("error", L("Falta cerrar unas comillas", "A quote is not closed"),
      L("Todo lo que va entre comillas (la mini-notación) necesita comillas de apertura y de cierre: s \"bd sn\".", "Everything in quotes (the mini-notation) needs an opening and a closing quote: s \"bd sn\"."),
      fixed + '"');
    return out; // con comillas rotas el resto del análisis no es fiable
  }
  // 2. Paréntesis fuera de comillas
  const out0 = outside(code);
  const par = balance(out0, "(", ")");
  if (par !== 0) add("error", par > 0 ? L("Falta cerrar un paréntesis", "A bracket is not closed") : L("Sobra un paréntesis de cierre", "There's an extra closing bracket"),
    L("Cada «(» necesita su «)». Cuéntalos: tiene que haber los mismos.", "Every «(» needs its «)». Count them: there must be the same number."),
    par > 0 ? fixed + ")".repeat(par) : null);
  // 3. Corchetes y < > dentro de la mini-notación
  for (const s of strings(code)) {
    for (const [o, c, name] of [["[", "]", L("corchete", "square bracket")], ["<", ">", L("signo < >", "< > sign")], ["{", "}", L("llave", "curly brace")]]) {
      const b = balance(s, o, c);
      if (b !== 0) add("error", L(`Dentro de "${s}" falta cerrar un ${name}`, `Inside "${s}" a ${name} is not closed`),
        L(`En la mini-notación, cada «${o}» necesita su «${c}».`, `In mini-notation, every «${o}» needs its «${c}».`),
        b > 0 ? fixed.replace(`"${s}"`, `"${s}${c.repeat(b)}"`) : null);
    }
  }
  // 4. Falta el $ tras una función que envuelve
  const head = code.trim();
  if (WRAPPERS.test(head) && !/\$/.test(out0) && /\b(s|n|sound|note)\s+"/.test(head) && !/^\w+[^(]*\(\s*(s|n|sound|note)\s+"/.test(head)) {
    const m = head.match(/\s(s|n|sound|note)\s+"/);
    if (m) {
      const at = head.indexOf(m[0]);
      const arreglo = head.slice(0, at) + " $" + head.slice(at);
      add("error", L("Falta el «$»", "The «$» is missing"),
        L(`«${head.split(/\s/)[0]}» transforma el patrón que tiene a la derecha, y el «$» se lo dice a Tidal: «aplícalo a todo lo de la derecha».`,
          `«${head.split(/\s/)[0]}» transforms the pattern on its right, and the «$» tells Tidal: «apply it to everything on the right».`), arreglo);
    }
  }
  // 5. Sonidos que no existen
  for (const m of code.matchAll(/\b(?:s|sound)\s+"([^"]*)"/g)) {
    const words = m[1].replace(/[\[\]<>{}(),|*\/!?.~@]/g, " ").split(/\s+/).filter((w) => w && !/^\d/.test(w)).map((w) => w.split(":")[0]);
    for (const w of new Set(words)) {
      if (SOUND_SET.has(w) || /^[tf]$/.test(w)) continue;
      const sug = closest(w, [...SOUND_SET]);
      add("aviso", L(`No conozco el sonido «${w}»`, `I don't know the sound «${w}»`),
        sug ? L(`¿Querías decir «${sug}»? Si el nombre no existe, SuperDirt no hace ningún ruido.`, `Did you mean «${sug}»? If the name doesn't exist, SuperDirt makes no sound.`)
          : L("Si no existe en SuperDirt, esa nota no sonará. Mira la pestaña Registro: allí avisa de los sonidos que no encuentra.", "If it doesn't exist in SuperDirt, that note won't play. Check the Log tab: it reports sounds it can't find."),
        sug ? fixed.replace(m[0], m[0].replace(new RegExp(`\\b${w}\\b`, "g"), sug)) : null);
    }
  }
  // 5b. Números negativos sin paréntesis: «# speed -1» Haskell lo lee como «speed menos 1»
  if (fixNegatives(code) !== code) {
    const m = code.match(/#\s*([A-Za-z]\w*)\s+-(\d[\d.]*)/);
    add("error", L(`El número negativo necesita paréntesis: «# ${m[1]} (-${m[2]})»`, `The negative number needs brackets: «# ${m[1]} (-${m[2]})»`),
      L(`Sin paréntesis, Tidal lee «${m[1]} -${m[2]}» como «${m[1]} menos ${m[2]}» (una resta) y da un error que nombra «${m[1]}». Con «(-${m[2]})» entiende que es un número negativo.`,
        `Without brackets, Tidal reads «${m[1]} -${m[2]}» as «${m[1]} minus ${m[2]}» (a subtraction) and gives an error that names «${m[1]}». With «(-${m[2]})» it knows it's a negative number.`),
      fixNegatives(fixed));
    fixed = fixNegatives(fixed);
  }
  // 6. Efectos (#) mal escritos
  for (const m of out0.matchAll(/#\s*([A-Za-z]\w*)/g)) {
    const p = m[1];
    if (PARAM_SET.has(p)) continue;
    const sug = closest(p, [...PARAM_SET]);
    add("error", L(`El efecto «# ${p}» no existe`, `The effect «# ${p}» doesn't exist`),
      sug ? L(`¿Querías decir «# ${sug}»?`, `Did you mean «# ${sug}»?`) : L("Revisa cómo se escribe: Tidal distingue mayúsculas y minúsculas.", "Check the spelling: Tidal is case-sensitive."),
      sug ? fixed.replace(new RegExp(`#\\s*${p}\\b`), `# ${sug}`) : null);
  }
  // 7. Funciones desconocidas que señala el error de Tidal
  for (const m of String(ctx.error || "").matchAll(/not in scope:\s*[‘'`"]?([\w']+)/gi)) {
    const w = m[1];
    if (!new RegExp(`\\b${w}\\b`).test(code)) continue; // el error es de otra pista
    const sug = closest(w, FUNC_NAMES) || closest(w, [...PARAM_SET]);
    add("error", L(`Tidal no conoce «${w}»`, `Tidal doesn't know «${w}»`),
      sug ? L(`¿Querías escribir «${sug}»? Una letra cambiada basta para que Tidal no lo entienda.`, `Did you mean «${sug}»? One wrong letter is enough for Tidal not to understand it.`)
        : L("Puede ser una palabra mal escrita o que falten comillas alrededor de los sonidos.", "It may be a misspelled word or missing quotes around the sounds."),
      sug ? fixed.replace(new RegExp(`\\b${w}\\b`), sug) : null);
  }
  if (ctx.error && /parse error/i.test(ctx.error) && !out.some((x) => x.nivel === "error"))
    add("error", L("Tidal no entiende cómo está escrito", "Tidal can't parse how it's written"),
      L("Suele ser un símbolo que falta o sobra: comillas, paréntesis, «$» o «#». Compara con la versión que funcionaba.", "Usually a missing or extra symbol: quotes, brackets, «$» or «#». Compare with the version that worked."), null);

  // 8. Cosas que hacen que no se oiga (o casi)
  const num = (p) => { const m = code.match(new RegExp(`#\\s*${p}\\s+(-?[\\d.]+)(?![\\w(])`)); return m ? parseFloat(m[1]) : null; };
  if (ctx.muted) add("aviso", L("La pista está silenciada", "The track is muted"), L("Pulsa el botón del altavoz para volver a oírla.", "Press the speaker button to hear it again."), null);
  const g = num("gain");
  if (g !== null && g <= 0.2) add("aviso", L(`El volumen está casi a cero (# gain ${g})`, `The volume is almost zero (# gain ${g})`), L("1 es el volumen normal. Prueba con 0.9.", "1 is normal volume. Try 0.9."), code.replace(/#\s*gain\s+[\d.]+/, "# gain 0.9"));
  if (g !== null && g > 1.4) add("aviso", L(`Volumen muy alto (# gain ${g})`, `Very high volume (# gain ${g})`), L("Por encima de 1.3 puede saturar y tapar a las demás pistas.", "Above 1.3 it can distort and drown out the other tracks."), code.replace(/#\s*gain\s+[\d.]+/, "# gain 1.1"));
  const lpf = num("lpf") ?? num("cutoff");
  if (lpf !== null && lpf < 120) add("aviso", L(`El filtro deja pasar muy poco (lpf ${lpf})`, `The filter lets very little through (lpf ${lpf})`), L("Con un número tan bajo apenas se oye. Prueba con 800 o más.", "With such a low number it's barely audible. Try 800 or more."), code.replace(/#\s*(lpf|cutoff)\s+[\d.]+/, "# $1 800"));
  const db = code.match(/degradeBy\s+([\d.]+)/);
  if (db && parseFloat(db[1]) >= 0.9) add("aviso", L(`degradeBy ${db[1]} quita casi todas las notas`, `degradeBy ${db[1]} removes almost every note`), L("Es el porcentaje que se quita al azar. Prueba con 0.3.", "It's the share removed at random. Try 0.3."), code.replace(/degradeBy\s+[\d.]+/, "degradeBy 0.3"));
  if (/\bspeed\s+0(?![.\d])/.test(code)) add("aviso", L("# speed 0 no suena", "# speed 0 makes no sound"), L("La velocidad 0 congela el sample. 1 es normal, 2 una octava arriba.", "Speed 0 freezes the sample. 1 is normal, 2 an octave up."), code.replace(/speed\s+0(?![.\d])/, "speed 1"));
  const strs = strings(code);
  if (strs.length && /\b(s|sound)\s+"/.test(code) && strs.every((s) => !s.replace(/[~\s\[\]<>,.*\d]/g, ""))) add("aviso", L("Solo hay silencios (~)", "There are only rests (~)"), L("«~» es un silencio. Pon algún sonido entre las comillas.", "«~» is a rest. Put some sound inside the quotes."), null);
  const mask = code.match(/mask\s+"([^"]*)"/);
  if (mask && !/t/.test(mask[1])) add("aviso", L("El mask nunca deja sonar", "The mask never lets it play"), L("Con mask, «t» suena y «f» calla. Si no hay ninguna «t», la pista no suena nunca.", "With mask, «t» plays and «f» is silent. With no «t», the track never plays."), null);
  if (mask && /^\s*<f!\d+/.test(mask[1])) add("info", L("Empieza callada a propósito", "It starts silent on purpose"), L(`«mask "${mask[1]}"» deja la pista callada los primeros compases. Espera o cambia la primera «f» por «t» para oírla ya.`, `«mask "${mask[1]}"» keeps the track silent for the first bars. Wait, or change the first «f» to «t» to hear it now.`), null);
  return out;
}

// ------------------------------------------------------------------ arreglos según lo que quería el alumno
const setParam = (code, p, v) => (new RegExp(`#\\s*${p}\\s+[-\\d.]+(?![\\w(])`).test(code)
  ? code.replace(new RegExp(`#\\s*${p}\\s+[-\\d.]+(?![\\w(])`), `# ${p} ${v}`) : `${code} # ${p} ${v}`);
const getNum = (code, p, def) => { const m = code.match(new RegExp(`#\\s*${p}\\s+(-?[\\d.]+)(?![\\w(])`)); return m ? parseFloat(m[1]) : def; };
const round = (x) => Math.round(x * 100) / 100;

export const WISHES = [
  { id: "nosuena", es: "No suena", en: "No sound" },
  { id: "error", es: "Da error", en: "It errors" },
  { id: "fuerte", es: "Más fuerte", en: "Louder" },
  { id: "flojo", es: "Más flojo", en: "Quieter" },
  { id: "rapido", es: "Más rápido", en: "Faster" },
  { id: "lento", es: "Más lento", en: "Slower" },
  { id: "oscuro", es: "Más oscuro", en: "Darker" },
  { id: "brillante", es: "Más brillante", en: "Brighter" },
  { id: "espacio", es: "Con más espacio", en: "More space" },
  { id: "variado", es: "Menos repetitivo", en: "Less repetitive" },
];
export const wishLabel = (w) => L(w.es, w.en);

function matchWish(text) {
  const t = (text || "").toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  if (has("no suena", "no se oye", "no sound", "silent", "can't hear", "cant hear", "nothing")) return "nosuena";
  if (has("error", "falla", "no funciona", "doesn't work", "broken")) return "error";
  if (has("más fuerte", "mas fuerte", "louder", "volumen alto", "más alto", "mas alto")) return "fuerte";
  if (has("flojo", "bajito", "quieter", "softer", "más bajo", "mas bajo", "too loud", "demasiado fuerte")) return "flojo";
  if (has("rápid", "rapid", "faster", "quick")) return "rapido";
  if (has("lent", "slower", "slow")) return "lento";
  if (has("oscur", "apagad", "darker", "muffled", "grave")) return "oscuro";
  if (has("brill", "brighter", "agud", "claro")) return "brillante";
  if (has("espacio", "reverb", "space", "eco", "echo", "lejos")) return "espacio";
  if (has("repetit", "aburr", "boring", "varia", "variation")) return "variado";
  return null;
}

export function fixLocal(code, wishText, ctx = {}) {
  const wish = WISHES.find((w) => w.id === wishText)?.id || matchWish(wishText);
  const problems = diagnose(code, ctx);
  const firstFix = problems.find((p) => p.arreglo);
  const res = (diagnostico, codigo, explicacion) => ({ diagnostico, codigo, explicacion: explicacion || [], problemas: problems });

  if (wish === "nosuena" || wish === "error" || !wish || problems.some((p) => p.nivel === "error")) {
    if (firstFix) {
      // aplicar en cadena todos los arreglos automáticos de errores
      let c = code;
      for (let i = 0; i < 4; i++) { const p = diagnose(c, ctx).find((x) => x.arreglo && x.nivel === "error"); if (!p) break; c = p.arreglo; }
      if (c === code) c = firstFix.arreglo;
      const errs = problems.filter((p) => p.nivel === "error");
      const main = errs.length ? errs : problems;
      return res(main.length > 1 ? main.map((p) => p.titulo).join(". ") + "." : main[0].titulo + ". " + main[0].explicacion, c);
    }
    if (problems.length) return res(problems[0].titulo + ". " + problems[0].explicacion, null);
    if (wish === "nosuena") return res(L("El código parece correcto. Comprueba que el motor de sonido esté arrancado (pastilla «Sonido listo» arriba) y que «En vivo» esté activado, o pulsa el botón de tocar de la pista. Si usa mask, puede estar callada a propósito unos compases.",
      "The code looks correct. Check that the sound engine is running («Sound ready» at the top) and «Live» is on, or press the track's play button. If it uses mask, it may be silent on purpose for some bars."), null);
    if (!wish) return res(L("No he encontrado ningún error en el código. Elige qué querías conseguir (más fuerte, más lento…) o, con una IA conectada, descríbemelo con tus palabras.",
      "I didn't find any errors in the code. Pick what you wanted (louder, slower…) or, with an AI connected, describe it in your own words."), null);
  }
  const g = getNum(code, "gain", 1);
  switch (wish) {
    case "fuerte": return res(L(`Subo el volumen de ${g} a ${round(Math.min(1.3, g * 1.2))}.`, `I raise the volume from ${g} to ${round(Math.min(1.3, g * 1.2))}.`), setParam(code, "gain", round(Math.min(1.3, g * 1.2))),
      [{ fragmento: `# gain ${round(Math.min(1.3, g * 1.2))}`, explicacion: L("gain es el volumen: 1 es normal. Por encima de 1.3 empieza a saturar.", "gain is the volume: 1 is normal. Above 1.3 it starts to distort.") }]);
    case "flojo": return res(L(`Bajo el volumen de ${g} a ${round(g * 0.75)}.`, `I lower the volume from ${g} to ${round(g * 0.75)}.`), setParam(code, "gain", round(g * 0.75)),
      [{ fragmento: `# gain ${round(g * 0.75)}`, explicacion: L("gain es el volumen: menos de 1 suena más flojo.", "gain is the volume: below 1 is quieter.") }]);
    case "rapido": {
      if (/^slow\s+[\d.]+\s*\$\s*/.test(code)) return res(L("Quito el «slow» que la hacía ir lenta.", "I remove the «slow» that made it slow."), code.replace(/^slow\s+[\d.]+\s*\$\s*/, ""));
      return res(L("La hago ir el doble de rápido con «fast 2», sin cambiar el tempo de las demás pistas.", "I make it twice as fast with «fast 2», without changing the other tracks' tempo."), `fast 2 $ ${code}`,
        [{ fragmento: "fast 2 $", explicacion: L("Toca el patrón dos veces en cada compás. Si querías acelerar toda la canción, sube los BPM arriba.", "Plays the pattern twice per bar. To speed up the whole song, raise the BPM at the top.") }]);
    }
    case "lento": {
      if (/^fast\s+[\d.]+\s*\$\s*/.test(code)) return res(L("Quito el «fast» que la hacía ir rápida.", "I remove the «fast» that made it fast."), code.replace(/^fast\s+[\d.]+\s*\$\s*/, ""));
      return res(L("La hago ir a la mitad de velocidad con «slow 2».", "I make it half speed with «slow 2»."), `slow 2 $ ${code}`,
        [{ fragmento: "slow 2 $", explicacion: L("El patrón dura dos compases en vez de uno. Para toda la canción, baja los BPM.", "The pattern lasts two bars instead of one. For the whole song, lower the BPM.") }]);
    }
    case "oscuro": return res(L("Le quito agudos con un filtro paso bajo.", "I take off some highs with a low-pass filter."), setParam(code, "lpf", Math.round(Math.min(getNum(code, "lpf", 4000), 4000) * 0.4)),
      [{ fragmento: "# lpf", explicacion: L("Deja pasar solo las frecuencias por debajo de ese número (Hz). Menos número, más apagado.", "Lets through only frequencies below that number (Hz). Lower number, more muffled.") }]);
    case "brillante": {
      const lp = getNum(code, "lpf", null);
      if (lp !== null) return res(L(`Abro el filtro de ${lp} a ${Math.round(Math.min(lp * 2.5, 12000))} para que entren más agudos.`, `I open the filter from ${lp} to ${Math.round(Math.min(lp * 2.5, 12000))} to let more highs in.`), setParam(code, "lpf", Math.round(Math.min(lp * 2.5, 12000))));
      return res(L("Le quito algo de graves con un filtro paso alto: suena más claro.", "I remove some lows with a high-pass filter: it sounds clearer."), setParam(code, "hpf", 300),
        [{ fragmento: "# hpf 300", explicacion: L("Quita lo que hay por debajo de 300 Hz: menos peso, más claridad.", "Removes what's below 300 Hz: less weight, more clarity.") }]);
    }
    case "espacio": return res(L("Le añado reverb para que suene en una sala.", "I add reverb so it sounds like it's in a room."), setParam(setParam(code, "room", 0.5), "size", 0.8),
      [{ fragmento: "# room 0.5 # size 0.8", explicacion: L("room es cuánta reverb; size, el tamaño de la sala.", "room is how much reverb; size, the room size.") }]);
    case "variado": return res(L("Cada 4 compases la doy la vuelta con «rev»: misma idea, pero con sorpresa.", "Every 4 bars I reverse it with «rev»: same idea, with a surprise."), `every 4 rev $ ${code}`,
      [{ fragmento: "every 4 rev $", explicacion: L("Cada 4 compases toca el patrón al revés.", "Every 4 bars it plays the pattern backwards.") }]);
  }
  return res(L("No he encontrado ningún error.", "I didn't find any errors."), null);
}
