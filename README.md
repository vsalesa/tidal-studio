# 🎛 Tidal Studio · tu compositor en casa

Estudio de música en vivo con [TidalCycles](https://tidalcycles.org) y SuperCollider, con un asistente de IA
("Maestro") que te guía paso a paso aunque no sepas nada de música ni de programación.

- **Componentes para añadir**: percusión, bajo, acordes, melodía, texturas, efectos y "¿cuándo pasa?" (estructura).
- **Código siempre visible**: cada cambio se refleja en código Tidal que puedes leer y editar a mano.
- **Asistente guiado**: te pregunta estilo → ritmo → velocidad → bajo → acordes → melodía → efectos → estructura,
  y propone cambios que suenan al momento.
- **Cualquier IA**: cualquier endpoint compatible con OpenAI (OpenAI, OpenRouter, Groq, DeepSeek, Mistral,
  Ollama, LM Studio…) o Claude (Anthropic). Sin IA también funciona, con una guía de botones.
- **Funciona en macOS, Windows y Linux**. El instalador detecta tu sistema.

## Instalación (una sola vez)

Descarga o clona esta carpeta y:

| Sistema | Qué hacer |
|---|---|
| **Windows 10/11** | Doble clic en `install.bat` |
| **macOS** | Abre Terminal en la carpeta y ejecuta `./install.sh` |
| **Linux** (Debian/Ubuntu, Fedora, Arch, openSUSE) | `./install.sh` |

El instalador pone, si faltan: Python 3, Git, SuperCollider, SuperDirt (sonidos), Haskell (vía ghcup) y TidalCycles.
Tarda 15–40 minutos la primera vez (descarga ~1 GB). Puedes ejecutarlo otra vez sin miedo: se salta lo que ya está.

## Uso

| Sistema | Abrir el estudio |
|---|---|
| Windows | Doble clic en `start.bat` |
| macOS / Linux | `./start.sh` |

Se abre el navegador en <http://localhost:8765>. Después:

1. Pulsa **⚙️** y conecta tu IA (o sigue sin IA con la guía de botones).
2. Habla con **Maestro** a la derecha, o añade componentes desde la izquierda.
3. Mira y edita el código en la pestaña **⌨️ Código** (`Ctrl+Enter` aplica).
4. **■ Silencio** para parar todo al instante.

### Configurar la IA

| Servicio | URL base | Modelo de ejemplo |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local, gratis) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local, gratis) | `http://localhost:1234/v1` | el que tengas cargado |
| Claude (Anthropic) | — | `claude-opus-5-5` |

Las claves se guardan solo en `config.json`, en tu ordenador (no se sube a git). También puedes usar las variables
de entorno `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`.

## Cómo funciona

```
 Navegador (web/)  ──HTTP──▶  server/app.py  ──stdin──▶  GHCi + TidalCycles ──OSC──▶ SuperCollider + SuperDirt ──▶ 🔊
     │                            │
     └── chat ───────────────────▶ server/llm.py ──▶ OpenAI-compatible / Claude
```

- `server/app.py`: servidor local (solo biblioteca estándar de Python, sin `pip install`). Escucha solo en `127.0.0.1`.
- `server/engine.py`: busca y arranca `sclang` (con `supercollider/start_superdirt.scd`) y `ghci` (con `tidal/BootTidal.hs`).
  Si falta algo, trabaja en **modo simulación**: la interfaz funciona pero no suena.
- `server/assistant.py`: las instrucciones de "Maestro" y la lectura de sus respuestas (JSON con mensaje, opciones y cambios de pistas).
- `web/catalog.js`: el catálogo de componentes. Añadir uno nuevo es añadir un objeto a la lista.

Cada pista es un `dN` de Tidal (d1…d12) con su propio canal de efectos (orbit).

## Problemas frecuentes

- **No suena nada**: mira la pestaña 📜 Registro. Ejecuta `python3 server/app.py --check` para ver qué falta.
- **Linux sin sonido**: SuperCollider usa JACK. Con PipeWire se arranca solo con `pw-jack`; si usas JACK clásico, arráncalo antes.
- **macOS pide permiso de micrófono** a SuperCollider: acéptalo (lo necesita para abrir el audio).
- **Windows: "Haskell se está terminando de instalar en otra ventana"**: espera a que acabe y vuelve a ejecutar `install.bat`.
- **Puerto ocupado**: `./start.sh --port 9000`.

## Opciones del servidor

```
python3 server/app.py [--port 8765] [--no-browser] [--no-engine] [--check]
```
