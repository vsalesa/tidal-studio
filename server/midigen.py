"""Generar una canción a partir de TU MIDI, en el estilo que elijas.

Coge lo que quieras conservar de tu MIDI (melodía, acordes, bajo, batería, tempo) y escribe el resto como lo
haría ese estilo: la batería de los cursos de género, un bajo y un acompañamiento con los ritmos medidos en
canciones reales (ver server/data/style_profiles.json y docs/COURSES.md) tocados sobre TUS acordes, y una
melodía nueva hecha con frases de pregunta y respuesta si no te quedas la tuya.

Todo es local y determinista (la misma semilla da la misma versión), así que funciona sin IA. Después Maestro
puede variarla, alargarla o explicarla.
"""
import random
import re

from songimport import KEY_NAMES, NOTE_NAMES, _compress, analyse

ROLES = ("melody", "chords", "bass", "drums", "tempo")

# Intervalos de cada tipo de acorde (nombres de acorde de Tidal, los mismos que usa songimport.CHORDS)
QUALITY = {"major": (0, 4, 7), "minor": (0, 3, 7), "dom7": (0, 4, 7, 10), "min7": (0, 3, 7, 10),
           "major7": (0, 4, 7, 11), "dim": (0, 3, 6), "sus4": (0, 5, 7), "sus2": (0, 2, 7)}
SUFFIX = {"major": "", "minor": "m", "dom7": "7", "min7": "m7", "major7": "maj7", "dim": "dim", "sus4": "sus4", "sus2": "sus2"}
MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10)


def T(es, en):
    return {"es": es, "en": en}


