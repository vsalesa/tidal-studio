# Elección de modelo y esfuerzo

Elige el modelo más barato y el esfuerzo más bajo que puedan hacer el trabajo. Empieza ahí y sube solo si el resultado falla.
Versión en inglés: [MODEL_ROUTING.md](MODEL_ROUTING.md).

## Niveles de esfuerzo

- `low`: el cambio es local y la respuesta está en un solo sitio. Edita o responde directamente.
- `medium`: el cambio afecta a varios archivos, o necesita un plan corto antes.
- `high`: hay que seguir el flujo entre módulos, valorar opciones de diseño o comprobar un comportamiento delicado.

| Tarea | Ejemplos en este repo | Modelo | Esfuerzo | Por qué |
|---|---|---|---|---|
| Config, hooks, docs | `.claude/settings.json`, una línea del README, `CLAUDE.md` | Haiku 5.5 | low | Mecánico, nada que planificar |
| Arreglo de un archivo | Etiqueta mal escrita en `web/`, errata en un prompt de `server/assistant.py` | Haiku 5.5 | low | Un solo archivo, arreglo claro |
| Consultas y preguntas | Dónde `skills.py` elige una skill; qué envía `engine.py` a SuperCollider | Haiku 5.5 | low | La respuesta está en el código; Graphify la encuentra |
| Renombrados | Renombrar un helper usado en un solo módulo | Haiku 5.5 | low | Mecánico |
| Funcionalidad en varios archivos | Nueva opción leída en `server/app.py` y mostrada en `web/` | Sonnet 5.5 | medium | Plan entre archivos, sin diseño profundo |
| Trabajo de UI | Nuevo panel, botón o estado en `web/` | Sonnet 5.5 | medium | Decisiones locales de diseño y estado |
| Bug no trivial | Comportamiento que abarca dos o tres módulos | Sonnet 5.5 | high | Seguir el flujo entre módulos antes de editar |
| Arquitectura | Cómo Maestro planifica y elige skills (`assistant.py`, `skills.py`) | Opus 5.5 | high | Compromisos y decisiones de diseño |
| Refactor transversal | Cambiar una capa usada por varios módulos del servidor | Opus 5.5 | high | Muchas dependencias que mantener coherentes |
| Depuración difícil | Un bug que un modelo más barato ya no logró arreglar | Opus 5.5 | high | Hacen falta hipótesis nuevas, no más de lo mismo |

## Escalado

1. Busca la fila de la tarea y usa su modelo y su esfuerzo.
2. Si el resultado falla (tests en rojo tras dos arreglos, o respuesta incorrecta), sube un nivel de esfuerzo con el mismo modelo: `low` -> `medium` -> `high`.
3. Si sigue fallando en `high`, pasa al modelo siguiente y empieza en `medium` (Sonnet) o `high` (Opus).
4. Empieza directamente con Sonnet u Opus si la tarea toca 5 o más archivos.
5. Nunca subas el esfuerzo para suplir datos que faltan. Explora primero con Graphify.

## Ahorro de tokens

- Explora el código con Graphify antes de grep o Read.
- Usa Context7 para la documentación de librerías.
- Ejecuta solo los tests del código que cambiaste.
- Genera instaladores y regenera README y capturas solo en las versiones.
