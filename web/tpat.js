// Mini-Tidal en el navegador: calcula DÓNDE cae cada nota de una pista sin tener Tidal.
// Lo usa la Línea de tiempo cuando el motor no está (modo simulación) o Tidal no puede leer la pista.
// Es una aproximación: entiende la mini-notación completa (con la posición de cada trozo en el código)
// y las funciones más habituales (fast, slow, every, off, jux, stack, mask, euclid…). Lo que no conoce
// lo deja pasar tal cual y lo apunta en `unknown`.

const EPS = 1e-9;
const fl = (x) => Math.floor(x + EPS);

// ---------------------------------------------------------------- patrones
// Un patrón es { q(a, b) } → eventos cuyo «whole» se cruza con [a, b): { t0, t1, v:{}, pos:[[ini, fin]], maybe }
const P = (q) => ({ q });
const silence = P(() => []);
const mapEv = (p, f) => P((a, b) => p.q(a, b).map(f).filter(Boolean));
const withTime = (p, inv, fwd) => P((a, b) => p.q(inv(a), inv(b)).map((e) => ({ ...e, t0: fwd(e.t0), t1: fwd(e.t1) })));

function pure(v, pos = []) {
  return P((a, b) => {
    const out = [];
    for (let c = fl(a); c < b - EPS; c++) out.push({ t0: c, t1: c + 1, v: { ...v }, pos: pos.slice() });
    return out;
  });
}
const fast = (k, p) => (k <= 0 ? silence : k === 1 ? p : withTime(p, (t) => t * k, (t) => t / k));
const shift = (d, p) => (d === 0 ? p : withTime(p, (t) => t - d, (t) => t + d));
const stack = (ps) => P((a, b) => ps.flatMap((p) => p.q(a, b)));

