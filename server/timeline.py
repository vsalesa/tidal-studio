"""
Línea de tiempo: pregunta a TidalCycles DÓNDE cae cada nota de cada pista.

Arranca un GHCi propio (aparte del que suena, así no se mezclan sus mensajes) con
tidal/Timeline.ghci y le pide `queryArc` de cada patrón entre dos ciclos. Tidal
contesta con cada evento: cuándo empieza y acaba, sus valores (s, n, note…) y la
posición en la mini-notación que lo produce (para enlazarlo con el código).
"""
import os
import queue
import subprocess
import threading
import time

from engine import find_ghci, utf8_env, SYSTEM

READY = "TS_TIMELINE_READY"
MAX_CYCLES = 64


class TimelineQuery:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.lines = queue.Queue()
        self.lock = threading.Lock()
        self.ready = False
        self.reason = ""
        self.counter = 0
        self.failed_at = 0

    # ---------- arranque ----------
    def _pump(self, proc):
        for raw in iter(proc.stdout.readline, b""):
            self.lines.put(raw.decode("utf-8", errors="replace").rstrip("\r\n"))
        self.lines.put(None)

    def _start(self):
        if self.proc and self.proc.poll() is None and self.ready:
            return True
        ghci = find_ghci()
        if not ghci:
            self.reason = "no-ghci"
            return False
        if time.time() - self.failed_at < 60:
            return False  # falló hace poco (¿falta Tidal?): no lo reintentamos en cada consulta
        script = os.path.join(self.root, "tidal", "Timeline.ghci")
        kwargs = dict(stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=self.root, bufsize=0, env=utf8_env())
        if SYSTEM == "Windows":
            kwargs["creationflags"] = 0x08000000
        self.lines = queue.Queue()
        self.proc = subprocess.Popen([ghci, "-ghci-script", script], **kwargs)
        threading.Thread(target=self._pump, args=(self.proc,), daemon=True).start()
        out, deadline = [], time.time() + 90
        while time.time() < deadline:
            try:
                line = self.lines.get(timeout=1)
            except queue.Empty:
                continue
            if line is None:
                break
            if READY in line:
                bad = [l for l in out if "Could not find module" in l or "Could not load module" in l or "rror" in l]
                if bad:
                    break
                self.ready = True
                self.reason = ""
                return True
            out.append(line)
        self.reason = "no-tidal: " + " ".join(l.strip() for l in out if "rror" in l or "module" in l)[:400]
        self.failed_at = time.time()
        self.close()
        return False

    def close(self):
        self.ready = False
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.kill()
            except OSError:
                pass
        self.proc = None

    # ---------- consulta ----------
    def _ask(self, code, a, b, timeout=10.0):
        self.counter += 1
        tag = f"q{self.counter}"
        body = "\n".join("  " + l for l in code.replace("\r\n", "\n").split("\n"))
        payload = (f':{{\ntsQuery "{tag}" ({a}) ({b}) (\n{body}\n  )\n:}}\n'
                   f'putStrLn "TSDONE\\t{tag}"\n')
        try:
            self.proc.stdin.write(payload.encode("utf-8"))
            self.proc.stdin.flush()
        except OSError:
            self.close()
            return {"ok": False, "error": "ghci-closed"}
        events, errors, ended, deadline = [], [], False, time.time() + timeout
        while True:
            try:
                line = self.lines.get(timeout=max(0.05, deadline - time.time()))
            except queue.Empty:
                # Tidal se ha quedado pensando (patrón infinito…): lo reiniciamos
                self.close()
                return {"ok": False, "error": "timeout"}
            if line is None:
                self.close()
                return {"ok": False, "error": "ghci-closed"}
            if line == f"TSDONE\t{tag}":
                break
            if line == f"TSEND\t{tag}":
                ended = True
                continue
            if line.startswith("TSEV\t"):
                ev = parse_event(line, tag)
                if ev:
                    events.append(ev)
                continue
            if line.strip():
                errors.append(line)
        if not ended:
            return {"ok": False, "error": "\n".join(errors[:25]) or "error"}
        return {"ok": True, "events": events}

    def query(self, tracks, a, b):
        a = max(0, int(a))
        b = max(a + 1, min(int(b), a + MAX_CYCLES))
        with self.lock:
            if not self._start():
                return {"available": False, "reason": self.reason}
            out = {}
            for t in tracks[:16]:
                code = (t.get("code") or "").strip()
                if not code:
                    out[t.get("id", "?")] = {"ok": True, "events": []}
                    continue
                out[t.get("id", "?")] = self._ask(code, a, b)
                if not self.proc:  # se ha caído o colgado: lo volvemos a arrancar para la siguiente
                    if not self._start():
                        break
            return {"available": True, "source": "tidal", "from": a, "to": b, "tracks": out}


def parse_event(line, tag):
    parts = line.split("\t")
    if len(parts) < 6 or parts[1] != tag or not parts[2]:
        return None  # sin «whole»: es un valor continuo, no una nota
    try:
        w0, w1 = (float(x) for x in parts[2].split())
        p0, p1 = (float(x) for x in parts[3].split())
    except ValueError:
        return None
    if abs(p0 - w0) > 1e-9:
        return None  # trozo de una nota que empezó antes del tramo pedido
    pos = []
    for chunk in parts[4].split():
        try:
            c1, l1, c2, l2 = (int(x) for x in chunk.split(","))
            pos.append([c1, l1, c2, l2])
        except ValueError:
            pass
    values = {}
    for kv in "\t".join(parts[5:]).split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            try:
                values[k] = float(v) if k not in ("s", "vowel", "unit") else v
            except ValueError:
                values[k] = v
    return {"t0": w0, "t1": w1, "v": values, "pos": pos}
