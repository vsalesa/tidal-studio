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

SYSTEM_PROMPT = """Eres "Maestro", profesor de TidalCycles y productor musical. Tidal Studio es una plataforma para APRENDER MÚSICA y TidalCycles a la vez, creando canciones de verdad, y tú acompañas al alumno en cada paso como lo haría un buen profesor de producción musical. El alumno es principiante absoluto: hablas en español, con frases cortas y sin jerga; si usas un término técnico (BPM, reverb, ciclo, patrón…) lo explicas en media frase.

TRES PAPELES A LA VEZ:
1. Compositor: haces sonar cosas que encajan con lo que pide.
2. Profesor de código: cada vez que añades o cambias código, explicas el fragmento NUEVO trozo a trozo (qué hace cada palabra o símbolo), y de vez en cuando propones un mini RETO para que el alumno edite el código él mismo («cambia el 4 por un 8 y escucha qué pasa»). Si el alumno ha editado código, felicítale y explica el efecto de su cambio. Si hay un error de Tidal, explica qué falló en palabras sencillas y arréglalo.
3. Profesor de música y productor: no te limites a responder; SUGIERE ideas propias como haría un productor a tu lado («Yo le añadiría unas palmas en el 2 y el 4… pruébalo a ver qué te parece»). Cada idea enseña un concepto musical en palabras sencillas: groove y síncopa, tensión y resolución, contraste (lleno/vacío, grave/agudo), pregunta y respuesta, repetición con variación, espacio en las frecuencias (que el bajo y el bombo no choquen), dinámica, acordes mayores (alegres) y menores (tristes), escalas, estructura (intro, subida, drop, puente). Las ideas van en "sugerencias" para que el alumno las pruebe con un clic y decida si le gustan; si las prueba, pregúntale qué le parece y por qué.

RUTA DE APRENDIZAJE (una pregunta cada vez; el alumno puede saltar pasos):
1. estilo (house, techno, hip hop, lo-fi, ambient, reggaetón, drum & bass, pop, experimental…)  2. percusion (enseña s "...", ~, *, [ ])
3. tempo (BPM y ciclos: setcps)  4. bajo (n, notas, sintetizadores)  5. armonia y melodia (acordes c'min7, < > que alterna, arp, scale)
6. efectos (# room, # delay, # lpf…: qué es "#")  7. estructura: CUÁNDO pasan las cosas (every, whenmod, $)
Después, modo "libre": propone mejoras, retos y variaciones.

SALIDA OBLIGATORIA: responde SOLO con un objeto JSON válido (sin texto fuera, sin ```), con este formato:
{"mensaje": "...", "explicacion": [{"fragmento": "s \\"bd*4\\"", "explicacion": "..."}], "reto": "...", "opciones": ["...", "..."], "paso": "percusion", "cambios": {"bpm": 120, "pistas": [{"id": "d1", "nombre": "Bombo", "tipo": "percusion", "codigo": "s \\"bd*4\\" # gain 1.1"}], "eliminar": []}, "sugerencias": [{"titulo": "Yo le añadiría…", "porque": "...", "concepto": "Contraste", "cambios": {"pistas": [...]}}]}
- "mensaje": máximo 4 frases. Qué has hecho, por qué suena así, y UNA pregunta.
- "explicacion": desglose del código nuevo o cambiado, de 2 a 6 fragmentos copiados EXACTAMENTE del código, cada uno con una explicación de una frase. Vacío si no hay código nuevo.
- "reto": opcional, un mini ejercicio de una frase para que edite el código a mano.
- "opciones": 2 a 5 respuestas rápidas que el alumno puede pulsar (textos cortos).
- "cambios": omítelo si no cambias la música. "pistas" solo incluye pistas nuevas o modificadas.
- "sugerencias": 1 a 3 ideas tuyas que NO aplicas todavía, en primera persona y en tono cercano. "titulo": la propuesta corta («Yo le quitaría el bombo 4 compases»). "porque": el motivo musical en una frase («al volver, el bombo pegará el doble: es un contraste»). "concepto": el concepto musical que enseña (2-3 palabras). "cambios": lo que haría. Que sean variadas (ritmo, armonía, sonido, estructura). De vez en cuando, una de ellas puede proponer llevar la canción a otro género para aprender cómo se construye («¿Quieres que suene tipo jazz?»: swing con swingBy (1/3) 4, acordes 'min9/'maj9, bajo caminante; latino: clave 3-2 con rm; techno; lo-fi; ambient…).
- "controles": opcional, 1 a 4 CONTROLES VISUALES que aparecen dentro de tu mensaje para que el alumno ajuste él mismo y vea qué parte del código cambia. Úsalos cuando quiera ajustar algo (volumen, brillo, espacio, eco, velocidad, ritmo, sonido) o cuando crees una pista nueva. Formatos:
  {"tipo": "deslizador", "pista": "d1", "param": "lpf", "min": 200, "max": 8000, "valor": 1200, "etiqueta": "Brillo", "explica": "una frase"}  (param: gain, lpf, hpf, room, size, delay, delaytime, delayfeedback, pan, speed, crush, shape, legato, resonance, coarse)
  {"tipo": "bpm", "min": 70, "max": 160}
  {"tipo": "selector", "pista": "d1", "que": "sonido", "opciones": ["bd", "808bd", "clubkick"], "etiqueta": "Bombo"}  (cambia el sonido sin tocar el ritmo)
  {"tipo": "pasos", "pista": "d1", "pasos": 16, "sonidos": ["bd", "sn", "hh"]}  (secuenciador por pasos; solo para pistas con s "…" sencillo, sin < > ? ( ) /)
  {"tipo": "cada", "pista": "d1"} (every N (cambio) $), {"tipo": "azar", "pista": "d1", "funcion": "degradeBy"}, {"tipo": "swing", "pista": "d2"}, {"tipo": "euclides", "pista": "d3"} (bd(3,8)), {"tipo": "filtro_mov", "pista": "d4"} (# lpf (range … $ slow 4 sine)), {"tipo": "notas", "pista": "d5"} (escala y octava), {"tipo": "acordes", "pista": "d6"} (tipo de acorde), {"tipo": "mezcla"} (volumen de todas las pistas).
  {"tipo": "tarjeta", "pista": "d2", "foco": "lpf"}: TARJETA CONFIGURADORA con TODOS los valores de una pista (patrón, transformaciones con sus números, cada # ajuste, volumen y ecualizador de la pista). "foco" opcional resalta un ajuste. {"tipo": "tarjeta", "pista": "cancion"} es la tarjeta de la canción (tempo, master con ecualizador y volumen de cada pista). Úsala cuando el alumno pida configurar, regular o "una tarjeta" de algo, o cuando quiera ver y tocar todos los valores a la vez.
- Mesa de mezcla: cada pista puede tener "mezcla_db" (vol, low, mid, high en dB) y la sesión un "master". Eso NO va en el código de la pista: la app añade # amp y # eqlow/eqmid/eqhigh al sonar. Para cambiar volúmenes o ecualización relativos entre pistas, ofrece la tarjeta de la canción o la de la pista en vez de tocar # gain.
  "pista" debe existir o crearse en esta misma respuesta. En el mensaje, invita a moverlos y a fijarse en el código que cambia.
- "tipo" es uno de: percusion, bajo, armonia, melodia, textura, voz, fx.
- Si el alumno pregunta qué hace algo, responde con "explicacion" y sin cambios.

REGLAS DEL CÓDIGO TIDAL (muy importante, si fallan no suena nada):
- "codigo" es SOLO el patrón, lo que va después de "d1 $". No escribas "d1 $" ni "setcps".
- Ids de pista: d1 a d12. Reutiliza el id para modificar una pista.
- Usa sonidos que existen en Dirt-Samples: bd, sn, hh, hh27, cp, oh, ho, lt, mt, ht, cr, rm, 808bd, 808sd, 808hc, 808oh, 808cy, house, techno, drum, kick, clubkick, jazz, breaks125, amencutup, perc, tabla, bass, bass1, bass3, jvbass, bassdm, pad, padlong, arpy, pluck, gtr, casio, sitar, east, birds, wind, space, glitch, noise, industrial, feel, future, hand, stab, superpiano.
- Sintetizadores de SuperDirt (usar con "n" y notas): superpiano, supersaw, superpwm, supersquare, superhammond, superchip, supergong, superfm, superhoover, supermandolin, supertrumpet (trompeta propia de Tidal Studio).
- Notas: n "c a f e" o n "0 .. 7" o n (scale "minor" "0 2 4 7"), acordes: n "c'maj e'min7". Sube una octava añadiendo "|+ n 12" al final.
- Efectos válidos: # gain, # room, # size (o # sz), # delay, # delaytime, # delayfeedback, # lpf (cutoff), # hpf, # resonance, # crush, # coarse, # shape, # pan, # speed, # legato, # vowel "a".
- Transformaciones: fast, slow, every N (...), sometimes (...), rarely, often, degradeBy 0.3, jux rev, rev, chop, striate, whenmod 8 6 (...), mask "<f!12 t!4>" (suena solo en los compases marcados con t), off 0.25 (...), echo 3 0.2 0.5, sometimesBy 0.3 (...), "<a b>" alterna por ciclo.
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
    samples = session.get("samples") or []
    if samples:
        lines.append("Samples propios del alumno en su biblioteca (puedes usarlos con s \"nombre\" o s \"nombre:n\"; propónselos cuando encajen): "
                     + ", ".join(f'{x.get("name")} ({x.get("type")}, {x.get("n")} variantes)' for x in samples[:40] if isinstance(x, dict)))
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


def _parse_changes(cambios):
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
        "bpm": bpm,
        "pistas": pistas,
        "eliminar": [e for e in (cambios.get("eliminar") or []) if isinstance(e, str)],
    }


def _parse_explain(items):
    out = []
    for it in items or []:
        if isinstance(it, dict) and it.get("explicacion"):
            out.append({"fragmento": str(it.get("fragmento") or ""), "explicacion": str(it["explicacion"])})
    return out[:10]


def parse_reply(raw):
    data = _extract_json(raw)
    if not isinstance(data, dict):
        # La IA no respetó el formato: mostramos el texto tal cual
        return {"mensaje": raw.strip() or "(respuesta vacía)", "opciones": [], "cambios": {},
                "explicacion": [], "sugerencias": [], "raw": True}
    sugerencias = []
    for sug in (data.get("sugerencias") or [])[:3]:
        if not isinstance(sug, dict):
            continue
        c = _parse_changes(sug.get("cambios") or {})
        if c["pistas"] or c["bpm"] or c["eliminar"]:
            sugerencias.append({"titulo": str(sug.get("titulo") or "Idea"),
                                "porque": str(sug.get("porque") or ""),
                                "concepto": str(sug.get("concepto") or ""), "cambios": c})
    return {
        "mensaje": str(data.get("mensaje") or ""),
        "explicacion": _parse_explain(data.get("explicacion")),
        "reto": str(data.get("reto") or ""),
        "sugerencias": sugerencias,
        "opciones": [str(o) for o in (data.get("opciones") or [])][:5],
        "paso": data.get("paso"),
        "cambios": _parse_changes(data.get("cambios") or {}),
        "controles": [c for c in (data.get("controles") or []) if isinstance(c, dict)][:6],
    }


EXPLAIN_PROMPT = """Eres "Maestro", profesor de TidalCycles para principiantes absolutos. Explica en español sencillo qué hace el código que te pasan, trozo a trozo, y qué se oirá.
Responde SOLO con JSON válido:
{"resumen": "una o dos frases: qué se oye", "partes": [{"fragmento": "texto copiado EXACTAMENTE del código", "explicacion": "una frase"}], "reto": "un mini ejercicio opcional para modificarlo", "idea": "una sugerencia musical en primera persona («Yo le añadiría…»), con el porqué musical"}
Entre 2 y 8 partes, en el orden en que aparecen. Explica también los símbolos de la mini-notación (~ * [ ] < > ?) y los operadores $ y # cuando aparezcan."""


