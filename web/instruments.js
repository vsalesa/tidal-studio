// Instrumentos con fotos reales: batería interactiva y teclado para instrumentos melódicos.
// Fotos con licencia libre de Wikimedia Commons (créditos en cada instrumento y en CREDITS.md).
import { L } from "./i18n.js";

const IMG = "img/instruments/";
const COMMONS = "https://commons.wikimedia.org/wiki/File:";
const LIC = {
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};
// fit: "contain" = producto sobre fondo blanco (se funde con la tarjeta); "cover" = foto con su propio fondo
const PHOTOS = {
  drums: { src: "drums.jpg", fit: "cover", author: "Englishteacher68", license: "CC BY-SA 4.0", file: "Pearl_Midtown_compact_drum_kit.jpg" },
  piano: { src: "piano.jpg", fit: "contain", author: "Steinway & Sons; derivative work: Morn", license: "CC BY-SA 3.0",
    file: "Steinway_%26_Sons_concert_grand_piano,_model_D-274,_manufactured_at_Steinway%27s_factory_in_Hamburg,_Germany_cropped.jpg" },
  bass: { src: "bass.jpg", fit: "contain", author: "Th. Ott", license: "CC BY-SA 3.0", file: "Fender_Jazz-Bass_1966.jpg" },
  guitar: { src: "guitar.jpg", fit: "contain", author: "muzyczny.pl", license: "CC BY-SA 4.0", file: "Gitara_klasyczna_C30M_firmy_Yamaha.jpg" },
  sax: { src: "sax.jpg", fit: "contain", author: "Yamaha Corporation", license: "CC BY-SA 4.0", file: "Yamaha_Saxophone_YAS-62.tif" },
  trumpet: { src: "trumpet.jpg", fit: "contain", author: "Yamaha Corporation", license: "CC BY-SA 4.0", file: "Yamaha_Trumpet_YTR-8335LA_crop.jpg" },
  marimba: { src: "marimba.jpg", fit: "cover", author: "HorsePunchKid", license: "CC BY-SA 3.0", file: "Bass_Marimba.jpg" },
  kalimba: { src: "kalimba.jpg", fit: "cover", author: "Ernst-Andreas Müller (uploaded by Poipoi)", license: "CC BY-SA 3.0", file: "Kalimba.jpg" },
};
const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function photoImg(id, cls = "") {
  const p = PHOTOS[id];
  return `<img class="inst-photo ${p.fit}${cls ? " " + cls : ""}" src="${IMG}${p.src}" alt="" draggable="false">`;
}
// pie de foto con autor y licencia (obligatorio en CC BY-SA)
export function photoCredit(id) {
  const p = PHOTOS[id];
  return `<div class="inst-credit">${L("Foto", "Photo")}: <a href="${COMMONS}${p.file}" target="_blank" rel="noopener">${escA(p.author)}</a> · <a href="${LIC[p.license]}" target="_blank" rel="noopener">${p.license}</a> · ${L("vía Wikimedia Commons", "via Wikimedia Commons")}</div>`;
}

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
    tip: ["Tom de altura media: junto al agudo y al grave forma una escalera de tambores. Esta batería compacta solo trae dos toms, así que el medio no sale en la foto: pulsa su botón debajo.", "Medium-pitched tom: with the high and low ones it makes a staircase of drums. This compact kit only has two toms, so the mid tom is not in the photo: press its button below."] },
  lt: { es: "Tom base (grave)", en: "Floor tom (low)", steps: [0, 0, 0, 0, 0, 0, 0, 1],
    tip: ["El tom más grave, apoyado en el suelo. Cierra los redobles con fuerza.", "The lowest tom, standing on the floor. It closes fills with power."] },
  bd: { es: "Bombo", en: "Kick drum", steps: [1, 0, 1, 0, 1, 0, 1, 0],
    tip: ["El tambor grande que se toca con el pie: el corazón del ritmo. En tiempos 1, 2, 3 y 4 es «a negras».", "The big drum played with the foot: the heart of the beat. On beats 1, 2, 3 and 4 it's «four on the floor»."] },
  sn: { es: "Caja", en: "Snare", steps: [0, 0, 1, 0, 0, 0, 1, 0],
    tip: ["Golpe seco y brillante. En los tiempos 2 y 4 es el «backbeat» de casi todo el pop, rock y hip hop.", "Dry, bright hit. On beats 2 and 4 it's the «backbeat» of almost all pop, rock and hip hop."] },
  rm: { es: "Aro (rimshot)", en: "Rimshot", steps: [0, 0, 0, 1, 0, 0, 1, 0],
    tip: ["Golpear el borde metálico de la caja: un «toc» seco, típico del reggaetón y la música latina.", "Hitting the snare's metal rim: a dry «tock», typical of reggaeton and Latin music."] },
};

