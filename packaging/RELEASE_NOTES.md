## What's new in 0.3.0 / Novedades

- **Windows and Linux installers**, like the Mac one: everything inside, and the studio opens in its own window with no console. Closing the window stops SuperCollider and Tidal.
- **Maestro explains how it decided**: under each answer, the skill and rule behind every musical decision, and its reasoning live while it thinks.
- **Claude auto-detected**: Maestro finds the `claude` command, your subscription, model and endpoint by itself (you can still change them in Settings), plus a connection diagnostic.
- Mac: the native app from 0.2.0 (own window, no Terminal).

**Español:** instaladores para **Windows y Linux** (todo dentro, ventana propia, sin consola); Maestro enseña **cómo ha decidido** cada cosa (skill y regla) y su razonamiento en directo; **autodetección de Claude** (comando, suscripción, modelo y endpoint, que puedes cambiar en Ajustes); y en Mac la app nativa de la 0.2.0.

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
