"""Cadeado do livro: senha (hash PBKDF2) ou digital (passkey/WebAuthn) + sessão em cookie.

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
from datetime import datetime, timezone

from webauthn import (generate_authentication_options, generate_registration_options, options_to_json,
                      verify_authentication_response, verify_registration_response)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (AuthenticatorAttachment, AuthenticatorSelectionCriteria,
                                      PublicKeyCredentialDescriptor, ResidentKeyRequirement,
                                      UserVerificationRequirement)

import store

FILE = store.DATA / "auth.json"
COOKIE = "livro"
ITERATIONS = 300_000
SESSION_SECONDS = 12 * 3600
MAX_FREE_TRIES = 5
CHALLENGE_SECONDS = 120

_sessions = {}    # token -> expira em (epoch); ponytail: em memória, reiniciar o servidor tranca o livro
_challenges = {}  # "register" | "login" -> (desafio, expira em); um usuário só, então um de cada basta
_fails = {"n": 0, "until": 0.0}
_lock = threading.Lock()


def _load():
    return json.loads(FILE.read_text()) if FILE.exists() else {}


def _save(data):
    store.DATA.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(data))


def _new_session():
    token = secrets.token_urlsafe(32)
    _sessions[token] = time.time() + SESSION_SECONDS
    return token


# ---------------- Senha ----------------

def _hash(password, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations).hex()


def has_password():
    return "hash" in _load()


def set_password(password):
    salt = os.urandom(16)
    with _lock:
        data = _load()  # mantém as digitais já cadastradas
        data.update(salt=salt.hex(), iterations=ITERATIONS, hash=_hash(password, salt, ITERATIONS))
        _save(data)


def _check(password):
    d = _load()
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
        return _new_session()


def is_valid(token):
    expires = _sessions.get(token or "")
    return bool(expires and expires > time.time())


def end(token):
    _sessions.pop(token or "", None)


# ---------------- Digital (passkey) ----------------

def _remember(kind, challenge):
    _challenges[kind] = (challenge, time.time() + CHALLENGE_SECONDS)


def _take(kind):
    challenge, expires = _challenges.pop(kind, (None, 0))
    if not challenge or expires < time.time():
        raise ValueError("Tempo esgotado, tente de novo")
    return challenge


def passkeys(rp_id):
    return [p for p in _load().get("passkeys", []) if p["rp_id"] == rp_id]


def _descriptors(rp_id):
    return [PublicKeyCredentialDescriptor(id=base64url_to_bytes(p["id"])) for p in passkeys(rp_id)]


def register_options(rp_id):
    opts = generate_registration_options(
        rp_id=rp_id, rp_name="Livro de Receitas", user_id=b"livro-de-receitas",
        user_name="livro", user_display_name="Livro de Receitas",
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,  # sensor do próprio celular
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED),  # exige a digital, não só um toque
        exclude_credentials=_descriptors(rp_id))
    _remember("register", opts.challenge)
    return options_to_json(opts)


def register(credential, rp_id, origins, name):
    verified = verify_registration_response(
        credential=credential, expected_challenge=_take("register"),
        expected_rp_id=rp_id, expected_origin=origins, require_user_verification=True)
    with _lock:
        data = _load()
        data.setdefault("passkeys", []).append({
            "id": bytes_to_base64url(verified.credential_id),
            "public_key": bytes_to_base64url(verified.credential_public_key),
            "sign_count": verified.sign_count, "rp_id": rp_id, "name": name[:60],
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        _save(data)


def login_options(rp_id):
    opts = generate_authentication_options(rp_id=rp_id, allow_credentials=_descriptors(rp_id),
                                           user_verification=UserVerificationRequirement.REQUIRED)
    _remember("login", opts.challenge)
    return options_to_json(opts)


def login(credential, rp_id, origins):
    """Token de sessão. Qualquer erro (digital desconhecida, assinatura inválida) levanta exceção."""
    with _lock:
        data = _load()
        key = next((p for p in data.get("passkeys", [])
                    if p["id"] == credential.get("id") and p["rp_id"] == rp_id), None)
        if key is None:
            raise ValueError("Digital não cadastrada neste livro")
        verified = verify_authentication_response(
            credential=credential, expected_challenge=_take("login"),
            expected_rp_id=rp_id, expected_origin=origins,
            credential_public_key=base64url_to_bytes(key["public_key"]),
            credential_current_sign_count=key["sign_count"], require_user_verification=True)
        key["sign_count"] = verified.new_sign_count
        _save(data)
        return _new_session()


if __name__ == "__main__":
    new = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("Nova senha do livro: ")
    if len(new) < 4:
        sys.exit("A senha precisa de pelo menos 4 caracteres.")
    set_password(new)
    print(f"Senha guardada em {FILE}")