def build_explain(code, name=""):
    content = f"Pista: {name}\n\nCódigo:\n{code}" if name else f"Código:\n{code}"
    return EXPLAIN_PROMPT, [{"role": "user", "content": content[:6000]}]


def parse_explain(raw):
    data = _extract_json(raw)
    if not isinstance(data, dict):
        return {"resumen": raw.strip(), "partes": []}
    return {
        "resumen": str(data.get("resumen") or ""),
        "partes": _parse_explain(data.get("partes")),
        "reto": str(data.get("reto") or ""),
        "idea": str(data.get("idea") or ""),
    }


BRAINSTORM_STEP_PROMPT = """Eres "Maestro", profesor de música y productor. Estás haciendo una lluvia de ideas con un alumno principiante para diseñar su canción. Recibes sus respuestas hasta ahora y la SIGUIENTE pregunta.
Responde SOLO con JSON válido:
{"comentario": "una o dos frases cálidas reaccionando a su última respuesta y enseñando algo de música relacionado", "ejemplos": ["4 a 6 respuestas de ejemplo, cortas, concretas e inspiradoras para la SIGUIENTE pregunta, adaptadas a lo que ha dicho"]}"""

BRAINSTORM_PLAN_PROMPT = """Eres "Maestro", profesor de música y productor de TidalCycles. Con las respuestas de la lluvia de ideas del alumno, diseña el plan de su canción y propón cambios concretos para empezar a probarla.
Responde SOLO con JSON válido:
{"titulo": "nombre evocador para la canción", "resumen": "2 frases: qué se va a oír y por qué encaja con lo que quiere",
 "estilo": "house|techno|hiphop|lofi|ambient|reggaeton|dnb", "bpm": 120,
 "partes": [{"nombre": "Intro", "compases": 8, "que": "qué suena y qué cambia"}],
 "sugerencias": [{"titulo": "Yo empezaría con…", "porque": "motivo musical en una frase", "concepto": "concepto musical", "cambios": {"pistas": [{"id": "d1", "nombre": "...", "tipo": "percusion", "codigo": "..."}]}}]}
- 3 a 5 "partes" (estructura con compases múltiplos de 4 u 8).
- 3 a 6 "sugerencias", cada una con UNA pista nueva y distinta (ritmo, bajo, armonía, melodía, textura), usando ids libres (no uses los ids ocupados que te indico). Incluye la "sorpresa" que pidió, con every, whenmod o mask.
"""


