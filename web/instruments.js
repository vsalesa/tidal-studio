// Instrumentos ilustrados: batería interactiva y teclado para instrumentos melódicos.
// Ilustraciones dibujadas a mano en SVG (estilo «Partitura»), sin imágenes externas.
import { L } from "./i18n.js";

const INK = "#2a2620", IVORY = "#fbf6ea", BRASS = "#d9a531", BRASS_D = "#a8761a", RED = "#c4452c", RED_D = "#8f2d1b",
  CHROME = "#c9c3b8", WOOD = "#b5713b", WOOD_D = "#7d4a22", TEAL = "#1d7f86";
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

// ------------------------------------------------------------------ batería
export const DRUM_PIECES = {
  cr: { es: "Crash", en: "Crash cymbal", steps: [1, 0, 0, 0, 0, 0, 0, 0],
    tip: ["Platillo grande para marcar el inicio de una parte. Úsalo poco: un golpe al empezar una sección.", "Big cymbal that marks the start of a part. Use it sparingly: one hit when a section begins."] },
  ho: { es: "Hi-hat abierto", en: "Open hi-hat", steps: [0, 1, 0, 1, 0, 1, 0, 1],
    tip: ["Los dos platillos separados: un «tsss» largo. Entre bombo y bombo hace bailar (house).", "Both cymbals apart: a long «tsss». Between kicks it makes people dance (house)."] },
  hh: { es: "Hi-hat cerrado", en: "Closed hi-hat", steps: [1, 1, 1, 1, 1, 1, 1, 1],
    tip: ["Los platillos juntos: un «chk» corto. Marca el pulso rápido de la canción.", "Cymbals closed: a short «chk». It keeps the fast pulse of the song."] },
  ht: { es: "Tom agudo", en: "High tom", steps: [0, 0, 0, 0, 0, 1, 0, 0],
    tip: ["El tambor más pequeño y agudo. Los toms se usan para redobles al final de una frase.", "The smallest, highest drum. Toms are used for fills at the end of a phrase."] },
  mt: { es: "Tom medio", en: "Mid tom", steps: [0, 0, 0, 0, 0, 0, 1, 0],
    tip: ["Tom de altura media: junto al agudo y al grave forma una escalera de tambores.", "Medium-pitched tom: with the high and low ones it makes a staircase of drums."] },
  lt: { es: "Tom base (grave)", en: "Floor tom (low)", steps: [0, 0, 0, 0, 0, 0, 0, 1],
    tip: ["El tom más grave, apoyado en el suelo. Cierra los redobles con fuerza.", "The lowest tom, standing on the floor. It closes fills with power."] },
  bd: { es: "Bombo", en: "Kick drum", steps: [1, 0, 1, 0, 1, 0, 1, 0],
    tip: ["El tambor grande que se toca con el pie: el corazón del ritmo. En tiempos 1, 2, 3 y 4 es «a negras».", "The big drum played with the foot: the heart of the beat. On beats 1, 2, 3 and 4 it's «four on the floor»."] },
  sn: { es: "Caja", en: "Snare", steps: [0, 0, 1, 0, 0, 0, 1, 0],
    tip: ["Golpe seco y brillante. En los tiempos 2 y 4 es el «backbeat» de casi todo el pop, rock y hip hop.", "Dry, bright hit. On beats 2 and 4 it's the «backbeat» of almost all pop, rock and hip hop."] },
  rm: { es: "Aro (rimshot)", en: "Rimshot", steps: [0, 0, 0, 1, 0, 0, 1, 0],
    tip: ["Golpear el borde metálico de la caja: un «toc» seco, típico del reggaetón y la música latina.", "Hitting the snare's metal rim: a dry «tock», typical of reggaeton and Latin music."] },
};

function badge(p, x, y, lx, ly) {
  return `<g class="dk-badge" data-p="${p}"><path d="M${lx} ${ly}L${x} ${y}" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="13" fill="#fff" stroke="${INK}" stroke-width="2.4"/><text x="${x}" y="${y + 4.5}" text-anchor="middle">${p}</text></g>`;
}

