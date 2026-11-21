"""
Smoke test for an INSTALLED offline bundle (run by CI after installing the .pkg / Setup.exe).
Checks that Python, GHCi + Tidal and sclang + SuperDirt all work from the install folder,
without anything from the build machine.

Usage: <bundled python> smoke_test.py <install-root>
"""
import os
import platform
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(sys.argv[1])
WIN = platform.system() == "Windows"
MAC = platform.system() == "Darwin"
failures = []


def section(t):
    print(f"\n===== {t} =====", flush=True)


def run(cmd, env, stdin=None, timeout=600, cwd=None):
    print("$", " ".join(cmd), flush=True)
    p = subprocess.run(cmd, input=stdin, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env, timeout=timeout, cwd=cwd)
    out = (p.stdout or "") + (p.stderr or "")
    print(out[-6000:], flush=True)
    return p.returncode, out


if WIN:
    ghci = os.path.join(ROOT, "ghc", "bin", "ghci.exe")
    import glob
    sclang = (glob.glob(os.path.join(ROOT, "SuperCollider", "**", "sclang.exe"), recursive=True) or [""])[0]
    python = os.path.join(ROOT, "python", "python.exe")
    app = os.path.join(ROOT, "app")
else:
    import shutil
    ghci = os.path.join(ROOT, "ghc", "bin", "ghci")
    # Linux: SuperCollider comes from the distribution (a dependency of the .deb)
    sclang = (os.path.join(ROOT, "SuperCollider.app", "Contents", "MacOS", "sclang") if MAC
              else shutil.which("sclang") or "/usr/bin/sclang")
    python = os.path.join(ROOT, "python", "bin", "python3")
    app = os.path.join(ROOT, "app")

env = dict(os.environ)
env.update({
    "TIDAL_GHCI": ghci,
    "TIDAL_SCLANG": sclang,
    "TIDAL_SCLANG_CONF": os.path.join(ROOT, "sclang_conf.yaml"),
    "GHC_ENVIRONMENT": os.path.join(ROOT, "tidal.env"),
    "TIDAL_STUDIO_LANG": "en",
})
if not MAC:
    env["QT_QPA_PLATFORM"] = "offscreen"
# Hide the build tools so we notice if anything still depends on them
for k in ("GHCUP_INSTALL_BASE_PREFIX", "CABAL_DIR"):
    env.pop(k, None)
if MAC:
    # same PATH the launcher sets (shims/ lets GHCi work without the Xcode Command Line Tools)
    env["PATH"] = os.path.join(ROOT, "shims") + ":/usr/bin:/bin:/usr/sbin:/sbin"

section("files")
for p in (ghci, sclang, python, os.path.join(ROOT, "tidal.env"), os.path.join(ROOT, "quarks", "Dirt-Samples", "bd")):
    ok = os.path.exists(p)
    print(("ok  " if ok else "MISSING ") + p)
    if not ok:
        failures.append(f"missing {p}")

section("python server --check")
code, out = run([python, os.path.join(app, "server", "app.py"), "--check"], env, timeout=60)
if code != 0 or "NOT found" in out:
    failures.append("server --check")

section("ghci + Tidal")
script = (
    'd1 $ s "bd*2 [sn cp]" # speed 1.5\n'
    'd2 $ n (scale "major" "0 .. 7") # s "superpiano" # room 0.3\n'
    ':t fast 2 $ every 3 rev $ sound "hh*4"\n'
    'hush\n'
    'putStrLn ("SMOKE" ++ "-OK")\n'
    ':q\n'
)
boot = os.path.join(app, "tidal", "BootTidal.hs")
code, out = run([ghci, "-ghci-script", boot], env, stdin=script, timeout=600, cwd=app)
if "SMOKE-OK" not in out or "error" in out.lower():
    failures.append("ghci + Tidal")

if MAC:
    # Many Macs have no Xcode Command Line Tools: simulate that (xcrun can't find clang)
    section("ghci + Tidal without Xcode Command Line Tools")
    env2 = dict(env, DEVELOPER_DIR="/nonexistent-xcode")
    code, out = run([ghci, "-v2", "-ghci-script", boot], env2, stdin=script, timeout=600, cwd=app)
    if "SMOKE-OK" not in out:
        failures.append("ghci + Tidal without Xcode CLT")

section("sclang + SuperDirt")
scd = os.path.join(tempfile.mkdtemp(), "check.scd")
with open(scd, "w", encoding="utf-8") as f:
    f.write('(\nvar ok = \\SuperDirt.asClass.notNil and: { \\Vowel.asClass.notNil };\n'
            '(if(ok) { "SC-" ++ "OK" } { "SC-" ++ "FAIL" }).postln;\n0.exit;\n)\n')
try:
    code, out = run([sclang, "-l", env["TIDAL_SCLANG_CONF"], scd], env, timeout=240,
                    cwd=os.path.dirname(sclang))
    if "SC-OK" not in out:
        failures.append("sclang + SuperDirt")
except subprocess.TimeoutExpired:
    failures.append("sclang timed out")

section("result")
if failures:
    print("FAILED:", ", ".join(failures))
    sys.exit(1)
print("All smoke tests passed")
