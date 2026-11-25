// Cuántas pistas (d1…dN) tiene el estudio (0.25.1). Lo dice el servidor en /api/status (Ajustes → Límites → Pistas);
// 12 hasta que conteste. Ver server/tracklimit.py: cada pista es una orbit de SuperDirt (más pistas, más CPU).
export const TRACKS_MIN = 12, TRACKS_MAX = 64;
let max = 12;
export const maxTracks = () => max;
export function setMaxTracks(n) {
  const v = Math.round(+n);
  if (v >= TRACKS_MIN && v <= TRACKS_MAX) max = v;
  return max;
}
