// Iconos propios de Tidal Studio, dibujados a mano en SVG (24×24, trazo de 1.75 px).
// Usan "currentColor", así toman el color del texto donde se pongan.

const P = {
  logo: `<circle cx="12" cy="12" r="9.5"/><path d="M4 12c1.6 0 1.6-5 3.2-5s1.6 10 3.2 10 1.6-10 3.2-10 1.6 10 3.2 10 1.6-5 3.2-5"/>`,
  // categorías
  percusion: `<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/><path d="M4 12.5l3 1.8M20 12.5l-3 1.8M9.5 15.5l2.5-2 2.5 2"/><path d="M15 3l4-1.5M9 3L5 1.5"/>`,
  bajo: `<path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/><path d="M2 21h20" opacity=".45"/>`,
  armonia: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v10M12 4v10M16 4v10"/><path d="M8 14v6M12 14v6M16 14v6" opacity=".45"/><rect x="6.6" y="4" width="2.8" height="6" rx=".6" fill="currentColor"/><rect x="14.6" y="4" width="2.8" height="6" rx=".6" fill="currentColor"/>`,
  melodia: `<path d="M9 18V5l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15" r="2.5"/><path d="M9 9l11-2"/>`,
  textura: `<path d="M6.5 17a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.7-1.4A4.5 4.5 0 0 1 17.5 17z"/><path d="M8 20.5h.01M12 21.5h.01M16 20.5h.01" stroke-width="2.5"/>`,
  efecto: `<circle cx="12" cy="13" r="7"/><path d="M12 13l3.5-3.5"/><path d="M12 3v1.5M3.5 8l1.3.8M20.5 8l-1.3.8"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/>`,
  estructura: `<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/><path d="M12 8v4l2.5 2.5"/>`,
  fx: `<path d="M4 18L18 4M14 4h4v4"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>`,
  // acciones
  play: `<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke-linejoin="round"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>`,
  mute: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>`,
  unmute: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>`,
  trash: `<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  explain: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/><path d="M12 7v3M12 12.5h.01" stroke-width="2"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>`,
  maestro: `<circle cx="9" cy="7" r="3.5"/><path d="M2.5 21c0-4 2.9-6.5 6.5-6.5 1.6 0 3 .5 4.1 1.3"/><path d="M14 13l7.5-7.5"/><circle cx="14" cy="13" r="1.2" fill="currentColor"/><path d="M17 17.5l1 1 3-3"/>`,
  tracks: `<path d="M5 3v18M12 3v18M19 3v18"/><rect x="3" y="12" width="4" height="3" rx="1" fill="currentColor"/><rect x="10" y="6" width="4" height="3" rx="1" fill="currentColor"/><rect x="17" y="14" width="4" height="3" rx="1" fill="currentColor"/>`,
  code: `<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>`,
  log: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>`,
  send: `<path d="M4 12l16-8-6 16-3-7z"/><path d="M11 13l9-9"/>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>`,
  power: `<path d="M12 3v8"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  brain: `<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>`,
  speaker: `<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><circle cx="12" cy="14.5" r="3.5"/><circle cx="12" cy="7" r="1.3"/>`,
  dice: `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>`,
  wand: `<path d="M4 20L15 9"/><path d="M15 9l2-2" stroke-width="3"/><path d="M17 2.5v2M20.5 6h-2M19.5 3.5l-1.4 1.4M10 4v1.5M9.25 4.75h1.5M20 13v1.5M19.25 13.75h1.5"/>`,
  back: `<path d="M19 12H5M11 6l-6 6 6 6"/>`,
  folder: `<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>`,
  blank: `<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>`,
  steps: `<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>`,
  // GitHub (icono genérico: nube con versiones, sin logotipos de marca)
  blocks: `<rect x="3" y="3" width="18" height="5" rx="1.2"/><rect x="6" y="10" width="15" height="4.5" rx="1.2"/><rect x="9" y="16.5" width="12" height="4.5" rx="1.2"/><path d="M4.5 8v10.5H9M4.5 12.2H6"/>`,
  cloud: `<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4-1.2A4.6 4.6 0 0 1 17.5 18z"/><path d="M12 15.5v-5M9.8 12.6L12 10.4l2.2 2.2"/>`,
  history: `<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 3-3.5 3.5-10 6.5"/>`,
  link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
};

export function icon(name, size = 18, cls = "") {
  const d = P[name] || P.fx;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// Rellena todos los elementos <i data-icon="nombre"> del HTML
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, parseInt(el.dataset.size || "18"));
  });
}
