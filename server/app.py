"""API do livro + frontend estático. Rodar: uvicorn app:app --app-dir server"""
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import docx_import
import store

WEB = Path(__file__).resolve().parent.parent / "web"
MAX_UPLOAD = 15 * 1024 * 1024
MediaField = Literal["photo", "ink_ingredients", "ink_steps", "ink_notes"]


class RecipeIn(BaseModel):
    title: str = Field("", max_length=200)
    category: str = Field("", max_length=60)
    ingredients: str = Field("", max_length=20_000)
    steps: str = Field("", max_length=50_000)
    notes: str = Field("", max_length=20_000)


def _image_ext(data):
    """Extensão pelo conteúdo real do arquivo, nunca pelo nome/tipo que o cliente mandou."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"GIF8"):
        return "gif"
    return None


async def _read(upload):
    data = await upload.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Arquivo grande demais (máx. 15 MB)")
    return data


def _or_404(fn, *args):
    try:
        return fn(*args)
    except KeyError:
        raise HTTPException(404, "Receita não encontrada")


app = FastAPI(title="Livro de Receitas")


@app.get("/api/recipes")
def list_recipes():
    return store.all_recipes()


@app.post("/api/recipes", status_code=201)
def create_recipe(r: RecipeIn):
    return store.save(r.model_dump())


@app.put("/api/recipes/{rid}")
def update_recipe(rid: str, r: RecipeIn):
    return _or_404(store.save, r.model_dump(), rid)


@app.delete("/api/recipes/{rid}", status_code=204)
def delete_recipe(rid: str):
    _or_404(store.delete, rid)


@app.post("/api/recipes/{rid}/media/{field}")
async def upload_media(rid: str, field: MediaField, file: UploadFile):
    data = await _read(file)
    ext = _image_ext(data)
    if ext is None or (field != "photo" and ext != "png"):
        raise HTTPException(415, "Formato de imagem não suportado")
    return _or_404(store.set_media, rid, field, data, ext)


@app.delete("/api/recipes/{rid}/media/{field}")
def delete_media(rid: str, field: MediaField):
    return _or_404(store.set_media, rid, field)


@app.post("/api/import")
async def import_docx(files: list[UploadFile]):
    created, failed = [], []
    for f in files:
        data = await _read(f)
        try:
            if not data.startswith(b"PK"):
                raise ValueError("não é .docx")
            fields, img = docx_import.parse(data, f.filename or "receita.docx")
        except Exception:  # docx corrompido não pode derrubar a importação dos outros
            failed.append(f.filename)
            continue
        row = store.save(fields)
        ext = img and _image_ext(img)
        if ext:
            row = store.set_media(row["id"], "photo", img, ext)
        created.append(row)
    return {"created": created, "failed": failed}


store.MEDIA.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=store.MEDIA), name="media")
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
