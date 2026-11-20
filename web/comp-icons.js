// Iconos propios de cada componente del catálogo (SVG 24×24, trazo, se colorean con currentColor)
const F = `fill="currentColor"`;
const DOT = (pts) => `<path d="${pts.map(([x, y]) => `M${x} ${y}h.01`).join("")}" stroke-width="2.8"/>`;

export const COMP_ICONS = {
  // ---------------------------------------------------------------- percusión
  kick4: `<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.6"/>${DOT([[4.5, 21], [9.5, 21], [14.5, 21], [19.5, 21]])}`,
  kickhh: `<circle cx="12" cy="9.5" r="6.5"/><circle cx="12" cy="9.5" r="2.3"/>${DOT([[4, 21], [11.5, 21], [15, 21]])}<path d="M19 19.5l1.5 1.5" opacity=".5"/>`,
  clap: `<path d="M8.5 21l-3.6-6.6a1.8 1.8 0 0 1 3-1.9l1.6 2V6a1.6 1.6 0 0 1 3.2 0v6.5"/><path d="M12.7 10a1.6 1.6 0 0 1 3.2 0v4.6a6.4 6.4 0 0 1-6.4 6.4"/><path d="M17.5 4.5l1.5-2M19.5 8l2.3-.8M19.5 11.5h2.3"/>`,
  snare: `<ellipse cx="12" cy="12" rx="8" ry="2.6"/><path d="M4 12v4.8c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V12"/><path d="M7 14.4v4.3M12 14.6v4.8M17 14.4v4.3" opacity=".6"/><path d="M7 3l4.5 7M17 3l-4.5 7"/>`,
  hats8: `<path d="M4 9.5c2-2.4 14-2.4 16 0z"/><path d="M4 11c2 2.2 14 2.2 16 0"/><path d="M12 3v18M9 21h6"/>`,
  hatsoff: `<path d="M4 7.5c2-2.4 14-2.4 16 0z"/><path d="M4 12.5c2 2.2 14 2.2 16 0"/><path d="M12 3v18M9 21h6"/><path d="M1.8 5.5l1.6.8M22.2 5.5l-1.6.8M2 10h1.6M22 10h-1.6" opacity=".6"/>`,
  hatstrap: `<path d="M5 7.5c2-2.2 12-2.2 14 0z"/><path d="M12 3v4.5"/><path d="M5 14h14"/><path d="M5 14v6M8.5 14v6M12 14v6M15.5 14v6M19 14v6"/>`,
  dembow: `<rect x="2.5" y="9" width="7" height="7" rx="1.6"/><rect x="11" y="9" width="7" height="7" rx="1.6"/><rect x="19.5" y="9" width="2.5" height="7" rx="1"/>${DOT([[6, 5], [14.5, 5], [20.8, 5]])}`,
  amen: `<path d="M3 12v0M5.5 8v8M8 10v4M10.5 5v14M13 9v6M15.5 7v10M18 10v4M20.5 11v2"/><path d="M9.2 2.5v19M16.8 2.5v19" stroke-dasharray="1.8 2.2" opacity=".55"/>`,
  lofidrums: `<rect x="2.5" y="5" width="19" height="14" rx="2.2"/><circle cx="8" cy="11" r="2.1"/><circle cx="16" cy="11" r="2.1"/><path d="M10.1 11h3.8"/><path d="M6.5 19l1.5-3.5h8l1.5 3.5"/>`,
  shaker: `<ellipse cx="12" cy="12" rx="4.6" ry="7" transform="rotate(35 12 12)"/>${DOT([[11, 10.5], [13.2, 12.5], [10.8, 13.6]])}<path d="M3.5 6.5a6 6 0 0 0-.5 5M20.5 12.5a6 6 0 0 1 .5 5" opacity=".6"/>`,

  // ---------------------------------------------------------------- bajo
  bass_off: `<path d="M4.5 9a5.5 5.5 0 0 1 11 0c0 6.5-6 10.5-11 11.5"/><circle cx="6.5" cy="9.5" r="1.6" ${F}/>${DOT([[19.5, 7], [19.5, 12]])}`,
  bass_roll: `<path d="M2 17l4-9v9l4-9v9l4-9v9l4-9v9l4-9"/><path d="M2 21h20" opacity=".4"/>`,
  bass_hh: `<path d="M2 15c2 0 2.2-7 4.5-7s2.3 10 4.5 10 2.2-8 4.5-8 2.2 4 4.5 4"/><circle cx="20.5" cy="14" r="1.5" ${F}/>`,
  bass_sub: `<path d="M2 12c4 0 5-7 10-7s6 14 10 14"/><path d="M2 21.5h20" opacity=".4"/><path d="M5 18.5l1.5 1.5 1.5-1.5" opacity=".6"/>`,

  // ---------------------------------------------------------------- acordes y pads
  chords_min: `<rect x="3" y="10" width="18" height="11" rx="1.6"/><path d="M9 10v11M15 10v11"/><rect x="7.7" y="10" width="2.6" height="6" rx=".5" ${F}/><rect x="13.7" y="10" width="2.6" height="6" rx=".5" ${F}/><path d="M12 2.2c1.5 1.9 2.3 3.1 2.3 4.1a2.3 2.3 0 0 1-4.6 0c0-1 .8-2.2 2.3-4.1z"/>`,
  stabs: `<rect x="3.5" y="4" width="6" height="3.2" rx="1"/><rect x="3.5" y="10.4" width="6" height="3.2" rx="1"/><rect x="3.5" y="16.8" width="6" height="3.2" rx="1"/><rect x="14.5" y="5.5" width="6" height="3.2" rx="1" ${F}/><rect x="14.5" y="11.9" width="6" height="3.2" rx="1" ${F}/><rect x="14.5" y="18.3" width="6" height="3.2" rx="1" ${F}/>`,
  pad: `<path d="M3 7.5c3-2 6-2 9 0s6 2 9 0"/><path d="M3 12.5c3-2 6-2 9 0s6 2 9 0" opacity=".7"/><path d="M3 17.5c3-2 6-2 9 0s6 2 9 0" opacity=".42"/>`,
  rhodes: `<rect x="2.5" y="11" width="19" height="8.5" rx="1.6"/><path d="M6.6 11v5M10.6 11v5M14.6 11v5M18.3 11v5"/><path d="M4.5 6.5c1.2-1.6 2.5-1.6 3.7 0s2.5 1.6 3.7 0 2.5-1.6 3.7 0 2.5 1.6 3.7 0"/>`,
  reggae_chords: `<path d="M14 10l6.5-6.5"/><path d="M18.5 2.5l3 3"/><path d="M11 9.2a4 4 0 0 0-5.8 1.4 3.6 3.6 0 0 0-1.4 4.7 3.6 3.6 0 0 0 4.5 4.5 3.6 3.6 0 0 0 4.7-1.4 4 4 0 0 0 1.4-5.8"/><circle cx="9.8" cy="14.2" r="1.6"/>`,

  // ---------------------------------------------------------------- melodía
  arp: `<path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21" opacity=".45"/><circle cx="5" cy="17.5" r="1.7" ${F}/><circle cx="9.7" cy="13" r="1.7" ${F}/><circle cx="14.3" cy="8.5" r="1.7" ${F}/><circle cx="19" cy="4" r="1.7" ${F}/>`,
  pent: `<path d="M3 15l4.5-6 4 9 4.5-12 5 6"/><circle cx="3" cy="15" r="1.4" ${F}/><circle cx="7.5" cy="9" r="1.4" ${F}/><circle cx="11.5" cy="18" r="1.4" ${F}/><circle cx="16" cy="6" r="1.4" ${F}/><circle cx="21" cy="12" r="1.4" ${F}/>`,
  arpy: `<path d="M9 18V6.5l8-2.5v4.5"/><circle cx="6.5" cy="18" r="2.5"/><path d="M17.5 12.5v5M15 15h5M20.5 4.5l.01 0" /><path d="M21 9.5l.01 0" stroke-width="2.6"/>`,
  bell: `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M12 3v2"/><path d="M2 8.5a9 9 0 0 1 2-4M22 8.5a9 9 0 0 0-2-4" opacity=".5"/>`,

  // ---------------------------------------------------------------- texturas
  wind: `<path d="M3 8h10a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 17h6" opacity=".6"/>`,
  birds: `<path d="M2.5 9.5c2-2.2 4-2.2 5.5 0 1.5-2.2 3.5-2.2 5.5 0"/><path d="M10.5 16c1.5-1.6 3-1.6 4 0 1-1.6 2.5-1.6 4 0"/><path d="M17 6c1-1 2-1 2.6 0 .6-1 1.6-1 2.4 0" opacity=".6"/>`,
  glitch: `<path d="M3 6h9M15 6h6M7 10.5h14M3 15h7M13 15h4M6 19.5h12"/><rect x="11" y="12.8" width="2.5" height="4.4" ${F} stroke="none"/><rect x="3" y="8.6" width="2.5" height="3.8" ${F} stroke="none" opacity=".6"/>`,
  vinyl: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/><path d="M12 5.8a6.2 6.2 0 0 1 6.2 6.2" opacity=".6"/>${DOT([[6.5, 16.5], [8.5, 18.5], [17, 6.5]])}`,

  // ---------------------------------------------------------------- efectos
  fx_reverb: `<path d="M3 4h18v16H3z" opacity=".35"/><circle cx="7.5" cy="12" r="1.5" ${F}/><path d="M11 9a4 4 0 0 1 0 6M14 6.5a7.5 7.5 0 0 1 0 11M17 4.5a11 11 0 0 1 0 15"/>`,
  fx_delay: `<circle cx="5" cy="12" r="3"/><circle cx="12.5" cy="12" r="2.2" opacity=".7"/><circle cx="18.5" cy="12" r="1.5" opacity=".45"/><circle cx="22" cy="12" r=".6" ${F} opacity=".3"/>`,
  fx_lpf: `<path d="M3 8h9c3 0 4 2 5 5l2 6"/><path d="M3 21h18" opacity=".4"/><path d="M3 8v13" opacity=".25"/>`,
  fx_sweep: `<path d="M3 11h8c3 0 4 2 5 5l2 4.5"/><path d="M12.5 4.5h9M15 2l-2.5 2.5L15 7M19 2l2.5 2.5L19 7"/>`,
  fx_hpf: `<path d="M21 8h-9c-3 0-4 2-5 5l-2 6"/><path d="M3 21h18" opacity=".4"/><path d="M21 8v13" opacity=".25"/>`,
  fx_dist: `<path d="M2 12h2l1.5-6h5l3 12h5L20 12h2"/><path d="M2 6h20M2 18h20" stroke-dasharray="1.6 2.2" opacity=".45"/>`,
  fx_crush: `<path d="M3 18h3v-4h3V8h3v4h3v5h3v-8h3"/><rect x="2.5" y="2.5" width="3" height="3" ${F} stroke="none" opacity=".5"/><rect x="6.5" y="2.5" width="3" height="3" ${F} stroke="none"/>`,
  fx_pan: `<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/><circle cx="12" cy="12" r="2.3" ${F}/><path d="M12 4v3M12 17v3" opacity=".4"/>`,
  fx_jux: `<path d="M4 8h14M15 5l3 3-3 3"/><path d="M20 16H6M9 13l-3 3 3 3"/>`,
  fx_human: `<path d="M7 19.5c-1.5-2-2.2-4.4-2.2-7.5a7.2 7.2 0 0 1 14.4 0"/><path d="M10.2 20.5c-1-2-1.6-4.4-1.6-8.5a3.4 3.4 0 0 1 6.8 0c0 2.6-.2 4.6-.8 6.4"/><path d="M12 12c0 3.2.5 6.2 1.5 8.8"/><path d="M19.2 15c-.2 1.6-.5 3.1-1 4.6"/>`,
  fx_echo: `<path d="M4 5v14M9 7.5v9M14 9.5v5M19 11v2"/>`,
  fx_holes: `<rect x="2.5" y="9" width="4" height="6" rx="1" ${F}/><rect x="7.5" y="9" width="4" height="6" rx="1" stroke-dasharray="1.5 1.5" opacity=".6"/><rect x="12.5" y="9" width="4" height="6" rx="1" ${F}/><rect x="17.5" y="9" width="4" height="6" rx="1" stroke-dasharray="1.5 1.5" opacity=".6"/>`,

  // ---------------------------------------------------------------- ¿cuándo pasa?
  st_fill: `<rect x="2.5" y="8" width="4" height="8" rx="1"/><rect x="7.5" y="8" width="4" height="8" rx="1"/><rect x="12.5" y="8" width="4" height="8" rx="1"/><path d="M18 7v10M20 7v10M22 7v10"/>`,
  st_rev: `<path d="M3 8h12a4 4 0 0 1 0 8H8"/><path d="M11 13l-3 3 3 3"/>`,
  st_inout: `<rect x="3" y="7" width="8" height="10" rx="1.6" ${F}/><rect x="13" y="7" width="8" height="10" rx="1.6" stroke-dasharray="2 2"/>`,
  st_buildup: `<path d="M3 20L16 7"/><path d="M10 7h6v6"/><path d="M21 3v18" stroke-dasharray="2 2.4"/>`,
  st_alt: `<rect x="2.5" y="8" width="4" height="8" rx="1" ${F}/><rect x="7.5" y="8" width="4" height="8" rx="1" opacity=".5"/><rect x="12.5" y="8" width="4" height="8" rx="1" ${F}/><rect x="17.5" y="8" width="4" height="8" rx="1" opacity=".5"/>`,
  st_sometimes: `<circle cx="12" cy="12" r="9" stroke-dasharray="3 2.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14"/><path d="M12 17.3h.01" stroke-width="2.6"/>`,
};

export function compIcon(id, size = 20) {
  const d = COMP_ICONS[id];
  if (!d) return "";
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
