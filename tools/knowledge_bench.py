#!/usr/bin/env python3
"""Banco de pruebas de la búsqueda en skills (0.21): mismo corpus, varios modos, sin IA.

  python3 tools/knowledge_bench.py            # tabla resumen
  python3 tools/knowledge_bench.py --misses   # y qué consulta falla en el modo por defecto
  python3 tools/knowledge_bench.py --json out.json

Modos (las letras son las de la spec):
  A whole       skills enteras, como hasta la 0.19
  B bm25        skills a la carta de la 0.20 (BM25 en Python, secciones planas)
  C child       0.21 FTS5 solo hijos, sin padres (control negativo)
  D smart       0.21 FTS5 + padre–hijo (el modo por defecto)
  E smart-core  D sin las seis skills nuevas (mide la arquitectura sola)
Mide: cobertura de lo necesario (por requisito y por consulta), críticas que fallan, prohibidas que se cuelan,
caracteres y tokens ESTIMADOS de skills enviados. No mide calidad musical: eso es la escucha a ciegas.
"""
import argparse
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import knowledge_store as ks  # noqa: E402
import plugins  # noqa: E402
import skills  # noqa: E402

GOLD = os.path.join(ROOT, "tests", "fixtures", "retrieval_gold.json")
NEW = ["music-evaluate", "music-compose", "arrangement-advisor", "melody-writer", "hook-writer", "prosody-checker"]
MODES = [("A", "whole", {}), ("B", "bm25", {}), ("C", "child", {}), ("D", "smart", {}), ("E", "smart-core", {})]


def blocks(text):
    """{skill: [líneas de cabecera de lo enviado]} y el texto de cada skill."""
    out, cur, body = {}, None, {}
    for line in text.split("\n"):
        m = re.match(r"^### Skill «([^»]+)»", line)
        if m:
            cur = m.group(1)
            out.setdefault(cur, [])
            body.setdefault(cur, "")
            if "·" in line:   # secciones pedidas con mas_skills
                out[cur].append(line)
            continue
        if line.startswith("Otras secciones de esta skill"):
            continue
        if cur and (line.startswith("#### ") or line.startswith("##### ")):
            out[cur].append(line)
        if cur:
            body[cur] += line + "\n"
    return out, body


def hit(alt, heads, body, whole):
    skill, _, rest = alt.partition("|")
    file, _, heading = rest.partition("|")
    if skill not in heads:
        return False
    if whole:
        b = body[skill]
        if file and file != "SKILL.md" and not any(file in h for h in heads[skill]):
            return False
        return not heading or heading.lower() in b.lower()
    for h in heads[skill]:
        if (not file or file in h) and (not heading or heading.lower() in h.lower()):
            return True
    return False


def run_mode(code, mode, gold, cfg):
    res = {"code": code, "mode": mode, "items": 0, "items_ok": 0, "queries_ok": 0, "critical_fail": [], "forbid": [],
           "chars": 0, "tokens": 0, "misses": [], "ctx": 0, "ctx_ok": 0, "ctx_miss": []}
    for g in gold:
        c = json.loads(json.dumps(cfg))
        kw = {}
        if mode == "whole":
            kw["mode"] = "whole"
        elif mode == "bm25":
            kw["mode"] = "bm25"
        elif mode == "child":
            kw.update(mode="smart", child_only=True)
        elif mode == "smart-core":
            c.setdefault("skills", {})["disabled"] = NEW
        _, loaded, text = skills.select(c, g["q"], "", (), genre=g.get("genre", ""), **kw)
        heads, body = blocks(text)
        ok_all = True
        for req in g["need"]:
            res["items"] += 1
            if any(hit(a, heads, body, mode == "whole") for a in req):
                res["items_ok"] += 1
            else:
                ok_all = False
                res["misses"].append(g["id"])
                if g.get("critical"):
                    res["critical_fail"].append(g["id"])
        for f in g.get("forbid") or []:
            if (f in heads) if "|" not in f else hit(f, heads, body, mode == "whole"):
                res["forbid"].append(f"{g['id']}:{f}")
                ok_all = False
        for req in g.get("need_ctx") or []:
            res["ctx"] += 1
            if any(hit(a, heads, body, mode == "whole") for a in req):
                res["ctx_ok"] += 1
            else:
                res["ctx_miss"].append(g["id"])
        res["queries_ok"] += ok_all
        res["chars"] += len(text)
        res["tokens"] += ks.estimate_tokens(text)
    n = len(gold)
    res["coverage"] = round(100 * res["items_ok"] / max(1, res["items"]), 1)
    res["ctx_coverage"] = round(100 * res["ctx_ok"] / max(1, res["ctx"]), 1)
    res["avg_chars"] = res["chars"] // n
    res["avg_tokens"] = res["tokens"] // n
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--misses", action="store_true")
    ap.add_argument("--json")
    a = ap.parse_args()
    gold = json.load(open(GOLD, encoding="utf-8"))["queries"]
    tmp = tempfile.mkdtemp()
    plugins.PLUGIN_DIR = os.path.join(tmp, "no-plugins")      # solo lo que trae la app, sin plugins descargados
    skills.USER_DIR = os.path.join(tmp, "no-user-skills")
    ks.configure(os.path.join(tmp, "bench.sqlite"))
    cfg = {"skills": {}}
    out = [run_mode(c, m, gold, cfg) for c, m, _ in MODES]
    print(f"{len(gold)} consultas, {out[0]['items']} requisitos\n")
    print(f"{'modo':<14}{'cobertura':>10}{'consultas ok':>14}{'críticas KO':>13}{'prohibidas':>12}{'excepciones':>13}{'chars/msg':>11}{'tokens est/msg':>16}")
    for r in out:
        print(f"{r['code']} {r['mode']:<12}{r['coverage']:>9}%{r['queries_ok']:>10}/{len(gold):<3}{len(r['critical_fail']):>13}"
              f"{len(r['forbid']):>12}{r['ctx_coverage']:>12}%{r['avg_chars']:>11}{r['avg_tokens']:>16}")
    if a.misses:
        for r in out:
            print(f"\n{r['code']} {r['mode']}: falla {sorted(set(r['misses']))} · críticas {r['critical_fail']} · prohibidas {r['forbid']} · sin excepciones {r['ctx_miss']}")
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
