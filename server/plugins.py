"""
Plugins para Maestro: el mismo formato que los plugins de Claude Code.

Un plugin es una carpeta con un manifiesto .claude-plugin/plugin.json y, dentro, piezas:
  skills/<nombre>/SKILL.md   conocimiento experto  -> Maestro las carga igual que las skills sueltas
  commands/<nombre>.md       comandos (/nombre)    -> los puedes usar en el chat de Maestro
  agents/<nombre>.md         subagentes            -> se listan; Maestro no los ejecuta
  hooks, .mcp.json, .lsp.json, bin/…               -> son para Claude Code: aquí no se usan

Un repositorio puede ser también un «marketplace» (.claude-plugin/marketplace.json) con una
lista de plugins. Se instalan en my-plugins/<plugin>/ (en tu ordenador, fuera de git),
copiando SOLO archivos de texto (.md, .json, .yaml, .txt, LICENSE, NOTICE): nada ejecutable.

Descarga: con git si lo tienes (git clone --depth 1), si no con el .tar.gz de GitHub.
Solo biblioteca estándar.
"""
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.request

import net

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN_DIR = os.path.join(ROOT, "my-plugins")

TEXT_EXT = (".md", ".json", ".yaml", ".yml", ".txt")
MAX_FILE = 400_000
MAX_FILES = 2000
MAX_TOTAL = 40_000_000

REPO_RE = re.compile(r"^(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?(?:/(?:tree|blob)/([^/]+)(?:/(.*?))?)?/?(?:[?#].*)?$")
SHORT_RE = re.compile(r"^([\w.-]+)/([\w.-]+)$")


class PluginError(Exception):
    pass


def _slug(s):
    return re.sub(r"[^a-z0-9-]+", "-", str(s or "").lower()).strip("-")


def _keep(name):
    n = name.lower()
    return n.endswith(TEXT_EXT) or name.upper().startswith(("LICENSE", "NOTICE", "COPYING"))


def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# ------------------------------------------------------------------ descargar

def parse_url(url):
    """github.com/usuario/repo[/tree/rama/carpeta] o usuario/repo -> (owner, repo, ref, path)."""
    url = (url or "").strip()
    m = REPO_RE.match(url)
    if m:
        owner, repo, ref, path = m.groups()
        return owner, repo, ref or "", (path or "").strip("/")
    m = SHORT_RE.match(url)
    if m:
        return m.group(1), m.group(2), "", ""
    raise PluginError("Pega el enlace de GitHub del plugin o del marketplace (https://github.com/usuario/repo)")


def _copy_text_tree(src, dst):
    """Copia solo archivos de texto, sin enlaces simbólicos ni carpetas ocultas (salvo .claude-plugin)."""
    count, total = 0, 0
    for base, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if (not d.startswith(".") or d == ".claude-plugin") and d not in ("node_modules", "__pycache__")
                   and not os.path.islink(os.path.join(base, d))]
        for fn in files:
            p = os.path.join(base, fn)
            if os.path.islink(p) or not _keep(fn):
                continue
            size = os.path.getsize(p)
            if size > MAX_FILE:
                continue
            count += 1
            total += size
            if count > MAX_FILES or total > MAX_TOTAL:
                raise PluginError("El plugin es demasiado grande")
            rel = os.path.relpath(p, src)
            t = os.path.join(dst, rel)
            os.makedirs(os.path.dirname(t), exist_ok=True)
            shutil.copyfile(p, t)


def _git(owner, repo, ref, dest):
    git = shutil.which("git")
    if not git:
        return False
    cmd = [git, "clone", "--depth", "1", "--quiet"] + (["--branch", ref] if ref else []) + \
          [f"https://github.com/{owner}/{repo}.git", dest]
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=env)
    except (OSError, subprocess.TimeoutExpired):
        return False
    if r.returncode != 0:
        print(f"[plugins] git: {r.stderr.strip()[:300]}")
        shutil.rmtree(dest, ignore_errors=True)
        return False
    return True


