"""Cadeado do livro: senha (hash PBKDF2) + sessão em cookie, com freio contra tentativas.

Trocar a senha: python server/auth.py   (pergunta a nova senha)
"""
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time

import store

FILE = store.DATA / "auth.json"
COOKIE = "livro"
ITERATIONS = 300_000
SESSION_SECONDS = 12 * 3600
MAX_FREE_TRIES = 5

_sessions = {}  # token -> expira em (epoch); ponytail: em memória, reiniciar o servidor tranca o livro
_fails = {"n": 0, "until": 0.0}
_lock = threading.Lock()


def _hash(password, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations).hex()


def has_password():
    return FILE.exists()


def set_password(password):
    salt = os.urandom(16)
    store.DATA.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps({"salt": salt.hex(), "iterations": ITERATIONS,
                                "hash": _hash(password, salt, ITERATIONS)}))


def _check(password):
    d = json.loads(FILE.read_text())
    return hmac.compare_digest(_hash(password, bytes.fromhex(d["salt"]), d["iterations"]), d["hash"])


def wait_seconds():
    return max(0.0, _fails["until"] - time.time())


def try_unlock(password):
    """Token de sessão, ou None se a senha estiver errada. TimeoutError enquanto estiver no freio."""
    with _lock:
        if wait_seconds():
            raise TimeoutError
        if not _check(password):
            _fails["n"] += 1
            if _fails["n"] >= MAX_FREE_TRIES:  # 30 s, 60 s, 120 s... até 15 min
                _fails["until"] = time.time() + min(900, 30 * 2 ** (_fails["n"] - MAX_FREE_TRIES))
            return None
        _fails.update(n=0, until=0.0)
        token = secrets.token_urlsafe(32)
        _sessions[token] = time.time() + SESSION_SECONDS
        return token


def is_valid(token):
    expires = _sessions.get(token or "")
    return bool(expires and expires > time.time())


def end(token):
    _sessions.pop(token or "", None)


if __name__ == "__main__":
    new = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("Nova senha do livro: ")
    if len(new) < 4:
        sys.exit("A senha precisa de pelo menos 4 caracteres.")
    set_password(new)
    print(f"Senha guardada em {FILE}")
