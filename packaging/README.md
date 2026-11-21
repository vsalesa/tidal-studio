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
- `run-studio.sh` copies the program files to `~/Library/Application Support/Tidal Studio/app`, where your
  `config.json`, samples and recordings live. `Tidal Studio.command` (in `/Users/Shared/TidalStudio`) runs the same
  script in Terminal and opens your browser, for troubleshooting only.
- The `.pkg` marks its bundles as non-relocatable, so an existing SuperCollider.app on the Mac is never touched.

## GitHub Action

`.github/workflows/installers.yml` ("Offline installers"):

1. builds the `.pkg` (Apple Silicon always; Intel on tags or when asked),
2. moves the build folder away, **installs the `.pkg`** and runs `packaging/common/smoke_test.py`, which boots
   Tidal in GHCi and evaluates patterns, and loads SuperDirt in sclang, all from the installed copy,
3. opens the installed app with `--self-test` (it starts the studio, loads it in its window and quits) and checks
   that no process is left running,
4. keeps the installer as a workflow artifact, and publishes a GitHub Release when you push a `v*` tag or run the
   workflow by hand with **publish** ticked.

To release: bump `packaging/VERSION` on `main` (see below), or run the workflow by hand with **publish**,
or push a tag such as `v0.1.0`.

The GHC + Tidal build (~15 min) is cached between runs.

### Automatic releases

Every push to `main` that touches `packaging/` builds and tests the installer. If there is no Release yet for
`v<packaging/VERSION>`, it is published automatically. So **to publish a new version, bump `packaging/VERSION` on
`main`** (for example `0.1.0` → `0.2.0`). Pushes that keep the same version only build and test.
