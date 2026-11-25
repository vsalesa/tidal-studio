# Offline installers

The installers built here contain **everything** Tidal Studio needs, so installing downloads nothing:

| Part | Where it comes from (at build time) |
|---|---|
| Python 3.12 | [python-build-standalone](https://github.com/astral-sh/python-build-standalone) |
| SuperCollider | latest [SuperCollider release](https://github.com/supercollider/supercollider/releases) |
| SuperDirt, Vowel, Dirt-Samples | their Git repositories (SuperDirt pinned to a tag) |
| GHC + TidalCycles | GHC via ghcup, Tidal via `cabal install --lib` |
| Tidal Studio | this repository |

## macOS (.pkg)

`packaging/macos/build.sh` builds on a Mac (the GitHub Action does it for you):

- The engine is built directly in its final place, `/Users/Shared/TidalStudio`. GHC and Cabal write absolute paths
  into their package databases, so building where it will be installed means nothing has to be relocated.
  `/Users/Shared` is writable by every user, so the build needs no `sudo`.
- `/Applications/Tidal Studio.app` is a native app (`packaging/macos/app/main.swift`, compiled with `swiftc`, no
  Xcode project). It runs `bin/run-studio.sh` in the background (no Terminal, and without reading your shell
  profile), waits for the server and shows the studio in a WKWebView window. Quitting sends SIGINT to the server,
  which stops GHCi and sclang; the server runs in its own process group, so anything left (scsynth) is killed too,
  and if the app dies the server notices and shuts itself down. Log: `~/Library/Logs/Tidal Studio/studio.log`.
- `run-studio.sh` copies the program files to `~/Library/Application Support/Tidal Studio/app` and passes
  `TIDAL_STUDIO_USERDATA=~/Library/Application Support/Tidal Studio/data` to the server: your `config.json`, songs,
  memory, samples and recordings live there, next to the program copy and never inside it (since 0.25). `Tidal Studio.command` (in `/Users/Shared/TidalStudio`) runs the same
  script in Terminal and opens your browser, for troubleshooting only.
- The `.pkg` marks its bundles as non-relocatable, so an existing SuperCollider.app on the Mac is never touched.

## Windows (Setup.exe)

`packaging/windows/build.sh` (Git Bash on a Windows runner) builds the runtime in `C:\TidalStudio`: Python
(python-build-standalone), SuperCollider (official win64 zip), GHC (official MinGW bindist, which brings its own C
toolchain) + Tidal via cabal, SuperDirt + sounds. Inno Setup (`TidalStudio.iss`) packs it; the installer always installs
to `C:\TidalStudio` because GHC stores absolute paths. The shortcuts run `pythonw.exe bin\launcher.py`
(`packaging/common/launcher.py`): no console, server in the background, the studio in Microsoft Edge's app mode with
its own profile (so the window is its own process), and when that window closes the server is stopped through
`/api/shutdown`; a Windows job object kills anything left. User data: `%LOCALAPPDATA%\Tidal Studio\data` (program copy in `…\app`).

## Linux (.deb)

`packaging/linux/build.sh` builds the runtime in `/opt/tidal-studio` (Python, GHC + Tidal, SuperDirt + sounds) and
packs a `.deb`. SuperCollider comes from the distribution (`Depends: supercollider-language, supercollider-server`),
because it links against the system's Qt and audio. The menu entry runs the same launcher, which opens a GTK + WebKit
window (`tidal-studio-window.py`, run with the system Python and `python3-gi`), or Chromium in app mode, or a small
control window plus the browser. User data: `~/.local/share/tidal-studio/data` (program copy in `…/app`).

## Your data across updates (0.25)

`server/paths.py` decides where everything lives: `TIDAL_STUDIO_USERDATA` (set by the launchers) or `<program>/data`
when running from source. Folders are named by what they hold (`songs/`, `memory/`, `sounds/`, `knowledge/`,
`backups/`, …). On first start it moves what 0.24 and older kept inside the program copy, never overwriting.
`server/backup.py` makes a backup before an update is installed and the first time a new version starts (before any
database opens), keeps the last 5, and restores on the next start after backing up the current state.
`tests/test_user_data.py` simulates N → N+1 → N+2 with the real `launcher.sync_app()` and checks every file byte by byte.

## In-app updates

`server/appupdate.py` checks `releases/latest` of this repository at startup (after 20 s) and every 12 hours (Settings ›
Updates can turn that off), and picks the asset for the running install: `macOS-AppleSilicon.pkg` (or `-Intel.pkg`),
`Windows-x64-Setup.exe` or `_amd64.deb`. **So keep those file names.** The download goes to `~/.tidal-studio/updates`
and must match the asset's `size` and `digest` (SHA-256, published by GitHub). To install, the server writes a small
script there and starts it detached (its own session on Mac/Linux; on Windows outside the launcher's job object, which
therefore has `JOB_OBJECT_LIMIT_BREAKAWAY_OK`), then writes `TIDAL_STUDIO_QUIT_FILE`. The Mac app and the launcher
watch that file and quit; the script waits for their PID (`TIDAL_STUDIO_SHELL_PID`) to exit, then runs:

- Mac: `installer -pkg … -target /` through `osascript … with administrator privileges` (the usual password dialog),
  then `open -a "Tidal Studio"`; if cancelled, it opens the `.pkg` in Installer.
- Windows: `Setup.exe /SILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS` (Inno Setup asks for elevation), then
  the launcher again.
- Linux: `pkexec apt-get install -y <deb>`, then `tidal-studio`; without pkexec it opens the package with `xdg-open`.

The shells pass `TIDAL_STUDIO_RUNTIME` (install folder, whose `VERSION` is the installed version). Run from source,
the studio only links to the new release. Log: `~/.tidal-studio/updates/install.log`. For testing,
`TIDAL_STUDIO_UPDATE_FEED=<release.json>` replaces the GitHub API answer (see `docs/screenshot-tool/app-update.js`).

## GitHub Action

`.github/workflows/installers.yml` ("Offline installers"):

1. builds the `.pkg` (Apple Silicon always; Intel on tags or when asked), the Windows `Setup.exe` and the Linux `.deb`,
2. moves the build folder away, **installs the `.pkg`** and runs `packaging/common/smoke_test.py`, which boots
   Tidal in GHCi and evaluates patterns, and loads SuperDirt in sclang, all from the installed copy,
3. opens the installed app with `--self-test` (it starts the studio, loads it in its window and quits) and checks
   that no process is left running,
4. keeps the installer as a workflow artifact, and publishes a GitHub Release when you push a `v*` tag or run the
   workflow by hand with **publish** ticked.

To release: bump `packaging/VERSION` on `main` (see below), or run the workflow by hand with **publish**,
or push a tag such as `v0.1.0`.

The GHC + Tidal build (~15 min) is cached between runs, on macOS, Linux and Windows.

### Automatic releases

Every push to `main` that touches `packaging/` builds and tests the installer. If there is no Release yet for
`v<packaging/VERSION>`, it is published automatically. So **to publish a new version, bump `packaging/VERSION` on
`main`** (for example `0.1.0` → `0.2.0`). Pushes that keep the same version only build and test.

**Build once.** A branch (PR) build and a release build are the same build: same scripts, no debug info,
same ad-hoc signing, version taken from `packaging/VERSION`. So when you merge, the push to `main` first looks
for a green branch build of the same shipped files (same git tree, ignoring `docs/`, `tests/`, `tools/`,
`examples/` and `ROADMAP.md`) whose installers haven't expired (30 days). If it finds one, it skips the three
build jobs and publishes those exact installers, the ones that passed the smoke tests. If not (for example,
`main` moved on with other app changes, or you merged before the PR build went green), it builds as before.
Tip: wait for the PR build to go green before merging.
