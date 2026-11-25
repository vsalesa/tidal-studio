"""0.20.1: pedir a Maestro que guarde opciones como estilos las guarda de verdad, y Maestro no puede decir
«guardado» si no se guardó nada. Ejecuta: python3 -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import assistant  # noqa: E402
import memory  # noqa: E402
import stylesave  # noqa: E402

DRUMS = {"id": "d1", "name": "Batería", "kind": "percusion", "code": 's "bd*4" # gain 0.9'}
OPTS = [
    {"titulo": "Bajo saltarín", "descripcion": "síncopa", "cambios": {"pistas": [{"id": "d2", "nombre": "Bajo", "tipo": "bajo", "codigo": 'note "c2 ~ c3 ~" # s "superfm"'}]}},
    {"titulo": "Pad oscuro", "cambios": {"bpm": 90, "pistas": [{"id": "d3", "nombre": "Pad", "tipo": "armonia", "codigo": 'n "c\'min" # s "superpiano" # room 0.6'}]}},
    {"titulo": "Palmas", "cambios": {"pistas": [{"id": "d4", "nombre": "Palmas", "tipo": "percusion", "codigo": 's "~ cp ~ cp"'}]}},
    {"titulo": "Sin bombo", "cambios": {"eliminar": ["d1"], "pistas": [{"id": "d2", "nombre": "Bajo", "tipo": "bajo", "codigo": 'note "e2*4" # s "superfm"'}]}},
]


def sess(picked=3):
    return {"bpm": 120, "style": "house", "name": "Mi tema", "tracks": [dict(DRUMS)],
            "opciones_recientes": [dict(o, elegida=(i == picked)) for i, o in enumerate(OPTS)]}


class Targets(unittest.TestCase):
    def t(self, text, s=None):
        return stylesave.parse_targets(text, stylesave.recent_options(s or sess()))

    def test_wants(self):
        for x in ("guárdame 3 como estilos", "guarda las otras tres como estilos", "save A and C as styles",
                  "Añade la B a mis estilos", "¿puedes guardar estas opciones como estilos?"):
            self.assertTrue(stylesave.wants_save(x), x)
        for x in ("hazme un bajo más oscuro", "cambia el estilo a techno", "guarda la canción"):
            self.assertFalse(stylesave.wants_save(x), x)

    def test_others_means_not_picked(self):
        # El caso de Victor: 4 opciones, eligió la D, pide guardar las otras 3
        self.assertEqual(self.t("guárdame las otras tres como estilos"), ["A", "B", "C"])
        self.assertEqual(self.t("save the others as styles"), ["A", "B", "C"])
        self.assertEqual(self.t("guarda como estilos las que no he elegido"), ["A", "B", "C"])

    def test_letters_numbers_all(self):
        self.assertEqual(self.t("guarda la A y la C como estilos"), ["A", "C"])
        self.assertEqual(self.t("Guarda las A, B y D como estilos"), ["A", "B", "D"])
        self.assertEqual(self.t("save options 2 and 4 as styles"), ["B", "D"])
        self.assertEqual(self.t("guarda todas como estilos"), ["A", "B", "C", "D"])
        self.assertEqual(self.t("guarda esta canción como estilo"), ["cancion"])

    def test_unclear_goes_to_maestro(self):
        self.assertIsNone(self.t("guárdame 3 como estilos"))
        self.assertIsNone(self.t("guarda a mis estilos lo que te parezca"))
        # «las otras» sin ninguna elegida no se puede saber
        self.assertIsNone(self.t("guarda las otras como estilos", sess(picked=None)))


class Saving(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.m = memory.Store(os.path.join(self.dir, "memory.db"))

    def tearDown(self):
        self.m.db.close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_saves_three_with_their_own_tracks(self):
        s = sess()
        saved, errs = stylesave.save(self.m, s, [{"opcion": x} for x in "ABC"], stylesave.recent_options(s), "house")
        self.assertEqual(errs, [])
        self.assertEqual([x["name"] for x in saved], ["Bajo saltarín", "Pad oscuro", "Palmas"])
        styles = {st["name"]: st for st in self.m.styles()}
        self.assertEqual(len(styles), 3)
        self.assertEqual(styles["Pad oscuro"]["bpm"], 90)
        self.assertEqual({r["name"] for r in styles["Palmas"]["roles"]}, {"Batería", "Palmas"})
        self.assertEqual(styles["Bajo saltarín"]["description"], "síncopa")
        # la sesión no se toca
        self.assertEqual(s["tracks"], [DRUMS])

    def test_delete_and_song(self):
        s = sess()
        saved, _ = stylesave.save(self.m, s, [{"opcion": "D", "nombre": "Sin bombo"}, {"opcion": "cancion", "nombre": "Lo de ahora"}],
                                  stylesave.recent_options(s))
        st = self.m.style(saved[0]["id"])
        self.assertEqual([r["name"] for r in st["roles"]], ["Bajo"])
        self.assertEqual(self.m.style(saved[1]["id"])["roles"][0]["name"], "Batería")

    def test_unknown_option_is_an_error_not_a_save(self):
        saved, errs = stylesave.save(self.m, {"tracks": [DRUMS]}, [{"opcion": "B"}], [])
        self.assertEqual(saved, [])
        self.assertTrue(errs)
        self.assertIn("No se ha guardado", stylesave.result_text(saved, errs))


class Honesty(unittest.TestCase):
    def test_reply_field_parsed(self):
        r = assistant.parse_reply('{"mensaje": "Te las guardo", "guardar_estilos": [{"opcion": "A", "nombre": "x"}]}')
        self.assertEqual(stylesave.parse_items(r["guardar_estilos"]), [{"opcion": "A", "nombre": "x", "descripcion": ""}])
        self.assertNotIn("guardar_estilos", assistant.parse_reply('{"mensaje": "hola"}'))

    def test_false_claim_detected(self):
        self.assertTrue(stylesave.claims_saved("¡Listo! He guardado las tres opciones en Mis estilos."))
        self.assertTrue(stylesave.claims_saved("Done, they're saved as styles."))
        self.assertFalse(stylesave.claims_saved("Te propongo un estilo más oscuro."))
        self.assertFalse(stylesave.claims_saved("Receta guardada en tu recetario."))

    def test_prompt_and_summary(self):
        system, msgs = assistant.build_messages([{"role": "user", "content": "guárdame 3 como estilos"}], sess())
        self.assertIn("guardar_estilos", system)
        self.assertIn("D) Sin bombo [ELEGIDA]", msgs[-1]["content"])


if __name__ == "__main__":
    unittest.main()
