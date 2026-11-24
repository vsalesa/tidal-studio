## What's new in 0.12.1 / Novedades

- **Fix: save songs to an empty GitHub repository**: a repository you just created on GitHub with no files (no README) gave «GitHub 409: the repository is empty» when saving. Now the first save adds a small README as the first commit and saves your song on top. The configured branch is created if it doesn't exist, and the repository field also accepts a pasted GitHub URL (`https://github.com/user/repo`, `.git`).

**Español:** **Arreglo: guardar canciones en un repositorio de GitHub vacío**: un repositorio recién creado en GitHub sin ficheros (sin README) daba «GitHub 409: el repositorio está vacío» al guardar. Ahora el primer guardado añade un README pequeño como primer commit y guarda tu canción encima. Si la rama configurada no existe, se crea, y el campo del repositorio también acepta la URL de GitHub pegada (`https://github.com/usuario/repo`, `.git`).

## 0.12.0

- **Play your MIDI keyboard**: plug in your USB piano and press **MIDI keyboard**. It sounds right away with the instrument you pick (SuperCollider listens to it, so it works in the Mac app too), the keys light up on screen, and what you play **turns into Tidal tracks**, one per hand, snapped to a grid, with the key and chords. Record with a count-in and metronome or in time with your song from its next bar; the code is written live while you play; or turn your last phrase into code without having pressed Record. Then add it to your song, ask Maestro to explain it and continue it, generate it in a style, or download the .mid. No keyboard? Use the on-screen keys or your computer keys.

**Español:** **Toca tu teclado MIDI**: enchufa tu piano USB y pulsa **Teclado MIDI**. Suena al momento con el instrumento que elijas (lo escucha SuperCollider, así que funciona también en la app de Mac), las teclas se iluminan en pantalla y lo que tocas **se convierte en pistas de Tidal**, una por mano, cuadradas a una rejilla, con la tonalidad y los acordes. Graba con cuenta atrás y metrónomo o a compás con tu canción desde su siguiente compás; el código se escribe mientras tocas; o convierte tu última frase sin haber pulsado Grabar. Luego añádela a tu canción, pide a Maestro que te la explique y la continúe, genérala en un estilo o descarga el .mid. ¿Sin teclado? Usa las teclas de la pantalla o las del ordenador.

## 0.11.0

- **Tidal Studio updates itself**: at startup and every 12 hours it checks GitHub for a new version and shows a card with what's new. **Update now** downloads the installer for your computer with a progress bar and verifies it (SHA-256); **Install and restart** closes the app, installs the new version (your Mac asks for your password, Windows for permission) and opens it again. Your songs, samples, plugins and settings are left alone.
- **Check by hand or turn it off** in Settings › Updates, and **Skip this version** if you'd rather wait. On the Mac also from **Tidal Studio › Check for Updates…**. This is the last version you install by hand.

**Español:** **Tidal Studio se actualiza solo**: al arrancar y cada 12 horas mira en GitHub si hay versión nueva y te enseña una tarjeta con las novedades. **Actualizar ahora** descarga el instalador de tu ordenador con barra de progreso y lo comprueba (SHA-256); **Instalar y reiniciar** cierra la app, instala la versión nueva (el Mac te pide tu contraseña y Windows, permiso) y la vuelve a abrir. Tus canciones, samples, plugins y ajustes no se tocan. **Búscalas a mano o desactívalo** en Ajustes › Actualizaciones, y **Salta una versión** si prefieres esperar. En el Mac también desde **Tidal Studio › Buscar actualizaciones…**. Es la última versión que instalas a mano.

## 0.10.0