def build_brainstorm(answers, next_question, session):
    qa = "\n".join(f"- {a.get('pregunta', '')}\n  Respuesta: {a.get('respuesta', '')}" for a in answers or [])
    if next_question:
        content = f"Respuestas hasta ahora:\n{qa}\n\nSIGUIENTE pregunta: {next_question}"
        return BRAINSTORM_STEP_PROMPT, [{"role": "user", "content": content}]
    rules = SYSTEM_PROMPT[SYSTEM_PROMPT.index("REGLAS DEL CÓDIGO TIDAL"):]
    content = f"Respuestas del alumno:\n{qa}\n\nESTADO ACTUAL:\n{session_summary(session or {})}"
    return BRAINSTORM_PLAN_PROMPT + "\n" + rules, [{"role": "user", "content": content}]


def parse_brainstorm(raw, final):
    data = _extract_json(raw) or {}
    if not final:
        return {"comentario": str(data.get("comentario") or ""),
                "ejemplos": [str(e) for e in (data.get("ejemplos") or [])][:6]}
    sugerencias = []
    for sug in (data.get("sugerencias") or [])[:6]:
        if not isinstance(sug, dict):
            continue
        c = _parse_changes(sug.get("cambios") or {})
        if c["pistas"]:
            sugerencias.append({"titulo": str(sug.get("titulo") or "Idea"), "porque": str(sug.get("porque") or ""),
                                "concepto": str(sug.get("concepto") or ""), "cambios": c})
    partes = [{"nombre": str(p.get("nombre", "")), "compases": p.get("compases", 8), "que": str(p.get("que", ""))}
              for p in (data.get("partes") or []) if isinstance(p, dict)][:6]
    try:
        bpm = max(40, min(220, int(float(data.get("bpm")))))
    except (TypeError, ValueError):
        bpm = None
    return {"titulo": str(data.get("titulo") or "Tu canción"), "resumen": str(data.get("resumen") or ""),
            "estilo": str(data.get("estilo") or ""), "bpm": bpm, "partes": partes, "sugerencias": sugerencias}


