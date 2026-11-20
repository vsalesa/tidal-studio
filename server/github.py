"""
Integración con GitHub: guarda cada canción como una carpeta en un repositorio tuyo.

  songs/<nombre>/song.tidal   el código completo, listo para pegar en cualquier editor de Tidal
  songs/<nombre>/song.json    el proyecto de Tidal Studio (pistas, BPM, estilo…) para volver a abrirlo
  songs/<nombre>/README.md    ficha de la canción (se ve bonita en GitHub)

Cada guardado es UN commit, así que el historial del repo es el historial de versiones de tu canción.
Solo biblioteca estándar. El token se guarda únicamente en config.json, en tu ordenador.
"""
import base64
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import net


EN = {
    "el token no es válido o ha caducado": "the token is invalid or expired",
    "el token no tiene permiso (necesita acceso de escritura a «Contents»)": "the token has no permission (it needs write access to «Contents»)",
    "no encuentro el repositorio (¿nombre correcto? ¿el token tiene acceso a él?)": "repository not found (right name? does the token have access to it?)",
    "el repositorio está vacío o hay un conflicto": "the repository is empty or there is a conflict",
    "GitHub no acepta los datos": "GitHub doesn't accept the data",
    "No se pudo conectar con GitHub": "Couldn't connect to GitHub",
    "Falta el token de GitHub": "The GitHub token is missing",
    "No encuentro la canción": "Song not found:",
    "(falta song.json)": "(song.json is missing)",
}


def translate(msg, lang):
    if lang != "en":
        return msg
    for es, en in EN.items():
        msg = msg.replace(es, en)
    return msg


class GitHubError(Exception):
    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status


def slugify(name):
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60] or "cancion"


def _cfg(cfg):
    g = cfg.get("github") or {}
    return {
        "token": (g.get("token") or "").strip(),
        "repo": (g.get("repo") or "").strip().strip("/"),
        "branch": (g.get("branch") or "main").strip() or "main",
        "folder": (g.get("folder") or "songs").strip().strip("/") or "songs",
        "api_url": (g.get("api_url") or "https://api.github.com").rstrip("/"),
    }


def configured(cfg):
    g = _cfg(cfg)
    return bool(g["token"] and re.fullmatch(r"[\w.-]+/[\w.-]+", g["repo"]))


def _req(g, method, path, body=None, ok404=False):
    url = path if path.startswith("http") else g["api_url"] + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {g['token']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tidal-studio",
        **({"Content-Type": "application/json"} if data else {}),
    })
    try:
        with net.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code == 404 and ok404:
            return None
        try:
            msg = json.loads(e.read().decode("utf-8")).get("message", "")
        except Exception:
            msg = ""
        hints = {401: "el token no es válido o ha caducado", 403: "el token no tiene permiso (necesita acceso de escritura a «Contents»)",
                 404: "no encuentro el repositorio (¿nombre correcto? ¿el token tiene acceso a él?)",
                 409: "el repositorio está vacío o hay un conflicto", 422: "GitHub no acepta los datos"}
        raise GitHubError(f"GitHub {e.code}: {hints.get(e.code, msg or 'error')}" + (f" ({msg})" if msg and e.code in hints else ""), e.code)
    except urllib.error.URLError as e:
        raise GitHubError(f"No se pudo conectar con GitHub: {e.reason}")


def _paths(g, slug):
    base = f"{g['folder']}/{slug}"
    return base, f"/repos/{g['repo']}"


# ------------------------------------------------------------------ acciones
def test(cfg):
    g = _cfg(cfg)
    if not g["token"]:
        raise GitHubError("Falta el token de GitHub")
    user = _req(g, "GET", "/user")
    out = {"login": user.get("login"), "repo": g["repo"], "repo_exists": False}
    if g["repo"]:
        repo = _req(g, "GET", f"/repos/{g['repo']}", ok404=True)
        if repo:
            out.update(repo_exists=True, private=repo.get("private"), html_url=repo.get("html_url"),
                       can_push=bool((repo.get("permissions") or {}).get("push", True)))
    return out


def create_repo(cfg):
    g = _cfg(cfg)
    owner, name = (g["repo"].split("/", 1) + [""])[:2]
    me = _req(g, "GET", "/user").get("login")
    body = {"name": name, "private": True, "auto_init": True,
            "description": "Mis canciones hechas con Tidal Studio (TidalCycles)"}
    if owner.lower() == (me or "").lower():
        repo = _req(g, "POST", "/user/repos", body)
    else:
        repo = _req(g, "POST", f"/orgs/{owner}/repos", body)
    return {"html_url": repo.get("html_url"), "full_name": repo.get("full_name")}