- **Generate from your MIDI, in any style**: upload a MIDI of yours, pick one of 11 styles (merengue, salsa, cumbia, reggaeton, bossa nova, jazz, funk, house, techno, drum & bass, lo-fi) and what to keep (melody, chords, bass, drums, tempo); the studio writes the rest in that style over your chords, offline and without AI: course drums, bass and accompaniment with rhythms measured in real songs, and a new call-and-response melody if you don't keep yours. Each track says where it comes from; try another version, change style, then ask Maestro to turn it into a whole song. Also from the genre courses (Make my MIDI Merengue) and from song import.
- **Maestro makes a plan for big requests and goes step by step**: ask for a whole song or a big change and Maestro first shows a plan of 3 to 6 steps to approve, edit or skip, then does it all in a row or step by step. Each step is applied, explained and saved as soon as it's done, with a progress bar at the top of the chat.
- **No more lost work on timeouts**: if a step takes too long, the finished steps stay in your song and you retry only that step; a normal request that times out can be turned into a plan with one click. The AI is now only cut off when it stops sending anything for 5 minutes (`ai_timeout`), not while it's still answering.
- **Cancel what you sent to the chat**: while Maestro is thinking, Cancel (in its message, the square send button or Esc) stops the AI call at once, applies nothing and puts your message back in the box; cancelling a plan step pauses the plan.
- **Better audio import**: audio import separates instruments with MSST (ZFTurbo's SCNet XL model, downloaded on first use) plus Demucs for the bass; choose Quality (MSST) or Fast (Demucs) per song; existing audio tools are offered an update.
- **Maestro caches what it loads and finds**: prompt caching with Claude (API and subscription) and OpenAI-compatible providers, skills kept in memory, and internet sound searches saved in `cache/`.
- **Hear a real drummer in the genre courses**: nine courses bring a real drummer's performance in MIDI (Groove MIDI Dataset, Google Magenta, CC BY 4.0): Dominican merengue, reggaeton, bossa nova, Cuban songo, swing, funk, disco, breakbeat and hip hop. It downloads once (3 MB) and becomes Tidal tracks that keep the strength and timing of every hit, played with the course's instruments; listen to it or add it to your song. The reggaeton course now accents and pushes like the real drummer.
- **Styles learned from real songs**: 31 Latin songs in MIDI were measured (bass, piano, horns, percussion and chords, as statistics only) and Maestro now gets that profile for merengue, salsa, cumbia, bossa nova and reggaeton. The merengue course's bass, piano and tambora were rewritten from it. Each course can also load your own example MIDI, and `tools/learn_style.py` learns a genre from your MIDI folder.
- **Several songs open at once, in tabs**: each song opens in its own tab (new project, open file, GitHub, My projects, imports and generated songs); switch with a click or Alt+1…9 (⌘⇧[ ] in the Mac app), close with × and it asks only if there are unsaved changes. The File menu opens `.tidal` files from your disk and from GitHub side by side. Only the front tab plays.
- **Maestro sees what you just downloaded**: new samples, instruments, loops and synth engines are read from disk with every message (newest first, marked NEW for 2 hours), so Maestro no longer says a sound you just got isn't there; sounds loaded while SuperDirt was still starting are no longer lost.
- **Faster, more reliable releases**: installers are built once per release, and the Linux/Windows build cache is fixed.

**Español:** **Genera desde tu MIDI, en cualquier estilo**: sube un MIDI tuyo, elige uno de 11 estilos (merengue, salsa, cumbia, reggaeton, bossa nova, jazz, funk, house, techno, drum & bass, lo-fi) y qué te quedas (melodía, acordes, bajo, batería, tempo); el estudio escribe el resto en ese estilo sobre tus acordes, sin conexión y sin IA: batería del curso, bajo y acompañamiento con ritmos medidos en canciones reales, y una melodía nueva de pregunta y respuesta si no te quedas la tuya. Cada pista dice de dónde sale; prueba otra versión, cambia de estilo y luego pide a Maestro que la convierta en una canción entera. También desde los cursos (Hacer mi MIDI Merengue) y al importar una canción. **Maestro hace un plan para las peticiones grandes y va paso a paso**: pide una canción entera o un cambio grande y Maestro primero te enseña un plan de 3 a 6 pasos para aprobarlo, cambiarlo o saltártelo, y luego lo hace todo seguido o paso a paso. Cada paso se aplica, se explica y se guarda en cuanto termina, con una barra de progreso arriba del chat. **Ya no se pierde trabajo por un timeout**: si un paso tarda demasiado, los pasos hechos siguen en tu canción y reintentas solo ese paso; una petición normal que da timeout se convierte en un plan con un clic. La IA ahora solo se corta si pasa 5 minutos sin mandar nada (`ai_timeout`), no mientras sigue respondiendo. **Cancela lo que has enviado al chat**: mientras Maestro piensa, Cancelar (en su mensaje, el botón cuadrado de enviar o Esc) corta la llamada a la IA al momento, no aplica nada y te devuelve el mensaje a la caja; si cancelas un paso de un plan, el plan se pausa. **Escucha a un baterista real en los cursos de géneros**: nueve cursos traen la interpretación de un baterista real en MIDI (Groove MIDI Dataset, Google Magenta, CC BY 4.0): merengue dominicano, reggaeton, bossa nova, songo cubano, swing, funk, disco, breakbeat y hip hop. Se descarga una vez (3 MB) y se convierte en pistas de Tidal que conservan la fuerza y el tiempo de cada golpe, con los instrumentos del curso; escúchalo o añádelo a tu canción. El curso de reggaeton ahora acentúa y empuja como el baterista real. **Estilos aprendidos de canciones reales**: se han medido 31 canciones latinas en MIDI (bajo, piano, metales, percusión y acordes, solo como estadística) y Maestro recibe ese perfil para merengue, salsa, cumbia, bossa nova y reggaeton; el bajo, el piano y la tambora del curso de merengue se han reescrito con él. Cada curso puede cargar además tu propio MIDI de ejemplo, y `tools/learn_style.py` aprende un género de tu carpeta de MIDI. **Mejor importación de audio**: la importación de audio separa los instrumentos con MSST (modelo SCNet XL de ZFTurbo, se descarga la primera vez) y el bajo con Demucs; eliges Calidad (MSST) o Rápido (Demucs) en cada canción; si ya tenías las herramientas de audio, te ofrece actualizarlas. **Maestro guarda en caché lo que carga y encuentra**: caché de prompts con Claude (API y suscripción) y proveedores compatibles con OpenAI, skills en memoria y búsquedas de sonidos en internet guardadas en `cache/`. **Varias canciones abiertas a la vez, en pestañas**: cada canción se abre en su pestaña (proyecto nuevo, abrir archivo, GitHub, Mis proyectos, importadas y generadas); cambia con un clic o Alt+1…9 (⌘⇧[ ] en la app de Mac), cierra con × y solo pregunta si hay cambios sin guardar. El menú Archivo abre `.tidal` de tu disco y de GitHub, uno al lado del otro. Solo suena la pestaña de delante. **Maestro ve lo que acabas de descargar**: los samples, instrumentos, loops y motores de synth nuevos se leen del disco en cada mensaje (los más nuevos primero, marcados NUEVO durante 2 horas), así Maestro ya no dice que no tienes un sonido que acabas de bajar; y los sonidos cargados mientras SuperDirt aún arrancaba ya no se pierden. **Versiones más rápidas y fiables**: los instaladores se construyen una sola vez por versión y se arregla la caché de compilación de Linux y Windows.

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
