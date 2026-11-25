"""
Integración con GitHub: guarda cada canción como una carpeta en un repositorio tuyo.

  songs/<nombre>/song.tidal   el código completo, listo para pegar en cualquier editor de Tidal
  songs/<nombre>/song.json    el proyecto de Tidal Studio (pistas, BPM, estilo…) para volver a abrirlo
  songs/<nombre>/README.md    ficha de la canción (se ve bonita en GitHub)

Cada guardado es UN commit, así que el historial del repo es el historial de versiones de tu canción.
Solo biblioteca estándar. El token se guarda únicamente en config.json, en tu ordenador.
"""
import xml.etree.ElementTree as ET
import score as scoremod
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


def normalize_repo(value):
    """Acepta «usuario/repo» y también la URL que copias de GitHub:
    https://github.com/usuario/repo(.git), github.com/usuario/repo/tree/main, git@github.com:usuario/repo.git"""
    s = (value or "").strip()
    s = re.sub(r"^(?:https?://)?(?:www\.)?github\.com[/:]", "", s, flags=re.I)
    s = re.sub(r"^git@github\.com:", "", s, flags=re.I)
    parts = [p for p in s.split("/") if p][:2]
    if len(parts) == 2 and parts[1].lower().endswith(".git"):
        parts[1] = parts[1][:-4]
    return "/".join(parts)