export function drumKitSVG(sel = "", labels = true) {
  // sin etiquetas = miniatura: no es interactiva
  const on = (p) => labels ? `class="dk-p${sel === p ? " sel" : ""}" data-p="${p}"` : "";
  return `<svg class="drumkit" viewBox="0 0 330 222" role="img" aria-label="${L("Batería", "Drum kit")}">
  <ellipse cx="165" cy="212" rx="150" ry="7" fill="${INK}" opacity=".08"/>
  <g ${S} fill="none" opacity=".85"><path d="M62 58L62 200M62 200l-18 10M62 200l18 10M62 150l-18 60M62 150l18 60" stroke="#8a847a"/>
    <path d="M276 92V200M276 200l-16 10M276 200l16 10M276 160l-16 50M276 160l16 50" stroke="#8a847a"/>
    <path d="M251 160l-14 46M251 160l14 46M251 150v10" stroke="#8a847a"/>
    <path d="M160 100v-14M130 82l30 8 30-8" stroke="#8a847a"/></g>
  <g ${on("cr")}><ellipse cx="66" cy="50" rx="58" ry="11" transform="rotate(-9 66 50)" fill="${BRASS}" ${S}/><ellipse cx="62" cy="50" rx="10" ry="3.6" transform="rotate(-9 62 50)" fill="${BRASS_D}"/></g>
  <g ${on("lt")}><path d="M22 128v54c0 6 17 10 38 10s38-4 38-10v-54" fill="${RED}" ${S}/><path d="M22 140h76M22 172h76" stroke="${RED_D}" stroke-width="2"/><path d="M30 182l-4 22M90 182l4 22" ${S}/><ellipse cx="60" cy="128" rx="38" ry="10" fill="${IVORY}" ${S}/></g>
  <g ${on("mt")}><g transform="rotate(-8 124 82)"><path d="M93 64v38c0 5 14 9 31 9s31-4 31-9V64" fill="${RED}" ${S}/><path d="M93 74h62" stroke="${RED_D}" stroke-width="2"/><ellipse cx="124" cy="64" rx="31" ry="8.5" fill="${IVORY}" ${S}/></g></g>
  <g ${on("ht")}><g transform="rotate(8 196 82)"><path d="M168 66v34c0 5 13 8 28 8s28-3 28-8V66" fill="${RED}" ${S}/><path d="M168 76h56" stroke="${RED_D}" stroke-width="2"/><ellipse cx="196" cy="66" rx="28" ry="8" fill="${IVORY}" ${S}/></g></g>
  <g ${on("bd")}><circle cx="160" cy="152" r="56" fill="${RED}" ${S}/><circle cx="160" cy="152" r="46" fill="${INK}"/><circle cx="160" cy="152" r="46" fill="none" stroke="${CHROME}" stroke-width="3"/><path d="M136 152c4 0 4-8 8-8s4 16 8 16 4-16 8-16 4 16 8 16 4-8 8-8" stroke="${IVORY}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/><path d="M128 204l-8 6M192 204l8 6" ${S}/></g>
  <g ${on("sn")}><path d="M216 140v20c0 5 16 9 35 9s35-4 35-9v-20" fill="${CHROME}" ${S}/><path d="M226 145v21M238 147v22M251 148v22M264 147v22M276 145v21" stroke="#8a847a" stroke-width="1.6"/><ellipse cx="251" cy="140" rx="35" ry="9" fill="${IVORY}" ${S}/></g>
  <g ${on("rm")}><path d="M216 140c0 5 16 9 35 9s35-4 35-9" fill="none" stroke="${INK}" stroke-width="5.5"/><path d="M216 140c0 5 16 9 35 9s35-4 35-9" fill="none" stroke="${CHROME}" stroke-width="2.6"/></g>
  <g ${on("hh")}><ellipse cx="276" cy="100" rx="38" ry="6" fill="${BRASS}" ${S}/></g>
  <g ${on("ho")}><ellipse cx="276" cy="86" rx="38" ry="6" fill="${BRASS}" ${S}/><path d="M276 80v-10" ${S}/></g>
  ${labels ? [badge("cr", 22, 18, 40, 44), badge("ho", 312, 60, 300, 82), badge("hh", 314, 124, 304, 102), badge("mt", 108, 28, 118, 60), badge("ht", 220, 28, 206, 60),
    badge("lt", 18, 104, 30, 122), badge("bd", 108, 206, 124, 190), badge("sn", 204, 196, 228, 162), badge("rm", 304, 160, 284, 146)].join("") : ""}
</svg>`;
}

