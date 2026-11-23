## What's new in 0.9.0 / Novedades

- **Instrument library with 600+ specific instruments** (harpsichord, pizzicato double bass, Steinway, sitar, celesta…), by category with real photos, pre-listen, on-demand downloads from freely licensed sound sets, and notes mapped to the real recordings.
- **Add your own instruments**: SoundFont (.sf2), SFZ in a zip, recordings with the note in the name, or a single sound.
- **Synth engines**: 15 new built-in synths, plus one-button install of sc3-plugins, Mi-UGens (Plaits, Braids, Rings) and VSTPlugin for Surge XT and Vital.
- **Wikimedia photos**: find a freely licensed photo for any instrument and pin it as a card in the studio's instrument row. Maestro also picks specific instruments from the library.
- **Plugins update themselves**: at startup Tidal Studio checks GitHub for new versions of your plugins (like the music composition one) and installs them; turn it off to get an Update button instead.

**Español:** **Biblioteca con más de 600 instrumentos concretos** (clavecín, contrabajo en pizzicato, Steinway, sitar, celesta…), por categorías con fotos reales, escucha previa, descarga cuando la pides desde juegos de sonidos con licencia libre y notas tocadas con las grabaciones reales. **Añade tus instrumentos** (SoundFont, SFZ en un zip, grabaciones con la nota en el nombre o un solo sonido). **Motores de synth**: 15 synths nuevos incluidos e instalación con un botón de sc3-plugins, Mi-UGens y VSTPlugin para Surge XT y Vital. **Fotos de Wikimedia** para cualquier instrumento, que puedes fijar como tarjeta en la fila de instrumentos del estudio. Maestro también elige instrumentos concretos de la biblioteca. **Los plugins se actualizan solos**: al arrancar, Tidal Studio busca en GitHub versiones nuevas de tus plugins (como el de composición musical) y las instala; desactívalo para tener un botón Actualizar.

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