def _cfg(cfg):
    g = cfg.get("github") or {}
    return {
        "token": (g.get("token") or "").strip(),
        "repo": normalize_repo(g.get("repo")),
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
    extra = (project.get("extra") or "").strip()
    if extra:
        # Código que no es una pista (let, definiciones, once…): va antes de las pistas, como en el estudio
        lines[5:5] = ["-- Código extra / Extra code", extra, ""]
    tidal = "\n".join(lines)
    keep = {k: project.get(k) for k in ("name", "bpm", "style", "tracks", "projectId", "extra") if project.get(k) not in (None, "")}
    keep["tracks"] = [{k: t.get(k) for k in ("id", "name", "kind", "code", "muted", "fromScore") if t.get(k) not in (None, "")} for t in tracks]
    sc = scoremod.normalize(project.get("score")) if project.get("score") else None
    readme = [f"# {name}", "", f"**{bpm} BPM**" + (f" · {project.get('style')}" if project.get("style") else "") + f" · {len(tracks)} pistas", "",
              "| Pista | Nombre | Código |", "|---|---|---|"]
    for t in tracks:
        code = (t.get("code") or "").replace("|", "\\|").replace("\n", " ")
        readme.append(f"| `{t.get('id')}` | {t.get('name', '')} | `{code}` |")
    readme += ["", "Abre `song.tidal` en tu editor de TidalCycles, o abre la canción desde Tidal Studio (Mis proyectos → GitHub).", ""]
    out = {"song.tidal": tidal, "song.json": json.dumps(keep, ensure_ascii=False, indent=2), "README.md": "\n".join(readme)}
    if sc and sc["parts"]:
        # El bloque de composición: song.tidal + song.musicxml (melodía, acordes y bajo; se abre en MuseScore)
        out["song.musicxml"] = scoremod.to_musicxml(sc, name)
        out["README.md"] = out["README.md"].replace("Abre `song.tidal`", "La partitura (melodía, acordes y bajo) está en `song.musicxml`: ábrela en MuseScore.\n\nAbre `song.tidal`")
    return out


def _branch_head(g, repo):
    """Devuelve el commit de la rama, creándola si hace falta.

    Un repositorio recién creado en GitHub sin README no tiene ningún commit: la API de datos de Git
    responde 409 «Git Repository is empty» y no se puede crear un árbol ni una rama. En ese caso hago
    un primer commit con la API de contenidos (que sí funciona con repos vacíos) y sigo como siempre.
    """
    branch = urllib.parse.quote(g["branch"])
    try:
        ref = _req(g, "GET", f"{repo}/git/ref/heads/{branch}", ok404=True)
    except GitHubError as e:
        if e.status != 409:
            raise
        ref, empty = None, True
    else:
        empty = False
    if ref and ref.get("object"):
        return ref["object"]["sha"]
    if empty:
        readme = (f"# {g['repo'].split('/')[-1]}\n\nMis canciones hechas con Tidal Studio (TidalCycles). "
                  f"Cada canción está en `{g['folder']}/<nombre>/`.\n\n"
                  f"My songs made with Tidal Studio (TidalCycles). Each song lives in `{g['folder']}/<name>/`.\n")
        # Sin «branch»: en un repo vacío GitHub crea la rama por defecto con este commit
        r = _req(g, "PUT", f"{repo}/contents/README.md", {"message": "Primer commit: repositorio de canciones de Tidal Studio",
                                                         "content": base64.b64encode(readme.encode("utf-8")).decode()})
        sha = r["commit"]["sha"]
        default = (_req(g, "GET", repo) or {}).get("default_branch") or g["branch"]
        if default == g["branch"]:
            return sha
    else:
        # El repo tiene commits pero no existe la rama configurada: la creo desde la rama por defecto
        default = _req(g, "GET", repo)["default_branch"]
        sha = _req(g, "GET", f"{repo}/git/ref/heads/{urllib.parse.quote(default)}")["object"]["sha"]
    _req(g, "POST", f"{repo}/git/refs", {"ref": f"refs/heads/{g['branch']}", "sha": sha})
    return sha


def save_song(cfg, project, message="", slug=None):
    g = _cfg(cfg)
    slug = slug or slugify(project.get("name"))
    base, repo = _paths(g, slug)
    files = song_files(project)
    message = (message or "").strip() or f"Guardo «{project.get('name') or slug}»"
    head = _branch_head(g, repo)
    # Un único commit con los tres ficheros (API de datos de Git)
    base_tree = _req(g, "GET", f"{repo}/git/commits/{head}")["tree"]["sha"]
    tree = _req(g, "POST", f"{repo}/git/trees", {"base_tree": base_tree, "tree": [
        {"path": f"{base}/{n}", "mode": "100644", "type": "blob", "content": c} for n, c in files.items()]})
    if tree.get("sha") == base_tree:
        return {"slug": slug, "unchanged": True, **remote_where(g, slug)}
    commit = _req(g, "POST", f"{repo}/git/commits", {"message": message, "tree": tree["sha"], "parents": [head]})
    _req(g, "PATCH", f"{repo}/git/refs/heads/{urllib.parse.quote(g['branch'])}", {"sha": commit["sha"]})
    sha, url = commit["sha"], commit.get("html_url")
    return {"slug": slug, "sha": sha, "commit_url": url or f"https://github.com/{g['repo']}/commit/{sha}", **remote_where(g, slug)}


def commit_files(cfg, files, message, delete=()):
    """Un commit con varios ficheros {ruta: texto} en la rama configurada (estilos compartidos, copia de la memoria).
    «delete» son rutas que se borran en el mismo commit."""
    g = _cfg(cfg)
    repo = f"/repos/{g['repo']}"
    head = _branch_head(g, repo)
    base_tree = _req(g, "GET", f"{repo}/git/commits/{head}")["tree"]["sha"]
    tree = _req(g, "POST", f"{repo}/git/trees", {"base_tree": base_tree, "tree": [
        {"path": p, "mode": "100644", "type": "blob", "content": c} for p, c in files.items()]
        + [{"path": p, "mode": "100644", "type": "blob", "sha": None} for p in delete if p not in files]})
    if tree.get("sha") == base_tree:
        return {"unchanged": True}
    commit = _req(g, "POST", f"{repo}/git/commits", {"message": message, "tree": tree["sha"], "parents": [head]})
    _req(g, "PATCH", f"{repo}/git/refs/heads/{urllib.parse.quote(g['branch'])}", {"sha": commit["sha"]})
    return {"sha": commit["sha"], "commit_url": commit.get("html_url") or f"https://github.com/{g['repo']}/commit/{commit['sha']}"}


MAX_SYNC_FILES = 400


def read_folder(cfg, folder):
    """Los .json de una carpeta de TU repositorio (rama configurada), con sus subcarpetas: {ruta: texto}.
    Un repositorio vacío, sin esa rama o sin esa carpeta devuelve {} (no hay nada que traer)."""
    g = _cfg(cfg)
    repo = f"/repos/{g['repo']}"
    try:
        tree = _req(g, "GET", f"{repo}/git/trees/{urllib.parse.quote(g['branch'])}?recursive=1", ok404=True)
    except GitHubError as e:
        if e.status == 409:
            return {}
        raise
    out = {}
    for it in (tree or {}).get("tree") or []:
        p = it.get("path") or ""
        if it.get("type") == "blob" and p.startswith(folder + "/") and p.endswith(".json") and (it.get("size") or 0) <= MAX_SHARED:
            if len(out) >= MAX_SYNC_FILES:
                break
            b = _req(g, "GET", f"{repo}/git/blobs/{it['sha']}")
            out[p] = base64.b64decode(b.get("content") or "").decode("utf-8", "replace")
    return out


def fetch_memory(cfg, link):
    """La memoria, los casos y los estilos que otra persona tiene en SU repositorio (carpeta tidal-studio/ o la que
    diga el enlace). Acepta u/r, u/r/carpeta y https://github.com/u/r[/tree/rama/carpeta]. Devuelve {ruta: texto}
    con las rutas relativas a esa carpeta, como «tidal-studio/memories.json»."""
    g = _cfg(cfg)
    link = (link or "").strip()
    m = re.match(r"^(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+)(?:/tree/([^/]+)(?:/(.+?))?)?/?$", link) \
        or re.match(r"^([\w.-]+)/([\w.-]+)()(?:/(.+?))?/?$", link)
    if not m:
        raise GitHubError("No entiendo ese enlace de GitHub")
    owner, repo, ref, path = m.groups()
    repo = repo[:-4] if repo.lower().endswith(".git") else repo
    path = (path or "tidal-studio").strip("/")
    q = f"?ref={urllib.parse.quote(ref)}" if ref else ""
    base = f"{g['api_url']}/repos/{owner}/{repo}/contents/"
    tok = g["token"]
    out = {}
    for name in ("memories.json", "cases.json"):
        try:
            out[f"tidal-studio/{name}"] = _raw_get(base + urllib.parse.quote(f"{path}/{name}") + q, tok)
        except GitHubError as e:
            if e.status not in (404,):
                raise
    try:
        listing = json.loads(_list_get(base + urllib.parse.quote(f"{path}/styles") + q, tok))
    except GitHubError as e:
        if e.status != 404:
            raise
        listing = []
    for x in [x for x in listing if isinstance(x, dict) and x.get("type") == "file" and x.get("name", "").lower().endswith(".json")][:40]:
        out[f"tidal-studio/styles/{x['name']}"] = _raw_get(base + urllib.parse.quote(x["path"]) + q, tok)
    if not out:
        raise GitHubError(f"No encuentro memoria de Tidal Studio en {owner}/{repo}/{path} (¿enlace correcto? ¿repositorio público?)", 404)
    return out


def share_url(cfg, path):
    g = _cfg(cfg)
    return f"https://github.com/{g['repo']}/blob/{urllib.parse.quote(g['branch'])}/{path}"


MAX_SHARED = 300_000


def _raw_get(url, token=""):
    headers = {"User-Agent": "tidal-studio", "Accept": "application/vnd.github.raw+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with net.urlopen(req, timeout=20) as r:
            data = r.read(MAX_SHARED + 1)
    except urllib.error.HTTPError as e:
        raise GitHubError(f"GitHub {e.code}: no encuentro ese estilo (¿enlace correcto? ¿repositorio público?)", e.code)
    except urllib.error.URLError as e:
        raise GitHubError(f"No se pudo conectar con GitHub: {e.reason}")
    if len(data) > MAX_SHARED:
        raise GitHubError("Ese fichero es demasiado grande para ser un estilo")
    return data.decode("utf-8", "replace")


def fetch_shared(cfg, link):
    """Lee uno o varios ficheros .json compartidos en GitHub a partir de un enlace.

    Acepta https://github.com/u/r/blob/rama/ruta.json, https://raw.githubusercontent.com/u/r/rama/ruta.json,
    u/r/ruta.json y u/r (entonces lee todos los .json de su carpeta styles/). Con tu token se pueden leer
    también repositorios privados a los que tengas acceso. Devuelve [(ruta, texto)]."""
    g = _cfg(cfg)
    link = (link or "").strip()
    m = re.match(r"^https?://raw\.githubusercontent\.com/([\w.-]+)/([\w.-]+)/([^/]+)/(.+)$", link)
    if m:
        return [(m.group(4), _raw_get(link))]
    m = re.match(r"^(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+)(?:/(?:blob|tree)/([^/]+)/(.+?))?/?$", link)
    if m:
        owner, repo, ref, path = m.groups()
    else:
        m = re.match(r"^([\w.-]+)/([\w.-]+)(?:/(.+?))?/?$", link)
        if not m:
            raise GitHubError("No entiendo ese enlace de GitHub")
        owner, repo, path = m.groups()
        ref = None
    repo = repo[:-4] if repo.lower().endswith(".git") else repo
    path = (path or "styles").strip("/")
    q = f"?ref={urllib.parse.quote(ref)}" if ref else ""
    api = f"{g['api_url']}/repos/{owner}/{repo}/contents/{urllib.parse.quote(path)}{q}"
    tok = g["token"]
    if path.lower().endswith(".json"):
        return [(path, _raw_get(api, tok))]
    listing = json.loads(_list_get(api, tok))
    files = [x for x in listing if isinstance(x, dict) and x.get("type") == "file" and x.get("name", "").lower().endswith(".json")][:20]
    if not files:
        raise GitHubError("En esa carpeta no hay estilos (.json)")
    return [(x["path"], _raw_get(f"{g['api_url']}/repos/{owner}/{repo}/contents/{urllib.parse.quote(x['path'])}{q}", tok)) for x in files]


def _list_get(url, token=""):
    headers = {"User-Agent": "tidal-studio", "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with net.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as r:
            return r.read(MAX_SHARED).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise GitHubError(f"GitHub {e.code}: no encuentro esa carpeta (¿enlace correcto? ¿repositorio público?)", e.code)
    except urllib.error.URLError as e:
        raise GitHubError(f"No se pudo conectar con GitHub: {e.reason}")


def _empty_ok(fn):
    """En un repo vacío (409) no hay canciones ni historial: devuelvo una lista vacía, no un error."""
    try:
        return fn()
    except GitHubError as e:
        if e.status == 409:
            return []
        raise


def list_songs(cfg):
    g = _cfg(cfg)
    items = _empty_ok(lambda: _req(g, "GET", f"/repos/{g['repo']}/contents/{g['folder']}?ref={urllib.parse.quote(g['branch'])}", ok404=True)) or []
    return [{"slug": it["name"], "html_url": it.get("html_url")} for it in items if it.get("type") == "dir"]


def load_song(cfg, slug, ref=None):
    g = _cfg(cfg)
    base, repo = _paths(g, slug)
    r = _req(g, "GET", f"{repo}/contents/{base}/song.json?ref={urllib.parse.quote(ref or g['branch'])}", ok404=True)
    if not r or "content" not in r:
        raise GitHubError(f"No encuentro la canción «{slug}» (falta song.json)", 404)
    data = json.loads(base64.b64decode(r["content"]).decode("utf-8"))
    # La partitura manda para la melodía, los acordes y el bajo (puede venir editada en MuseScore)
    x = _req(g, "GET", f"{repo}/contents/{base}/song.musicxml?ref={urllib.parse.quote(ref or g['branch'])}", ok404=True)
    if x and "content" in x:
        try:
            data["score"] = scoremod.to_json(scoremod.from_musicxml(base64.b64decode(x["content"]).decode("utf-8", "replace")))
        except (ValueError, ET.ParseError):
            data["score_error"] = "song.musicxml"
    data["github"] = {"slug": slug, "ref": ref or g["branch"], **remote_where(g, slug)}
    return data


def remote_where(g, slug):
    """Dónde vive la canción en GitHub: «usuario/repo/songs/slug» (lo que se enseña en vez de una ruta local)."""
    base = f"{g['folder']}/{slug}"
    return {"repo": g["repo"], "branch": g["branch"], "path": base, "remote": f"{g['repo']}/{base}",
            "html_url": f"https://github.com/{g['repo']}/tree/{urllib.parse.quote(g['branch'])}/{base}"}


def where(cfg):
    """Repo, rama y carpeta configurados (para que la web pinte rutas remotas)."""
    g = _cfg(cfg)
    return {"repo": g["repo"], "branch": g["branch"], "folder": g["folder"]}


def history(cfg, slug, limit=20):
    g = _cfg(cfg)
    base, repo = _paths(g, slug)
    commits = _empty_ok(lambda: _req(g, "GET", f"{repo}/commits?sha={urllib.parse.quote(g['branch'])}&path={urllib.parse.quote(base)}&per_page={limit}")) or []
    return [{"sha": c["sha"], "message": (c.get("commit") or {}).get("message", ""),
             "date": ((c.get("commit") or {}).get("author") or {}).get("date", ""), "html_url": c.get("html_url")} for c in commits]
