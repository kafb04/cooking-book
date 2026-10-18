"""Receitas num único arquivo Parquet, lido e escrito pelo DuckDB."""
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import duckdb

DATA = Path(os.environ.get("COOKBOOK_DATA", Path(__file__).resolve().parent.parent / "data"))
FILE = DATA / "recipes.parquet"
MEDIA = DATA / "media"

COLUMNS = ("id", "title", "category", "ingredients", "steps", "notes",
           "photo", "ink_ingredients", "ink_steps", "ink_notes", "created_at", "updated_at")
MEDIA_FIELDS = ("photo", "ink_ingredients", "ink_steps", "ink_notes")
_PROTECTED = ("id", "created_at", "updated_at")

# Um usuário só, mas o FastAPI roda handlers em threads: sem lock, dois saves simultâneos perdem dados.
_lock = threading.Lock()


def _read():
    if not FILE.exists():
        return []
    with duckdb.connect() as con:
        cur = con.execute("SELECT * FROM read_parquet(?) ORDER BY lower(title)", [str(FILE)])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def _write(rows):
    # ponytail: reescreve o arquivo inteiro a cada save; ok pra centenas de receitas, particionar se virar milhares.
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".tmp")
    with duckdb.connect() as con:
        con.execute(f"CREATE TABLE r ({', '.join(c + ' VARCHAR' for c in COLUMNS)})")
        if rows:
            con.executemany(f"INSERT INTO r VALUES ({', '.join('?' * len(COLUMNS))})",
                            [[row.get(c) for c in COLUMNS] for row in rows])
        con.execute(f"COPY r TO '{tmp.as_posix().replace(chr(39), chr(39) * 2)}' (FORMAT parquet)")
    os.replace(tmp, FILE)  # atômico: um crash no meio nunca deixa o livro corrompido


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _find(rows, rid):
    row = next((r for r in rows if r["id"] == rid), None)
    if row is None:
        raise KeyError(rid)
    return row


def _drop_file(name):
    if name:
        (MEDIA / name).unlink(missing_ok=True)


def all_recipes():
    return _read()


def save(fields, rid=None):
    """Cria (rid=None) ou atualiza uma receita; devolve a linha salva."""
    with _lock:
        rows = _read()
        if rid is None:
            row = dict.fromkeys(COLUMNS) | {"id": uuid.uuid4().hex, "created_at": _now()}
            rows.append(row)
        else:
            row = _find(rows, rid)
        row.update({k: v for k, v in fields.items() if k in COLUMNS and k not in _PROTECTED})
        row["updated_at"] = _now()
        _write(rows)
        return row


def set_media(rid, field, data=None, ext=None):
    """Grava (ou apaga, com data=None) a foto/tinta de uma receita, trocando o arquivo antigo."""
    assert field in MEDIA_FIELDS
    with _lock:
        rows = _read()
        row = _find(rows, rid)
        name = None
        if data is not None:
            MEDIA.mkdir(parents=True, exist_ok=True)
            name = f"{uuid.uuid4().hex}.{ext}"
            (MEDIA / name).write_bytes(data)
        _drop_file(row[field])
        row[field] = name
        row["updated_at"] = _now()
        _write(rows)
        return row


def delete(rid):
    with _lock:
        rows = _read()
        row = _find(rows, rid)
        rows.remove(row)
        _write(rows)
    for f in MEDIA_FIELDS:
        _drop_file(row[f])
