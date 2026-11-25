#!/usr/bin/env python3
"""Skills incluidas en el instalador (0.21): copia fijada, licencias y manifiesto.

Herramienta de mantenimiento (no se ejecuta en el ordenador del usuario):

  python3 tools/vendor_music_skills.py --fetch     # clona cada repositorio en su commit fijado y copia SOLO el texto
  python3 tools/vendor_music_skills.py             # rehace skills/BUNDLE-MANIFEST.json con los SHA-256 reales
  python3 tools/vendor_music_skills.py --verify    # comprueba que lo que hay en skills/ es lo del manifiesto (CI)

De cada skill de terceros se copian únicamente SKILL.md y sus referencias Markdown, más el LICENSE del repositorio
y un SOURCE.json con el origen. Nunca scripts, ejecutables, audio, modelos ni dependencias: Maestro no ejecuta nada
de una skill. El manifiesto lista también las tres skills que ya venían con Tidal Studio, así la app sabe qué
archivos son suyos (y puede borrar los que una versión nueva ya no trae sin tocar nada tuyo).
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, "skills")
MANIFEST = os.path.join(SKILLS, "BUNDLE-MANIFEST.json")
VERSION_FILE = os.path.join(ROOT, "packaging", "VERSION")

# Secciones que se indexan pero NO se envían a Maestro: instrucciones para otro agente (scripts, formato de salida
# propio, entrevistas, otras skills que aquí no existen). Maestro tiene su propio contrato de salida.
AGENT_META = ["Execution prerequisites", "Optional customisation pack", "Deterministic tools", "Audio sketches",
              "Technical QC", "References", "Bundled files", "Works well with", "Going further",
              "What to look for in the request", "Output format", "Reporting"]

SB = {"repo": "sb-dev/music-production-skills", "commit": "aa3933bc87f54a48ec018bb868bf6385b340db22",
      "license": "MIT", "author": "Music Production Skills contributors"}
VO = {"repo": "Vocaler-AI/music-skills", "commit": "4479796b9f05e2fc300fee1a848b0effa1993b8a",
      "license": "MIT", "author": "Vocaler"}

# Las seis de la spec 0.21 (copiadas por --fetch) y las tres que ya venían (copiadas a mano en versiones anteriores)
THIRD_PARTY = [
    dict(SB, folder="music-evaluate", path="skills/music-evaluate", default_enabled=True,
         why="Evaluate by lifecycle stage, protect approved/locked decisions, route each defect to the stage that owns it"),
    dict(SB, folder="music-compose", path="skills/music-compose", default_enabled=True,
         why="Alternatives, selected/approved/locked decision states, scoped revision"),
    dict(VO, folder="arrangement-advisor", path="skills/arrangement-advisor", default_enabled=True,
         why="What plays in each section, builds and drops, fixing a static or crowded track"),
    dict(VO, folder="melody-writer", path="skills/melody-writer", default_enabled=True,
         why="Motif, phrase, contour and range for toplines and lead lines"),
    dict(VO, folder="hook-writer", path="skills/hook-writer", default_enabled=True,
         why="Memorable hooks: repeated rhythmic and melodic motifs, chorus lift"),
    dict(VO, folder="prosody-checker", path="skills/prosody-checker", default_enabled=False,
         why="Lyric stress and syllables against the beat; off unless you write lyrics"),
]
EARLIER = [
    {"folder": "livecoding", "repo": "broomva/skills", "commit": "7fcf46bfc5767ca2aeacb077d52f203bf7f4fc49",
     "path": "skills/audio/livecoding", "license": "MIT", "author": "broomva", "default_enabled": True},
    {"folder": "strudel", "repo": "ahgraber/skills", "commit": "b347e346d8523310d46415885cd0b6eac11ff3c6",
     "path": "skills/strudel", "license": "CC0-1.0", "author": "ahgraber", "default_enabled": True},
    {"folder": "music-composition", "repo": "SJY051/music-composition", "commit": "07cecf9c8fd15249ea3da311dc9a7c7893ff801f",
     "path": "", "license": "CC-BY-4.0", "author": "SJY051", "default_enabled": True},
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def fetch():
    with tempfile.TemporaryDirectory() as tmp:
        clones = {}
        for s in THIRD_PARTY:
            if s["repo"] not in clones:
                d = os.path.join(tmp, s["repo"].replace("/", "_"))
                subprocess.run(["git", "clone", "-q", f"https://github.com/{s['repo']}", d], check=True)
                subprocess.run(["git", "-C", d, "checkout", "-q", s["commit"]], check=True)
                clones[s["repo"]] = d
            src = os.path.join(clones[s["repo"]], s["path"])
            dst = os.path.join(SKILLS, s["folder"])
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            os.makedirs(dst)
            copied = []
            for base, dirs, files in os.walk(src):
                dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in ("scripts", "evals", "assets", "node_modules"))
                for fn in sorted(files):
                    p = os.path.join(base, fn)
                    if not fn.endswith(".md") or os.path.islink(p):
                        continue
                    rel = os.path.relpath(p, src)
                    os.makedirs(os.path.dirname(os.path.join(dst, rel)), exist_ok=True)
                    shutil.copyfile(p, os.path.join(dst, rel))
                    copied.append(rel.replace(os.sep, "/"))
            shutil.copyfile(os.path.join(clones[s["repo"]], "LICENSE"), os.path.join(dst, "LICENSE"))
            with open(os.path.join(dst, "SOURCE.json"), "w", encoding="utf-8") as f:
                json.dump({"url": f"https://github.com/{s['repo']}/tree/{s['commit']}/{s['path']}", "license": s["license"],
                           "author": s["author"], "commit": s["commit"], "copied": copied,
                           "note": "Text files only, copied verbatim. Scripts, evals and assets were left out: Tidal Studio never runs them."},
                          f, indent=2)
                f.write("\n")
            print(f"{s['folder']}: {len(copied)} archivo(s) de {s['repo']}@{s['commit'][:7]}")


def build_manifest():
    try:
        version = open(VERSION_FILE).read().strip()
    except OSError:
        version = "dev"
    out = []
    for s in EARLIER + THIRD_PARTY:
        folder = os.path.join(SKILLS, s["folder"])
        if not os.path.isfile(os.path.join(folder, "SKILL.md")):
            continue
        files = []
        for base, dirs, names in os.walk(folder):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "__pycache__")
            for fn in sorted(names):
                p = os.path.join(base, fn)
                if fn.startswith(".") or os.path.islink(p):
                    continue
                files.append({"path": os.path.relpath(p, SKILLS).replace(os.sep, "/"), "sha256": sha256(p), "size": os.path.getsize(p)})
        out.append({
            "id": "builtin:" + s["folder"], "folder": s["folder"], "upstream": s["repo"], "commit": s["commit"],
            "upstream_path": s["path"], "license": s["license"], "author": s["author"],
            "default_enabled": s["default_enabled"], "execution_supported": False,
            "skip_headings": AGENT_META if s in THIRD_PARTY else [],
            "why": s.get("why", ""), "files": files,
        })
    return {"schema_version": 1, "bundle_id": "tidal-studio-skills", "bundle_version": version, "files_root": "skills",
            "skills": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.fetch:
        fetch()
    m = build_manifest()
    if a.verify:
        try:
            cur = json.load(open(MANIFEST, encoding="utf-8"))
        except (OSError, ValueError):
            print("No hay manifiesto")
            return 1
        strip = lambda x: [{k: v for k, v in s.items()} for s in x["skills"]]  # noqa: E731
        if strip(cur) != strip(m):
            print("skills/ no coincide con BUNDLE-MANIFEST.json: ejecuta tools/vendor_music_skills.py")
            return 1
        print(f"OK: {len(m['skills'])} skills, {sum(len(s['files']) for s in m['skills'])} archivos")
        return 0
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"Manifiesto: {len(m['skills'])} skills, {sum(len(s['files']) for s in m['skills'])} archivos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
