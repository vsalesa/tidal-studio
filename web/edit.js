import { L } from "./i18n.js";
import { parsePattern, miniSteps } from "./blocks.js";
import { PARAMS as CP, fmt } from "./controls.js";
// Edición estructurada de una pista: la usan la vista de Bloques (tooltip al pulsar un bloque)
// y la «tarjeta configuradora» de Maestro. Cada parte editable tiene una clave estable:
//   "<ruta>|w"        envoltura (lo que va antes de $)       ruta = "c.c.1" (c = dentro de la envoltura, n = hijo n de stack)
//   "<ruta>|w#k"      número k dentro de esa envoltura (every 4 … → slider)
//   "<ruta>|src"      sonido / notas (s "…", n "…")
//   "<ruta>|p3"       ajuste # número 3
//   "<ruta>|st1.0"    paso de la mini-notación (1.0 = primer paso dentro del segundo grupo)
//   "|root"           la pista entera (añadir transformaciones)
// Al editar se vuelve a escribir el código desde el árbol: se pierden los comentarios y los saltos de línea.

// ------------------------------------------------------------------ árbol ↔ código
export function serialize(node) {
  if (node.type === "wrap") return `${node.code} $ ${serialize(node.child)}`;
  if (node.type === "stack") return `stack [${node.children.map(serialize).join(", ")}]`;
  let src = node.complex ? node.raw : `${node.fn} "${node.pattern}"`;
  if (node.complex && node.pattern != null && node.patStart != null) src = node.raw.slice(0, node.patStart) + `"${node.pattern}"` + node.raw.slice(node.patEnd);
  return [src, ...node.params.map((p) => `${p.op} ${p.name}${p.value !== "" ? " " + p.value : ""}`)].join(" ");
}
export const tidy = (code) => code.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

export function nodeAt(tree, path) {
  let n = tree;
  for (const s of path) n = s === "c" ? n.child : n.children[+s];
  return n;
}
const splitKey = (key) => { const [p, target] = key.split("|"); return { path: p ? p.split(".") : [], target }; };

// ------------------------------------------------------------------ mini-notación
function rebuildTok(tok, fn) {
  // fn(list) recibe la lista de pasos y la cambia en sitio
  const sub = tok.match(/^\[(.*)\](.*)$/);
  if (sub) { const l = miniSteps(sub[1]); fn(l); return l.length ? `[${l.join(" ")}]${sub[2]}` : "~"; }
  const alt = tok.match(/^<(.*)>(.*)$/);
  if (alt) { const l = miniSteps(alt[1]); fn(l); return l.length ? `<${l.join(" ")}>${alt[2]}` : "~"; }
  return tok;
}
// Cambia el paso en la ruta "1.0" del patrón; edit(list, i) cambia la lista que lo contiene
export function editStep(pattern, sp, edit) {
  const idx = sp.split(".").map(Number);
  const go = (list, d) => {
    const i = idx[d];
    if (d === idx.length - 1) return edit(list, i);
    list[i] = rebuildTok(list[i], (l) => go(l, d + 1));
  };
  const top = miniSteps(pattern);
  go(top, 0);
  return top.join(" ") || "~";
}
export function stepAt(pattern, sp) {
  let list = miniSteps(pattern), tok = null;
  for (const i of sp.split(".").map(Number)) {
    tok = list[i]; if (tok == null) return null;
    const m = tok.match(/^[\[<](.*)[\]>].*$/); list = m ? miniSteps(m[1]) : [];
  }
  return tok;
}

