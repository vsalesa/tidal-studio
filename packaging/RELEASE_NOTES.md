## What's new in 0.10.0 / Novedades

- **Maestro makes a plan for big requests and goes step by step**: ask for a whole song or a big change and Maestro first shows a plan of 3 to 6 steps to approve, edit or skip, then does it all in a row or step by step. Each step is applied, explained and saved as soon as it's done, with a progress bar at the top of the chat.
- **No more lost work on timeouts**: if a step takes too long, the finished steps stay in your song and you retry only that step; a normal request that times out can be turned into a plan with one click. The AI is now only cut off when it stops sending anything for 5 minutes (`ai_timeout`), not while it's still answering.
- **Cancel what you sent to the chat**: while Maestro is thinking, Cancel (in its message, the square send button or Esc) stops the AI call at once, applies nothing and puts your message back in the box; cancelling a plan step pauses the plan.
- **Maestro caches what it loads and finds**- **Hear a real drummer in the genre courses**: nine courses bring a real drummer's performance in MIDI (Groove MIDI Dataset, Google Magenta, CC BY 4.0): Dominican merengue, reggaeton, bossa nova, Cuban songo, swing, funk, disco, breakbeat and hip hop. It downloads once (3 MB) and becomes Tidal tracks that keep the strength and timing of every hit, played with the course's instruments; listen to it or add it to your song. The reggaeton course now accents and pushes like the real drummer.
: prompt caching with Claude (API and subscription) and OpenAI-compatible providers, skills kept in memory, and internet sound searches saved in `cache/`.

**Español:** **Maestro hace un plan para las peticiones grandes y va paso a paso**: pide una canción entera o un cambio grande y Maestro primero te enseña un plan de 3 a 6 pasos para aprobarlo, cambiarlo o saltártelo, y luego lo hace todo seguido o paso a paso. Cada paso se aplica, se explica y se guarda en cuanto termina, con una barra de progreso arriba del chat. **Ya no se pierde trabajo por un timeout**: si un paso tarda demasiado, los pasos hechos siguen en tu canción y reintentas solo ese paso; una petición normal que da timeout se convierte en un plan con un clic. La IA ahora solo se corta si pasa 5 minutos sin mandar nada (`ai_timeout`), no mientras sigue respondiendo. **Cancela lo que has enviado al chat**: mientras Maestro piensa, Cancelar (en su mensaje, el botón cuadrado de enviar o Esc) corta la llamada a la IA al momento, no aplica nada y te devuelve el mensaje a la caja; si cancelas un paso de un plan, el plan se pausa. **Escucha a un baterista real en los cursos de géneros**: nueve cursos traen la interpretación de un baterista real en MIDI (Groove MIDI Dataset, Google Magenta, CC BY 4.0): merengue dominicano, reggaeton, bossa nova, songo cubano, swing, funk, disco, breakbeat y hip hop. Se descarga una vez (3 MB) y se convierte en pistas de Tidal que conservan la fuerza y el tiempo de cada golpe, con los instrumentos del curso; escúchalo o añádelo a tu canción. El curso de reggaeton ahora acentúa y empuja como el baterista real. **Maestro guarda en caché lo que carga y encuentra**: caché de prompts con Claude (API y suscripción) y proveedores compatibles con OpenAI, skills en memoria y búsquedas de sonidos en internet guardadas en `cache/`.

## 0.9.1

- **Tidal Studio route for Maestro**: when your composition plugin brings `mc-tidal-studio` (music-composition-skills 1.2.0+), a skills route written for this app, Maestro loads it with every message instead of the plugin's generic index, plus the genre skill that best fits your request. The Skills panel shows it as «Tidal Studio route».

**Español:** **Ruta de Tidal Studio para Maestro**: cuando tu plugin de composición trae `mc-tidal-studio` (music-composition-skills 1.2.0 o posterior), una ruta de skills escrita para esta app, Maestro la carga en cada mensaje en lugar del índice genérico del plugin, más la skill de género que mejor encaje con lo que pides. El panel de Skills la muestra como «Ruta Tidal Studio».

