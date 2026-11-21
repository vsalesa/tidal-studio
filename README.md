# Tidal Studio · learn music with your teacher

**English** · [Español](README.es.md) · [Website](https://vsalesa.github.io/tidal-studio/) · [Roadmap](ROADMAP.md)

A platform to **learn music and [TidalCycles](https://tidalcycles.org) at the same time**, building your own song live
with an AI teacher ("Maestro") who supports you at every step, even if you know nothing about music or programming.

**Website: [vsalesa.github.io/tidal-studio](https://vsalesa.github.io/tidal-studio/)** (overview, screenshots and install steps).

![Tidal Studio](docs/screenshots/studio.png)

**Contents:** [Start a song](#start-a-song) · [Genre courses](#genre-courses) · [Maestro, your teacher](#maestro-your-teacher) ·
[Help with your code](#help-with-your-code-and-code-palette) · [Blocks and live highlighting](#blocks-view-and-live-highlighting) ·
[Controls in the chat](#controls-and-cards-in-the-chat) · [Mix](#mix-tab) · [Arrangement](#arrangement) ·
[Undo and a tidy chat](#undo-history-and-a-tidy-chat) · [Instruments](#instruments) · [Sample library](#sample-library) ·
[Skills and plugins](#skills-and-plugins) · [How Maestro decides](#how-maestro-decides-and-its-reasoning) ·
[AI detection and Diagnostics](#connect-your-ai-with-automatic-detection-and-diagnostics) · [Native app](#a-real-app-on-your-computer) · [Tutorial](#interactive-tutorial) · [Save and share](#save-export-and-share) ·
[Installation](#installation-once)

## What you can do

### Start a song

**New project: blank, with a wizard or with a brainstorm.** Your current project is saved automatically in My projects.

![New project](docs/screenshots/new-project.png)

The **wizard** lets you pick style, tempo, beat, bass, chords, melody, texture, effects and structure by clicking options
(the ones recommended for your style are marked «fits») and you hear it live while you choose. It ends with a summary
where every line of code is explained.

| 1. Style | 2. Tempo |
|---|---|
| ![Choose style](docs/screenshots/wizard-1-style.png) | ![Choose tempo](docs/screenshots/wizard-2-tempo.png) |
| **3. Beat (up to 3 layers)** | **4. Bass, chords, melody and texture** |
| ![Choose beat](docs/screenshots/wizard-3-beat.png) | ![Choose chords](docs/screenshots/wizard-4-chords.png) |
| **5. Effects** | **6. Structure over time** |
| ![Choose effects](docs/screenshots/wizard-5-effects.png) | ![Choose structure](docs/screenshots/wizard-6-structure.png) |
| **7. Summary with all the code explained** | |
| ![Summary](docs/screenshots/wizard-7-summary.png) | |

The **brainstorm** asks open questions (what do you want to feel? what place do you imagine? how does the energy
change?…) with clickable examples, and ends in a **plan for your song**: style, tempo, sections and concrete changes to try.

| Questions with examples | Your song plan |
|---|---|
| ![Brainstorm question](docs/screenshots/brainstorm-question.png) | ![Song plan](docs/screenshots/brainstorm-plan.png) |

### Genre courses

**Build a song from scratch.** Eleven courses (merengue, salsa, cumbia, reggaeton, bossa nova, jazz, funk, house, techno,
drum & bass, lo-fi), each one a full production class: the signature rhythm (güira and tambora, clave and tumbao, dembow,
two-step…), then bass, harmony, melody, arrangement and mix. Every step adds tracks that already sound good, Maestro
explains the musical *why* and the code piece by piece, and gives you a challenge. See [docs/COURSES.md](docs/COURSES.md)
for the full list and sources.

| Pick a genre | Each step: why it sounds like that, the code, and Maestro explaining |
|---|---|
| ![Genre courses](docs/screenshots/courses.png) | ![Course step](docs/screenshots/course-step.png) |
| **Arrangement step: intro, band, mambo** | **Mix step and course complete** |
| ![Course arrangement](docs/screenshots/course-arrangement.png) | ![Course complete](docs/screenshots/course-complete.png) |

### Maestro, your teacher

- **Maestro guides you** step by step: style, beat, tempo, bass, chords, melody, effects, and when each thing changes.
- **It explains the code**: an «Explain» button on every track and «Explain all the code». Every change comes with a
  piece-by-piece explanation and, sometimes, a small **challenge** so you edit it yourself.
- **It suggests ideas like a producer**: «I'd add claps on 2 and 4… try it and see what you think». Each idea teaches a
  musical concept (backbeat, contrast, call and response, major and minor…). Press **Try**, listen and decide:
  **Keep it** or **Undo**.
- **Pre-listen**: a «Listen» button on every idea and recipe plays it for a few bars and then returns to your version.
- **Style recipes**: «Want it to sound like jazz?» (also Latin, techno, lo-fi, ambient). It transforms your song and
  shows you **how it did it**: the code before and after, with what's new highlighted and explained.

![Jazz recipe: before and after, explained](docs/screenshots/recipe-jazz.png)

### Help with your code and code palette

**Help**: edited a track and it errors or doesn't sound how you wanted? Press **Help** (it also opens by itself when Tidal
returns an error). Pick what you wanted (no sound, louder, slower, darker…) or describe it, and Maestro finds the problem
(missing `$`, unclosed quotes or brackets, misspelled sounds or effects, things that make it silent), proposes the fix with
before/after, lets you **Listen** before applying, and can go **back to the version that worked**.

**Code palette**: 39 Tidal blocks organized by what you want to do (rhythm, sound, notes and harmony, effects, time and
structure, chance) and by level (first steps, intermediate, advanced). Click one to apply it to the selected track;
Maestro shows and explains the change, and you can undo it.

| Help: Maestro finds the problem and proposes the fix | Code palette by goal and level |
|---|---|
| ![Code help](docs/screenshots/code-help.png) | ![Code palette](docs/screenshots/code-palette.png) |

### Blocks view and live highlighting

**Blocks view**: your song as nested visual blocks. Each track shows what transforms it (before the `$`), what it plays
(every step of the cycle as a box, with groups `[ ]`, alternations `< >`, rests `~` and repeats `*`) and its settings
(`#`). Click any block and a **tooltip** tells you what it does and lets you **edit it right there**: change a step (rest,
×2, split, sometimes, add, delete), the mini-notation, a setting's value with a slider, the numbers of a transformation
(`every 4 (fast 2)`), add settings or transformations, or change the tempo. It plays as you edit.

| Your song as nested blocks | Click a block: tooltip to edit it |
|---|---|
| ![Blocks view](docs/screenshots/blocks.png) | ![Editing a block](docs/screenshots/blocks-edit.png) |

**See what is sounding**: while the music plays, the part of each track's code that is sounding right now lights up, step
by step, in the Tracks, Blocks and Code views (like Strudel). SuperDirt tells the app every note it plays.

| In the Tracks view | In the Blocks view |
|---|---|
| ![Live highlighting in Tracks](docs/screenshots/live-highlight-tracks.png) | ![Live highlighting in Blocks](docs/screenshots/live-highlight-blocks.png) |
| **In the Code tab** | |
| ![Live highlighting in Code](docs/screenshots/live-highlight-code.png) | |

### Controls and cards in the chat

**Controls in the chat (agentic UI)**: Maestro puts sliders, a tempo control, a sound selector and a step sequencer right
inside its messages. Moving them writes the Tidal code live, so you see which word changes. Use the sliders button on any
track, the «Tweak with controls» chip, or just ask for controls. There are more: `every` (do something every N cycles),
chance (`degradeBy`, `sometimesBy`), swing, Euclidean rhythms (`bd(3,8)`), a moving filter
(`# lpf (range … $ slow n sine)`), scale and octave, chords, and a **mix desk** with volume, pan and mute for every track
at once. Each one shows the code it writes.

**Configurator card**: ask Maestro for «a card for the bass» (or press the card button on a track, a block or a mixer
strip) and you get a card in the chat with **every value** of that element: what plays, transformations and their numbers,
each `#` setting, plus the track's volume and EQ. The «song card» has tempo, master and every track's volume. Cards always
act on the **current** version of the song and refresh themselves when you change things elsewhere.

| Controls in the chat | Configurator card for the bass |
|---|---|
| ![Chat controls](docs/screenshots/chat-controls.png) | ![Configurator card](docs/screenshots/configurator-card.png) |

### Mix tab

A mixing desk with a volume fader (dB) and a 3-band **equalizer** (lows 200 Hz, mids 1 kHz, highs 4 kHz) for every track,
mute and solo, and a **Master** strip for the whole song. It doesn't touch your track code: when playing it adds `# amp`
and `# eqlow / eqmid / eqhigh` (shown as a `-- mix` line in the Code tab).

![Mixer](docs/screenshots/mixer.png)

### Arrangement

The Arrangement tab shows every track across 8, 16 or 32 bars. Paint which bars each track plays (it writes
`mask "<…>"`) or start from a preset: build up in layers, drop, break, call and response.

![Arrangement](docs/screenshots/arrangement.png)

### Undo, history and a tidy chat

**Undo, redo and history (rollback)**: every change to the song is saved. Undo/redo buttons (Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z) and a **History** list to go back to any earlier version.

![Song history](docs/screenshots/history.png)

**A tidy chat**: the «Clear chat» button (top right of Maestro's panel) empties the conversation without touching your
song, and a «Bring the chat back» chip restores it. «Hide» folds Maestro's ideas away to give the chat more room (the
browser remembers your choice; «Show» brings them back).

| «Hide» Maestro's ideas for a bigger chat | «Clear chat»: the song stays, the chat can come back |
|---|---|
| ![Hide ideas](docs/screenshots/hide-ideas.png) | ![Clear chat](docs/screenshots/clear-chat.png) |

### Instruments

**Real instrument photos** (openly licensed, from Wikimedia Commons, see [CREDITS.md](CREDITS.md)): a drum kit where you
press each piece (bd, sn, hh, ho, toms, crash, rimshot) to hear it and learn its Tidal name, then choose its steps and add
it; piano, bass, guitar, sax, trumpet, marimba and kalimba with an on-screen keyboard that writes your melody as code.
Every component in the catalog also has its own icon.

| Drum kit: press a piece, learn its name | Instruments with a keyboard |
|---|---|
| ![Drum kit](docs/screenshots/instruments-drums.png) | ![Sax](docs/screenshots/instruments-sax.png) |

### Sample library

Sounds by type (kicks, snares, hats, percussion, breaks, basses, melodic, pads, voices, FX, synths). Listen to them, use
one on a new track, or put it on the selected track keeping the same rhythm. Upload your own files (WAV, AIFF, FLAC, OGG)
or **search Freesound** (free API key) filtering by license; downloads are ready for Tidal and credits for CC BY sounds are
written to `samples/CREDITS.md`. The **Packs** tab browses community packs on GitHub (about 70 drum machines, Uzu drumkit,
VCSL, a grand piano, SP-12, mridangam, or any `github:user/repo` with a `strudel.json`): listen, install one sound or a
whole drum machine. **Installed packs and Freesound sounds load into SuperDirt right away**, without restarting the
engine. In your own samples you see the **waveform**, drag to choose a piece, listen to it and use it
(`# begin … # end …`). Maestro knows your library and can use it.

| Built-in sounds by type | Online packs: whole drum machines |
|---|---|
| ![Sample library](docs/screenshots/sample-library.png) | ![Online packs](docs/screenshots/online-packs.png) |
| **Search Freesound by license** | **Waveform and trimming** |
| ![Search online](docs/screenshots/samples-online.png) | ![Trim](docs/screenshots/sample-trim.png) |

### Skills and plugins

Maestro loads music **skills** (`SKILL.md`, the same format as Claude's Agent Skills) and shows under each answer which
ones it loaded and used. Install more skills, or whole **Claude Code plugins and marketplaces**, by pasting a GitHub link
in the Skills panel: their skills join Maestro's and their commands work in the chat as `/name`. Details in
[Skills](#skills) and [Plugins](#plugins) below.

| Under every answer: which skills were loaded and used | The Skills panel: turn on, always load, view, install |
|---|---|
| ![Skills in the chat](docs/screenshots/skills-in-chat.png) | ![Skills panel](docs/screenshots/skills-panel.png) |
| **Plugins: a whole Claude Code plugin from a GitHub link** | |
| ![Plugins panel](docs/screenshots/plugins-panel.png) | |

### How Maestro decides, and its reasoning

Every answer that relied on a skill opens with **How I decided**: one row per musical decision (style, rhythm,
tempo, bass, harmony, melody, instruments, effects, mix, structure) with the skill it consulted, the rule or advice
it took from it, and what it did with it (track, value, code). Only skills whose content was actually loaded for that
message can appear there, so a rule can't be made up from a skill's name. Click a skill to open it.

While **Maestro is thinking…**, a faint grey **Thinking** line shows what it is doing, like a typical coding harness:
reading your song, which skills it picked and why, who it is asking, and Claude's own reasoning as it streams.
Click it to unfold; after the answer it stays under the message as **Reasoning**. With an Anthropic API key it uses
adaptive thinking with summarized display; with your Claude subscription it reads the `claude` CLI's `stream-json`
output; OpenAI-compatible models show `reasoning_content` when they return it. Providers that don't share their
reasoning show only the steps.

| How I decided | Reasoning |
|---|---|
| ![How I decided](docs/screenshots/skills-decisions.png) | ![Reasoning](docs/screenshots/reasoning.png) |

### Connect your AI, with automatic detection and Diagnostics

Choose an OpenAI-compatible endpoint, an Anthropic API key or **Claude with your subscription** in **Settings**. With your
subscription, the studio finds the `claude` command your terminal uses and shows what it detected: path, version, whether
you are signed in, default model, endpoint and API key. **Automatic** picks the right connection for you (your plan if you
are signed in, otherwise the same setup as your terminal). If Maestro doesn't answer, press **Diagnostics**: it checks
your terminal environment, the `claude` command, sign-in, connection mode, model and a live test step by step, tells you
how to fix what fails, and **Test models** tries each model so you can **Use** one that works. **Copy report** gives you
a text summary with keys masked. Details in [Setting up the AI](#setting-up-the-ai).

| Detected on this computer | Diagnostics and Test models |
|---|---|
| ![Claude detection](docs/screenshots/claude-detect.png) | ![Diagnostics](docs/screenshots/diagnostics.png) |

### A real app on your computer

Tidal Studio installs as a **native app** with everything inside (TidalCycles, SuperCollider, the sounds, Python): it
opens in its own window with no Terminal, starts the sound engine in the background and stops it when you close it.
Download the installer for your system from the
[latest release](https://github.com/vsalesa/tidal-studio/releases/latest); steps in [Installation](#installation-once).

### Interactive tutorial

The first time you open the studio, Maestro walks you through everything in 22 short steps (play the drums, add tracks,
effects, chat controls, ideas, recipes, blocks, arrangement, code, library…). Each step waits for you to do it, and you
can repeat it from the cap button.

![Tutorial](docs/screenshots/tutorial.png)

### Save, export and share

- **GitHub**: save each version of your song as a commit in a repository of yours (`song.tidal`, `song.json`,
  `README.md`), browse the history and open any old version from My projects → GitHub.
- **Export**: download the song as a `.tidal` file, copy a **share link** (the whole song in the URL; opening it loads it
  as a new project), or **record** what you hear to a WAV file in `recordings/` with the record button.
- **My projects**: your songs are saved automatically; open or delete them from the folder button.

![GitHub: every save is a version](docs/screenshots/github-versions.png)

### And also

- **Your progress**: the code and music concepts you have already used.
- **Components to add** and **code always visible and editable**.
- **English and Spanish**: switch with the EN/ES button in the top bar. Maestro answers in the chosen language.
- **Any AI**: an OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Ollama, LM Studio…)
  or Claude (Anthropic). It also works without AI: button-guided flow, explanations and local ideas.
- **macOS, Windows and Linux**: the installer detects your system.

## Installation (once)

### Easiest: the all-in-one Mac installer

Download `TidalStudio-…-macOS-AppleSilicon.pkg` from the
[latest release](https://github.com/vsalesa/tidal-studio/releases/latest) and double-click it. It contains
everything (TidalCycles with its own Haskell, SuperCollider, SuperDirt and its sounds, Python) and **downloads nothing**
while installing. Then open **Tidal Studio** from Applications.

Tidal Studio is a real Mac app: it opens in its own window (with its Dock icon and menu bar), starts SuperCollider,
SuperDirt and Tidal in the background with **no Terminal window**, and stops all of them when you quit (⌘Q or close
the window). If something goes wrong it shows the log, which is also in `~/Library/Logs/Tidal Studio/studio.log`.
**View → Open in Web Browser** opens the same studio in your browser.

It is not signed with an Apple Developer ID yet, so the first time macOS blocks it: open
**System Settings → Privacy & Security**, press **Open Anyway** and run the `.pkg` again.
It installs the engine in `/Users/Shared/TidalStudio` (about 3 GB) and leaves any SuperCollider, Haskell or Python you
already have untouched. How it is built: [packaging/README.md](packaging/README.md).

### Windows: the all-in-one installer

Download `TidalStudio-…-Windows-x64-Setup.exe` from the
[latest release](https://github.com/vsalesa/tidal-studio/releases/latest) and run it. It also has everything inside and
installs to `C:\TidalStudio`. Open **Tidal Studio** from the Start menu or the desktop: the studio opens in its own
window (Microsoft Edge in app mode, with no tabs or address bar) and **no console**, and closing that window stops
SuperCollider and Tidal. It is not signed yet, so SmartScreen may say "Windows protected your PC": press
**More info → Run anyway**. Log: `%LOCALAPPDATA%\Tidal Studio\logs\studio.log`.

### Linux (Ubuntu 22.04+, Debian 12+): the .deb package

Download `tidal-studio_…_amd64.deb` from the [latest release](https://github.com/vsalesa/tidal-studio/releases/latest)
and install it with `sudo apt install ./tidal-studio_*_amd64.deb` (apt also installs SuperCollider from your
distribution). Open **Tidal Studio** from your applications menu: it opens in its own GTK window, and closing it stops
everything. With PipeWire, install `pipewire-jack` so SuperCollider can play sound. Log:
`~/.local/share/tidal-studio/logs/studio.log`.

### From the source folder (Windows, Linux, or Mac)

Download or clone this folder and:

| System | What to do |
|---|---|
| **Windows 10/11** | Double-click `install.bat` |
| **macOS** | Open Terminal in the folder and run `./install.sh` |
| **Linux** (Debian/Ubuntu, Fedora, Arch, openSUSE) | `./install.sh` |

The installer speaks English or Spanish depending on your system language (force it with `./install.sh --lang en` or
`install.ps1 -Lang es`). It adds, if missing: Python 3, Git, SuperCollider, SuperDirt (sounds), Haskell (via ghcup) and TidalCycles.
It takes 15–40 minutes the first time (~1 GB download). You can run it again safely: it skips what's already there.

## Usage

| System | Open the studio |
|---|---|
| Windows | Double-click `start.bat` |
| macOS / Linux | `./start.sh` |

Your browser opens at <http://localhost:8765>. Then:

1. Press **New project** and choose blank, wizard or brainstorm.
2. Optionally open **Settings** (gear icon) and connect your AI; without it, the button guide still works.
3. Talk to **Maestro** on the right, try its ideas, or add components from the left.
4. See and edit the code in the **Code** tab (`Ctrl+Enter` applies it).
5. **Hush** stops everything instantly.

### Setting up the AI

| Service | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local, free) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local, free) | `http://localhost:1234/v1` | whichever you have loaded |
| Claude (Anthropic API key) | — | `claude-opus-5-5` |
| **Claude with your subscription** (Claude Code, Pro/Max) | — | your plan's default |

**No API key? Use your Claude subscription:** install [Claude Code](https://claude.com/claude-code), run `claude` once in a
terminal and sign in with your Pro or Max plan, then choose «Claude with your subscription» in Settings. Maestro talks to
Claude through the `claude` command on your computer. It counts towards your plan's usage limits and answers a bit
slower than the API (about 10–20 s).

Keys are stored only in `config.json`, on your computer (it is not committed to git). You can also use the
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variables.

If it doesn't connect, open **Settings → Diagnostics** ([what it checks](#connect-your-ai-with-automatic-detection-and-diagnostics)).

### Skills

Maestro can load **skills** (folders with a `SKILL.md`, the same format as Claude's Agent Skills). Three open-license
music skills come included (Tidal live coding, Strudel recipes and general music composition); open the skills button in the top bar to turn them on or off, mark one «Always load», read it,
or install another one by pasting its GitHub link. Under each of Maestro's answers you see which skills were loaded for
that message and which it actually used. Details and sources: [skills/README.md](skills/README.md).


### Plugins

The same box also installs **Claude Code plugins** (a repo with `.claude-plugin/plugin.json`) and **marketplaces**
(`.claude-plugin/marketplace.json`, which lists several plugins: you pick which ones). Paste the repository link, for
example `https://github.com/jtydhr88/music-composition-skills`. Tidal Studio downloads it with `git` (or GitHub's
`.tar.gz` if you don't have git), copies **only text files** into `my-plugins/<plugin>/` on your computer (never into
this repository) and then:

- its **skills** are used by Maestro like any other (they appear grouped under the plugin in the panel);
- its **commands** (`commands/*.md`) can be typed in Maestro's chat: `/name` or `/plugin:name`, with arguments;
- agents, hooks, MCP and LSP servers are for Claude Code: they are listed but not used.

Each plugin can be turned off (its skills and commands disappear) or removed. Check its license and any `NOTICE` before
sharing its content.

**Included by default: music composition.** The first time Tidal Studio starts with internet, it downloads
[vsalesa/music-composition-skills](https://github.com/vsalesa/music-composition-skills) (the English translation of
jtydhr88's 30-skill composition plugin, MIT) into `my-plugins/`. It is marked **Always use**: Maestro loads its main
`music-composition` skill with every message and always gives one slot to its best-matching skill (harmony, jazz,
groove, form…). It is downloaded instead of shipped in the installer because its reference files quote copyrighted
books (see its `NOTICE`). If you remove it, it doesn't come back; untick «Always use» to make it an ordinary plugin.

### Samples

Your sounds live in `samples/<name>/` (each folder is a Tidal sound: `s "name"`, `s "name:1"` for the second file).
SuperDirt loads them on start and reloads them when you add or delete something. For Freesound, get a free API key at
[freesound.org/apiv2/apply](https://freesound.org/apiv2/apply) and paste it in the library (Search online tab). Tidal
Studio downloads Freesound's high-quality OGG preview, which SuperCollider reads directly.

Optional drum machines: `git clone https://github.com/geikha/tidal-drum-machines samples/packs/tidal-drum-machines`
(loaded automatically on the next start).

### GitHub

Open ⚙ Settings → GitHub. Create a **fine-grained token** on GitHub (Settings → Developer settings → Personal access
tokens) with access to your songs repository and the permission **Contents: Read and write**. Type the repository as
`user/name`; if it doesn't exist yet, «Create private repository» makes it (that needs a token with permission to create
repositories). Then use the cloud button in the top bar to save a version with a message. The token is stored only in
`config.json`.

## How it works

[![How Tidal Studio works](docs/diagrams/architecture.png)](docs/diagrams/architecture.svg)

Diagram source: [docs/diagrams/architecture.puml](docs/diagrams/architecture.puml) (PlantUML), rendered to [SVG](docs/diagrams/architecture.svg) and PNG with `docs/diagrams/render.sh`.

- `server/app.py`: local server (Python standard library only, no `pip install`). Listens only on `127.0.0.1`.
- `server/engine.py`: finds and starts `sclang` (with `supercollider/start_superdirt.scd`) and `ghci` (with `tidal/BootTidal.hs`).
  If something is missing it runs in **simulation mode**: the interface works but there is no sound.
- `server/assistant.py`: Maestro's instructions and parsing of its replies (JSON with message, options and track changes).
- `web/catalog.js`: the component catalog. Adding one means adding an object to the list.
- `web/builder.js`: the base-project wizard. `web/wizard.js`: brainstorm questions and offline plan.
- `web/explain.js`: offline code explainer. `web/suggest.js`: offline producer ideas and progress concepts.
- `web/flavors.js`: style recipes (jazz, Latin, techno, lo-fi, ambient).
- `web/doctor.js`: offline code checks and fixes for the Help panel (`/api/fix` with AI). `web/palette.js`: code palette blocks.
- `web/controls.js`: controls in the chat (agentic UI). `web/blocks.js` + `web/edit.js`: blocks view and its editing. `web/card.js`: configurator card. `web/mixer.js`: mix tab. `web/history.js`: undo and history. `web/samples.js` + `server/samples.py`: sample library and Freesound. `server/github.py`: GitHub versions.
- `server/plugins.py`: Claude Code plugins and marketplaces (`my-plugins/`): download, manifests, skills and `/commands`.
- `server/skills.py` + `web/skills.js`: Maestro's skills (`skills/` included, `my-skills/` yours): choosing which to load, install from GitHub, the panel and the chips in the chat.
- `web/i18n.js`: language switch. `web/icons.js`: custom SVG icons. `web/style.css`: light «Partitura» theme.

Each track is a Tidal `dN` (d1…d12) with its own effects channel (orbit).

## Troubleshooting

- **No sound**: check the **Log** tab. Run `python3 server/app.py --check` to see what's missing.
- **Linux without sound**: SuperCollider uses JACK. With PipeWire it starts with `pw-jack`; with classic JACK, start it first.
- **macOS asks for microphone permission** for SuperCollider: accept it (it needs it to open audio).
- **Windows: "Haskell se está terminando de instalar en otra ventana"** (Haskell is finishing installing in another window): wait until it finishes and run `install.bat` again.
- **Maestro doesn't answer with Claude**: open **Settings → Diagnostics**. It tells you which step fails (command not found,
  not signed in, model not accepted…) and how to fix it; **Test models** shows which models work.
- **Port in use**: `./start.sh --port 9000`.

## Server options

```
python3 server/app.py [--port 8765] [--no-browser] [--no-engine] [--check]
```
