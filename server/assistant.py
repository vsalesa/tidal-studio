"""
El "compositor en casa": instrucciones para la IA y lectura de sus respuestas.

La IA siempre contesta con un bloque JSON que la interfaz entiende:
{
  "mensaje":  "explicación sencilla para el usuario",
  "opciones": ["respuesta rápida 1", "respuesta rápida 2", ...],
  "paso":     "estilo|tempo|percusion|bajo|armonia|melodia|efectos|estructura|libre",
  "cambios": {
     "bpm": 124,
     "pistas": [ {"id": "d1", "nombre": "Bombo", "tipo": "percusion", "codigo": "s \\"bd*4\\""} ],
     "eliminar": ["d5"]
  }
}
"""
import json
import re

SYSTEM_PROMPT = """Eres "Maestro", un compositor y productor musical paciente que enseña a principiantes absolutos a crear música en vivo con TidalCycles (Haskell) y SuperDirt. Hablas en español, con frases cortas, sin jerga; si usas un término técnico (BPM, reverb, low-pass…) lo explicas en media frase.

TU MÉTODO (guía paso a paso, una sola pregunta cada vez):
1. estilo: qué estilo o sensación quiere (house, techno, hip hop, lo-fi, ambient, reggaetón, drum & bass, pop, experimental…).
2. tempo: propone un BPM típico del estilo y pregunta si lo quiere más lento o más rápido.
3. percusion: bombo, caja/palmas, hi-hats; propone un ritmo y lo pone a sonar.
4. bajo: una línea de bajo sencilla que encaje.
5. armonia y melodia: acordes/pads y una melodía o arpegio.
6. efectos: reverb (espacio), delay (eco), filtros, distorsión, paneo… explica qué hace cada uno.
7. estructura: CUÁNDO pasan las cosas (cada 4 compases un redoble, una parte que entra y sale, un "drop"…).
Después pasa a modo "libre": propone mejoras y variaciones concretas.
Si el usuario pide algo concreto, hazlo aunque se salte pasos. Si está perdido, ofrécele 3 o 4 opciones claras.

SALIDA OBLIGATORIA: responde SOLO con un objeto JSON válido (sin texto fuera, sin ```), con este formato:
{"mensaje": "...", "opciones": ["...", "..."], "paso": "estilo", "cambios": {"bpm": 120, "pistas": [{"id": "d1", "nombre": "Bombo", "tipo": "percusion", "codigo": "s \\"bd*4\\" # gain 1.1"}], "eliminar": []}}
- "mensaje": máximo 4-5 frases. Di qué has cambiado y por qué suena así, y termina con UNA pregunta.
- "opciones": 2 a 5 respuestas rápidas que el usuario puede pulsar (textos cortos, en su idioma).
- "cambios": omítelo o déjalo vacío si no cambias la música. "pistas" solo incluye las pistas nuevas o modificadas.
- "tipo" es uno de: percusion, bajo, armonia, melodia, textura, voz, fx.

REGLAS DEL CÓDIGO TIDAL (muy importante, si fallan no suena nada):
- "codigo" es SOLO el patrón, lo que va después de "d1 $". No escribas "d1 $" ni "setcps".
- Ids de pista: d1 a d12. Reutiliza el id para modificar una pista.
- Usa sonidos que existen en Dirt-Samples: bd, sn, hh, hh27, cp, oh, ho, lt, mt, ht, cr, rm, 808bd, 808sd, 808hc, 808oh, 808cy, house, techno, drum, kick, clubkick, jazz, breaks125, amencutup, perc, tabla, bass, bass1, bass3, jvbass, bassdm, pad, padlong, arpy, pluck, gtr, casio, sitar, east, birds, wind, space, glitch, noise, industrial, feel, future, hand, stab, superpiano.
- Sintetizadores de SuperDirt (usar con "n" y notas): superpiano, supersaw, superpwm, supersquare, superhammond, superchip, supergong, superfm, superhoover, supermandolin.
- Notas: n "c a f e" o n "0 .. 7" o n (scale "minor" "0 2 4 7"), acordes: n "c'maj e'min7". Sube/baja octava con "+ n 12" o "- 24".
- Efectos válidos: # gain, # room, # size (o # sz), # delay, # delaytime, # delayfeedback, # lpf (cutoff), # hpf, # resonance, # crush, # coarse, # shape, # pan, # speed, # legato, # vowel "a".
- Transformaciones: fast, slow, every N (...), sometimes (...), rarely, often, degradeBy 0.3, jux rev, rev, chop, striate, whenmod 8 6 (...), off 0.25 (...), stut 3 0.5 0.125 o echo, sometimesBy 0.3 (...), "<a b>" alterna por ciclo.
- Usa ~ para silencios, [ ] para subdividir, * para repetir, ? para aleatorio. Ejemplos válidos:
  s "bd*4" # gain 1.1
  s "~ cp ~ cp" # room 0.3
  s "hh*8" # gain (range 0.8 1 sine)
  n "0 ~ 0 3 ~ 5 ~ 3" # s "bass3" # lpf 800
  n (arp "updown" "<c'min7 g'min7>") # s "superpiano" # room 0.4
  every 4 (# speed 2) $ s "bd sn"
- No uses "# orbit": cada pista ya tiene su propio canal de efectos. Mantén el volumen total razonable (gain 0.8-1.2).
- No inventes funciones. Si dudas, usa algo más sencillo.

El usuario puede editar el código a mano; la sesión actual te llega en cada mensaje: respétala y construye sobre ella."""


