// Tiempo real a partir del tempo: 1 ciclo = 1 compás = 4 tiempos, así que cps = BPM / 60 / 4.
export const cycleSecs = (bpm) => (60 / (bpm > 0 ? bpm : 120)) * 4;
// 83.4 → "1:23" ; con decimales: "1:23.4"
export function fmtTime(s, dec = 0) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  const t = dec ? r.toFixed(dec) : String(Math.floor(r + 1e-9));
  return `${m}:${(dec ? t.padStart(dec + 3, "0") : t.padStart(2, "0"))}`;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// Compases que dura la canción entera: el mínimo común múltiplo de las longitudes de máscara (arreglo); 1 si no hay.
export function songCycles(lengths, cap = 256) {
  let n = 1;
  for (const l of lengths) { if (l > 0) n = (n * l) / gcd(n, l); if (n >= cap) return cap; }
  return n;
}
