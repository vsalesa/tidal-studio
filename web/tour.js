// Tutorial interactivo para principiantes: un foco ilumina cada parte de la app y Maestro te pide hacer algo.
// Cada paso espera a que lo hagas (done) o puedes saltarlo. Se pinta como popover para quedar encima de los diálogos.
import { L } from "./i18n.js";
import { icon } from "./icons.js";

const flags = new Set();
export const tourFlag = (f) => flags.add(f);
const DONE_KEY = "tidal-studio-tour-done";
export const tourSeen = () => { try { return !!localStorage.getItem(DONE_KEY); } catch { return true; } };

const $ = (s) => document.querySelector(s);
const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
const open = (id) => !!$(id)?.open;
const tab = (n) => $(`.tab[data-tab="${n}"]`)?.classList.contains("active");

// target: selector (o función) a iluminar; done: qué tiene que pasar; before: se ejecuta al entrar
function steps(ctx) {
  const n = () => ctx.state().tracks.length;
  let n0 = 0;
  const mark = () => { n0 = n(); };
  return [
    { title: L("¡Bienvenido a Tidal Studio!", "Welcome to Tidal Studio!"), center: true, art: "hello",
      text: L("En 5 minutos vas a hacer tu primera canción y conocer todo el estudio. Yo te ilumino cada parte y tú la pruebas. Puedes saltar cualquier paso.",
        "In 5 minutes you'll make your first song and get to know the whole studio. I light up each part and you try it. You can skip any step.") },
    { title: L("1 · Los instrumentos", "1 · The instruments"), target: ".inst-strip", before: () => ctx.closeDialogs(),
      text: L("Aquí tienes instrumentos de verdad dibujados. Empezamos por el ritmo: abre la batería.", "Here are real instruments, illustrated. Let's start with the beat: open the drum kit."),
      todo: L("Pulsa «Batería»", "Press «Drum kit»"), done: () => open("#instrument") },
    { title: L("2 · Toca la batería", "2 · Play the drums"), target: "#instrument .inst-stage", before: () => { flags.delete("drum-piece"); if (!open("#instrument")) ctx.openInstrument("drums"); },
      text: L("Cada pieza tiene su nombre en Tidal: bd es el bombo, sn la caja, hh el hi-hat… Pulsa una pieza para oírla.",
        "Each piece has its Tidal name: bd is the kick, sn the snare, hh the hi-hat… Press a piece to hear it."),
      todo: L("Pulsa el bombo (bd)", "Press the kick (bd)"), done: () => flags.has("drum-piece") },
    { title: L("3 · Tu primera pista", "3 · Your first track"), target: "#instrument .inst-side", before: mark,
      text: L("Los cuadrados son los pasos de un compás. Enciende o apaga alguno y mira cómo cambia el código. Cuando te guste, añádelo.",
        "The squares are the steps of one bar. Turn some on or off and watch the code change. When you like it, add it."),
      todo: L("Pulsa «Añadir como pista»", "Press «Add as a track»"), done: () => n() > n0 },
    { title: L("4 · Las pistas", "4 · Tracks"), target: "#tracks .track", before: () => { ctx.closeDialogs(); ctx.tab("tracks"); },
      text: L("Cada pista es una línea de Tidal (d1, d2…) que suena en bucle. Puedes tocarla, silenciarla, editar su código o borrarla.",
        "Each track is one line of Tidal (d1, d2…) that loops. You can play it, mute it, edit its code or delete it.") },
    { title: L("5 · Pregunta qué hace", "5 · Ask what it does"), target: "#tracks .track button[data-a=explain]",
      text: L("¿No entiendes el código? Maestro te lo explica trozo a trozo.", "Don't understand the code? Maestro explains it piece by piece."),
      todo: L("Pulsa «Explícame»", "Press «Explain»"), done: () => !!$("#tracks .explain-box") },
    { title: L("6 · Componentes", "6 · Components"), target: '.cat[data-cat="percusion"]', before: () => { ctx.pane("comps"); mark(); },
      text: L("Los componentes son recetas listas: cada icono es una pista. Añade unos hi-hats o unas palmas.", "Components are ready-made recipes: each icon is a track. Add some hi-hats or claps."),
      todo: L("Pulsa un componente de percusión", "Press a drums component"), done: () => n() > n0 },
    { title: L("7 · Efectos", "7 · Effects"), target: '.cat[data-cat="efecto"]',
      text: L("Los efectos cambian cómo suena la pista seleccionada: espacio, eco, filtros… Prueba la reverb.", "Effects change how the selected track sounds: space, echo, filters… Try the reverb."),
      todo: L("Pulsa un efecto", "Press an effect"), done: () => ctx.state().tracks.some((t) => /#\s*(room|delay|lpf|hpf|shape|crush|pan)|jux|echo|degradeBy/.test(t.code)) },
    { title: L("8 · Más instrumentos", "8 · More instruments"), target: "#instrument .keyboard, .inst-row", before: () => { flags.delete("inst-key"); },
      text: L("Ahora una melodía: abre el piano (o el saxo) y toca unas teclas. Cada tecla se convierte en una nota del código.",
        "Now a melody: open the piano (or the sax) and play some keys. Each key becomes a note in the code."),
      todo: L("Toca alguna tecla de un instrumento", "Play some key on an instrument"), done: () => flags.has("inst-key") },
    { title: L("9 · Habla con Maestro", "9 · Talk to Maestro"), target: "#chat-form", before: () => { ctx.closeDialogs(); flags.delete("controls"); },
      text: L("Puedes pedirle cosas con tus palabras. Prueba a escribir «controles»: te dará deslizadores que escriben el código por ti.",
        "You can ask for things in your own words. Try typing «controls»: you'll get sliders that write the code for you."),
      todo: L("Escribe «controles» y envía", "Type «controls» and send"), done: () => !!$("#chat .ctl-panel") },
    { title: L("10 · Mueve un control", "10 · Move a control"), target: () => [...document.querySelectorAll("#chat .ctl-panel")].pop(), before: () => flags.delete("ctl-move"),
      text: L("Mueve un deslizador y fíjate en la línea gris: es el código Tidal cambiando en directo.", "Move a slider and watch the grey line: it's the Tidal code changing live."),
      todo: L("Mueve cualquier control", "Move any control"), done: () => flags.has("ctl-move") },
    { title: L("11 · Ideas de productor", "11 · Producer ideas"), target: "#ideas",
      text: L("Maestro te propone ideas como un productor. «Escuchar» la prueba unos compases sin cambiar nada; «Probar» la aplica y puedes deshacerla.",
        "Maestro suggests ideas like a producer. «Listen» plays it for a few bars without changing anything; «Try» applies it and you can undo it.") },
    { title: L("12 · Recetas de estilo", "12 · Style recipes"), target: "#flavors",
      text: L("¿Quieres que suene a jazz, techno o lo-fi? Maestro transforma tu canción y te enseña el antes y el después.",
        "Want it to sound like jazz, techno or lo-fi? Maestro transforms your song and shows you the before and after.") },
    { title: L("13 · Vista de bloques", "13 · Blocks view"), target: '.tab[data-tab="blocks"]', before: () => ctx.tab("tracks"),
      text: L("Tu canción como bloques de colores: qué la transforma, qué toca en cada paso y sus ajustes.", "Your song as colored blocks: what transforms it, what plays on each step and its settings."),
      todo: L("Abre «Bloques»", "Open «Blocks»"), done: () => tab("blocks") },
    { title: L("14 · Arreglo", "14 · Arrangement"), target: '.tab[data-tab="arrange"]',
      text: L("Una canción cambia con el tiempo. En Arreglo pintas en qué compases suena cada pista, o usas un preset como «Entra poco a poco».",
        "A song changes over time. In Arrangement you paint which bars each track plays, or use a preset like «Builds up»."),
      todo: L("Abre «Arreglo»", "Open «Arrangement»"), done: () => tab("arrange") },
    { title: L("15 · El código", "15 · The code"), target: '.tab[data-tab="code"]',
      text: L("Todo lo que haces es código Tidal de verdad. Aquí lo ves entero, lo editas (Ctrl+Enter lo aplica), lo descargas o compartes un enlace.",
        "Everything you do is real Tidal code. Here you see all of it, edit it (Ctrl+Enter applies it), download it or share a link."),
      todo: L("Abre «Código»", "Open «Code»"), done: () => tab("code") },
    { title: L("16 · Paleta de código", "16 · Code palette"), target: '.ltab[data-pane="palette"]',
      text: L("Cuando te atrevas con el código: bloques de Tidal ordenados por lo que quieres conseguir y por nivel.", "When you're ready for code: Tidal blocks sorted by what you want to achieve and by level."),
      todo: L("Abre la paleta", "Open the palette"), done: () => $('.ltab[data-pane="palette"]')?.classList.contains("active") },
    { title: L("17 · Tu biblioteca de sonidos", "17 · Your sound library"), target: "#btn-samples", before: () => ctx.pane("comps"),
      text: L("Cientos de sonidos por tipo, packs online, Freesound y tus propios archivos. Puedes recortar un sample viendo su onda.",
        "Hundreds of sounds by type, online packs, Freesound and your own files. You can trim a sample by looking at its waveform."),
      todo: L("Abre la biblioteca", "Open the library"), done: () => open("#samples") },
    { title: L("18 · Tocar, grabar y guardar", "18 · Play, record and save"), target: ".topbar", before: () => ctx.closeDialogs(),
      text: L("Arriba: «Tocar todo», «Silencio» para parar ya, «Grabar» a WAV, el tempo (BPM), tus proyectos y guardar versiones en GitHub.",
        "At the top: «Play all», «Hush» to stop at once, «Record» to WAV, the tempo (BPM), your projects and saving versions to GitHub.") },
    { title: L("19 · Proyectos nuevos", "19 · New projects"), target: "#btn-new",
      text: L("Para la próxima canción: empieza en blanco, con el asistente paso a paso o con una lluvia de ideas.", "For your next song: start blank, with the step-by-step wizard or with a brainstorm.") },
    { title: L("¡Ya conoces todo el estudio!", "You know the whole studio!"), center: true, art: "done",
      text: L("Ahora sigue tú: pídele a Maestro ideas, prueba recetas y mira el código. Puedes repetir este tutorial cuando quieras desde el botón del birrete.",
        "Now it's your turn: ask Maestro for ideas, try recipes and look at the code. You can repeat this tutorial any time from the cap button.") },
  ];
}

let T = null;
export function startTour(ctx) {
  stopTour(false);
  const list = steps(ctx);
  const spot = document.createElement("div"); spot.className = "tour-spot"; spot.popover = "manual";
  const card = document.createElement("div"); card.className = "tour-card"; card.popover = "manual";
  document.body.append(spot, card);
  T = { ctx, list, i: 0, spot, card, okAt: 0, timer: 0 };
  card.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]");
    if (!b) return;
    if (b.dataset.t === "next") go(T.i + 1);
    if (b.dataset.t === "back") go(T.i - 1);
    if (b.dataset.t === "close") stopTour(true);
  });
  document.addEventListener("keydown", onKey);
  T.timer = setInterval(tick, 250);
  go(0);
}
function onKey(e) { if (T && e.key === "Escape" && !document.querySelector("dialog[open]")) stopTour(true); }
export function stopTour(done) {
  if (!T) return;
  clearInterval(T.timer); document.removeEventListener("keydown", onKey);
  T.spot.remove(); T.card.remove(); T = null;
  if (done) try { localStorage.setItem(DONE_KEY, "1"); } catch {}
}
function go(i) {
  if (!T) return;
  if (i >= T.list.length) return stopTour(true);
  T.i = Math.max(0, i); T.okAt = 0;
  const s = T.list[T.i];
  try { s.before && s.before(); } catch {}
  renderCard();
  setTimeout(tick, 60);
}
function target(s) {
  if (!s.target) return null;
  if (typeof s.target === "function") return s.target();
  for (const sel of s.target.split(",")) { const el = [...document.querySelectorAll(sel.trim())].find(visible); if (el) return el; }
  return null;
}
function renderCard() {
  const s = T.list[T.i], last = T.i === T.list.length - 1, ok = !!T.okAt;
  const art = s.art === "hello" ? `<div class="tour-art">${icon("maestro", 34)}</div>` : s.art === "done" ? `<div class="tour-art done">${icon("check", 34)}</div>` : "";
  T.card.innerHTML = `<div class="tour-top"><span class="tour-who">${icon("maestro", 15)} Maestro</span><span class="tour-n">${T.i + 1}/${T.list.length}</span>
      <button data-t="close" class="tour-x" title="${L("Salir del tutorial", "Exit tutorial")}">${icon("close", 15)}</button></div>
    <div class="tour-bar"><i style="width:${((T.i + 1) / T.list.length) * 100}%"></i></div>
    ${art}<h3>${s.title}</h3><p>${s.text}</p>
    ${s.todo ? `<div class="tour-todo ${ok ? "ok" : ""}">${ok ? icon("check", 15) : `<span class="tour-pulse"></span>`}<span>${ok ? L("¡Hecho!", "Done!") : s.todo}</span></div>` : ""}
    <div class="tour-btns">${T.i > 0 && !last ? `<button data-t="back">${icon("back", 13)} ${L("Atrás", "Back")}</button>` : ""}
      <button data-t="next" class="${!s.todo || ok ? "primary" : ""}">${last ? L("¡A crear!", "Let's create!") : T.i === 0 ? L("Empezar", "Start") : s.todo && !ok ? L("Saltar paso", "Skip step") : L("Siguiente", "Next")} ${last ? "" : icon("arrow", 13)}</button></div>`;
  T.card.classList.toggle("center", !!s.center);
}
function raise(el) { try { el.hidePopover(); el.showPopover(); } catch {} }
let lastTop = null;
function tick() {
  if (!T) return;
  const s = T.list[T.i];
  if (s.todo && !T.okAt) {
    let d = false; try { d = s.done(); } catch {}
    if (d) { T.okAt = Date.now(); renderCard(); setTimeout(() => { if (T && T.list[T.i] === s) go(T.i + 1); }, 1100); }
  }
  // mantener el tutorial por encima del diálogo abierto más reciente
  const top = document.querySelector("dialog[open]");
  if (top !== lastTop || !T.spot.matches(":popover-open")) { lastTop = top; raise(T.spot); raise(T.card); }
  const el = s.center ? null : target(s);
  const vw = innerWidth, vh = innerHeight, cw = Math.min(360, vw - 24);
  T.card.style.width = cw + "px";
  if (!el) {
    T.spot.style.cssText = "opacity:0";
    T.card.style.left = (vw - cw) / 2 + "px"; T.card.style.top = Math.max(16, vh / 2 - T.card.offsetHeight / 2) + "px";
    return;
  }
  if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false);
  let r = el.getBoundingClientRect();
  // recorta el foco a la parte visible dentro de su caja con scroll (p. ej. el chat)
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") {
      const q = p.getBoundingClientRect();
      const top = Math.max(r.top, q.top), bottom = Math.min(r.bottom, q.bottom);
      if (bottom > top) r = { left: r.left, width: r.width, top, height: bottom - top };
      break;
    }
  }
  const pad = 6;
  const R = { x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(r.width + pad * 2, vw - 8), h: Math.min(r.height + pad * 2, vh - 8) };
  T.spot.style.cssText = `left:${R.x}px;top:${R.y}px;width:${R.w}px;height:${R.h}px;opacity:1`;
  const ch = T.card.offsetHeight, gap = 14;
  let x, y;
  if (R.x + R.w + gap + cw < vw) { x = R.x + R.w + gap; y = R.y; }            // a la derecha
  else if (R.x - gap - cw > 0) { x = R.x - gap - cw; y = R.y; }              // a la izquierda
  else if (R.y + R.h + gap + ch < vh) { x = R.x; y = R.y + R.h + gap; }       // debajo
  else { x = R.x; y = R.y - gap - ch; }                                        // encima
  T.card.style.left = Math.max(12, Math.min(vw - cw - 12, x)) + "px";
  T.card.style.top = Math.max(12, Math.min(vh - ch - 12, y)) + "px";
}