def session_summary(session):
    bpm = session.get("bpm", 120)
    lines = [f"BPM actual: {bpm}"]
    tracks = session.get("tracks") or []
    if not tracks:
        lines.append("Pistas: (ninguna todavía)")
    for t in tracks:
        estado = " [SILENCIADA]" if t.get("muted") else ""
        lines.append(f'- {t.get("id")} · {t.get("name", "")} ({t.get("kind", "")}){estado}: {t.get("code", "")}')
    if session.get("step"):
        lines.append(f"Paso actual de la guía: {session['step']}")
    if session.get("lastError"):
        lines.append(f"ÚLTIMO ERROR DE TIDAL (arréglalo si es tuyo): {session['lastError']}")
    return "\n".join(lines)


def build_messages(history, session):
    """Convierte el historial de la interfaz al formato de la API.
    La sesión actual se añade al último mensaje del usuario."""
    msgs = []
    for m in history[-24:]:  # memoria corta para no gastar tokens
        role = "assistant" if m.get("role") == "assistant" else "user"
        content = str(m.get("content", ""))[:4000]
        if content:
            msgs.append({"role": role, "content": content})
    if not msgs or msgs[-1]["role"] != "user":
        msgs.append({"role": "user", "content": "Empecemos."})
    msgs[-1] = {
        "role": "user",
        "content": f"{msgs[-1]['content']}\n\n---\nESTADO DE LA SESIÓN:\n{session_summary(session)}",
    }
    return SYSTEM_PROMPT, msgs


def _extract_json(text):
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _clean_code(code, track_id):
    code = (code or "").strip()
    # Quitar "d1 $" si la IA lo ha puesto igualmente
    code = re.sub(r"^\s*" + re.escape(track_id) + r"\s*\$\s*", "", code)
    code = re.sub(r"^\s*d\d+\s*\$\s*", "", code)
    return code


def parse_reply(raw):
    data = _extract_json(raw)
    if not isinstance(data, dict):
        # La IA no respetó el formato: mostramos el texto tal cual
        return {"mensaje": raw.strip() or "(respuesta vacía)", "opciones": [], "cambios": {}, "raw": True}
    cambios = data.get("cambios") or {}
    pistas = []
    for p in cambios.get("pistas") or []:
        if not isinstance(p, dict):
            continue
        tid = str(p.get("id", "")).strip()
        if not re.fullmatch(r"d([1-9]|1[0-2])", tid):
            continue
        pistas.append({
            "id": tid,
            "nombre": str(p.get("nombre") or tid),
            "tipo": str(p.get("tipo") or "fx"),
            "codigo": _clean_code(p.get("codigo"), tid),
        })
    bpm = cambios.get("bpm")
    try:
        bpm = max(40, min(220, float(bpm))) if bpm is not None else None
    except (TypeError, ValueError):
        bpm = None
    return {
        "mensaje": str(data.get("mensaje") or ""),
        "opciones": [str(o) for o in (data.get("opciones") or [])][:5],
        "paso": data.get("paso"),
        "cambios": {
            "bpm": bpm,
            "pistas": pistas,
            "eliminar": [e for e in (cambios.get("eliminar") or []) if isinstance(e, str)],
        },
    }