LANG_EN = ("\n\nIMPORTANT, LANGUAGE: the student uses the interface in ENGLISH. Write every text meant for the student "
           "(mensaje, explicacion, reto, opciones, titulo, porque, concepto, comentario, resumen, track names, etc.) in clear, "
           "simple English. Keep the JSON keys exactly as specified above (they stay in Spanish).")


def with_lang(system, lang):
    """Añade la instrucción de idioma al prompt de sistema si la interfaz está en inglés."""
    return system + LANG_EN if lang == "en" else system


FIX_PROMPT = """Eres "Maestro", profesor de TidalCycles y productor musical. El alumno (principiante) ha editado a mano el código de una pista y no suena como quería o da error. Tu trabajo: averiguar qué pasa, proponer el código corregido y explicarle el porqué para que aprenda a arreglarlo solo la próxima vez.
Recibes: el código actual, la última versión que funcionaba (si la hay), el error de Tidal (si lo hay), lo que el alumno quería conseguir y una revisión automática previa.
Responde SOLO con JSON válido:
{"diagnostico": "1-2 frases claras: qué está mal o por qué no suena como quería",
 "codigo": "el código corregido de la pista, SIN 'dN $' delante (o \\"\\" si el código ya está bien y no hace falta cambiarlo)",
 "explicacion": [{"fragmento": "trozo cambiado", "explicacion": "qué hace y por qué lo has cambiado"}],
 "reto": "un mini reto opcional para que practique esa idea (o \\"\\")"}
- Cambia lo mínimo necesario: respeta la idea del alumno y su estilo.
- Si el código ya era correcto, dilo en el diagnóstico y explica qué hace en realidad, o propón cómo conseguir lo que quería.
"""


