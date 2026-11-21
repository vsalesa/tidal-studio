## What's new in 0.4.1 / Novedades

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
