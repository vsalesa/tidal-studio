"""Conexiones HTTPS de Tidal Studio (samples, packs, Freesound, GitHub, IA).

En macOS, el Python de python.org no trae certificados hasta que ejecutas
«Install Certificates.command», y las descargas fallan con
CERTIFICATE_VERIFY_FAILED. Aquí cargamos además los certificados de certifi
(si está instalado) o los del sistema (/etc/ssl/cert.pem en macOS), así que
normalmente funciona sin tocar nada.

Último recurso, desactivado por defecto: saltarse la verificación SSL con
  ./start.sh --insecure-ssl          o
  "network": {"insecure_ssl": true}  en config.json   o
  TIDAL_STUDIO_INSECURE_SSL=1
Eso hace que cualquiera en tu red pueda colarte otro archivo: úsalo solo si lo anterior no basta.
"""

import json
import os
import ssl
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config.json")
EXTRA_BUNDLES = ["/etc/ssl/cert.pem", "/opt/homebrew/etc/openssl@3/cert.pem", "/usr/local/etc/openssl@3/cert.pem",
                 "/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt"]
FORCE_INSECURE = False  # lo pone app.py con --insecure-ssl
_warned = False


def insecure():
    if FORCE_INSECURE or os.environ.get("TIDAL_STUDIO_INSECURE_SSL", "").lower() in ("1", "true", "yes", "si", "sí"):
        return True
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return bool((json.load(f).get("network") or {}).get("insecure_ssl"))
    except Exception:
        return False


def ssl_context():
    global _warned
    if insecure():
        if not _warned:
            print("[red] AVISO: verificación SSL DESACTIVADA (insecure_ssl). Las descargas no se comprueban.", file=sys.stderr)
            _warned = True
        return ssl._create_unverified_context()
    ctx = ssl.create_default_context()
    try:
        import certifi  # opcional
        ctx.load_verify_locations(certifi.where())
        return ctx
    except Exception:
        pass
    for path in EXTRA_BUNDLES:
        if os.path.exists(path):
            try:
                ctx.load_verify_locations(path)
                break
            except Exception:
                continue
    return ctx


def urlopen(req, timeout=30):
    """urllib.request.urlopen con los certificados de arriba."""
    return urllib.request.urlopen(req, timeout=timeout, context=ssl_context())


def ssl_hint(err):
    """Texto de ayuda si un error es de certificados."""
    if "CERTIFICATE_VERIFY_FAILED" in str(err) or "certificate verify failed" in str(err).lower():
        return (" (Error de certificados SSL. Si usas el Python de python.org en Mac, abre "
                "«Aplicaciones › Python 3.x › Install Certificates.command». Como último recurso: ./start.sh --insecure-ssl)")
    return ""