def song_files(project):
    """Convierte un proyecto de Tidal Studio en los tres ficheros de la canción."""
    name = project.get("name") or "Canción sin título"
    bpm = project.get("bpm") or 120
    tracks = project.get("tracks") or []
    lines = [f"-- {name}", f"-- Hecho con Tidal Studio · {bpm} BPM", "", f"setcps ({bpm}/60/4)", ""]
    for t in tracks:
        lines.append(f"-- {t.get('name', t.get('id'))} ({t.get('kind', '')})")
        lines.append(f"{t.get('id')} $ {t.get('code', '')}" if not t.get("muted") else f"{t.get('id')} silence -- silenciada: {t.get('code', '')}")
        lines.append("")
    tidal = "\n".join(lines)
    keep = {k: project.get(k) for k in ("name", "bpm", "style", "tracks", "projectId") if k in project}
    keep["tracks"] = [{k: t.get(k) for k in ("id", "name", "kind", "code", "muted")} for t in tracks]
    readme = [f"# {name}", "", f"**{bpm} BPM**" + (f" · {project.get('style')}" if project.get("style") else "") + f" · {len(tracks)} pistas", "",
              "| Pista | Nombre | Código |", "|---|---|---|"]
    for t in tracks:
        code = (t.get("code") or "").replace("|", "\\|").replace("\n", " ")
        readme.append(f"| `{t.get('id')}` | {t.get('name', '')} | `{code}` |")
    readme += ["", "Abre `song.tidal` en tu editor de TidalCycles, o abre la canción desde Tidal Studio (Mis proyectos → GitHub).", ""]
    return {"song.tidal": tidal, "song.json": json.dumps(keep, ensure_ascii=False, indent=2), "README.md": "\n".join(readme)}


def save_song(cfg, project, message="", slug=None):
    g = _cfg(cfg)
    slug = slug or slugify(project.get("name"))
    base, repo = _paths(g, slug)
    files = song_files(project)
    message = (message or "").strip() or f"Guardo «{project.get('name') or slug}»"
    ref = _req(g, "GET", f"{repo}/git/ref/heads/{urllib.parse.quote(g['branch'])}", ok404=True)
    if ref and ref.get("object"):
        # Un único commit con los tres ficheros (API de datos de Git)
        head = ref["object"]["sha"]
        base_tree = _req(g, "GET", f"{repo}/git/commits/{head}")["tree"]["sha"]
        tree = _req(g, "POST", f"{repo}/git/trees", {"base_tree": base_tree, "tree": [
            {"path": f"{base}/{n}", "mode": "100644", "type": "blob", "content": c} for n, c in files.items()]})
        if tree.get("sha") == base_tree:
            return {"slug": slug, "unchanged": True, "html_url": f"https://github.com/{g['repo']}/tree/{g['branch']}/{base}"}
        commit = _req(g, "POST", f"{repo}/git/commits", {"message": message, "tree": tree["sha"], "parents": [head]})
        _req(g, "PATCH", f"{repo}/git/refs/heads/{urllib.parse.quote(g['branch'])}", {"sha": commit["sha"]})
        sha, url = commit["sha"], commit.get("html_url")
    else:
        # Repositorio vacío: la API de contenidos crea la rama con el primer fichero
        sha = url = None
        for n, c in files.items():
            r = _req(g, "PUT", f"{repo}/contents/{base}/{n}", {"message": message, "branch": g["branch"],
                                                                 "content": base64.b64encode(c.encode("utf-8")).decode()})
            sha = r["commit"]["sha"]; url = r["commit"].get("html_url")
    return {"slug": slug, "sha": sha, "commit_url": url or f"https://github.com/{g['repo']}/commit/{sha}",
            "html_url": f"https://github.com/{g['repo']}/tree/{g['branch']}/{base}"}


def list_songs(cfg):
    g = _cfg(cfg)
    items = _req(g, "GET", f"/repos/{g['repo']}/contents/{g['folder']}?ref={urllib.parse.quote(g['branch'])}", ok404=True) or []
    return [{"slug": it["name"], "html_url": it.get("html_url")} for it in items if it.get("type") == "dir"]


def load_song(cfg, slug, ref=None):
    g = _cfg(cfg)
    base, repo = _paths(g, slug)
    r = _req(g, "GET", f"{repo}/contents/{base}/song.json?ref={urllib.parse.quote(ref or g['branch'])}", ok404=True)
    if not r or "content" not in r:
        raise GitHubError(f"No encuentro la canción «{slug}» (falta song.json)", 404)
    data = json.loads(base64.b64decode(r["content"]).decode("utf-8"))
    data["github"] = {"slug": slug, "ref": ref or g["branch"]}
    return data


def history(cfg, slug, limit=20):
    g = _cfg(cfg)
    base, repo = _paths(g, slug)
    commits = _req(g, "GET", f"{repo}/commits?sha={urllib.parse.quote(g['branch'])}&path={urllib.parse.quote(base)}&per_page={limit}") or []
    return [{"sha": c["sha"], "message": (c.get("commit") or {}).get("message", ""),
             "date": ((c.get("commit") or {}).get("author") or {}).get("date", ""), "html_url": c.get("html_url")} for c in commits]