## 0.9.0

- **Instrument library with 600+ specific instruments** (harpsichord, pizzicato double bass, Steinway, sitar, celesta…), by category with real photos, pre-listen, on-demand downloads from freely licensed sound sets, and notes mapped to the real recordings.
- **Add your own instruments**: SoundFont (.sf2), SFZ in a zip, recordings with the note in the name, or a single sound.
- **Synth engines**: 15 new built-in synths, plus one-button install of sc3-plugins, Mi-UGens (Plaits, Braids, Rings) and VSTPlugin for Surge XT and Vital.
- **Wikimedia photos**: find a freely licensed photo for any instrument and pin it as a card in the studio's instrument row. Maestro also picks specific instruments from the library.
- **Latin courses follow your composition plugin**: merengue, salsa, cumbia, reggaeton and bossa nova follow its Latin style skills, show the skill's rule on each step, and are played by real instruments from the library, downloaded when the course starts.
- **Plugins update themselves**: at startup Tidal Studio checks GitHub for new versions of your plugins (like the music composition one) and installs them; turn it off to get an Update button instead.

**Español:** **Biblioteca con más de 600 instrumentos concretos** (clavecín, contrabajo en pizzicato, Steinway, sitar, celesta…), por categorías con fotos reales, escucha previa, descarga cuando la pides desde juegos de sonidos con licencia libre y notas tocadas con las grabaciones reales. **Añade tus instrumentos** (SoundFont, SFZ en un zip, grabaciones con la nota en el nombre o un solo sonido). **Motores de synth**: 15 synths nuevos incluidos e instalación con un botón de sc3-plugins, Mi-UGens y VSTPlugin para Surge XT y Vital. **Fotos de Wikimedia** para cualquier instrumento, que puedes fijar como tarjeta en la fila de instrumentos del estudio. Maestro también elige instrumentos concretos de la biblioteca. **Cursos latinos que siguen tu plugin de composición**: merengue, salsa, cumbia, reggaeton y bossa nova siguen sus skills de estilo latino, muestran la regla de la skill en cada paso y suenan con instrumentos reales de la biblioteca, que se descargan al empezar el curso. **Los plugins se actualizan solos**: al arrancar, Tidal Studio busca en GitHub versiones nuevas de tus plugins (como el de composición musical) y las instala; desactívalo para tener un botón Actualizar.

## 0.8.0

- **Long loops library**: drop loops, folders or a zip; tempo, bars, key and hits are detected, and you get code that fits your tempo, with variations.

**Español:** **Biblioteca de loops largos**: arrastra loops, carpetas o un zip; detecta el tempo, los compases, la tonalidad y los golpes, y te da código que encaja con tu tempo, con variaciones.

## 0.7.0

- **Import a song**: import a song (MIDI, or audio through optional Demucs/basic-pitch tools installed on first use) as the starting point for a new song, from New project → From a song or File → Import a song.

**Español:** **Importar una canción**: importa una canción (MIDI, o audio con las herramientas opcionales Demucs/basic-pitch, que se instalan la primera vez) como punto de partida de una canción nueva, desde Nuevo proyecto → Desde una canción o Archivo → Importar una canción.

## 0.6.0

- **Maestro fetches missing sounds by itself**: when a sound your song uses isn't installed, Maestro finds it in the free sample packs and downloads it to your library, ready to play.

**Español:** **Maestro descarga solo los sonidos que faltan**: si tu canción usa un sonido que no tienes, Maestro lo busca en los packs libres y lo descarga a tu biblioteca, listo para sonar.

## 0.5.0

