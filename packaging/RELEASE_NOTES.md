## What's new in 0.2.0 / Novedades

**Tidal Studio is now a real Mac app.** It opens in its own window with its Dock icon and menu bar, starts SuperCollider, SuperDirt and Tidal in the background with **no Terminal window**, and stops everything when you quit (⌘Q or close the window). If something fails it shows you the log (also in `~/Library/Logs/Tidal Studio/studio.log`). **View → Open in Web Browser** opens the same studio in your browser.

**Español:** Tidal Studio ya es una app de Mac de verdad: se abre en su propia ventana, con su icono en el Dock, arranca SuperCollider, SuperDirt y Tidal en segundo plano **sin Terminal** y lo para todo al salir. Si algo falla, te enseña el registro.

> Projects you saved in «My projects» before this version live in the web browser where you made them. They are still there: **View → Open in Web Browser** opens the studio in that browser. / Los proyectos que guardaste antes en «Mis proyectos» siguen en tu navegador: ábrelo con **Visualización → Abrir en el navegador**.

## Offline installer / Instalador offline

Everything is inside the installer: Tidal Studio, TidalCycles with its own Haskell (GHC), SuperCollider + SuperDirt + the Dirt-Samples sounds, and Python. **Nothing is downloaded while installing.**

| Your computer | File |
|---|---|
| Mac with Apple Silicon (M1–M5) | `TidalStudio-…-macOS-AppleSilicon.pkg` |
| Mac with Intel | `TidalStudio-…-macOS-Intel.pkg` (when present) |

**macOS:** double-click the `.pkg`. The installer is not signed with an Apple Developer ID yet, so the first time macOS blocks it: open **System Settings → Privacy & Security**, scroll down and press **Open Anyway**, then run the `.pkg` again. After installing, open **Tidal Studio** from Applications.

---

**Español:** el instalador lo lleva todo dentro y no descarga nada. En Mac, haz doble clic en el `.pkg`. Como aún no está firmado por Apple, la primera vez macOS lo bloquea: ve a **Ajustes del Sistema → Privacidad y seguridad**, baja y pulsa **Abrir igualmente**, y vuelve a abrir el `.pkg`. Después abre **Tidal Studio** desde Aplicaciones.
