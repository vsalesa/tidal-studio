# Elección de modelo

Elige el modelo más barato que pueda hacer el trabajo. Empieza por ahí y sube de modelo solo si falla.
Versión en inglés: [MODEL_ROUTING.md](MODEL_ROUTING.md).

| Tarea | Ejemplos en este repo | Modelo | Esfuerzo |
|---|---|---|---|
| Config, hooks, docs | `.claude/settings.json`, una línea del README, `CLAUDE.md` | Haiku 5.5 | low |
| Arreglo de un archivo | Etiqueta mal escrita en `web/`, errata en un prompt de `server/assistant.py` | Haiku 5.5 | low |
| Consultas y preguntas | Dónde `skills.py` elige una skill; qué envía `engine.py` a SuperCollider | Haiku 5.5 | low |
| Renombrados | Renombrar un helper usado en un solo módulo | Haiku 5.5 | low |
| Funcionalidad en varios archivos | Nueva opción leída en `server/app.py` y mostrada en `web/` | Sonnet 5.5 | medium |
| Trabajo de UI | Nuevo panel, botón o estado en `web/` | Sonnet 5.5 | medium |
| Bug no trivial | Comportamiento que hay que seguir entre dos o tres módulos | Sonnet 5.5 | medium |
| Arquitectura | Cómo Maestro planifica y elige skills (`assistant.py`, `skills.py`) | Opus 5.5 | high |
| Refactor transversal | Cambiar una capa usada por varios módulos del servidor | Opus 5.5 | high |
| Depuración difícil | Un bug que un modelo más barato ya no logró arreglar | Opus 5.5 | high |

## Regla de escalado

1. Busca la fila que corresponde a la tarea y empieza con su modelo.
2. Sube un nivel (Haiku -> Sonnet -> Opus) solo si el modelo más barato falla: los tests siguen en rojo tras dos arreglos, o la respuesta es incorrecta y hay que rehacerla.
3. Empieza directamente con Sonnet u Opus si la tarea toca 5 o más archivos.
4. Mantén el esfuerzo en `low` salvo que la fila indique otra cosa. No subas el esfuerzo para suplir datos que faltan; explora primero con Graphify.

## Ahorro de tokens

- Explora el código con Graphify antes de grep o Read.
- Usa Context7 para la documentación de librerías.
- Ejecuta solo los tests del código que cambiaste.
- Genera instaladores y regenera README y capturas solo en las versiones.