- **Open and save Tidal files**: a File menu opens any `.tidal` / `.hs` file (each `d1…d12` or `p "name"` becomes a track; other code is kept intact as Extra code) and saves clean `.tidal` files that play in any Tidal editor, with recent files, an unsaved-changes indicator and `Ctrl/⌘+O / S / Shift+S`. Native dialogs on macOS (and a File menu in the Mac menu bar), Windows and Linux.

**Español:** **abrir y guardar archivos de Tidal**: menú Archivo que abre cualquier `.tidal` / `.hs` (cada `d1…d12` o `p "nombre"` es una pista; el resto se guarda intacto como Código extra) y guarda `.tidal` limpios que suenan en cualquier editor de Tidal, con archivos recientes, aviso de cambios sin guardar y `Ctrl/⌘+O / S / Shift+S`. Diálogos nativos en macOS (y menú Archivo en la barra de menús), Windows y Linux.

## 0.4.1

- **Each track shows its mix** (volume and EQ) in Tracks and Blocks, so you always see what is changing the sound.

**Español:** cada pista muestra su **mezcla** (volumen y ecualización) en Pistas y Bloques.

## 0.4.0

- **Pick by ear**: Maestro offers 3–4 options you can listen to over your song (live A/B) before keeping one.
- **Timeline tab**: see where each sound plays in time, calculated by Tidal and linked to its code.
- **Effects on/off**: bypass any effect without losing its value, and dismiss Maestro's ideas.
- **Cleaner errors**: a track's old errors clear on a clean play, with an × button and a "stale" marker.
- Fixes in the mixer.

**Español:** **elige de oído** entre 3–4 opciones que Maestro te deja escuchar sobre tu canción; pestaña **Línea de tiempo** (dónde suena cada sonido, calculado por Tidal y enlazado a su código); **activar/desactivar efectos** sin perder su valor y descartar ideas de Maestro; los errores viejos de una pista se limpian solos; y arreglos en la mezcla.

## Offline installer / Instalador offline

Everything is inside the installer: Tidal Studio, TidalCycles with its own Haskell (GHC), SuperCollider + SuperDirt + the Dirt-Samples sounds, and Python. **Nothing is downloaded while installing.**

| Your computer | File |
|---|---|
| Mac with Apple Silicon (M1–M5) | `TidalStudio-…-macOS-AppleSilicon.pkg` |
| Mac with Intel | `TidalStudio-…-macOS-Intel.pkg` (when present) |
| Windows 10/11 (64-bit) | `TidalStudio-…-Windows-x64-Setup.exe` |
| Ubuntu 22.04+ / Debian 12+ | `tidal-studio_…_amd64.deb` |

**macOS:** double-click the `.pkg`. The installer is not signed with an Apple Developer ID yet, so the first time macOS blocks it: open **System Settings → Privacy & Security**, scroll down and press **Open Anyway**, then run the `.pkg` again. After installing, open **Tidal Studio** from Applications.

**Windows:** run the `Setup.exe`. It is not signed yet, so SmartScreen may say "Windows protected your PC": press **More info → Run anyway**. Then open **Tidal Studio** from the Start menu.

**Linux:** `sudo apt install ./tidal-studio_*_amd64.deb` (it also installs SuperCollider from your distribution), then open **Tidal Studio** from your applications menu. With PipeWire, install `pipewire-jack` for sound.

---

**Español:** el instalador lo lleva todo dentro y no descarga nada. En Mac, haz doble clic en el `.pkg`. Como aún no está firmado por Apple, la primera vez macOS lo bloquea: ve a **Ajustes del Sistema → Privacidad y seguridad**, baja y pulsa **Abrir igualmente**, y vuelve a abrir el `.pkg`. Después abre **Tidal Studio** desde Aplicaciones. En **Windows**, ejecuta el `Setup.exe` (si SmartScreen lo frena: **Más información → Ejecutar de todas formas**) y abre Tidal Studio desde el menú Inicio. En **Linux**, `sudo apt install ./tidal-studio_*_amd64.deb` y ábrelo desde el menú de aplicaciones.