def _tarball(owner, repo, ref, dest):
    url = f"https://codeload.github.com/{owner}/{repo}/tar.gz/{ref or 'HEAD'}"
    req = urllib.request.Request(url, headers={"User-Agent": "tidal-studio/0.1"})
    try:
        with net.urlopen(req, timeout=120) as r:
            data = r.read(200_000_000)
    except urllib.error.HTTPError as e:
        raise PluginError(f"GitHub respondió {e.code}: ¿el repositorio existe y es público?")
    except urllib.error.URLError as e:
        raise PluginError(f"No se pudo descargar el plugin: {e.reason}{net.ssl_hint(e.reason)}")
    os.makedirs(dest, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        for m in tf.getmembers():
            if not m.isfile():
                continue
            parts = m.name.split("/")[1:]  # quitar la carpeta «repo-rama/»
            if not parts or ".." in parts or parts[-1] == "" or m.size > MAX_FILE or not _keep(parts[-1]):
                continue
            t = os.path.join(dest, *parts)
            os.makedirs(os.path.dirname(t), exist_ok=True)
            f = tf.extractfile(m)
            if f:
                with open(t, "wb") as out:
                    out.write(f.read())
    return True


def fetch(owner, repo, ref=""):
    """Descarga el repositorio a una carpeta temporal (solo texto). Devuelve la carpeta."""
    tmp = tempfile.mkdtemp(prefix="tidal-plugin-")
    raw = os.path.join(tmp, "raw")
    clean = os.path.join(tmp, "repo")
    if _git(owner, repo, ref, raw):
        _copy_text_tree(raw, clean)
    else:
        _tarball(owner, repo, ref, clean)
    shutil.rmtree(raw, ignore_errors=True)
    return tmp, clean


# ------------------------------------------------------------------ leer manifiestos

def _paths(v, default):
    if not v:
        return [default]
    if isinstance(v, str):
        return [v]
    if isinstance(v, list):
        return [x for x in v if isinstance(x, str)]
    return [default]


def _inside(root, rel):
    p = os.path.normpath(os.path.join(root, rel))
    return p if (p == root or p.startswith(root + os.sep)) else None


def components(folder):
    """Qué trae un plugin: skills, comandos, agentes y piezas que aquí no se usan."""
    man = _load_json(os.path.join(folder, ".claude-plugin", "plugin.json")) or {}
    skills, commands, agents, other = [], [], [], []
    seen = set()
    skill_roots = _paths(man.get("skills"), "skills") + (["skills"] if man.get("skills") else [])
    for rel in skill_roots:
        d = _inside(folder, rel)
        if not d or not os.path.isdir(d):
            continue
        if os.path.isfile(os.path.join(d, "SKILL.md")):
            cands = [d]
        else:
            cands = [os.path.join(d, e) for e in sorted(os.listdir(d))]
        for c in cands:
            if os.path.isfile(os.path.join(c, "SKILL.md")) and c not in seen:
                seen.add(c)
                skills.append(os.path.relpath(c, folder).replace(os.sep, "/"))
    for key, default, out in (("commands", "commands", commands), ("agents", "agents", agents)):
        for rel in _paths(man.get(key), default) + ([default] if man.get(key) else []):
            p = _inside(folder, rel)
            if not p:
                continue
            if os.path.isfile(p) and p.endswith(".md"):
                files = [p]
            elif os.path.isdir(p):
                files = []
                for base, dirs, fns in os.walk(p):
                    files += [os.path.join(base, f) for f in sorted(fns) if f.endswith(".md")]
            else:
                continue
            for f in files:
                r = os.path.relpath(f, folder).replace(os.sep, "/")
                if r not in out:
                    out.append(r)
    if man.get("hooks") or os.path.isfile(os.path.join(folder, "hooks", "hooks.json")):
        other.append("hooks")
    if man.get("mcpServers") or os.path.isfile(os.path.join(folder, ".mcp.json")):
        other.append("MCP")
    if man.get("lspServers") or os.path.isfile(os.path.join(folder, ".lsp.json")):
        other.append("LSP")
    if man.get("outputStyles") or os.path.isdir(os.path.join(folder, "output-styles")):
        other.append("output styles")
    return man, skills, commands, agents, other


def _find_plugins(repo_root, path, repo_name=""):
    """Devuelve (marketplace|None, [(nombre, carpeta, entrada)])."""
    base = _inside(repo_root, path) if path else repo_root
    if not base or not os.path.isdir(base):
        raise PluginError("No encuentro esa carpeta en el repositorio")
    mk = _load_json(os.path.join(base, ".claude-plugin", "marketplace.json"))
    if mk and isinstance(mk.get("plugins"), list):
        root_hint = ((mk.get("metadata") or {}).get("pluginRoot") or "").strip("./")
        out = []
        for e in mk["plugins"]:
            if not isinstance(e, dict) or not e.get("name"):
                continue
            src = e.get("source")
            if isinstance(src, str):
                rel = src
                if root_hint and not src.startswith(("./", "../")):
                    rel = os.path.join(root_hint, src)
                d = _inside(repo_root, os.path.relpath(os.path.normpath(os.path.join(base, rel)), repo_root))
                out.append((e["name"], d if d and os.path.isdir(d) else None, e))
            elif isinstance(src, dict) and src.get("source") == "github" and src.get("repo"):
                out.append((e["name"], None, e))  # vive en otro repositorio: se instala aparte
            else:
                out.append((e["name"], None, e))
        return mk, out
    if os.path.isfile(os.path.join(base, ".claude-plugin", "plugin.json")) or os.path.isdir(os.path.join(base, "skills")):
        man = _load_json(os.path.join(base, ".claude-plugin", "plugin.json")) or {}
        fallback = os.path.basename(base.rstrip(os.sep)) if path else repo_name
        return None, [(man.get("name") or fallback, base, {})]
    raise PluginError("Ese repositorio no parece un plugin: no tiene .claude-plugin/plugin.json ni marketplace.json")


def _license_text(folder, repo_root):
    for d in (folder, repo_root):
        for fn in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"):
            p = os.path.join(d, fn)
            if os.path.isfile(p):
                return p
    return None


def _guess_license(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            t = f.read(800)
    except OSError:
        return ""
    for k, name in (("Attribution 4.0", "CC-BY-4.0"), ("MIT License", "MIT"), ("CC0", "CC0-1.0"), ("Apache License", "Apache-2.0"),
                    ("GNU AFFERO", "AGPL-3.0"), ("GNU GENERAL PUBLIC", "GPL-3.0"), ("BSD", "BSD")):
        if k in t:
            return name
    return ""


def _summary(name, folder, entry):
    man, skills, commands, agents, other = components(folder) if folder else ({}, [], [], [], [])
    return {
        "name": _slug(man.get("name") or name) or _slug(name),
        "description": str(entry.get("description") or man.get("description") or "")[:600],
        "version": str(man.get("version") or entry.get("version") or ""),
        "skills": len(skills), "commands": len(commands), "agents": len(agents), "other": other,
        "installable": bool(folder) or bool(isinstance(entry.get("source"), dict) and entry["source"].get("source") == "github" and entry["source"].get("repo")),
        "reason": "" if folder else "Usa un origen que Tidal Studio no sabe descargar (solo carpetas del mismo repositorio o repositorios de GitHub)",
        "repo": (entry.get("source") or {}).get("repo", "") if isinstance(entry.get("source"), dict) else "",
    }


# ------------------------------------------------------------------ instalar

def install(url, names=None):
    """Instala uno o varios plugins desde un repo de GitHub (plugin suelto o marketplace).
    Si el marketplace trae varios y no dices cuáles, devuelve {"choose": [...]} sin instalar."""
    owner, repo, ref, path = parse_url(url)
    tmp, root = fetch(owner, repo, ref)
    try:
        mk, found = _find_plugins(root, path, repo)
        if not found:
            raise PluginError("El marketplace no tiene plugins")
        summaries = [_summary(n, d, e) for n, d, e in found]
        if names is None and len(found) > 1:
            return {"choose": summaries, "marketplace": (mk or {}).get("name", repo)}
        want = None if names is None else {_slug(n) for n in names}
        os.makedirs(PLUGIN_DIR, exist_ok=True)
        done = []
        for (n, d, e), s in zip(found, summaries):
            if want is not None and s["name"] not in want:
                continue
            if not d and s["repo"]:
                # el plugin vive en otro repositorio de GitHub: lo instalamos desde allí
                src = e.get("source") or {}
                sub = f"https://github.com/{s['repo']}" + (f"/tree/{src['ref']}/{src['path']}" if src.get("ref") and src.get("path") else
                                                           f"/tree/{src['ref']}" if src.get("ref") else "")
                done += install(sub, None).get("installed", [])
                continue
            if not d:
                if want is not None or len(found) == 1:
                    raise PluginError(f"«{s['name']}»: {s['reason']}" + (f" (github.com/{s['repo']})" if s["repo"] else ""))
                continue
            dest = os.path.join(PLUGIN_DIR, s["name"])
            stage = dest + ".tmp"
            shutil.rmtree(stage, ignore_errors=True)
            _copy_text_tree(d, stage)
            lic = _license_text(d, root)
            if lic and not any(os.path.isfile(os.path.join(stage, f)) for f in ("LICENSE", "LICENSE.md", "LICENSE.txt")):
                shutil.copyfile(lic, os.path.join(stage, "LICENSE"))
            notice = os.path.join(root, "NOTICE")
            if os.path.isfile(notice) and not os.path.isfile(os.path.join(stage, "NOTICE")):
                shutil.copyfile(notice, os.path.join(stage, "NOTICE"))
            man = _load_json(os.path.join(d, ".claude-plugin", "plugin.json")) or {}
            author = man.get("author") or e.get("author") or (mk or {}).get("owner") or {}
            source = {
                "url": f"https://github.com/{owner}/{repo}" + (f"/tree/{ref}/{path}" if ref and path else ""),
                "repo": f"{owner}/{repo}", "ref": ref,
                "path": os.path.relpath(d, root).replace(os.sep, "/"),
                "marketplace": (mk or {}).get("name", ""),
                "license": str(man.get("license") or e.get("license") or (_guess_license(lic) if lic else "")),
                "author": author.get("name", "") if isinstance(author, dict) else str(author),
                "homepage": str(man.get("homepage") or e.get("homepage") or ""),
            }
            with open(os.path.join(stage, "PLUGIN-SOURCE.json"), "w", encoding="utf-8") as f:
                json.dump(source, f, indent=2, ensure_ascii=False)
            shutil.rmtree(dest, ignore_errors=True)
            os.replace(stage, dest)
            done.append(s["name"])
        if not done:
            raise PluginError("No había ningún plugin que se pudiera instalar")
        return {"installed": done}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def remove(name):
    name = _slug(name)
    d = os.path.join(PLUGIN_DIR, name)
    if not name or not os.path.isdir(d):
        raise PluginError("No encuentro ese plugin")
    shutil.rmtree(d, ignore_errors=True)
    return True


# ------------------------------------------------------------------ listar y usar

def _md_meta(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read(MAX_FILE)
    except OSError:
        return {}, ""
    import skills as skillset  # import tardío: skills.py también importa este módulo
    return skillset._parse_frontmatter(text)


def scan(cfg=None):
    pl = (cfg or {}).get("plugins") or {}
    disabled = set(pl.get("disabled") or [])
    out = []
    if not os.path.isdir(PLUGIN_DIR):
        return out
    for entry in sorted(os.listdir(PLUGIN_DIR)):
        folder = os.path.join(PLUGIN_DIR, entry)
        if entry.endswith(".tmp") or not os.path.isdir(folder):
            continue
        man, skills, commands, agents, other = components(folder)
        src = _load_json(os.path.join(folder, "PLUGIN-SOURCE.json")) or {}
        cmds = []
        for c in commands:
            meta, _ = _md_meta(os.path.join(folder, c))
            cmds.append({"name": _slug(os.path.splitext(os.path.basename(c))[0]), "file": c,
                         "description": re.sub(r"\s+", " ", str(meta.get("description") or ""))[:240],
                         "hint": str(meta.get("argument-hint") or "")[:80]})
        ags = []
        for a in agents:
            meta, _ = _md_meta(os.path.join(folder, a))
            ags.append({"name": str(meta.get("name") or os.path.splitext(os.path.basename(a))[0]),
                        "description": re.sub(r"\s+", " ", str(meta.get("description") or ""))[:240]})
        lic = src.get("license") or str(man.get("license") or "")
        if not lic:
            p = _license_text(folder, folder)
            lic = _guess_license(p) if p else ""
        out.append({
            "name": entry,
            "title": str(man.get("name") or entry),
            "description": str(man.get("description") or "")[:600],
            "version": str(man.get("version") or ""),
            "author": src.get("author") or "",
            "license": lic,
            "url": src.get("url") or "",
            "homepage": src.get("homepage") or "",
            "marketplace": src.get("marketplace") or "",
            "notice": os.path.isfile(os.path.join(folder, "NOTICE")),
            "enabled": entry not in disabled,
            "skills": [s.rsplit("/", 1)[-1] for s in skills],
            "commands": cmds,
            "agents": ags,
            "other": other,
            "_folder": folder,
            "_skill_dirs": [os.path.join(folder, *s.split("/")) for s in skills],
        })
    return out


def public(plugins):
    return [{k: v for k, v in p.items() if not k.startswith("_")} for p in plugins]


def source_of(name):
    """Origen y licencia de un plugin instalado (para las skills que trae)."""
    folder = os.path.join(PLUGIN_DIR, _slug(name))
    src = _load_json(os.path.join(folder, "PLUGIN-SOURCE.json")) or {}
    if not src.get("license"):
        man = _load_json(os.path.join(folder, ".claude-plugin", "plugin.json")) or {}
        lic = man.get("license") or ""
        if not lic:
            p = _license_text(folder, folder)
            lic = _guess_license(p) if p else ""
        src["license"] = lic
    return {k: src.get(k, "") for k in ("license", "url", "author")}


def skill_dirs(cfg=None):
    """Carpetas de skills de los plugins ACTIVOS: [(carpeta, plugin)]."""
    out = []
    for p in scan(cfg):
        if p["enabled"]:
            out += [(d, p["name"]) for d in p["_skill_dirs"]]
    return out


def expand_command(cfg, text):
    """Si el mensaje empieza por /comando (o /plugin:comando), lo cambia por el texto del comando.
    Devuelve (texto, {"plugin", "command"}|None)."""
    m = re.match(r"^\s*/([\w.-]+)(?::([\w.-]+))?(?:\s+(.*))?$", text or "", re.S)
    if not m:
        return text, None
    a, b, args = m.group(1).lower(), (m.group(2) or "").lower(), (m.group(3) or "").strip()
    plug, cmd = (a, b) if b else (None, a)
    for p in scan(cfg):
        if not p["enabled"] or (plug and p["name"] != plug):
            continue
        for c in p["commands"]:
            if c["name"] == cmd:
                _, body = _md_meta(os.path.join(p["_folder"], c["file"]))
                body = body.strip()
                parts = args.split()
                body = body.replace("$ARGUMENTS", args)
                for i in range(9, 0, -1):
                    body = body.replace(f"${i}", parts[i - 1] if len(parts) >= i else "")
                if args and args not in body:
                    body += "\n\n" + args
                return (f"(Comando /{p['name']}:{cmd} del plugin «{p['title']}»)\n{body}",
                        {"plugin": p["name"], "command": cmd})
    return text, None
