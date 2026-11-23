"""
Genera server/data/instrument-files.json: qué archivo hay que bajar para cada nota de los
instrumentos multimuestreados que no siguen un patrón fijo (VCSL, VSCO 2 CE, Salamander).
Solo hace falta volver a ejecutarlo si cambian esas bibliotecas:

    python3 tools/build_instrument_files.py /ruta/a/VSCO-2-CE

(la carpeta es un `git clone --filter=blob:none --no-checkout https://github.com/sgossner/VSCO-2-CE`;
basta con la lista de archivos). Los instrumentos General MIDI no necesitan nada: sus archivos se
llaman por la nota (A0.mp3 … C8.mp3).
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from urllib.parse import quote

OUT = os.path.join(os.path.dirname(__file__), "..", "server", "data", "instrument-files.json")
DOUGH = "https://raw.githubusercontent.com/felixroos/dough-samples/main/"
VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"
NOTE = re.compile(r"(?<![A-Za-z])([A-Ga-g])(#|b|s)?(-?\d)(?![0-9])")
PC = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}

# carpeta de VSCO 2 CE → id del instrumento en el catálogo (ver server/instlib.py)
VSCO_DIRS = {
    "Strings/Solo Contrabass/SusVib": "vsco_contrabass_arco", "Strings/Solo Contrabass/SusNV": "vsco_contrabass_straight",
    "Strings/Solo Contrabass/Pizz": "vsco_contrabass_pizz", "Strings/Solo Contrabass/Spic": "vsco_contrabass_spic",
    "Strings/Solo Contrabass/Trem": "vsco_contrabass_trem",
    "Strings/Solo Violin/Arco Vib": "vsco_violin_arco", "Strings/Solo Violin/Pizz": "vsco_violin_pizz",
    "Strings/Solo Violin/spic": "vsco_violin_spic", "Strings/Solo Violin/Trem": "vsco_violin_trem",
    "Strings/Violin Section/susVib": "vsco_violins_arco", "Strings/Violin Section/Pizz": "vsco_violins_pizz",
    "Strings/Violin Section/Spic": "vsco_violins_spic", "Strings/Violin Section/Trem": "vsco_violins_trem",
    "Strings/Viola Section/susvib": "vsco_violas_arco", "Strings/Viola Section/pizz": "vsco_violas_pizz",
    "Strings/Viola Section/spic": "vsco_violas_spic", "Strings/Viola Section/trem": "vsco_violas_trem",
    "Strings/Cello Section/susvib": "vsco_cellos_arco", "Strings/Cello Section/pizzT": "vsco_cellos_pizz",
    "Strings/Cello Section/spic": "vsco_cellos_spic", "Strings/Cello Section/trem": "vsco_cellos_trem",
    "Strings/Harp": "vsco_harp",
    "Brass/F Horn/sus": "vsco_horn", "Brass/F Horn/stac": "vsco_horn_stac", "Brass/F Horn/mute": "vsco_horn_muted",
    "Brass/Trumpet/sus": "vsco_trumpet", "Brass/Trumpet/susvib": "vsco_trumpet_vib", "Brass/Trumpet/stac": "vsco_trumpet_stac",
    "Brass/Trumpet/harmonM-sus": "vsco_trumpet_harmon", "Brass/Trumpet/straightM-sus": "vsco_trumpet_straight",
    "Brass/Tenor Trombone/sus": "vsco_trombone", "Brass/Tenor Trombone/vib": "vsco_trombone_vib",
    "Brass/Tenor Trombone/stac": "vsco_trombone_stac",
    "Brass/OldTrombone/Sustain": "vsco_oldtrombone", "Brass/OldTrombone/Buzz": "vsco_oldtrombone_buzz",
    "Brass/Tuba/sus": "vsco_tuba", "Brass/Tuba/stac": "vsco_tuba_stac",
    "Woodwinds/Flute/susvib": "vsco_flute", "Woodwinds/Flute/susNV": "vsco_flute_straight",
    "Woodwinds/Flute/stac": "vsco_flute_stac", "Woodwinds/Piccolo/Sus": "vsco_piccolo",
    "Woodwinds/Oboe/Vib": "vsco_oboe", "Woodwinds/Oboe/Stacc": "vsco_oboe_stac",
    "Woodwinds/Clarinet/susLong": "vsco_clarinet", "Woodwinds/Clarinet/stac": "vsco_clarinet_stac",
    "Woodwinds/Bassoon/sus": "vsco_bassoon", "Woodwinds/Bassoon/stac": "vsco_bassoon_stac",
    "Keys/Upright Nr1": "vsco_upright",
    "Percussion/Glock": "vsco_glockenspiel", "Percussion/Xylo": "vsco_xylophone", "Percussion/Marimba": "vsco_marimba",
}
# VCSL (vía el índice strudel.json de dough-samples) → id del catálogo
VCSL_IDS = {
    "steinway": "steinway_b", "kawai": "kawai_grand", "harp": "concert_harp", "folkharp": "folk_harp",
    "dantranh": "dan_tranh", "dantranh_tremolo": "dan_tranh_trem", "dantranh_vibrato": "dan_tranh_vib",
    "psaltery_pluck": "psaltery_pluck", "psaltery_bow": "psaltery_bow", "psaltery_spiccato": "psaltery_spic",
    "strumstick": "strumstick", "recorder_soprano_sus": "recorder_soprano", "recorder_soprano_stacc": "recorder_soprano_stac",
    "recorder_alto_sus": "recorder_alto", "recorder_alto_vib": "recorder_alto_vib", "recorder_alto_stacc": "recorder_alto_stac",
    "recorder_tenor_sus": "recorder_tenor", "recorder_tenor_vib": "recorder_tenor_vib", "recorder_tenor_stacc": "recorder_tenor_stac",
    "recorder_bass_sus": "recorder_bass", "recorder_bass_vib": "recorder_bass_vib", "recorder_bass_stacc": "recorder_bass_stac",
    "ocarina": "ocarina_vcsl", "ocarina_vib": "ocarina_vcsl_vib", "ocarina_small": "ocarina_small", "ocarina_small_stacc": "ocarina_small_stac",
    "pipeorgan_loud": "pipe_organ_loud", "pipeorgan_quiet": "pipe_organ_soft", "pipeorgan_loud_pedal": "pipe_organ_pedal",
    "pipeorgan_quiet_pedal": "pipe_organ_pedal_soft", "organ_8inch": "renaissance_organ_8", "organ_4inch": "renaissance_organ_4",
    "organ_full": "renaissance_organ_full", "harmonica": "hohner_special20", "harmonica_soft": "hohner_special20_soft",
    "harmonica_vib": "hohner_special20_vib", "super64": "hohner_super64", "super64_acc": "hohner_super64_acc",
    "super64_vib": "hohner_super64_vib", "sax": "tenor_sax_vcsl", "sax_vib": "tenor_sax_vcsl_vib", "sax_stacc": "tenor_sax_vcsl_stac",
    "saxello": "saxello", "saxello_vib": "saxello_vib", "saxello_stacc": "saxello_stac",
    "clavisynth": "tx81z_clavisynth", "fmpiano": "tx81z_fmpiano", "piano1": "tx81z_piano",
    "wineglass": "wine_glass", "wineglass_slow": "wine_glass_slow", "balafon": "balafon", "balafon_hard": "balafon_hard",
    "balafon_soft": "balafon_soft", "belltree": "bell_tree", "glockenspiel": "glockenspiel_vcsl", "handchimes": "hand_chimes",
    "kalimba": "mbira_kenya", "kalimba2": "mbira_tanzania", "kalimba3": "mbira_gandanga", "kalimba4": "mbira_nyamaropa",
    "kalimba5": "nyunga_nyunga", "marimba": "marimba_vcsl", "tubularbells": "tubular_bells_vcsl", "tubularbells2": "tubular_bells_vcsl2",
    "vibraphone": "vibraphone_hard", "vibraphone_soft": "vibraphone_soft", "vibraphone_bowed": "vibraphone_bowed",
    "xylophone_medium_ff": "xylophone_vcsl", "xylophone_soft_pp": "xylophone_vcsl_soft", "xylophone_hard_ff": "xylophone_vcsl_hard",
    # golpes sueltos (kits): se tocan con n 0, n 1…
    "bongo": "bongos", "conga": "congas", "darbuka": "darbuka", "framedrum": "frame_drum", "cajon": "cajon",
    "timpani": "timpani_vcsl", "timpani_roll": "timpani_roll", "bassdrum1": "concert_bass_drum", "snare_modern": "snare_modern",
    "snare_low": "rope_snare", "tom_stick": "concert_tom_hi", "tom2_stick": "concert_tom_lo", "agogo": "agogo_vcsl",
    "anvil": "anvil", "brakedrum": "brake_drum", "cabasa": "cabasa", "clap": "claps_vcsl", "clash": "clash_cymbals",
    "clave": "claves", "cowbell": "cowbells", "flexatone": "flexatone", "gong": "gong", "gong2": "gong_tam",
    "guiro": "guiro", "handbells": "nepalese_bells", "hihat": "hihat_vcsl", "marktrees": "mark_trees", "oceandrum": "ocean_drum",
    "ratchet": "ratchet", "shaker_large": "shaker_large", "shaker_small": "shaker_small", "slapstick": "slapstick",
    "sleighbells": "sleigh_bells", "slitdrum": "slit_drum", "sus_cymbal": "suspended_cymbal", "tambourine": "tambourine_vcsl",
    "triangles": "triangles", "vibraslap": "vibraslap", "woodblock": "woodblock_vcsl", "didgeridoo": "didgeridoo",
    "trainwhistle": "train_whistle", "siren": "siren_whistle", "ballwhistle": "ball_whistle", "fingercymbal": "finger_cymbal",
}


def midi_of(tok):
    m = NOTE.search(tok)
    if not m:
        return None
    pc = PC[m.group(1).lower()] + {"#": 1, "s": 1, "b": -1, None: 0}[m.group(2)]
    return (int(m.group(3)) + 1) * 12 + pc


def pref(path):
    """Entre varias grabaciones de la misma nota: primera ronda (rr1) y dinámica media."""
    n = os.path.basename(path).lower()
    score = 0
    if re.search(r"rr2|_2\.wav|rr3", n):
        score += 5
    v = re.search(r"_v(?:l)?(\d)", n)
    if v:
        score += abs(int(v.group(1)) - 2)
    for dyn, s in (("_mf", 0), ("_f_", 1), ("_f.", 1), ("_p.", 2), ("_ff", 2), ("_mp", 1), ("_pp", 3), ("_p_", 2)):
        if dyn in n:
            score += s
    return score


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "tidal-studio-dev"}), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main(vsco_dir):
    out = {}
    files = subprocess.run(["git", "-C", vsco_dir, "ls-tree", "-r", "--name-only", "HEAD"], capture_output=True, text=True, check=True).stdout.splitlines()
    for d, iid in VSCO_DIRS.items():
        notes = {}
        for f in files:
            if os.path.dirname(f) != d or not f.lower().endswith(".wav"):
                continue
            m = midi_of(os.path.basename(f).replace("_A#", "_As").replace("#", "s"))
            if m is None:
                continue
            notes.setdefault(m, []).append(f)
        if not notes:
            print("sin notas:", d)
            continue
        out[iid] = {"base": VSCO, "notes": {str(k): quote(sorted(v, key=pref)[0]) for k, v in sorted(notes.items())}}
    vcsl = get_json(DOUGH + "vcsl.json")
    base = vcsl["_base"]
    for k, iid in VCSL_IDS.items():
        v = vcsl.get(k)
        if v is None:
            print("falta en VCSL:", k)
            continue
        fix = lambda p: quote(p, safe="/%")  # algunos índices traen espacios sin codificar
        if isinstance(v, dict):
            notes = {}
            for name, p in v.items():
                m = midi_of(name)
                if m is not None:
                    notes[str(m)] = fix(p)
            out[iid] = {"base": base, "notes": dict(sorted(notes.items(), key=lambda x: int(x[0])))}
        else:
            out[iid] = {"base": base, "hits": [fix(p) for p in v[:24]]}
    piano = get_json(DOUGH + "piano.json")
    out["salamander_grand"] = {"base": piano["_base"], "notes": {str(midi_of(n)): quote(p) for n, p in piano["piano"].items()}}
    # Tamaño de cada descarga (para avisar antes de bajar algo grande)
    from concurrent.futures import ThreadPoolExecutor

    def size(url):
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "tidal-studio-dev"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return int(r.headers.get("Content-Length") or 0)
        except Exception:
            return 0
    for iid, v in out.items():
        urls = [v["base"] + p for p in (v.get("notes") or {}).values()] + [v["base"] + p for p in v.get("hits", [])]
        with ThreadPoolExecutor(12) as ex:
            v["mb"] = round(sum(ex.map(size, urls)) / 1048576, 1)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=0, sort_keys=True)
    print(len(out), "instrumentos →", OUT)


if __name__ == "__main__":
    main(sys.argv[1])