// ------------------------------------------------------------------ instrumentos melódicos
const piano = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="152" rx="100" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M40 56L196 20l6 10L52 68z" fill="${INK}" ${S}/><path d="M118 40l-6 34" ${S}/>
  <path d="M30 70h150c22 0 36 10 34 26-2 14-22 16-34 24-10 7-20 10-40 10H30z" fill="${INK}" ${S}/>
  <rect x="30" y="112" width="96" height="16" rx="2" fill="${IVORY}" ${S}/>
  <path d="M42 112v16M54 112v16M66 112v16M78 112v16M90 112v16M102 112v16M114 112v16" stroke="${INK}" stroke-width="1.4"/>
  <path d="M38 112v9M50 112v9M62 112v9M86 112v9M98 112v9" stroke="${INK}" stroke-width="4"/>
  <path d="M40 130v18M120 130v18M180 120v28" ${S}/><path d="M60 98v-8h18v8" fill="none" stroke="${CHROME}" stroke-width="2"/></svg>`;
const bass = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="152" rx="96" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M40 96c-14-14-6-36 14-34 10 1 14 8 24 6 12-2 18-14 32-10 18 5 16 26 4 34 10 8 14 26-2 34-14 7-24-4-36-2-10 2-14 12-30 10-20-3-24-26-6-38z" fill="${TEAL}" ${S}/>
  <path d="M60 104l10-6 48-10" fill="none" stroke="${IVORY}" stroke-width="7" stroke-linecap="round"/>
  <path d="M96 92L214 30" stroke="${WOOD}" stroke-width="10" stroke-linecap="round"/><path d="M96 92L214 30" ${S} fill="none" opacity=".25"/>
  <path d="M206 26l20-12 8 10-20 14z" fill="${WOOD_D}" ${S}/>
  <path d="M62 112L218 26M64 116L220 30M66 120L222 34M68 124L224 38" stroke="${CHROME}" stroke-width="1"/>
  <rect x="58" y="104" width="20" height="9" rx="2" transform="rotate(-28 68 108)" fill="${INK}"/><circle cx="216" cy="14" r="3" fill="${CHROME}" ${S}/><circle cx="230" cy="22" r="3" fill="${CHROME}" ${S}/></svg>`;