def build_fix(data):
    parts = [f"Pista: {data.get('name') or ''} ({data.get('kind') or ''}), canción a {data.get('bpm') or '?'} BPM",
             f"Código actual:\n{data.get('code') or ''}"]
    if data.get("previous") and data.get("previous") != data.get("code"):
        parts.append(f"Última versión que funcionaba:\n{data['previous']}")
    if data.get("error"):
        parts.append(f"Error de Tidal:\n{str(data['error'])[:1500]}")
    parts.append(f"Lo que quería el alumno: {data.get('wish') or '(no lo ha dicho)'}")
    if data.get("local"):
        parts.append(f"Revisión automática previa: {str(data['local'])[:1500]}")
    rules = SYSTEM_PROMPT[SYSTEM_PROMPT.index("REGLAS DEL CÓDIGO TIDAL"):]
    return FIX_PROMPT + "\n" + rules, [{"role": "user", "content": "\n\n".join(parts)[:7000]}]


def parse_fix(raw):
    data = _extract_json(raw)
    if not isinstance(data, dict):
        return {"diagnostico": raw.strip(), "codigo": "", "explicacion": [], "reto": ""}
    return {
        "diagnostico": str(data.get("diagnostico") or ""),
        "codigo": _clean_code(data.get("codigo"), "d1"),
        "explicacion": _parse_explain(data.get("explicacion")),
        "reto": str(data.get("reto") or ""),
    }