// ------------------------------------------------------------------ números dentro de una envoltura
const NUM_RE = /(^|[\s(\[,])(-?\d+(?:\.\d+)?)(?=$|[\s)\],])/g;
function numsIn(code) {
  const out = [];
  const masked = code.replace(/"[^"]*"/g, (m) => " ".repeat(m.length)); // no tocar los números de dentro de comillas
  for (const m of masked.matchAll(NUM_RE)) out.push({ index: m.index + m[1].length, text: m[2], value: +m[2] });
  return out;
}
function setNum(code, k, v) {
  const n = numsIn(code)[k];
  return n ? code.slice(0, n.index) + fmt(v) + code.slice(n.index + n.text.length) : code;
}
// Rango razonable para un número de una envoltura, según la función que tiene justo delante
function numRange(fn, v) {
  if (/^(every|whenmod|chunk|ply|iter|striate|chop|mask|euclid|rot|linger)$/.test(fn) && Number.isInteger(v)) return { min: 1, max: 16, step: 1 };
  if (/^(fast|slow|hurry|density)$/.test(fn)) return { min: 0.25, max: 8, step: 0.25 };
  if (/^(degradeBy|sometimesBy|swingBy|off|nudge|often|rarely)$/.test(fn) && v <= 1) return { min: 0, max: 1, step: fn === "off" ? 0.0625 : 0.05 };
  if (Number.isInteger(v) && Math.abs(v) >= 1) return { min: Math.min(0, v), max: Math.max(16, v * 2), step: 1 };
  return { min: Math.min(0, v), max: Math.max(1, v * 2), step: 0.01 };
}
function wrapNums(code, fn, P) {
  return numsIn(code).map((x, k) => {
    const near = (code.slice(0, x.index).match(/([a-zA-Z]\w*)\s*\(?\s*$/) || [])[1] || fn;
    return { key: `${P}|w#${k}`, value: x.value, fn: near, ...numRange(near, x.value) };
  });
}
export function paramRange(name, v) {
  const P = CP[name];
  if (P) return { min: Math.min(P.min, v ?? P.min), max: Math.max(P.max, v ?? P.max), step: P.step, log: !!P.log, def: P.def };
  if (name === "amp") return { min: 0, max: 1, step: 0.01 };
  if (/^eq(low|mid|high)$/.test(name)) return { min: -24, max: 12, step: 0.5 };
  if (name === "n" || name === "note" || name === "up") return { min: -24, max: 24, step: 1 };
  if (typeof v === "number") return numRange("", v);
  return null;
}

// ------------------------------------------------------------------ lista de partes editables (para la tarjeta de Maestro)
export function elementsOf(code) {
  let tree;
  try { tree = parsePattern(code || ""); } catch { return []; }
  const out = [];
  const walk = (n, path) => {
    const P = path.join(".");
    if (n.type === "wrap") {
      out.push({ key: `${P}|w`, kind: "wrap", fn: n.fn, text: n.code, nums: wrapNums(n.code, n.fn, P) });
      return walk(n.child, [...path, "c"]);
    }
    if (n.type === "stack") return n.children.forEach((c, i) => walk(c, [...path, String(i)]));
    if (n.pattern != null) out.push({ key: `${P}|src`, kind: "src", fn: n.fn, text: n.pattern, complex: !!n.complex, raw: n.raw });
    else out.push({ key: `${P}|src`, kind: "raw", text: n.raw });
    n.params.forEach((p, i) => {
      const num = /^-?\d+(\.\d+)?$/.test(p.value) ? +p.value : null;
      out.push({ key: `${P}|p${i}`, kind: "param", name: p.name, op: p.op, text: p.value, value: num, range: num != null ? paramRange(p.name, num) : null });
    });
  };
  walk(tree, []);
  return out;
}

// ------------------------------------------------------------------ aplicar un cambio
// action: set | del | after | num | addParam | addWrap | addStep
export function applyEdit(code, key, action, value, extra) {
  let tree = parsePattern(code || "");
  const { path, target } = splitKey(key);
  if (target === "root") {
    if (action === "addWrap" && value) tree = { type: "wrap", code: value, fn: (value.match(/^[a-zA-Z']+/) || [""])[0], child: tree };
    return serialize(tree);
  }
  const parentPath = path.slice(0, -1), last = path[path.length - 1];
  const n = nodeAt(tree, path);
  const replaceNode = (repl) => {
    if (!path.length) { tree = repl; return; }
    const parent = nodeAt(tree, parentPath);
    if (last === "c") parent.child = repl; else parent.children[+last] = repl;
  };
  if (target === "w") {
    if (action === "del") replaceNode(n.child);
    if (action === "set") { const v = String(value).trim().replace(/\s*\$\s*$/, ""); if (!v) replaceNode(n.child); else { n.code = v; n.fn = (v.match(/^[a-zA-Z']+/) || [""])[0]; } }
  } else if (target.startsWith("w#")) {
    n.code = setNum(n.code, +target.slice(2), +value);
  } else if (target === "src") {
    if (action === "set") { if (n.pattern != null) n.pattern = String(value).replace(/"/g, ""); else n.raw = String(value); }
    if (action === "addStep") n.pattern = `${n.pattern ?? ""} ${value || "~"}`.trim();
    if (action === "addParam") n.params.push({ op: "#", name: value, value: extra ?? "", raw: "" });
  } else if (target.startsWith("p")) {
    const i = +target.slice(1);
    if (action === "del") n.params.splice(i, 1);
    if (action === "set") n.params[i].value = typeof value === "number" ? fmt(value) : String(value).trim();
  } else if (target.startsWith("st")) {
    const sp = target.slice(2);
    n.pattern = editStep(n.pattern, sp, (list, i) => {
      if (action === "set") { const v = String(value).trim().replace(/"/g, ""); if (v) list[i] = v; else list.splice(i, 1); }
      if (action === "del") list.splice(i, 1);
      if (action === "after") list.splice(i + 1, 0, value || list[i]);
    });
  }
  return serialize(tree);
}

// Lee el valor actual de una parte (para refrescar el tooltip)
export function partOf(code, key) {
  const tree = parsePattern(code || "");
  const { path, target } = splitKey(key);
  if (target === "root") return { kind: "root" };
  const n = nodeAt(tree, path);
  if (!n) return null;
  if (target === "w") return { kind: "wrap", text: n.code, fn: n.fn, nums: wrapNums(n.code, n.fn, path.join(".")) };
  if (target === "src") return n.pattern != null ? { kind: "src", text: n.pattern, fn: n.fn, params: n.params.map((p) => p.name) } : { kind: "raw", text: n.raw, params: n.params.map((p) => p.name) };
  if (target.startsWith("p")) { const p = n.params[+target.slice(1)]; if (!p) return null; const num = /^-?\d+(\.\d+)?$/.test(p.value) ? +p.value : null; return { kind: "param", name: p.name, text: p.value, value: num, range: num != null ? paramRange(p.name, num) : null }; }
  if (target.startsWith("st")) { const tok = stepAt(n.pattern || "", target.slice(2)); return tok == null ? null : { kind: "step", text: tok }; }
  return null;
}

// Transformaciones que se pueden añadir desde los bloques / la tarjeta
export const WRAPS = [
  ["every 4 (fast 2)", () => L("Cada 4 compases, el doble de rápido", "Every 4 bars, twice as fast")],
  ["every 2 rev", () => L("Cada 2 compases, al revés", "Every 2 bars, backwards")],
  ["degradeBy 0.2", () => L("Quitar golpes al azar", "Drop hits at random")],
  ["sometimesBy 0.3 (# speed 2)", () => L("A veces más agudo", "Sometimes higher")],
  ["jux rev", () => L("Estéreo: al revés en un lado", "Stereo: backwards on one side")],
  ["off 0.125 (# crush 4)", () => L("Eco rítmico sucio", "Dirty rhythmic echo")],
  ["swingBy (1/8) 4", () => "Swing"],
  ["fast 2", () => L("El doble de rápido", "Twice as fast")],
  ["slow 2", () => L("La mitad de rápido", "Half as fast")],
  ["mask \"<t!4 f!4>\"", () => L("Suena 4 compases, calla 4", "Plays 4 bars, rests 4")],
];
export const ADD_PARAMS = ["gain", "lpf", "hpf", "room", "size", "delay", "pan", "speed", "crush", "shape", "legato", "resonance"];
