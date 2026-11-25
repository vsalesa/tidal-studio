"""Cuántas pistas (d1…dN) tiene el estudio: un ajuste, 12 por defecto (0.25.1).

Cada pista suena en su propia «orbit» de SuperDirt, y cada orbit tiene sus propios efectos globales
(reverb, delay…) encendidos todo el rato. Más pistas = más CPU aunque estén calladas. Por eso:
  - 12 por defecto (lo que esperan los cursos: d1..d8 + la batería de referencia en las 4 últimas);
  - 12 como mínimo y 32 como máximo;
  - el BootTidal.hs (d1..dN) y las orbits de SuperDirt (N + 1: la última es la del teclado MIDI) se generan
    a partir de este número cada vez que arranca el motor.
"""
import os
import re

MIN, MAX, DEFAULT = 12, 32, 12

_D_LINE = re.compile(r"^    d\d+ = p \d+ \. \(\|< orbit \d+\)\n", re.M)


def clamp(n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        return DEFAULT
    return max(MIN, min(MAX, n))


def count(cfg):
    """El número de pistas guardado en Ajustes (config.json → tracks.count)."""
    return clamp(((cfg or {}).get("tracks") or {}).get("count", DEFAULT))


def boot_text(template, n):
    """El BootTidal.hs de tidal/ con d1..dN, cada una en su orbit (dK → orbit K-1)."""
    n = clamp(n)
    first = _D_LINE.search(template)
    if not first:
        return template
    lines = "".join(f"    d{i} = p {i} . (|< orbit {i - 1})\n" for i in range(1, n + 1))
    body = _D_LINE.sub("", template)
    return body[:first.start()] + lines + body[first.start():]


def write_boot(root, out_dir, n):
    """Escribe el BootTidal.hs generado en out_dir y devuelve su ruta (o la del original si no se puede)."""
    src = os.path.join(root, "tidal", "BootTidal.hs")
    try:
        with open(src, encoding="utf-8") as f:
            text = boot_text(f.read(), n)
        os.makedirs(out_dir, exist_ok=True)
        dst = os.path.join(out_dir, "BootTidal.hs")
        with open(dst, "w", encoding="utf-8") as f:
            f.write(text)
        return dst
    except OSError:
        return src