const guitar = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="152" rx="96" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M98 90L212 34" stroke="${WOOD_D}" stroke-width="11" stroke-linecap="round"/><path d="M204 30l22-10 7 12-22 10z" fill="${WOOD_D}" ${S}/>
  <path d="M84 70c20-6 34 8 30 26-2 10-8 14-6 22 4 18-12 34-36 32-18-1-28-10-36-20-12-2-24-12-22-28 2-20 22-28 38-22 10 4 18-6 32-10z" fill="${WOOD}" ${S}/>
  <circle cx="82" cy="104" r="12" fill="${INK}"/><circle cx="82" cy="104" r="15" fill="none" stroke="${WOOD_D}" stroke-width="2"/>
  <rect x="40" y="114" width="22" height="7" rx="2" transform="rotate(-26 51 118)" fill="${WOOD_D}" ${S}/>
  <path d="M50 122L216 36M50 117L214 32M48 112L212 28" stroke="${IVORY}" stroke-width="1" opacity=".9"/></svg>`;
const sax = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="152" rx="80" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M74 18l18 6" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <path d="M92 24c10 4 14 10 16 22l12 66c4 22 20 32 38 26 12-4 18-14 20-30" fill="none" stroke="${BRASS_D}" stroke-width="22" stroke-linecap="round"/>
  <path d="M92 24c10 4 14 10 16 22l12 66c4 22 20 32 38 26 12-4 18-14 20-30" fill="none" stroke="${BRASS}" stroke-width="17" stroke-linecap="round"/>
  <path d="M164 90c2-14 14-24 30-22l6 30c-14 4-28 2-36-8z" fill="${BRASS}" ${S}/><ellipse cx="197" cy="83" rx="7" ry="16" transform="rotate(-12 197 83)" fill="${BRASS_D}" ${S}/>
  ${[[112, 52], [114, 66], [117, 80], [120, 94], [128, 118], [146, 128]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${IVORY}" ${S}/>`).join("")}
  <path d="M126 50l14 4M128 66l14 2" stroke="${BRASS_D}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const trumpet = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="140" rx="100" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M22 74h10" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <rect x="64" y="74" width="98" height="30" rx="15" fill="none" stroke="${BRASS_D}" stroke-width="9"/><rect x="64" y="74" width="98" height="30" rx="15" fill="none" stroke="${BRASS}" stroke-width="5"/>
  <path d="M32 74H170" stroke="${BRASS_D}" stroke-width="9" stroke-linecap="round"/><path d="M32 74H170" stroke="${BRASS}" stroke-width="5" stroke-linecap="round"/>
  <path d="M166 70l52-26v62l-52-26z" fill="${BRASS}" ${S}/><ellipse cx="218" cy="75" rx="9" ry="31" fill="${BRASS_D}" ${S}/>
  ${[94, 112, 130].map((x) => `<rect x="${x}" y="52" width="13" height="58" rx="3" fill="${BRASS}" ${S}/><rect x="${x + 2}" y="40" width="9" height="12" rx="2" fill="${CHROME}" ${S}/><circle cx="${x + 6.5}" cy="37" r="6" fill="${IVORY}" ${S}/>`).join("")}</svg>`;
const marimba = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="152" rx="104" ry="5" fill="${INK}" opacity=".08"/>
  <path d="M28 82h188M40 82l-10 66M204 82l10 66" ${S} fill="none"/>
  ${Array.from({ length: 11 }, (_, i) => { const x = 34 + i * 17, h = 46 - i * 2.6; return `<rect x="${x + 4}" y="86" width="7" height="${h}" rx="3" fill="${CHROME}" ${S}/><rect x="${x}" y="${72 - (10 - i) * 0.4}" width="15" height="${22 - i * 0.6}" rx="3" fill="${i % 2 ? WOOD : "#c88447"}" ${S}/>`; }).join("")}
  <path d="M120 20l-20 44M150 20l-6 46" ${S}/><circle cx="98" cy="68" r="6" fill="${RED}" ${S}/><circle cx="143" cy="70" r="6" fill="${RED}" ${S}/></svg>`;
const kalimba = `<svg viewBox="0 0 240 160"><ellipse cx="120" cy="150" rx="70" ry="5" fill="${INK}" opacity=".08"/>
  <rect x="62" y="28" width="116" height="116" rx="22" fill="${WOOD}" ${S}/><circle cx="120" cy="112" r="12" fill="${WOOD_D}" ${S}/>
  <path d="M74 84h92" stroke="${CHROME}" stroke-width="6" stroke-linecap="round"/><path d="M74 84h92" stroke="${INK}" stroke-width="1.5" opacity=".4"/>
  ${[44, 52, 60, 68, 76, 80, 76, 68, 60, 52, 44].map((h, i) => `<path d="M${80 + i * 8} ${84 - h + 30}V${92}" stroke="${CHROME}" stroke-width="5" stroke-linecap="round"/><path d="M${80 + i * 8} ${84 - h + 30}V${92}" stroke="${INK}" stroke-width="1" opacity=".35"/>`).join("")}</svg>`;

// sound: nombre del sonido en Tidal. synth: sintetizador de SuperDirt (n = nota real). pack: se instala de VCSL.
export const INSTRUMENTS = [
  { id: "drums", es: "Batería", en: "Drum kit", kind: "percusion", svg: null,
    tip: ["Pulsa cada pieza para oírla. Luego elige en qué pasos suena y añádela como pista.", "Press each piece to hear it. Then choose which steps it plays on and add it as a track."] },
  { id: "piano", es: "Piano", en: "Piano", kind: "armonia", svg: piano, sound: "superpiano", synth: true, oct: 5, voice: "triangle",
    tip: ["El instrumento para aprender armonía: toca varias notas a la vez y tendrás un acorde.", "The instrument for learning harmony: play several notes at once and you have a chord."] },
  { id: "bass", es: "Bajo eléctrico", en: "Bass guitar", kind: "bajo", svg: bass, sound: "superpwm", synth: true, oct: 3, voice: "sawtooth", extra: " # lpf 900",
    tip: ["Notas graves que unen el ritmo con la armonía. Suele tocar la nota principal del acorde.", "Low notes that glue the beat to the harmony. It usually plays the chord's main note."] },
  { id: "guitar", es: "Guitarra", en: "Guitar", kind: "armonia", svg: guitar, sound: "gtr", oct: 5, voice: "triangle",
    tip: ["Muestra de guitarra de Dirt-Samples. Tidal cambia su altura con note.", "A guitar sample from Dirt-Samples. Tidal changes its pitch with note."] },
  { id: "sax", es: "Saxofón", en: "Saxophone", kind: "melodia", svg: sax, sound: "sax", oct: 5, voice: "square",
    tip: ["Viento-metal del jazz y el soul: melodías cortas con huecos para respirar.", "The wind instrument of jazz and soul: short melodies with gaps to breathe."] },
  { id: "trumpet", es: "Trompeta", en: "Trumpet", kind: "melodia", svg: trumpet, sound: "", oct: 5, voice: "square", freesound: "trumpet",
    tip: ["Tidal no trae trompeta: búscala en Freesound (biblioteca de samples) y aparecerá aquí.", "Tidal has no trumpet built in: find one on Freesound (sample library) and it will show up here."] },
  { id: "marimba", es: "Marimba", en: "Marimba", kind: "melodia", svg: marimba, sound: "marimba", pack: "vcsl", oct: 5, voice: "sine",
    tip: ["Láminas de madera golpeadas: suena cálido y redondo. Viene del pack libre VCSL (CC0).", "Struck wooden bars: warm and round. It comes from the free VCSL pack (CC0)."] },
  { id: "kalimba", es: "Kalimba", en: "Kalimba", kind: "melodia", svg: kalimba, sound: "kalimba", pack: "vcsl", oct: 5, voice: "sine",
    tip: ["Piano de pulgar africano: notas cristalinas, ideal para lo-fi y ambient. Pack VCSL (CC0).", "African thumb piano: crystal-clear notes, great for lo-fi and ambient. VCSL pack (CC0)."] },
];
export const instById = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
export const instThumb = (ins) => ins.id === "drums" ? drumKitSVG("", false) : ins.svg;

// ------------------------------------------------------------------ notas y código
export const NOTE_NAMES = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
// En Tidal, n "c5" es la nota 0 = do central (MIDI 60): la octava de Tidal es midi / 12
export const noteName = (midi) => NOTE_NAMES[midi % 12] + Math.floor(midi / 12);
export const noteFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export function stepsToMini(sound, steps) {
  if (steps.every(Boolean)) return `${sound}*${steps.length}`;
  if (!steps.some(Boolean)) return "~";
  const half = steps.length / 2, a = steps.slice(0, half), b = steps.slice(half);
  if (a.every((v, i) => v === b[i])) return `[${a.map((v) => (v ? sound : "~")).join(" ")}]*2`;
  return steps.map((v) => (v ? sound : "~")).join(" ");
}
export function drumCode(p, steps) {
  return `s "${stepsToMini(p, steps)}"`;
}
// seq: lista de midi (número) o null para silencio
export function melodyCode(ins, seq, sound) {
  const body = seq.length ? seq.map((m) => (m == null ? "~" : ins.synth ? noteName(m) : String(m - 60))).join(" ") : "~";
  return ins.synth ? `n "${body}" # s "${sound}"${ins.extra || ""}` : `note "${body}" # s "${sound}"`;
}

// ------------------------------------------------------------------ vista previa en el navegador
let ac = null;
export function beep(midi, voice = "triangle", dur = 0.45) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = voice; o.frequency.value = noteFreq(midi);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(voice === "square" || voice === "sawtooth" ? 0.08 : 0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch {}
}

export function keyboardHTML(oct, active = new Set()) {
  const whites = [0, 2, 4, 5, 7, 9, 11], blacks = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  let w = "", b = "";
  for (let o = 0; o < 2; o++) {
    whites.forEach((s, i) => {
      const m = oct * 12 + o * 12 + s;
      w += `<button class="key w${active.has(m) ? " on" : ""}" data-m="${m}" style="left:${(o * 7 + i) * (100 / 14)}%">${s === 0 ? `<span>${noteName(m).toUpperCase()}</span>` : ""}</button>`;
    });
    for (const [s, i] of Object.entries(blacks)) {
      const m = oct * 12 + o * 12 + +s;
      b += `<button class="key b${active.has(m) ? " on" : ""}" data-m="${m}" style="left:calc(${(o * 7 + i + 1) * (100 / 14)}% - 2.6%)"></button>`;
    }
  }
  return `<div class="keyboard">${w}${b}</div>`;
}