// Zonas clicables sobre la foto (coordenadas de la foto original, 1920×1472).
// Se dibujan de atrás hacia delante: lo que tapa a otra pieza va después.
const DK_W = 1920, DK_H = 1472;
const DK_SHAPES = {
  lt: `<path d="M338 655 L670 655 L670 1020 L338 1020 Z"/>`,
  bd: `<circle cx="975" cy="968" r="300"/>`,
  sn: `<path d="M872 585 L1258 585 L1258 705 L872 705 Z"/>`,
  rm: `<path class="dk-rim" d="M880 580 Q1060 548 1255 582"/>`,
  cr: `<ellipse cx="535" cy="418" rx="335" ry="48"/><ellipse cx="1520" cy="128" rx="240" ry="40"/>`,
  ho: `<ellipse cx="1485" cy="346" rx="190" ry="24"/>`,
  hh: `<ellipse cx="1490" cy="392" rx="190" ry="22"/>`,
  ht: `<ellipse cx="1190" cy="500" rx="172" ry="158"/>`,
};
const DK_ORDER = ["lt", "bd", "sn", "rm", "cr", "ho", "hh", "ht"];
// [x, y] de la etiqueta y [x, y] del punto al que señala
const DK_BADGES = {
  cr: [150, 290, 330, 400], ho: [1800, 260, 1660, 338], hh: [1800, 470, 1665, 398], ht: [1215, 215, 1195, 345],
  sn: [1400, 760, 1250, 680], rm: [760, 520, 885, 576], lt: [170, 820, 340, 840], bd: [560, 1330, 720, 1190],
};

export function drumKitSVG(sel = "", labels = true) {
  // sin etiquetas = miniatura: no es interactiva
  if (!labels) return photoImg("drums");
  const shapes = DK_ORDER.map((p) => `<g class="dk-p${sel === p ? " sel" : ""}" data-p="${p}"><title>${p}: ${escA(L(DRUM_PIECES[p].es, DRUM_PIECES[p].en))}</title>${DK_SHAPES[p]}</g>`).join("");
  const badges = Object.entries(DK_BADGES).map(([p, [x, y, lx, ly]]) =>
    `<g class="dk-badge${sel === p ? " sel" : ""}" data-p="${p}"><path d="M${lx} ${ly}L${x} ${y}"/><circle cx="${x}" cy="${y}" r="64"/><text x="${x}" y="${y + 20}" text-anchor="middle">${p}</text></g>`).join("");
  const chips = Object.keys(DRUM_PIECES).map((p) => `<button class="dk-chip${sel === p ? " sel" : ""}" data-p="${p}"><code>${p}</code> ${escA(L(DRUM_PIECES[p].es, DRUM_PIECES[p].en))}</button>`).join("");
  return `<div class="drumkit" role="group" aria-label="${L("Batería", "Drum kit")}">
  <div class="dk-photo">${photoImg("drums")}<svg viewBox="0 0 ${DK_W} ${DK_H}" preserveAspectRatio="none" aria-hidden="true">${shapes}${badges}</svg></div>
  <div class="dk-chips">${chips}</div>
</div>`;
}

