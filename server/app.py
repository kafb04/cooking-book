"""API do livro + frontend estático. Rodar: uvicorn app:app --app-dir server"""
import math
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
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


class UnlockIn(BaseModel):
    password: str = Field(min_length=4, max_length=128)


app = FastAPI(title="Livro de Receitas")
OPEN_PATHS = {"/api/session", "/api/unlock"}


@app.middleware("http")
async def require_unlocked(request: Request, call_next):
    """Receitas e fotos só saem do servidor com o livro destrancado."""
    path = request.url.path
    if path.startswith(("/api/", "/media/")) and path not in OPEN_PATHS             and not auth.is_valid(request.cookies.get(auth.COOKIE)):
        return JSONResponse({"detail": "Livro trancado"}, status_code=401)
    return await call_next(request)


@app.get("/api/session")
def session(request: Request):
    return {"unlocked": auth.is_valid(request.cookies.get(auth.COOKIE)), "setup": not auth.has_password()}


@app.post("/api/unlock")
def unlock(body: UnlockIn, response: Response):
    if not auth.has_password():  # primeira vez: a senha digitada vira a senha do livro
        auth.set_password(body.password)
    try:
        token = auth.try_unlock(body.password)
    except TimeoutError:
        raise HTTPException(429, f"Muitas tentativas. Espere {math.ceil(auth.wait_seconds())} s.")
    if not token:
        raise HTTPException(401, "Senha errada")
    # cookie de sessão (sem validade): fechar o navegador tranca de novo
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="strict")
    return {"unlocked": True}


@app.post("/api/lock")
def lock(request: Request, response: Response):
    auth.end(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE)
    return {"unlocked": False}


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


class AlwaysRevalidate(StaticFiles):
    """Sem isso o celular continua usando JS/CSS velhos depois de uma atualização."""

    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


EXAMPLE = {
    "title": "Bolo de Fubá da Vó",
    "category": "Bolos",
    "ingredients": "3 ovos\n2 xícaras de fubá\n1 e 1/2 xícara de açúcar\n1 xícara de leite\n1/2 xícara de óleo\n"
                   "2 colheres (sopa) de farinha de trigo\n1 colher (sopa) de fermento em pó\nPara untar:\nmanteiga e fubá",
    "steps": "Pré-aqueça o forno a 180 °C e unte a forma com manteiga e fubá.\n"
             "Bata no liquidificador os ovos, o açúcar, o leite e o óleo por 2 minutos.\n"
             "Junte o fubá e a farinha e bata só até misturar.\n"
             "Desligue e misture o fermento com uma colher.\n"
             "Asse por uns 40 minutos, até o palito sair limpo.",
    "notes": "Receita de exemplo: edite ou apague quando quiser.\nFica ótimo com café passado na hora.",
}
if not store.FILE.exists():  # livro novo: começa com uma receita de exemplo em vez de vazio
    # foto: "Bolo de Fubá.jpg", Wilfredor, Wikimedia Commons, CC0 (domínio público)
    photo = Path(__file__).with_name("example-bolo.jpg").read_bytes()
    store.set_media(store.save(EXAMPLE)["id"], "photo", photo, "jpg")

store.MEDIA.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=store.MEDIA), name="media")  # nomes uuid: nunca mudam
app.mount("/", AlwaysRevalidate(directory=WEB, html=True), name="web")