# ---------------------------------------------------------------- estilos
# drums: pistas de percusión de los cursos (web/courses.js), tal cual.
# bass.pattern: un compás; R raíz, L quinta por debajo, F quinta, T tercera, O octava, S séptima,
#   N raíz del acorde siguiente, A nota de aproximación (un semitono por debajo del acorde siguiente), _ alarga.
# comp.pattern: x = el acorde entero, 0-3 = notas del acorde de grave a agudo (3 = la de abajo, una octava arriba).
# lead.rhythms: x = una nota de la melodía (A pregunta, B respuesta).
# center: la nota MIDI alrededor de la que se mueve cada parte.
STYLES = {
    "merengue": {
        "name": "Merengue", "bpm": 140, "mode": "major", "prog": ["I", "IV", "V7", "I"],
        "drums": [(T("Güira", "Güira"), 's "[guiro:3 ~ guiro:1 guiro:2]*4" # gain "[1.15 0 0.75 0.65]*4" # cut 1 # hpf 2500 # pan 0.65'),
                  (T("Tambora", "Tambora"), 's "[woodblock_vcsl:6 ~ woodblock_vcsl:6 woodblock_vcsl:7] [woodblock_vcsl:6 ~ congas:22 ~] [woodblock_vcsl:6 ~ woodblock_vcsl:6 woodblock_vcsl:7] [congas:6 ~ congas:22 congas:22]" # gain 0.9 # room 0.15'),
                  (T("Bombo", "Kick"), 's "bd*4" # gain "[0.9 0.7]*2" # lpf 2500')],
        "bass": {"name": T("Bajo eléctrico", "Electric bass"), "patterns": ["R ~ ~ ~ ~ ~ L ~ R ~ ~ ~ L ~ A ~", "R ~ ~ ~ ~ ~ L ~ R ~ ~ ~ T ~ A ~"],
                 "sound": "electric_bass_finger_fluid", "fx": "# legato 0.7 # gain 0.9", "center": 38,
                 "why": T("salta entre la raíz y la quinta en el 1, el «y» del 2, el 3 y el 4, y acaba con una nota que se acerca al acorde siguiente, como en los merengues reales que analizamos",
                          "jumps between root and fifth on 1, the «and» of 2, 3 and 4, and ends with a note that leads into the next chord, like the real merengues we analysed")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["[0 [1 2] 0 [1 2] 0 1 2 [3 2]]"], "sound": "bright_acoustic_piano_fluid",
                 "fx": '# legato 0.6 # gain "[0.9 0.75]*4" # room 0.2', "center": 61,
                 "why": T("parte cada acorde nota a nota en casi todas las corcheas, con dos semicorcheas al final del 2 y del 4",
                          "breaks each chord up note by note on almost every eighth, with two sixteenths at the end of beats 2 and 4")},
        "lead": {"name": T("Trompetas", "Trumpets"), "rhythms": ["x ~ x x ~ x x ~", "x x x x ~ x ~ x"], "sound": "trumpet_fluid",
                 "fx": "# legato 0.8 # gain 0.9 # room 0.25", "center": 76},
    },
    "salsa": {
        "name": "Salsa", "bpm": 180, "mode": "minor", "prog": ["i", "iv", "V7", "iv"],
        "drums": [(T("Clave 2-3", "2-3 clave"), 's "<[~ claves:1 claves:1 ~] [claves:1 ~ ~ claves:1 ~ ~ claves:1 ~]>" # gain 1'),
                  (T("Congas (tumbao)", "Congas (tumbao)"), 's "congas:0 congas:1 congas:12 congas:1 congas:0 congas:1 congas:6 congas:22" # gain "0.75 0.65 1 0.65 0.75 0.65 1 1" # pan 0.4'),
                  (T("Bongó (martillo)", "Bongo (martillo)"), 's "bongos:0 bongos:6 bongos:2 bongos:6 bongos:0 bongos:6 bongos:16 bongos:7" # gain "0.95 0.75 0.9 0.75 0.95 0.75 1 0.75" # pan 0.6'),
                  (T("Campana", "Bongo bell"), 's "[cowbells:11 cowbells:9]*4" # gain "[1 0.7]*4" # pan 0.6')],
        "bass": {"name": T("Contrabajo (tumbao)", "Upright bass (tumbao)"), "patterns": ["~ ~ ~ F ~ ~ N ~"], "sound": "acoustic_bass_fluid",
                 "fx": "# legato 3 # gain 0.95", "center": 37,
                 "why": T("es el tumbao: nunca toca en el 1; da la quinta en el «y» del 2 y ya en el 4 se adelanta a la raíz del acorde siguiente",
                          "is the tumbao: it never plays on 1; it gives the fifth on the «and» of 2 and on 4 it already anticipates the next chord's root")},
        "comp": {"name": T("Piano (guajeo)", "Piano (guajeo)"), "patterns": ["[~ 1 0 ~ 2 1 ~ 3]"], "sound": "bright_acoustic_piano_fluid",
                 "fx": "# legato 0.9 # gain 0.85", "center": 72, "wrap": "superimpose (|- note 12) $ ",
                 "why": T("es un guajeo: notas del acorde a contratiempo, doblado una octava abajo (superimpose)",
                          "is a guajeo: chord notes on the off-beats, doubled an octave below (superimpose)")},
        "lead": {"name": T("Flauta", "Flute"), "rhythms": ["~ x x ~ x x ~ x", "x ~ x x ~ ~ x ~"], "sound": "flute_fluid",
                 "fx": "# legato 0.8 # gain 0.85 # room 0.25", "center": 79},
    },
    "cumbia": {
        "name": "Cumbia", "bpm": 96, "mode": "minor", "prog": ["i", "iv", "V7", "i"],
        "drums": [(T("Güiro", "Güiro"), 's "[guiro:3 ~ guiro:1 guiro:2]*4" # gain "[1.15 0 0.75 0.65]*4" # cut 1 # hpf 2000 # pan 0.4'),
                  (T("Congas", "Congas"), 's "[congas:1 congas:6] [congas:1 congas:22] [congas:1 congas:6] [congas:1 [congas:22 congas:23]]" # gain "[0.7 1]*4" # pan 0.6'),
                  (T("Bombo y timbal", "Kick and timbal"), 's "[bd ~ ~ ~ bd ~ bd ~, ~ ~ concert_tom_hi:2 ~ ~ ~ concert_tom_hi:2 ~]" # gain 0.95')],
        "bass": {"name": T("Bajo eléctrico", "Electric bass"), "patterns": ["R ~ ~ ~ F ~ F ~", "R ~ ~ ~ F ~ T A"], "sound": "electric_bass_finger_fluid",
                 "fx": "# legato 0.8 # gain 0.9", "center": 37,
                 "why": T("toca la raíz en el 1 y la quinta dos veces en el 3: el «tum… ta-ta» de la cumbia",
                          "plays the root on 1 and the fifth twice on 3: cumbia's «boom… ta-ta»")},
        "comp": {"name": T("Órgano", "Organ"), "patterns": ["[~ x]*4"], "sound": "drawbar_organ_fluid", "fx": "# legato 0.45 # gain 0.85", "center": 57,
                 "why": T("toca el acorde entero a contratiempo, en cada «y»", "plays the whole chord on the off-beat, on every «and»")},
        "lead": {"name": T("Acordeón", "Accordion"), "rhythms": ["x ~ x x ~ x x ~", "x x x x ~ x x x"], "sound": "accordion_fluid",
                 "fx": "# legato 0.85 # gain 0.85 # room 0.25", "center": 76},
    },
    "reggaeton": {
        "name": "Reggaeton", "bpm": 92, "mode": "minor", "prog": ["i", "VI", "III", "VII"],
        "drums": [(T("Bombo 808", "808 kick"), 's "808bd:3*4" # gain 1'),
                  (T("Caja dembow", "Dembow snare"), 's "[~ ~ ~ sn] [~ ~ sn ~] [~ ~ ~ sn] <[~ ~ sn ~] [~ ~ sn ~] [~ ~ sn ~] [sn sn sn sn]>" # gain 0.9 # nudge (-0.015)'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*8" # gain "[0.55 0.8]*4" # pan 0.6')],
        "bass": {"name": T("Sub 808", "808 sub"), "patterns": ["R ~ ~ R ~ ~ R ~"], "sound": "ts_sub", "fx": "# legato 0.6 # gain 0.95", "center": 35,
                 "why": T("sigue el «tresillo» 3-3-2 del dembow con la raíz de cada acorde", "follows the dembow's 3-3-2 «tresillo» with each chord's root")},
        "comp": {"name": T("Pad", "Pad"), "patterns": ["x"], "sound": "pad_2_warm_fluid", "fx": "# legato 1 # gain 0.8 # lpf 2500 # room 0.3", "center": 61,
                 "why": T("deja cada acorde sonando el compás entero, como una alfombra", "lets each chord ring for the whole bar, like a carpet")},
        "lead": {"name": T("Guitarra (gancho)", "Guitar (hook)"), "rhythms": ["x ~ ~ x ~ ~ x ~", "x ~ ~ x ~ ~ x x"], "sound": "acoustic_guitar_nylon_fluid",
                 "fx": "# gain 0.9 # delay 0.3 # delaytime (60/92/2) # delayfeedback 0.35", "center": 74},
    },
    "bossa": {
        "name": "Bossa nova", "bpm": 130, "mode": "major", "prog": ["Imaj7", "vi7", "ii7", "V7"], "sevenths": True,
        "drums": [(T("Shaker", "Shaker"), 's "[shaker_small:0 shaker_small:2]*8" # gain "[0.95 0.7 0.85 0.7]*4" # hpf 3000 # pan 0.6'),
                  (T("Surdo", "Surdo"), 's "bd ~ ~ bd bd ~ ~ bd" # gain 0.8 # lpf 900'),
                  (T("Aro", "Rimshot"), 's "<[808:5 ~ ~ 808:5 ~ ~ 808:5 ~] [~ ~ 808:5 ~ ~ 808:5 ~ ~]>" # gain 0.75')],
        "bass": {"name": T("Contrabajo", "Upright bass"), "patterns": ["R ~ ~ L L ~ ~ R"], "sound": "acoustic_bass_fluid", "fx": "# legato 1 # gain 0.9", "center": 36,
                 "why": T("alterna la raíz y la quinta de abajo: «pum… pum-pum… pum»", "alternates the root and the fifth below: «boom… boom-boom… boom»")},
        "comp": {"name": T("Guitarra de nailon", "Nylon guitar"), "patterns": ["x ~ ~ x ~ ~ x ~", "~ ~ x ~ ~ x ~ x"], "sound": "acoustic_guitar_nylon_fluid",
                 "fx": "# legato 0.5 # gain 0.85 # room 0.15", "center": 55,
                 "why": T("rasguea acordes de séptima con síncopa, como João Gilberto", "strums seventh chords with syncopation, like João Gilberto")},
        "lead": {"name": T("Flauta", "Flute"), "rhythms": ["x ~ ~ x x ~ ~ x", "~ ~ ~ ~ x ~ ~ ~"], "sound": "flute_fluid", "fx": "# legato 0.95 # gain 0.85 # room 0.3", "center": 80},
    },
    "jazz": {
        "name": "Jazz", "bpm": 140, "mode": "major", "prog": ["ii7", "V7", "Imaj7", "VI7"], "sevenths": True,
        "drums": [(T("Ride", "Ride"), 's "[drumtraks:7 ~ ~] [drumtraks:7 ~ drumtraks:7] [drumtraks:7 ~ ~] [drumtraks:7 ~ drumtraks:7]" # gain 0.8 # pan 0.65'),
                  (T("Charles y bombo", "Hi-hat and kick"), 's "[jazz:0, ~ jazz:3]*2" # gain 0.65')],
        "bass": {"name": T("Bajo caminante", "Walking bass"), "patterns": ["R T F A", "R F T A"], "sound": "superpwm", "fx": "# lpf 700 # legato 0.9 # gain 0.95", "center": 41,
                 "why": T("camina: una nota por tiempo por las notas del acorde y la última se acerca al acorde siguiente", "walks: one note per beat through the chord, and the last one leads into the next chord")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["[x ~ ~] [~ ~ x] ~ ~", "~ [~ ~ x] ~ [x ~ ~]"], "sound": "superpiano", "fx": "# gain 0.65 # legato 0.6 # room 0.25", "center": 64,
                 "why": T("«comping»: acordes de séptima en golpes cortos y a destiempo, dejando aire", "«comping»: short, off-beat seventh chords that leave space")},
        "lead": {"name": T("Trompeta", "Trumpet"), "rhythms": ["[x ~ x] [x ~ x] [x ~ ~] [~ ~ x]", "[x ~ x] [x ~ ~] [x ~ x] [x ~ ~]"], "sound": "supertrumpet",
                 "fx": "# lpf 2200 # legato 0.9 # gain 0.7 # room 0.2", "center": 76},
    },
    "funk": {
        "name": "Funk", "bpm": 104, "mode": "minor", "prog": ["i7", "IV7", "i7", "IV7"], "sevenths": True,
        "drums": [(T("Bombo", "Kick"), 's "bd ~ ~ bd ~ ~ ~ ~ ~ ~ bd ~ ~ bd ~ ~" # gain 1'),
                  (T("Caja", "Snare"), 's "~ ~ ~ ~ sn ~ ~ sn ~ sn ~ ~ sn ~ ~ sn" # gain "0 0 0 0 1 0 0 0.35 0 0.35 0 0 1 0 0 0.4"'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*16" # gain "[0.9 0.5 0.7 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R ~ O ~ ~ R ~ S ~ R ~ T ~ ~ F ~"], "sound": "superpwm", "fx": "# lpf 1500 # legato 0.5 # gain 0.95", "center": 43,
                 "why": T("salta de octava y rellena las semicorcheas: el bajo funk es casi otra batería", "jumps octaves and fills the sixteenths: funk bass is almost another drummer")},
        "comp": {"name": T("Guitarra", "Guitar"), "patterns": ["~ x ~ x ~ ~ x ~ ~ x ~ x ~ ~ x ~"], "sound": "superpiano", "fx": "# legato 0.3 # hpf 500 # gain 0.65 # pan 0.35", "center": 64,
                 "why": T("da golpes cortos de acorde en las semicorcheas débiles, como una guitarra rítmica", "plays short chord stabs on the weak sixteenths, like a rhythm guitar")},
        "lead": {"name": T("Metales", "Horns"), "rhythms": ["~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~", "~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ ~ ~ x ~"], "sound": "supertrumpet", "fx": "# legato 0.5 # gain 0.7", "center": 79},
    },
    "house": {
        "name": "House", "bpm": 124, "mode": "minor", "prog": ["i7", "VImaj7", "iv7", "v7"], "sevenths": True,
        "drums": [(T("Bombo", "Kick"), 's "house*4" # gain 1'), (T("Palmas", "Claps"), 's "~ cp ~ cp" # gain 0.85 # room 0.15'),
                  (T("Hi-hats", "Hi-hats"), 's "[house:3 house:3 house:4 house:3]*4" # gain "[0.6 0.5 0.85 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["[~ R]*4", "[~ R]*3 [~ O]"], "sound": "superpwm", "fx": "# lpf 700 # legato 0.6 # gain 0.95", "center": 37,
                 "why": T("toca a contratiempo, entre bombo y bombo: el «bombeo» del house", "plays on the off-beats, between the kicks: house's «pumping»")},
        "comp": {"name": T("Piano", "Piano"), "patterns": ["~ ~ x ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~"], "sound": "superpiano", "fx": "# legato 0.5 # gain 0.7 # room 0.3", "center": 66,
                 "why": T("da acordes sincopados de séptima, el piano típico del house de Chicago", "plays syncopated seventh chords, the classic Chicago house piano")},
        "lead": {"name": T("Sinte", "Synth"), "rhythms": ["x ~ x ~ x x ~ x", "x ~ ~ x ~ x ~ ~"], "sound": "supersaw",
                 "fx": "# lpf (range 800 4000 $ slow 8 sine) # legato 0.5 # gain 0.5 # delay 0.25 # delaytime (60/124*0.75) # delayfeedback 0.3", "center": 70},
    },
    "techno": {
        "name": "Techno", "bpm": 130, "mode": "minor", "prog": ["i", "i", "i", "III"],
        "drums": [(T("Bombo", "Kick"), 's "techno*4" # gain 1.05'), (T("Platos", "Hats"), 's "[hh27 hh27 ho hh27]*4" # cut 1 # gain "[0.6 0.5 0.8 0.5]*4"'),
                  (T("Palmas", "Claps"), 's "~ cp ~ cp" # gain 0.8 # room 0.25')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["[~ R R R]*4"], "sound": "superpwm", "fx": "# lpf 400 # legato 0.7 # shape 0.3 # gain 0.95", "center": 35,
                 "why": T("repite la raíz en las tres semicorcheas entre bombos: hipnótico", "repeats the root on the three sixteenths between kicks: hypnotic")},
        "comp": {"name": T("Pad", "Pad"), "kind": "textura", "patterns": ["x"], "sound": "supersaw", "fx": "# legato 1 # hpf 400 # lpf 2500 # room 0.6 # size 0.9 # gain 0.4", "center": 66,
                 "why": T("es un fondo largo y filtrado; en el techno manda el ritmo", "is a long filtered background; in techno the rhythm rules")},
        "lead": {"name": T("Línea ácida", "Acid line"), "rhythms": ["x x x x ~ x x x x ~ x x x ~ x x", "x x ~ x x ~ x x x x ~ x ~ x x ~"], "sound": "sawtooth",
                 "fx": "# lpf (range 300 3000 $ slow 16 sine) # resonance 0.25 # legato 0.6 # gain 0.55", "center": 50},
    },
    "dnb": {
        "name": "Drum & bass", "bpm": 174, "mode": "minor", "prog": ["i", "VI", "III", "VII"],
        "drums": [(T("Bombo", "Kick"), 's "bd ~ ~ ~ ~ ~ ~ ~ ~ ~ bd ~ ~ ~ ~ ~" # gain 1'), (T("Caja", "Snare"), 's "~ sn ~ sn" # gain 1 # shape 0.2'),
                  (T("Hi-hats", "Hi-hats"), 's "hh*8" # gain "[0.7 0.5]*4"')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R _ _ _ _ _ T _"], "sound": "supersaw", "fx": "# lpf 500 # legato 1 # gain 0.8", "center": 36,
                 "why": T("notas largas y graves que se arrastran debajo del ritmo rápido", "long, deep notes dragging under the fast beat")},
        "comp": {"name": T("Pad", "Pad"), "patterns": ["x"], "sound": "supersaw", "fx": "# lpf 1800 # legato 1 # gain 0.4 # room 0.6 # size 0.9", "center": 64,
                 "why": T("un acorde por compás, lejano y con mucha reverb", "one chord per bar, distant and with lots of reverb")},
        "lead": {"name": T("Piano", "Piano"), "rhythms": ["x ~ ~ x ~ ~ x ~", "~ ~ ~ ~ x ~ x x"], "sound": "superpiano",
                 "fx": "# gain 0.6 # room 0.4 # delay 0.35 # delaytime (60/174*0.75) # delayfeedback 0.4", "center": 78},
    },
    "lofi": {
        "name": "Lo-fi hip hop", "bpm": 80, "mode": "major", "prog": ["IVmaj7", "iii7", "ii7", "Imaj7"], "sevenths": True, "wrap": "swingBy (1/6) 4 $ ",
        "drums": [(T("Batería", "Drums"), 'swingBy (1/6) 4 $ s "[jazz:0 ~ ~ ~] [jazz:7 ~ ~ jazz:0] [~ ~ jazz:0 ~] [jazz:7 ~ ~ ~]" # lpf 3500'),
                  (T("Hi-hats", "Hi-hats"), 'swingBy (1/6) 4 $ s "jazz:3*8" # gain "[0.7 0.45]*4" # lpf 6000')],
        "bass": {"name": T("Bajo", "Bass"), "patterns": ["R _ _ _ _ _ F _"], "sound": "superpwm", "fx": "# lpf 350 # legato 1 # gain 0.95", "center": 40,
                 "why": T("una nota larga y una quinta corta al final, cálido y sin prisa", "one long note and a short fifth at the end, warm and unhurried")},
        "comp": {"name": T("Teclado", "Keys"), "patterns": ["x"], "sound": "superpiano", "fx": "# legato 1 # gain 0.6 # lpf 2500 # room 0.35", "center": 64,
                 "why": T("acordes de séptima largos y apagados (lpf), como un piano viejo", "long, muffled seventh chords (lpf), like an old piano")},
        "lead": {"name": T("Melodía", "Melody"), "rhythms": ["x ~ x ~ x ~ ~ ~", "x ~ ~ x ~ ~ x ~"], "sound": "superpiano",
                 "fx": "# gain 0.5 # lpf 3000 # room 0.4 # delay 0.3 # delaytime (60/80*0.75) # delayfeedback 0.3", "center": 79},
    },
}


# ---------------------------------------------------------------- armonía

ROMAN_RE = re.compile(r"^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|maj7|7)?$")
NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii"]


def roman_chord(sym, tonic, mode):
    """«V7» en La menor → {"root": 4, "tidal": "dom7"}. Los grados se cuentan en la escala del estilo."""
    m = ROMAN_RE.match(sym)
    if not m:
        return {"root": tonic, "tidal": "major"}
    acc, num, suf = m.groups()
    deg = NUMERALS.index(num.lower())
    scale = MINOR_SCALE if mode == "minor" else MAJOR_SCALE
    root = (tonic + scale[deg] + (1 if acc == "#" else -1 if acc == "b" else 0)) % 12
    upper = num.isupper()
    if suf == "°":
        q = "dim"
    elif suf == "maj7":
        q = "major7"
    elif suf == "7":
        q = "dom7" if upper else "min7"
    else:
        q = "major" if upper else "minor"
    return {"root": root, "tidal": q}


def chord_name(c):
    return KEY_NAMES[c["root"]] + SUFFIX.get(c["tidal"], "")


def seventh(c, key_root):
    """Para jazz, bossa, lo-fi…: tríadas → acordes de séptima (el V pasa a dominante)."""
    q = c["tidal"]
    if q == "major":
        q = "dom7" if (c["root"] - key_root) % 12 in (7, 10) else "major7"
    elif q == "minor":
        q = "min7"
    return {**c, "tidal": q}


def nearest(pc, center):
    """La nota de clase pc (0-11) más cerca de center."""
    p = center - ((center - pc) % 12)
    return p + 12 if center - p > 6 else p


def voicing(c, center, prev=None):
    """Notas del acorde en posición cerrada, en la inversión más cercana a center (y al acorde anterior)."""
    iv = QUALITY.get(c["tidal"], QUALITY["major"])
    best = None
    for inv in range(len(iv)):
        pcs = list(iv[inv:]) + [x + 12 for x in iv[:inv]]
        for octv in range(-2, 3):
            base = nearest(c["root"], center) + 12 * octv
            notes = [base + x for x in pcs]
            mean = sum(notes) / len(notes)
            cost = abs(mean - center)
            if prev and len(prev) == len(notes):
                cost += 0.35 * sum(abs(a - b) for a, b in zip(notes, prev)) / len(notes)
            if best is None or cost < best[0]:
                best = (cost, notes)
    return best[1]


def nm(p):
    return f"{NOTE_NAMES[p % 12]}{p // 12}"


TOKEN = re.compile(r"[A-Za-z0-9]+")


def bass_bar(pattern, c, nxt, center):
    root = nearest(c["root"], center)
    third = 3 if c["tidal"] in ("minor", "min7", "dim") else 4
    sev = 11 if c["tidal"] == "major7" else 10
    nroot = nearest(nxt["root"], root)
    vals = {"R": root, "L": root - 5, "F": root + 7, "T": root + third, "O": root + 12, "S": root + sev,
            "N": nroot, "A": nroot - 1}
    return TOKEN.sub(lambda m: nm(vals[m.group(0)]) if m.group(0) in vals else m.group(0), pattern)


def comp_bar(pattern, notes):
    def rep(m):
        t = m.group(0)
        if t == "x":
            return "[" + ",".join(nm(p) for p in notes) + "]"
        if t.isdigit():
            i = int(t)
            return nm(notes[i % len(notes)] + 12 * (i // len(notes)))
        return t
    return TOKEN.sub(rep, pattern)


def _one_group(b):
    """¿Es «[…]» un solo grupo (los corchetes de fuera se cierran al final)?"""
    if not (b.startswith("[") and b.endswith("]")):
        return False
    depth = 0
    for i, ch in enumerate(b):
        depth += ch == "["
        depth -= ch == "]"
        if depth == 0 and i < len(b) - 1:
            return False
    return True


def join_bars(bars):
    """Un patrón por compás → «<[…] […]>» (o uno solo si todos son iguales)."""
    if all(b == bars[0] for b in bars):
        return bars[0]
    return "<" + " ".join(b if " " not in b or _one_group(b) else f"[{b}]" for b in bars) + ">"


# ---------------------------------------------------------------- melodía nueva

def _scale_pcs(key):
    sc = MINOR_SCALE if key["mode"] == "minor" else MAJOR_SCALE
    return sorted((key["root"] + x) % 12 for x in sc)


def _scale_notes(key, lo, hi):
    pcs = set(_scale_pcs(key))
    return [p for p in range(lo, hi + 1) if p % 12 in pcs]


def _chord_tones(c, lo, hi):
    pcs = {(c["root"] + x) % 12 for x in QUALITY.get(c["tidal"], QUALITY["major"])}
    return [p for p in range(lo, hi + 1) if p % 12 in pcs]


def _phrase(rhythm, c, key, prev, rng, lo, hi, end_long=False):
    """Una frase de un compás: notas del acorde en las partes fuertes y pasos de la escala en medio."""
    n = rhythm.count("x")
    tones = _chord_tones(c, lo, hi)
    scale = _scale_notes(key, lo, hi)
    # incluye notas de paso cromáticas del acorde (p. ej. la sensible en el V de una tonalidad menor)
    scale = sorted(set(scale) | set(tones))
    out, p = [], prev
    for k in range(n):
        last = k == n - 1
        if k % 2 == 0 or (last and end_long):
            cands = sorted(tones, key=lambda x: (abs(x - p), x))[:3]
            if last and end_long:  # acabar la frase en la raíz o la tercera
                cands = sorted([t for t in tones if (t - c["root"]) % 12 in (0, 3, 4)], key=lambda x: abs(x - p))[:2] or cands
            p = rng.choice(cands[:2]) if len(cands) > 1 and rng.random() < 0.4 else cands[0]
        else:
            i = min(range(len(scale)), key=lambda j: abs(scale[j] - p))
            mid = (lo + hi) / 2
            step = rng.choice((1, 1, 2)) * (1 if (p < mid if rng.random() < 0.7 else rng.random() < 0.5) else -1)
            p = scale[max(0, min(len(scale) - 1, i + step))]
        out.append(p)
    it = iter(out)
    return TOKEN.sub(lambda m: nm(next(it)) if m.group(0) == "x" else m.group(0), rhythm), out


def _transpose(notes, scale, steps):
    out = []
    for p in notes:
        i = min(range(len(scale)), key=lambda j: abs(scale[j] - p))
        out.append(scale[max(0, min(len(scale) - 1, i + steps))])
    return out


def new_melody(lead, chords, key, rng):
    """Frases de pregunta y respuesta: A (pregunta), B (respuesta), A repetida sobre el acorde nuevo, y cierre."""
    lo, hi = lead["center"] - 7, lead["center"] + 10
    ra, rb = lead["rhythms"][0], lead["rhythms"][-1]
    scale = sorted(set(_scale_notes(key, lo - 12, hi + 12)))
    bars, prev, first = [], lead["center"], None
    for b, c in enumerate(chords):
        pos = b % 4
        if pos == 0:
            s, notes = _phrase(ra, c, key, prev, rng, lo, hi)
            first = (notes, c)
        elif pos == 2 and first and len(first[0]) == ra.count("x"):
            # misma frase, movida por la escala hasta el acorde de este compás: el oído reconoce el motivo
            deg = (c["root"] - first[1]["root"]) % 12
            steps = round(deg / 12 * 7)
            steps = steps - 7 if steps > 3 else steps
            notes = _transpose(first[0], scale, steps)
            notes = [min(max(p, lo - 2), hi + 2) for p in notes]
            it = iter(notes)
            s = TOKEN.sub(lambda m: nm(next(it)) if m.group(0) == "x" else m.group(0), ra)
        else:
            s, notes = _phrase(rb, c, key, prev, rng, lo, hi, end_long=pos == 3 or b == len(chords) - 1)
        if notes:
            prev = notes[-1]
        bars.append(s)
    return bars


# ---------------------------------------------------------------- de tu MIDI

SND_RE = re.compile(r'#\s*s\s+"[^"]*"')


def restyle(code, sound):
    return SND_RE.sub(f'# s "{sound}"', code) if SND_RE.search(code) else f'{code} # s "{sound}"'


def pick_parts(tracks):
    """Separa las pistas importadas en batería, bajo, melodía y acompañamiento."""
    drums = [t for t in tracks if t["tipo"] == "percusion"]
    bass = [t for t in tracks if t["tipo"] == "bajo"]
    tonal = [t for t in tracks if t["tipo"] not in ("percusion", "bajo")]
    melody = [t for t in tonal if t["tipo"] == "melodia"]
    if not melody:
        # sin pista de «melodía»: la más aguda que toque notas sueltas (no acordes) hace de melodía
        single = [t for t in tonal if t["codigo"].count(",") * 3 < len(re.findall(r"[a-g][sf]?\d", t["codigo"]))]
        if single:
            melody = [max(single, key=lambda t: t.get("avg", 0))]
    return drums, bass, melody[:2], [t for t in tonal if t not in melody]


# ---------------------------------------------------------------- generar

def generate(data, style="merengue", keep=("melody", "chords"), seed=1, lang="es", start_bar=None, bars=4, name=""):
    st = STYLES.get(style)
    if not st:
        raise ValueError("Estilo desconocido|Unknown style")
    es = lang != "en"
    tx = lambda d: d["es"] if es else d["en"]  # noqa: E731
    keep = {k for k in keep if k in ROLES}
    rng = random.Random(f"{style}:{seed}")
    imp = analyse(data, lang, start_bar, bars, name)
    s = imp["summary"]
    nbars = s["window"]["bars"]
    key = s["key"] or {"root": 0, "mode": "major", "name": "C"}
    drums_m, bass_m, melody_m, _ = pick_parts(imp["tracks"])
    notes = []  # qué he hecho, para el chat

    # Acordes: los tuyos (rellenando los compases sin acorde) o la progresión típica del estilo en tu tonalidad
    mine = s["window"].get("chord_data") or []
    if "chords" in keep and any(mine):
        chords, last = [], next(c for c in mine if c)
        for c in mine:
            last = c or last
            chords.append({"root": last["root"], "tidal": last["tidal"]})
        if st.get("sevenths"):
            chords = [seventh(c, key["root"]) for c in chords]
        src = T("tus acordes", "your chords")
    else:
        tonic = key["root"]
        if st["mode"] == "minor" and key["mode"] != "minor":
            tonic = (tonic + 9) % 12  # relativa menor: las mismas notas que tu canción
        elif st["mode"] == "major" and key["mode"] == "minor":
            tonic = (tonic + 3) % 12
        chords = [roman_chord(st["prog"][b % len(st["prog"])], tonic, st["mode"]) for b in range(nbars)]
        src = T(f"la progresión típica del {st['name']} ({' '.join(st['prog'])})", f"the typical {st['name']} progression ({' '.join(st['prog'])})")
        if "chords" in keep:
            notes.append(T("Tu MIDI no tiene acordes claros en este trozo, así que uso la progresión típica del estilo.",
                           "Your MIDI has no clear chords in this section, so I use the style's typical progression."))
        key = {"root": tonic, "mode": st["mode"], "name": KEY_NAMES[tonic] + ("m" if st["mode"] == "minor" else "")}
    names = [chord_name(c) for c in chords]
    wrap = st.get("wrap", "")
    out = []

    # Batería
    if "drums" in keep and drums_m:
        for t in drums_m:
            out.append({"nombre": t["nombre"], "tipo": "percusion", "codigo": t["codigo"], "origen": "midi",
                        "explicacion": T("Tu batería, tal cual.", "Your drums, as they are.")})
    else:
        if "drums" in keep:
            notes.append(T("Tu MIDI no tiene batería en este trozo: pongo la del estilo.", "Your MIDI has no drums in this section: I use the style's."))
        for nme, code in st["drums"]:
            out.append({"nombre": tx(nme), "tipo": "percusion", "codigo": code, "origen": "style",
                        "explicacion": T(f"Ritmo de {st['name']} del curso de género.", f"{st['name']} rhythm from the genre course.")})

    # Bajo
    b = st["bass"]
    if "bass" in keep and bass_m:
        out.append({"nombre": tx(T("Tu bajo", "Your bass")), "tipo": "bajo", "codigo": restyle(bass_m[0]["codigo"], b["sound"]), "origen": "midi",
                    "explicacion": T(f"Tus notas de bajo, con el sonido del {st['name']} ({b['sound']}).", f"Your bass notes, with the {st['name']} sound ({b['sound']}).")})
    else:
        if "bass" in keep:
            notes.append(T("Tu MIDI no tiene bajo en este trozo: escribo uno del estilo.", "Your MIDI has no bass in this section: I write one in the style."))
        pat = b["patterns"][rng.randrange(len(b["patterns"]))]
        bb = [bass_bar(pat, c, chords[(i + 1) % nbars], b["center"]) for i, c in enumerate(chords)]
        out.append({"nombre": tx(b["name"]), "tipo": "bajo", "codigo": f'{wrap}note "{join_bars(bb)}" # s "{b["sound"]}" {b["fx"]}', "origen": "new",
                    "explicacion": T(f"Bajo nuevo sobre {src['es']}: {b['why']['es']}.", f"New bass over {src['en']}: {b['why']['en']}.")})

    # Acompañamiento (siempre en el estilo: tus acordes, tocados como los toca ese género)
    cp = st["comp"]
    pat = cp["patterns"][rng.randrange(len(cp["patterns"]))]
    prev, cb = None, []
    for c in chords:
        v = voicing(c, cp["center"], prev)
        prev = v
        cb.append(comp_bar(pat, v))
    out.append({"nombre": tx(cp["name"]), "tipo": cp.get("kind", "armonia"),
                "codigo": f'{cp.get("wrap", "")}{wrap}note "{join_bars(cb)}" # s "{cp["sound"]}" {cp["fx"]}', "origen": "midi" if "chords" in keep and src["en"] == "your chords" else "new",
                "explicacion": T(f"Acordes ({' '.join(names)}): {src['es']}, tocados como en el {st['name']}: {cp['why']['es']}.",
                                 f"Chords ({' '.join(names)}): {src['en']}, played the {st['name']} way: {cp['why']['en']}.")})

    # Melodía
    ld = st["lead"]
    if "melody" in keep and melody_m:
        for i, t in enumerate(melody_m):
            out.append({"nombre": tx(T("Tu melodía", "Your melody")) + (f" {i + 1}" if i else ""), "tipo": "melodia",
                        "codigo": restyle(t["codigo"], ld["sound"]) if i == 0 else t["codigo"], "origen": "midi",
                        "explicacion": T(f"Tu melodía, nota por nota, tocada con {tx(ld['name']).lower()} ({ld['sound']}).",
                                         f"Your melody, note for note, played on {tx(ld['name']).lower()} ({ld['sound']}).")})
    else:
        if "melody" in keep:
            notes.append(T("No encuentro una melodía en tu MIDI en este trozo: invento una.", "I can't find a melody in your MIDI in this section: I make one up."))
        mb = new_melody(ld, chords, key, rng)
        out.append({"nombre": tx(ld["name"]), "tipo": "melodia", "codigo": f'{wrap}note "{join_bars(mb)}" # s "{ld["sound"]}" {ld["fx"]}', "origen": "new",
                    "explicacion": T("Melodía nueva de pregunta y respuesta: el compás 1 pregunta, el 2 contesta, el 3 repite la pregunta sobre su acorde y el 4 cierra en una nota del acorde.",
                                     "New call-and-response melody: bar 1 asks, bar 2 answers, bar 3 repeats the question over its chord and bar 4 closes on a chord note.")})

    bpm = s["studio_bpm"] if "tempo" in keep else st["bpm"]
    out = out[:12]
    gen = {
        "style": style, "style_name": st["name"], "keep": sorted(keep), "seed": seed, "bpm": bpm,
        "key": key.get("name"), "chords": names,
        "notes": [tx(n) for n in notes],
    }
    kept = ", ".join(tx(T({"melody": "melodía", "chords": "acordes", "bass": "bajo", "drums": "batería", "tempo": "tempo"}[k], k)) for k in sorted(keep)) or "—"
    ref = imp["reference"] + "\n" + (
        f"VERSIÓN GENERADA: el alumno ha generado una versión en estilo {st['name']} de SU MIDI (es suyo; puedes trabajar con sus notas). "
        f"Conserva de su MIDI: {kept}. Acordes por compás: {' '.join(names)}. Tempo {bpm} BPM. Pistas: "
        + "; ".join(f'{t["nombre"]} ({t["origen"]})' for t in out) + ". Si te pide variarla o alargarla, mantén lo que ha decidido conservar.")
    return {"summary": s, "generated": gen, "tracks": [{k: v for k, v in t.items() if k != "explicacion"} | {"explicacion": tx(t["explicacion"])} for t in out],
            "reference": ref}


def styles_list(lang="es"):
    return [{"id": k, "name": v["name"], "bpm": v["bpm"]} for k, v in STYLES.items()]
