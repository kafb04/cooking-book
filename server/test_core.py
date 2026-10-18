"""Checagem rápida: python server/test_core.py"""
import os
import sys
import tempfile
from pathlib import Path

os.environ["COOKBOOK_DATA"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).parent))

import store  # noqa: E402


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

    # digital: opções saem com o endereço certo e uma digital inventada é recusada
    import json
    opts = json.loads(auth.register_options("livro.exemplo.ts.net"))
    assert opts["rp"]["id"] == "livro.exemplo.ts.net"
    assert opts["authenticatorSelection"]["userVerification"] == "required"
    auth.login_options("livro.exemplo.ts.net")
    try:
        auth.login({"id": "inventada", "rawId": "inventada", "type": "public-key", "response": {}},
                   "livro.exemplo.ts.net", ["https://livro.exemplo.ts.net"])
        raise AssertionError("digital falsa passou")
    except ValueError:
        pass
    data = auth._load()
    data["passkeys"] = [{"id": "x", "public_key": "y", "sign_count": 0, "rp_id": "a", "name": "n"}]
    auth._save(data)
    auth.set_password("nova")  # trocar a senha não apaga as digitais
    assert auth._load()["passkeys"][0]["id"] == "x"


if __name__ == "__main__":
    test_store()
    test_auth()
    print("ok ♥")
