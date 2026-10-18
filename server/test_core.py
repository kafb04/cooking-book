"""Checagem rápida: python server/test_core.py"""
import os
import struct
import sys
import tempfile
import zlib
from io import BytesIO
from pathlib import Path

os.environ["COOKBOOK_DATA"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).parent))

from docx import Document  # noqa: E402

import docx_import  # noqa: E402
import store  # noqa: E402


def tiny_png():
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x69\xb4")) + chunk(b"IEND", b""))


def test_store():
    a = store.save({"title": "Pudim", "ingredients": "1 lata de leite condensado"})
    b = store.save({"title": "bolo de cenoura", "id": "hack"})
    assert b["id"] != "hack"
    store.save({"notes": "da vó"}, a["id"])
    store.set_media(a["id"], "photo", b"img", "png")
    rows = store.all_recipes()
    assert [r["title"] for r in rows] == ["bolo de cenoura", "Pudim"]
    pudim = rows[1]
    assert pudim["notes"] == "da vó" and pudim["ingredients"].startswith("1 lata")
    photo = store.MEDIA / pudim["photo"]
    assert photo.exists()
    store.delete(a["id"])
    assert not photo.exists() and len(store.all_recipes()) == 1
    try:
        store.save({}, "nao-existe")
        raise AssertionError("deveria dar KeyError")
    except KeyError:
        pass


def test_docx():
    doc = Document()
    doc.add_heading("Bolo de Fubá", 1)
    doc.add_paragraph("Rende 12 fatias")
    doc.add_paragraph("Ingredientes:")
    doc.add_paragraph("3 ovos")
    doc.add_paragraph("2 xícaras de fubá")
    doc.add_paragraph("Ingredientes da calda")
    doc.add_paragraph("1 xícara de açúcar")
    doc.add_paragraph("MODO DE PREPARO")
    doc.add_paragraph("Bata tudo no liquidificador.")
    doc.add_paragraph("Obs.")
    doc.add_paragraph("Obs: a massa fica mole mesmo, não precisa se preocupar com isso não")
    doc.add_picture(BytesIO(tiny_png()))
    buf = BytesIO()
    doc.save(buf)

    fields, img = docx_import.parse(buf.getvalue())
    assert fields["title"] == "Bolo de Fubá"
    assert fields["ingredients"] == "3 ovos\n2 xícaras de fubá\nIngredientes da calda\n1 xícara de açúcar"
    assert fields["steps"] == "Bata tudo no liquidificador."
    assert fields["notes"] == "Rende 12 fatias\nObs: a massa fica mole mesmo, não precisa se preocupar com isso não"
    assert img and img.startswith(b"\x89PNG")


def test_auth():
    import auth
    auth.ITERATIONS = 1000  # só pra o teste ser rápido
    assert not auth.has_password()
    auth.set_password("abcd")
    assert auth.try_unlock("errada") is None
    token = auth.try_unlock("abcd")
    assert auth.is_valid(token) and not auth.is_valid("inventado")
    auth.end(token)
    assert not auth.is_valid(token)
    for _ in range(auth.MAX_FREE_TRIES):
        auth.try_unlock("errada")
    try:
        auth.try_unlock("abcd")  # nem a certa passa durante o freio
        raise AssertionError("deveria estar no freio")
    except TimeoutError:
        pass


if __name__ == "__main__":
    test_store()
    test_docx()
    test_auth()
    print("ok ♥")