// Secuencia con pesos dentro de un ciclo: cada trozo ve su ciclo «c» comprimido en su hueco
function timecat(items) {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (!total) return silence;
  let acc = 0;
  const segs = items.map((x) => { const s = { p: x.p, o: acc / total, w: x.w / total }; acc += x.w; return s; });
  return P((a, b) => {
    const out = [];
    for (let c = fl(a); c < b - EPS; c++) {
      for (const s of segs) {
        const s0 = c + s.o, s1 = s0 + s.w;
        const lo = Math.max(a, s0), hi = Math.min(b, s1);
        if (hi <= lo + EPS) continue;
        const inv = (t) => c + (t - s0) / s.w, fwd = (u) => s0 + (u - c) * s.w;
        for (const e of s.p.q(inv(lo), inv(hi))) {
          // solo lo que empieza dentro de este ciclo del trozo (el resto lo verá el ciclo vecino)
          if (e.t0 < c - EPS || e.t0 >= c + 1 - EPS) {
            if (!(e.t0 < c - EPS && e.t1 > c + EPS)) continue;
          }
          out.push({ ...e, t0: fwd(e.t0), t1: fwd(e.t1) });
        }
      }
    }
    return out;
  });
}
const fastcat = (ps) => timecat(ps.map((p) => ({ p, w: 1 })));
// <a b c>: un elemento por ciclo; cada uno avanza a su ritmo (como slowcat de Tidal)
function slowcat(ps) {
  if (!ps.length) return silence;
  const n = ps.length;
  return P((a, b) => {
    const out = [];
    for (let c = fl(a); c < b - EPS; c++) {
      const p = ps[((c % n) + n) % n], off = c - Math.floor(c / n);
      const lo = Math.max(a, c), hi = Math.min(b, c + 1);
      for (const e of p.q(lo - off, hi - off)) {
        const t0 = e.t0 + off;
        if (t0 < c - EPS || t0 >= c + 1 - EPS) continue;
        out.push({ ...e, t0, t1: e.t1 + off });
      }
    }
    return out;
  });
}
// Valor de un patrón en el instante t (para tomar números como «fast "<1 2>"» o los parámetros de #)
function at(p, t) {
  const es = p.q(t, t + EPS * 10).filter((e) => e.t0 <= t + EPS && e.t1 > t + EPS);
  return es.length ? es[es.length - 1] : null;
}
// Aplica f(valor) ciclo a ciclo, cuando el argumento es un patrón
function perCycle(arg, mk) {
  if (typeof arg === "number") return mk(arg);
  return P((a, b) => {
    const out = [];
    for (let c = fl(a); c < b - EPS; c++) {
      const e = at(arg, c);
      const k = e ? num(e.v._ ?? Object.values(e.v)[0]) : NaN;
      if (!isFinite(k)) continue;
      const lo = Math.max(a, c), hi = Math.min(b, c + 1);
      out.push(...mk(k).q(lo, hi).filter((x) => x.t0 >= c - EPS && x.t0 < c + 1 - EPS));
    }
    return out;
  });
}
function num(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const n = noteNum(v);
  return n === null ? parseFloat(v) : n;
}
export function noteNum(w) {
  if (/^-?[\d.]+(e-?\d+)?$/.test(w)) return parseFloat(w);
  const m = /^([a-g])(s|f|#|b)?(-?\d+)?$/i.exec(w);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = m[2] === "s" || m[2] === "#" ? 1 : m[2] === "f" || m[2] === "b" ? -1 : 0;
  return base + acc + ((m[3] ? parseInt(m[3], 10) : 5) - 5) * 12;
}
const mark = (p) => mapEv(p, (e) => ({ ...e, maybe: true }));

function bjorklund(k, n) {
  n = Math.max(1, Math.round(n)); k = Math.max(0, Math.min(n, Math.round(k)));
  // algoritmo de Bjorklund, como en Tidal: (3,8) → x . . x . . x .
  let a = Array.from({ length: k }, () => [true]), b = Array.from({ length: n - k }, () => [false]);
  while (Math.min(a.length, b.length) > 1) {
    const m = Math.min(a.length, b.length), na = [];
    for (let i = 0; i < m; i++) na.push(a[i].concat(b[i]));
    b = a.length > m ? a.slice(m) : b.slice(m);
    a = na;
  }
  return a.flat().concat(b.flat());
}
const euclidP = (k, n, r, p, inv = false) => {
  let bits = bjorklund(Math.abs(k), n);
  if (k < 0) bits = bits.map((x) => !x);
  if (inv) bits = bits.map((x) => !x);
  const rr = ((Math.round(r) % bits.length) + bits.length) % bits.length;
  bits = bits.slice(rr).concat(bits.slice(0, rr));
  return fastcat(bits.map((x) => (x ? p : silence)));
};

// ---------------------------------------------------------------- mini-notación (con posiciones)
export function mini(str, base) {
  let i = 0;
  const n = str.length;
  const ws = () => { while (i < n && /\s/.test(str[i])) i++; };
  // sequence: capas separadas por coma ("|" = elegir al azar una de ellas)
  function sequence(endCh) {
    const layers = [[]]; let rand = false;
    for (;;) {
      ws();
      if (i >= n || str[i] === endCh) break;
      const ch = str[i];
      if (ch === ",") { layers.push([]); i++; continue; }
      if (ch === "|") { rand = true; layers.push([]); i++; continue; }
      if (ch === "." && (i + 1 >= n || /\s/.test(str[i + 1]))) { layers[layers.length - 1].push({ dot: true }); i++; continue; }
      if (ch === "_") { const cur = layers[layers.length - 1]; if (cur.length) cur[cur.length - 1].w += 1; i++; continue; }
      if ("]>}".includes(ch)) { i++; continue; } // cierre suelto: lo ignoramos
      const st = step();
      if (!st) { i++; continue; }
      layers[layers.length - 1].push(...st);
    }
    return { layers: layers.map(dots), rand };
  }
  function dots(steps) {
    // "0 .. 3" → 0 1 2 3
    for (let k = 1; k < steps.length - 1; k++) {
      const a = steps[k - 1].leaf, m = steps[k].leaf, b = steps[k + 1].leaf;
      if (!m || m.word !== ".." || !a || !b || !isFinite(+a.word) || !isFinite(+b.word)) continue;
      const lo = +a.word, hi = +b.word, dir = lo <= hi ? 1 : -1, made = [];
      for (let x = lo; dir > 0 ? x <= hi : x >= hi; x += dir) made.push({ p: pure({ _: String(x) }, [[a.pos[0][0], b.pos[0][1]]]), w: 1 });
      steps.splice(k - 1, 3, ...made);
      k += made.length - 2;
    }
    if (!steps.some((s) => s.dot)) return steps;
    const groups = []; let g = [];
    for (const s of steps) { if (s.dot) { groups.push(g); g = []; } else g.push(s); }
    groups.push(g);
    return groups.filter((x) => x.length).map((x) => ({ p: timecat(x), w: 1 }));
  }
  const seqPat = ({ layers, rand }) => {
    const ps = layers.filter((l) => l.length).map((l) => timecat(l));
    if (!ps.length) return silence;
    return rand ? mark(slowcat(ps)) : ps.length === 1 ? ps[0] : stack(ps);
  };
  function step() {
    ws();
    const ch = str[i];
    let p;
    if (ch === "[") { i++; p = seqPat(sequence("]")); i++; }
    else if (ch === "<") {
      i++; const s = sequence(">"); i++;
      const ls = s.layers.filter((l) => l.length);
      // <a b c>: un paso por ciclo (cada uno con su peso: <a@3 b> = a tres ciclos y b uno)
      const alt = (l) => {
        const flat = [];
        for (const x of l) for (let r = 0; r < Math.max(1, Math.round(x.w)); r++) flat.push(x.p);
        return slowcat(flat);
      };
      p = ls.length ? stack(ls.map(alt)) : silence;
    } else if (ch === "{") {
      i++; const s = sequence("}"); i++;
      const ls = s.layers.filter((l) => l.length);
      let steps = ls.length ? ls[0].length : 1;
      if (str[i] === "%") { i++; const m = /^[\d.]+/.exec(str.slice(i)); if (m) { steps = parseFloat(m[0]); i += m[0].length; } }
      p = stack(ls.map((l) => fast(steps / l.length, fastcat(l.map((x) => x.p)))));
    } else {
      const m = /^[^\s,\[\]<>{}*\/!@?(:|%_]+(:[^\s,\[\]<>{}*\/!@?(|%]+)?/.exec(str.slice(i)) || /^[^\s,\[\]<>{}*\/!@?(|%]+/.exec(str.slice(i));
      if (!m) return null;
      const word = m[0], pos = [[base + i, base + i + word.length]];
      i += word.length;
      p = word === "~" ? silence : pure({ _: word }, pos);
      var leaf = { word, pos };
    }
    let w = 1, reps = 1;
    // modificadores: *n /n !n @n ? (k,n,r) :n
    for (;;) {
      const c = str[i];
      if (c === "*" || c === "/") {
        i++;
        const arg = modArg(), base0 = p;
        p = c === "*" ? perCycle(arg, (k) => fast(k, base0)) : perCycle(arg, (k) => fast(1 / k, base0));
      } else if (c === "@") { i++; const a = modArg(); w = typeof a === "number" ? a : 1; }
      else if (c === "!") { i++; const m2 = /^\d+/.exec(str.slice(i)); if (m2) { reps += parseInt(m2[0], 10) - 1; i += m2[0].length; } else reps += 1; }
      else if (c === "?") { i++; const m2 = /^[\d.]+/.exec(str.slice(i)); if (m2) i += m2[0].length; p = mark(p); }
      else if (c === "(") {
        const j = str.indexOf(")", i); if (j < 0) break;
        const args = str.slice(i + 1, j).split(",").map((x) => x.trim());
        // cada argumento puede ser un número o un patrón: (<3 5>,8,<0 2>)
        const argP = args.map((x) => (/^-?[\d.]+$/.test(x) ? parseFloat(x) : mini(x, base + i + 1)));
        const pp = p, r0 = argP[2] ?? 0;
        if (argP.length >= 2) p = perCycle(argP[0], (kk) => perCycle(argP[1], (n2) => perCycle(r0, (rr) => euclidP(kk, n2, rr, pp))));
        i = j + 1;
      } else break;
    }
    // "." solo cuenta como separador si va suelto
    const out = [{ p, w, leaf: typeof leaf !== "undefined" && w === 1 && reps === 1 ? leaf : null }];
    for (let r = 1; r < reps; r++) out.push({ p, w });
    return out;
  }
  function modArg() {
    ws();
    if (str[i] === "<" || str[i] === "[") { const st = step(); return st ? st[0].p : 1; }
    const m = /^-?[\d.]+/.exec(str.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    return 1;
  }
  return seqPat(sequence(null));
}

// ---------------------------------------------------------------- código Haskell (un subconjunto)
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith("--", i) && !/[!#$%&*+./<=>?@\\^|~:]/.test(src[i + 2] || "")) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      toks.push({ t: "str", v: src.slice(i + 1, j), at: i + 1 }); i = j + 1; continue;
    }
    let m;
    if ((m = /^\d+(\.\d+)?(e-?\d+)?/.exec(src.slice(i)))) { toks.push({ t: "num", v: parseFloat(m[0]), at: i }); i += m[0].length; continue; }
    if ((m = /^[a-zA-Z_][\w']*/.exec(src.slice(i)))) { toks.push({ t: "id", v: m[0], at: i }); i += m[0].length; continue; }
    if ("()[],`".includes(ch)) { toks.push({ t: ch, at: i }); i++; continue; }
    if ((m = /^[!#$%&*+./<=>?@\\^|~:-]+/.exec(src.slice(i)))) { toks.push({ t: "op", v: m[0], at: i }); i += m[0].length; continue; }
    i++;
  }
  return toks;
}
// Prioridad de operadores (como en Haskell/Tidal): $ 0, # y |x| 1 (izquierda), + - 6, * / 7, . 9 (derecha)
function prec(op) {
  if (op === "$") return [0, "r"];
  if (op === ".") return [9, "r"];
  if (op === "<~" || op === "~>") return [5, "l"];
  if (op === "+" || op === "-") return [6, "l"];
  if (op === "*" || op === "/") return [7, "l"];
  return [1, "l"]; // #, |+|, |<, + …
}
function parse(toks) {
  let i = 0;
  const peek = () => toks[i];
  function expr(minP = 0) {
    let left = app();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" && t.t !== "`") break;
      let op;
      if (t.t === "`") { op = toks[i + 1] && toks[i + 1].v; } else op = t.v;
      const [p, assoc] = t.t === "`" ? [4, "l"] : prec(op);
      if (p < minP) break;
      i += t.t === "`" ? 3 : 1;
      const right = expr(assoc === "r" ? p : p + 1);
      left = { k: "op", op, l: left, r: right, at: t.at };
    }
    return left;
  }
  function app() {
    const parts = [];
    for (;;) {
      const t = peek();
      if (!t || t.t === "op" || t.t === ")" || t.t === "]" || t.t === "," || t.t === "`") break;
      parts.push(atom());
    }
    if (!parts.length) return { k: "hole" };
    return parts.length === 1 ? parts[0] : { k: "app", f: parts[0], args: parts.slice(1) };
  }
  function atom() {
    const t = toks[i++];
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v, at: t.at };
    if (t.t === "id") return { k: "id", v: t.v };
    if (t.t === "[") {
      const items = [];
      while (peek() && peek().t !== "]") { items.push(expr()); if (peek() && peek().t === ",") i++; }
      i++;
      return { k: "list", items };
    }
    if (t.t === "(") {
      // secciones: (# speed 2), (+ n 12), (0.25 ~>), (1/8)
      if (peek() && peek().t === "op" && peek().v !== "-") {
        const op = toks[i++].v;
        if (peek() && peek().t === ")") { i++; return { k: "opfn", op }; }
        const r = expr(); i++;
        return { k: "rsec", op, r };
      }
      const e = expr();
      if (peek() && peek().t === ")") { i++; return e; }
      if (peek() && peek().t === ",") { // tupla: nos quedamos con el primero
        while (peek() && peek().t !== ")") i++;
        i++; return e;
      }
      i++;
      return e;
    }
    return { k: "id", v: "id" };
  }
  return expr();
}

// ---------------------------------------------------------------- evaluación
const STR_PARAMS = new Set(["s", "sound", "vowel", "unit"]);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], majPent: [0, 2, 4, 7, 9], minPent: [0, 3, 5, 7, 10], pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11], melodicMinor: [0, 2, 3, 5, 7, 9, 11], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  whole: [0, 2, 4, 6, 8, 10], wholetone: [0, 2, 4, 6, 8, 10],
};
const CHORDS = { major: [0, 4, 7], maj: [0, 4, 7], minor: [0, 3, 7], min: [0, 3, 7], m: [0, 3, 7], major7: [0, 4, 7, 11], maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10], minor7: [0, 3, 7, 10], min7: [0, 3, 7, 10], m7: [0, 3, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  six: [0, 4, 7, 9], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], nine: [0, 4, 7, 10, 14], one: [0], five: [0, 7] };

// Valores: número | { str, at } | patrón { q } | función (js)
const isPat = (x) => x && typeof x === "object" && typeof x.q === "function";
const isStr = (x) => x && typeof x === "object" && "str" in x;

export function evalTrack(code) {
  const info = { unknown: new Set(), chance: false };
  const strPat = (s) => mini(s.str, s.at);
  const toPat = (x) => {
    if (isPat(x)) return x;
    if (isStr(x)) return strPat(x);
    if (typeof x === "number") return pure({ _: x });
    if (x && x.param) return x.param;
    return silence;
  };
  const toNum = (x, def = 1) => {
    if (typeof x === "number") return x;
    if (isStr(x)) { const n = num(x.str.trim()); return isFinite(n) ? n : toPat(x); }
    if (isPat(x)) return x;
    return def;
  };
  const toFn = (x) => (typeof x === "function" ? x : x && x.fn ? x.fn : (p) => p);
  // parámetro: «n "0 2"» → valores con nombre; los de texto se quedan como texto
  const param = (name) => (x) => {
    const p = toPat(x);
    return mapEv(p, (e) => {
      const raw = e.v._;
      if (raw === undefined) return e;
      const v = { ...e.v }; delete v._;
      if (name === "s" || name === "sound") {
        const [sn, nn] = String(raw).split(":");
        v.s = sn; if (nn !== undefined && isFinite(parseFloat(nn))) v.n = parseFloat(nn);
      } else if (STR_PARAMS.has(name)) v[name] = String(raw);
      else { const nv = num(raw); v[name === "up" ? "note" : name] = isFinite(nv) ? nv : raw; }
      return { ...e, v };
    });
  };
  // a # b: la estructura la pone a; los valores de b se toman en el inicio de cada nota
  const combine = (fnum) => (a, b) => {
    const pa = toPat(a), pb = toPat(b);
    return P((x, y) => pa.q(x, y).map((e) => {
      const o = at(pb, e.t0);
      if (!o) return e;
      const v = { ...e.v };
      for (const [k, val] of Object.entries(o.v)) v[k] = fnum && typeof v[k] === "number" && typeof val === "number" ? fnum(v[k], val) : fnum && v[k] !== undefined && k === "_" ? fnum(num(v[k]), num(val)) : (fnum && v[k] !== undefined ? v[k] : val);
      return { ...e, v, pos: e.pos.concat(o.pos), maybe: e.maybe || o.maybe };
    }));
  };
  const arith = { "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y, "/": (x, y) => x / y, "%": (x, y) => x % y };
  function binop(op, a, b) {
    if (op === "$") return apply(a, [b]);
    if (op === ".") return (x) => apply(a, [apply(b, [x])]);
    if (op === "<~" || op === "~>") {
      const sign = op === "<~" ? -1 : 1, p = toPat(b), d = toNum(a, 0);
      return perCycle(d, (k) => shift(sign * k, p));
    }
    if (typeof a === "number" && typeof b === "number" && arith[op]) return arith[op](a, b);
    if (op === "#") return combine(null)(a, b);
    const m = /^\|?([+\-*\/%<>])\|?$/.exec(op);
    if (m) {
      if (m[1] === "<") return combine(null)(a, b);
      if (m[1] === ">") return combine(null)(b, a);
      return combine(arith[m[1]])(a, b);
    }
    return toPat(a);
  }
  // Funciones conocidas (curry: van recogiendo argumentos)
  const curry = (n, f) => { const g = (...args) => (args.length >= n ? f(...args.slice(0, n)) : (...more) => g(...args, ...more)); return g; };
  const chance = (p) => { info.chance = true; return mark(p); };
  // sometimes & co.: Tidal tira los dados nota a nota; aquí marcamos las notas como «quizá cambia».
  // Si la transformación añade notas nuevas (p. ej. fast 2), las enseñamos también, como «quizá».
  const someFn = (f, p) => {
    info.chance = true;
    const pp = toPat(p), fp = toFn(f)(pp);
    return P((a, b) => {
      const base = pp.q(a, b), seen = new Set(base.map((e) => e.t0.toFixed(5)));
      return base.map((e) => ({ ...e, maybe: true })).concat(fp.q(a, b).filter((e) => !seen.has(e.t0.toFixed(5))).map((e) => ({ ...e, maybe: true })));
    });
  };
  const B = {
    silence: () => silence,
    id: () => (x) => x,
    const: () => curry(2, (a) => toPat(a)),
    fast: () => curry(2, (k, p) => perCycle(toNum(k), (v) => fast(v, toPat(p)))),
    density: () => B.fast(), hurry: () => B.fast(),
    slow: () => curry(2, (k, p) => perCycle(toNum(k), (v) => fast(1 / v, toPat(p)))),
    sparsity: () => B.slow(),
    rev: () => curry(1, (p) => { const pp = toPat(p); return P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) for (const e of pp.q(c, c + 1)) if (e.t0 >= c - EPS) out.push({ ...e, t0: 2 * c + 1 - e.t1, t1: 2 * c + 1 - e.t0 }); return out.filter((e) => e.t1 > a && e.t0 < b); }); }),
    every: () => curry(3, (n, f, p) => {
      const pp = toPat(p), fp = toFn(f)(pp);
      return perCycle(toNum(n), (k) => P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) { const src = k > 0 && c % Math.round(k) === 0 ? fp : pp; out.push(...src.q(Math.max(a, c), Math.min(b, c + 1)).filter((e) => e.t0 >= c - EPS && e.t0 < c + 1 - EPS)); } return out; }));
    }),
    whenmod: () => curry(4, (m, n, f, p) => {
      const pp = toPat(p), fp = toFn(f)(pp), M = toNum(m), N = toNum(n);
      return P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) { const src = (c % M) >= N ? fp : pp; out.push(...src.q(Math.max(a, c), Math.min(b, c + 1)).filter((e) => e.t0 >= c - EPS && e.t0 < c + 1 - EPS)); } return out; });
    }),
    sometimes: () => curry(2, someFn), often: () => curry(2, someFn), rarely: () => curry(2, someFn), almostNever: () => curry(2, someFn),
    almostAlways: () => curry(2, someFn), someCycles: () => curry(2, someFn),
    always: () => curry(2, (f, p) => toFn(f)(toPat(p))), never: () => curry(2, (f, p) => toPat(p)),
    sometimesBy: () => curry(3, (_x, f, p) => someFn(f, p)), someCyclesBy: () => curry(3, (_x, f, p) => someFn(f, p)),
    degrade: () => curry(1, (p) => chance(toPat(p))), degradeBy: () => curry(2, (_x, p) => chance(toPat(p))), unDegradeBy: () => curry(2, (_x, p) => chance(toPat(p))),
    off: () => curry(3, (t, f, p) => { const pp = toPat(p); return stack([pp, perCycle(toNum(t, 0), (k) => shift(k, toFn(f)(pp)))]); }),
    superimpose: () => curry(2, (f, p) => stack([toPat(p), toFn(f)(toPat(p))])),
    jux: () => curry(2, (f, p) => stack([mapEv(toPat(p), (e) => ({ ...e, v: { ...e.v, pan: 0 } })), mapEv(toFn(f)(toPat(p)), (e) => ({ ...e, v: { ...e.v, pan: 1 } }))])),
    juxBy: () => curry(3, (_x, f, p) => B.jux()(f, p)),
    stack: () => curry(1, (l) => stack((l || []).map(toPat))), overlay: () => curry(2, (a, b) => stack([toPat(a), toPat(b)])),
    cat: () => curry(1, (l) => slowcat((l || []).map(toPat))), slowcat: () => B.cat(),
    fastcat: () => curry(1, (l) => fastcat((l || []).map(toPat))), fastCat: () => B.fastcat(),
    randcat: () => curry(1, (l) => chance(slowcat((l || []).map(toPat)))),
    mask: () => curry(2, (m, p) => { const mp = toPat(m), pp = toPat(p); return P((a, b) => pp.q(a, b).filter((e) => { const o = at(mp, e.t0); return o && !/^(0|f|false)$/.test(String(o.v._)); }).map((e) => { const o = at(mp, e.t0); return { ...e, pos: e.pos.concat(o.pos) }; })); }),
    struct: () => curry(2, (s, p) => { const sp = toPat(s), pp = toPat(p); return P((a, b) => sp.q(a, b).filter((e) => !/^(0|f|false)$/.test(String(e.v._))).map((e) => { const o = at(pp, e.t0); return o ? { ...o, t0: e.t0, t1: e.t1, pos: o.pos.concat(e.pos) } : null; }).filter(Boolean)); }),
    euclid: () => curry(3, (k, n, p) => perCycle(toNum(k), (kk) => perCycle(toNum(n), (nn) => euclidP(kk, nn, 0, toPat(p))))),
    euclidInv: () => curry(3, (k, n, p) => perCycle(toNum(k), (kk) => perCycle(toNum(n), (nn) => euclidP(kk, nn, 0, toPat(p), true)))),
    euclidFull: () => curry(4, (k, n, p, p2) => stack([B.euclid()(k, n, p), B.euclidInv()(k, n, p2)])),
    euclidOff: () => curry(4, (k, n, r, p) => perCycle(toNum(k), (kk) => perCycle(toNum(n), (nn) => perCycle(toNum(r, 0), (rr) => euclidP(kk, nn, rr, toPat(p)))))),
    euclidOffFull: () => curry(5, (k, n, r, p) => B.euclidOff()(k, n, r, p)),
    ply: () => curry(2, (k, p) => perCycle(toNum(k), (v) => { const pp = toPat(p); return P((a, b) => pp.q(a, b).flatMap((e) => { const d = (e.t1 - e.t0) / v; return Array.from({ length: Math.max(1, Math.round(v)) }, (_, j) => ({ ...e, t0: e.t0 + j * d, t1: e.t0 + (j + 1) * d })); })); })),
    iter: () => curry(2, (k, p) => perCycle(toNum(k), (v) => { const pp = toPat(p); return P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) { const d = (((c % v) + v) % v) / v; out.push(...shift(-d, pp).q(c, c + 1).filter((e) => e.t0 >= c - EPS).map((e) => (e.t0 < c ? { ...e, t0: e.t0 + 1, t1: e.t1 + 1 } : e))); } return out.filter((e) => e.t0 < b && e.t1 > a); }); })),
    run: () => curry(1, (n) => perCycle(toNum(n), (v) => fastcat(Array.from({ length: Math.max(1, Math.round(v)) }, (_, j) => pure({ _: j }))))),
    segment: () => curry(2, (k, p) => perCycle(toNum(k), (v) => { const pp = toPat(p); return P((a, b) => { const out = []; for (let s = fl(a * v); s < b * v - EPS; s++) { const o = at(pp, s / v); if (o) out.push({ ...o, t0: s / v, t1: (s + 1) / v }); } return out; }); })),
    range: () => curry(3, (lo, hi, p) => mapEv(toPat(p), (e) => { const L = toNum(lo, 0), H = toNum(hi, 1); const x = num(e.v._); return isFinite(x) && typeof L === "number" && typeof H === "number" ? { ...e, v: { ...e.v, _: L + x * (H - L) } } : e; })),
    rand: () => pure({ _: 0.5 }), irand: () => curry(1, () => { info.chance = true; return mark(pure({ _: 0 })); }),
    perlin: () => pure({ _: 0.5 }), sine: () => pure({ _: 0.5 }), cosine: () => pure({ _: 0.5 }), saw: () => pure({ _: 0.5 }), tri: () => pure({ _: 0.5 }), square: () => pure({ _: 0.5 }),
    scale: () => curry(2, (name, p) => {
      const np = toPat(name), pp = toPat(p);
      return P((a, b) => pp.q(a, b).map((e) => {
        const o = at(np, e.t0), sc = SCALES[o ? String(o.v._) : "major"] || SCALES.major, d = num(e.v._);
        if (!isFinite(d)) return e;
        const k = Math.floor(d), oct = Math.floor(k / sc.length);
        return { ...e, v: { ...e.v, _: sc[((k % sc.length) + sc.length) % sc.length] + oct * 12 } };
      }));
    }),
    toScale: () => curry(2, (l, p) => mapEv(toPat(p), (e) => { const sc = Array.isArray(l) ? l : [0, 2, 4, 5, 7, 9, 11]; const d = Math.floor(num(e.v._)); if (!isFinite(d)) return e; const oct = Math.floor(d / sc.length); return { ...e, v: { ...e.v, _: sc[((d % sc.length) + sc.length) % sc.length] + oct * 12 } }; })),
    arp: () => curry(2, (m, p) => arpeggiate(chordify(toPat(p)), isStr(m) ? m.str.trim() : "up")), arpeggiate: () => curry(1, (p) => arpeggiate(chordify(toPat(p)))),
    swingBy: () => curry(3, (x, n, p) => { const pp = toPat(p), X = toNum(x, 0), N = toNum(n, 4); if (typeof X !== "number" || typeof N !== "number") return pp; return P((a, b) => pp.q(a - 1, b).map((e) => { const s = e.t0 * N, h = s - Math.floor(s + EPS); return h >= 0.5 - EPS ? { ...e, t0: e.t0 + X / N, t1: e.t1 + X / N } : e; }).filter((e) => e.t1 > a && e.t0 < b)); }),
    swing: () => curry(2, (n, p) => B.swingBy()(1 / 3, n, p)),
    inside: () => curry(3, (n, f, p) => perCycle(toNum(n), (v) => fast(v, toFn(f)(fast(1 / v, toPat(p)))))),
    outside: () => curry(3, (n, f, p) => perCycle(toNum(n), (v) => fast(1 / v, toFn(f)(fast(v, toPat(p)))))),
    palindrome: () => curry(1, (p) => { const pp = toPat(p), rp = B.rev()(pp); return P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) out.push(...(c % 2 ? rp : pp).q(Math.max(a, c), Math.min(b, c + 1)).filter((e) => e.t0 >= c - EPS && e.t0 < c + 1 - EPS)); return out; }); }),
    // Cortan o estiran el sonido, pero no cambian cuándo empieza cada nota
    chop: () => curry(2, (k, p) => perCycle(toNum(k), (v) => { const pp = toPat(p); return P((a, b) => pp.q(a, b).flatMap((e) => { const n = Math.max(1, Math.round(v)), d = (e.t1 - e.t0) / n; return Array.from({ length: n }, (_, j) => ({ ...e, t0: e.t0 + j * d, t1: e.t0 + (j + 1) * d })); })); })),
    striate: () => B.chop(), slice: () => curry(3, (_a, _b, p) => toPat(p)),
    splice: () => curry(3, (_a, _b, p) => toPat(p)), loopAt: () => curry(2, (_k, p) => toPat(p)), legato: () => param("legato"),
    brak: () => curry(1, (p) => toPat(p)),
    linger: () => curry(2, (k, p) => perCycle(toNum(k), (f) => { const pp = toPat(p); if (!(f > 0 && f <= 1)) return pp; return P((a, b) => { const out = []; for (let c = fl(a); c < b - EPS; c++) { const base = pp.q(c, c + f).filter((e) => e.t0 >= c - EPS && e.t0 < c + f - EPS); for (let j = 0; j < Math.round(1 / f); j++) for (const e of base) out.push({ ...e, t0: e.t0 + j * f, t1: e.t1 + j * f }); } return out.filter((e) => e.t1 > a && e.t0 < b); }); })), chunk: () => curry(3, (_n, _f, p) => toPat(p)),
    rot: () => curry(2, (_k, p) => toPat(p)), shuffle: () => curry(2, (_k, p) => chance(toPat(p))), scramble: () => curry(2, (_k, p) => chance(toPat(p))),
    chooseBy: () => curry(2, () => { info.chance = true; return pure({ _: 0 }); }), choose: () => curry(1, (l) => { info.chance = true; return mark(pure({ _: (l && l[0]) ?? 0 })); }),
    wchoose: () => curry(1, () => { info.chance = true; return pure({ _: 0 }); }),
    nTake: () => curry(2, (_n, l) => pure({ _: (l && l[0]) ?? 0 })),
    whenT: () => curry(3, (_t, _f, p) => toPat(p)),
    trunc: () => curry(2, (k, p) => { const pp = toPat(p), K = toNum(k, 1); return typeof K !== "number" ? pp : P((a, b) => pp.q(a, b).filter((e) => e.t0 - Math.floor(e.t0 + EPS) < K - EPS)); }),
    stut: () => curry(4, (n, _fb, t, p) => { const pp = toPat(p), N = toNum(n, 3), T = toNum(t, 0.125); if (typeof N !== "number" || typeof T !== "number") return pp; return stack(Array.from({ length: Math.round(N) }, (_, j) => shift(j * T, pp))); }),
    echo: () => curry(4, (n, t, _fb, p) => B.stut()(n, 0, t, p)),
    nudge: () => param("nudge"),
  };
  function arpeggiate(p, mode = "up") {
    return P((a, b) => {
      const evs = p.q(a, b), groups = new Map();
      for (const e of evs) { const k = e.t0.toFixed(6) + ":" + e.t1.toFixed(6); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
      const out = [];
      for (const g0 of groups.values()) {
        let g = g0;
        if (/^down/.test(mode)) g = [...g0].reverse();
        else if (mode === "updown") g = g0.concat(g0.slice(1, -1).reverse());
        else if (mode === "downup") g = [...g0].reverse().concat(g0.slice(1, -1));
        const d = (g[0].t1 - g[0].t0) / g.length;
        g.forEach((e, j) => out.push({ ...e, t0: e.t0 + j * d, t1: e.t0 + (j + 1) * d }));
      }
      return out;
    });
  }
  // «c'major» / «e'min7'ii»: acordes dentro de la mini-notación → varias notas a la vez
  const chordify = (p) => P((a, b) => p.q(a, b).flatMap((e) => {
    const raw = e.v._;
    if (typeof raw !== "string" || !raw.includes("'")) return [e];
    const [root, name] = raw.split("'");
    const r = num(root), ch = CHORDS[name] || CHORDS.major;
    return isFinite(r) ? ch.map((x) => ({ ...e, v: { ...e.v, _: r + x } })) : [e];
  }));

  function apply(f, args) {
    if (typeof f === "function") {
      let r = f;
      for (const a of args) r = typeof r === "function" ? r(a) : r;
      return r;
    }
    if (f && f.fn) return apply(f.fn, args);
    // aplicar un patrón a algo: nos quedamos con el patrón
    return f;
  }
  function ev(n) {
    switch (n.k) {
      case "num": return n.v;
      case "hole": return (x) => x;
      case "str": return { str: n.v, at: n.at };
      case "list": return n.items.map(ev).map((x) => (isStr(x) ? num(x.str) : x));
      case "id": {
        if (B[n.v]) return B[n.v]();
        if (n.v === "n" || n.v === "note" || n.v === "up") return (x) => param(n.v)(chordify(toPat(x)));
        if (/^(s|sound|vowel|unit)$/.test(n.v)) return param(n.v);
        // nombre desconocido: si le das un número o un texto es un parámetro (# lpf 800); si le das un patrón, lo deja pasar
        const name = n.v;
        const unk = (x) => {
          if (isPat(x)) { info.unknown.add(name); return x; }
          const par = param(name)(x);
          const fnv = (...more) => { info.unknown.add(name); const pats = more.filter(isPat); return pats.length ? pats[pats.length - 1] : unk; };
          fnv.q = par.q; // vale como patrón (parámetro) y como función (transformación desconocida)
          return fnv;
        };
        return unk;
      }
      case "app": return apply(ev(n.f), n.args.map(ev));
      case "op": {
        if (n.r.k === "hole") { const l = ev(n.l); return (x) => binop(n.op, l, x); } // sección: (0.25 ~>)
        if (n.op === "$") return apply(ev(n.l), [ev(n.r)]);
        return binop(n.op, ev(n.l), ev(n.r));
      }
      case "opfn": return (a) => (b) => binop(n.op, a, b);
      case "rsec": { const r = ev(n.r); return (x) => binop(n.op, x, r); }
      default: return silence;
    }
  }
  let pat = silence;
  try {
    const tree = parse(tokenize(code));
    pat = toPat(ev(tree));
  } catch (e) {
    info.error = String(e && e.message || e);
  }
  // valores sueltos sin nombre (un patrón sin s/n): los llamamos «s»
  const final = mapEv(pat, (e) => {
    if (e.v._ === undefined) return e;
    const v = { ...e.v }; const raw = v._; delete v._;
    if (v.s === undefined) v.s = String(raw);
    return { ...e, v };
  });
  return {
    query(a, b) {
      try {
        // una nota larga que cruza ciclos puede llegar repetida (una vez por ciclo): nos quedamos con una
        const seen = new Set();
        return final.q(a, b).filter((e) => {
          if (!(e.t0 >= a - EPS && e.t0 < b - EPS && e.t1 > e.t0)) return false;
          const k = `${e.t0.toFixed(6)}|${e.t1.toFixed(6)}|${JSON.stringify(e.v)}|${JSON.stringify(e.pos)}|${e.maybe ? 1 : 0}`;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        }).sort((x, y) => x.t0 - y.t0).slice(0, 6000);
      } catch (e) { info.error = String(e && e.message || e); return []; }
    },
    info,
  };
}

// Cadenas entre comillas del código de una pista (con su posición), saltándose los comentarios
export function stringLiterals(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    if (code.startsWith("--", i) && !/[!#$%&*+./<=>?@\\^|~:]/.test(code[i + 2] || "")) { while (i < code.length && code[i] !== "\n") i++; continue; }
    if (code[i] === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== '"') j += code[j] === "\\" ? 2 : 1;
      out.push({ start: i + 1, end: j, text: code.slice(i + 1, j), before: code.slice(Math.max(0, i - 12), i) });
      i = j + 1; continue;
    }
    i++;
  }
  return out;
}