// sound: nombre del sonido en Tidal. synth: sintetizador de SuperDirt (n = nota real). pack: se instala de VCSL.
export const INSTRUMENTS = [
  { id: "drums", es: "Batería", en: "Drum kit", kind: "percusion",
    tip: ["Pulsa cada pieza para oírla. Luego elige en qué pasos suena y añádela como pista.", "Press each piece to hear it. Then choose which steps it plays on and add it as a track."] },
  { id: "piano", es: "Piano", en: "Piano", kind: "armonia", sound: "superpiano", synth: true, oct: 5, voice: "piano",
    tip: ["El instrumento para aprender armonía: toca varias notas a la vez y tendrás un acorde.", "The instrument for learning harmony: play several notes at once and you have a chord."] },
  { id: "bass", es: "Bajo eléctrico", en: "Bass guitar", kind: "bajo", sound: "superpwm", synth: true, oct: 3, voice: "sawtooth", extra: " # lpf 900",
    tip: ["Notas graves que unen el ritmo con la armonía. Suele tocar la nota principal del acorde.", "Low notes that glue the beat to the harmony. It usually plays the chord's main note."] },
  { id: "guitar", es: "Guitarra", en: "Guitar", kind: "armonia", sound: "gtr", oct: 5, voice: "triangle",
    tip: ["Muestra de guitarra de Dirt-Samples. Tidal cambia su altura con note.", "A guitar sample from Dirt-Samples. Tidal changes its pitch with note."] },
  { id: "sax", es: "Saxofón", en: "Saxophone", kind: "melodia", sound: "sax", oct: 5, voice: "square",
    tip: ["Viento-metal del jazz y el soul: melodías cortas con huecos para respirar.", "The wind instrument of jazz and soul: short melodies with gaps to breathe."] },
  { id: "trumpet", es: "Trompeta", en: "Trumpet", kind: "melodia", sound: "supertrumpet", synth: true, oct: 5, voice: "brass", freesound: "trumpet",
    tip: ["Viento-metal brillante. Tidal no trae trompeta, así que Tidal Studio incluye un sintetizador (supertrumpet). Si prefieres una grabación real, búscala en Freesound.", "Bright brass. Tidal has no trumpet, so Tidal Studio ships a synth (supertrumpet). If you prefer a real recording, find one on Freesound."] },
  { id: "marimba", es: "Marimba", en: "Marimba", kind: "melodia", sound: "marimba", pack: "vcsl", oct: 5, voice: "sine",
    tip: ["Láminas de madera golpeadas: suena cálido y redondo. Viene del pack libre VCSL (CC0).", "Struck wooden bars: warm and round. It comes from the free VCSL pack (CC0)."] },
  { id: "kalimba", es: "Kalimba", en: "Kalimba", kind: "melodia", sound: "kalimba", pack: "vcsl", oct: 5, voice: "sine",
    tip: ["Piano de pulgar africano: notas cristalinas, ideal para lo-fi y ambient. Pack VCSL (CC0).", "African thumb piano: crystal-clear notes, great for lo-fi and ambient. VCSL pack (CC0)."] },
];
export const instById = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));
export const instThumb = (ins) => photoImg(ins.id);
export const instArt = (ins) => photoImg(ins.id, "big");

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
  const synth = ins.synth && sound === ins.sound;   // un sample elegido por ti se afina con note
  const body = seq.length ? seq.map((m) => (m == null ? "~" : synth ? noteName(m) : String(m - 60))).join(" ") : "~";
  return synth ? `n "${body}" # s "${sound}"${ins.extra || ""}` : `note "${body}" # s "${sound}"`;
}

// ------------------------------------------------------------------ vista previa en el navegador
let ac = null;
// Voces de la vista previa: "piano" y "brass" imitan algo mejor el instrumento que una onda pelada
function voiceNote(midi, voice, dur) {
  const t = ac.currentTime, f = noteFreq(midi), out = ac.createGain();
  out.connect(ac.destination);
  const osc = (type, freq, gain, decay) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05);
    return o;
  };
  if (voice === "piano") {
    const decay = Math.min(3, Math.max(0.6, 1.6 * Math.pow(f / 262, -0.5)));
    [[1, 0.2], [2, 0.07], [3, 0.035], [4, 0.015]].forEach(([k, a], i) => osc("sine", f * k * (1 + 0.0004 * k * k), a, decay / (1 + i * 0.7)));
    osc("triangle", f * 1.002, 0.05, decay * 0.8);
    return;
  }
  // brass: dientes de sierra con un filtro que se abre al soplar, pequeña subida de afinación y vibrato
  const len = Math.max(dur, 0.3), lp = ac.createBiquadFilter(), g = ac.createGain();
  lp.type = "lowpass"; lp.Q.value = 2;
  lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.exponentialRampToValueAtTime(f * 7, t + 0.05); lp.frequency.exponentialRampToValueAtTime(f * 4.5, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.09, t + 0.12);
  g.gain.setValueAtTime(0.09, t + len - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lfo = ac.createOscillator(), lfoG = ac.createGain();
  lfo.frequency.value = 5.5; lfoG.gain.setValueAtTime(0, t); lfoG.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
  lfo.connect(lfoG);
  [1, 1.003].forEach((d) => {
    const o = ac.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(f * d * 0.97, t); o.frequency.exponentialRampToValueAtTime(f * d, t + 0.05);
    lfoG.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + len + 0.05);
  });
  lp.connect(g).connect(out); lfo.start(t); lfo.stop(t + len + 0.05);
}
export function beep(midi, voice = "triangle", dur = 0.45) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (voice === "piano" || voice === "brass") return voiceNote(midi, voice, dur);
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
