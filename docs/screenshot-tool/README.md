# Screenshot tool

Retakes the README and website screenshots from the current app (English in `docs/screenshots/`, Spanish in
`docs/screenshots/es/`), so the docs never fall behind the interface again.

It runs the real studio with a fake sound engine (`fake-ghci`, `fake-sclang`) and answers Maestro's AI calls with
fixed replies from inside the browser, so it needs no TidalCycles, SuperCollider or API key.

```bash
# 1. Start a studio from a copy of the repo (so the sample library and config stay untouched)
cp -r . /tmp/ts && cd /tmp/ts
echo '{"provider":"anthropic","anthropic":{"api_key":"sk-ant-demo"},"github":{"token":"demo","repo":"you/songs"}}' > config.json
TIDAL_GHCI=$PWD/docs/screenshot-tool/fake-ghci TIDAL_SCLANG=$PWD/docs/screenshot-tool/fake-sclang \
  python3 server/app.py --port 8765 --no-browser &

# 2. Take the shots (Node + Playwright with Chromium)
cd docs/screenshot-tool
OUT=../screenshots node scenes.js                  # all scenes, English
LANGS=es OUT=../screenshots node scenes.js         # Spanish
OUT=../screenshots node scenes.js studio mixer     # just some scenes
```

- `skill-route` needs the music-composition plugin v1.2.0+ (with `mc-tidal-studio`) in `my-plugins/` and
  `"plugins":{"preferred":["music-composition"]}` in `config.json`.
- `sample-trim` needs a sample called `my_kick` in the library (upload any short `.wav` first).
- `settings` (AI detection and Diagnostics) needs a second studio set to Claude with your subscription,
  started with a clean environment: `HOME` pointing to a folder with `.claude/settings.json` and `fake-claude` copied
  to `~/.local/bin/claude`, `provider: "claudecode"` in its `config.json`, then `BASE=http://127.0.0.1:<port> node scenes.js settings`.
- Paths of the temporary folders are replaced with `~` before each shot.
- `tabs.js` checks the tabs (open from disk, switch, close with unsaved changes, reload) and takes `tabs*.png`: put two `.tidal` files in `$SONGS`, then `OUT=../screenshots node tabs.js` (`L=es` for Spanish, then rename to `pestanas*.png`).
- `v0201.js` takes the «save options as styles» shots (`styles-*.png`, `es/estilos-*.png`): one studio at a time with an empty `TIDAL_STUDIO_DATA`, no LLM needed (the save is answered locally).
- `v024.js` takes the answer-length setting (`short-answers.png`, `es/respuestas-cortas.png`): Sound Lab → Learning, no LLM needed.
- `v014.js` takes the 0.14 shots (locks, blind A/B, Listening, RAG monitor): it needs an OpenAI-compatible test LLM that answers with fixed options for d1..d4 (`LANGS=es` for Spanish).
- `ghimport.js` takes `github-*.png` (remote path, Settings, importer, create new songs on GitHub): start `fake-github.py 8799`, set `github.api_url` to `http://127.0.0.1:8799` in `config.json`, save a song called `night-drive` and put a few `.tidal` files in `$SONGS` (`L=es` for Spanish).
- The Timeline, long loops, files, import, web samples and Maestro options screenshots were taken with their own
  scenes when those features shipped and are not in this script yet.
