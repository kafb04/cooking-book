# cooking-book ♥

Meu livro de receitas: capa, sumário clicável, páginas que viram e contracapa. Receitas digitadas
ou escritas com a caneta, foto do prato e importação dos `.docx` que eu já tenho.

## Rodar

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app:app --app-dir server --host 0.0.0.0 --port 8000
```

- No PC: http://localhost:8000
- No celular (mesmo Wi-Fi): `http://<ip-do-pc>:8000` (o IP aparece em `ipconfig`, "Endereço IPv4").
  No Chrome, menu ⋮ → "Adicionar à tela inicial" pra virar um app.
- Se o Windows perguntar sobre o firewall na primeira vez, permita em rede privada.

## Como funciona

| Onde | O quê |
|---|---|
| `server/store.py` | receitas em `data/recipes.parquet`, lidas/escritas com DuckDB |
| `server/docx_import.py` | lê um `.docx` e separa **Ingredientes / Modo de preparo / Observações** pelos títulos |
| `server/app.py` | API + serve o site |
| `web/css/tokens.css` | paleta e fontes — toda cor sai daqui |
| `web/index.html` | `<template>`s das páginas; toda receita usa o mesmo layout |
| `web/js/book.js` | ordem das páginas, virada 3D, setas/teclado/swipe |
| `web/js/editor.js`, `ink.js` | editor, caneta com pressão (ignora a palma da mão quando a caneta está em uso) |

Fotos e manuscritos ficam em `data/media/`. **Backup = copiar a pasta `data/`.**

## Importar .docx

Uma receita por arquivo. A primeira linha vira o título; linhas como `Ingredientes`, `Modo de preparo`,
`Como fazer`, `Observações`, `Dicas` abrem cada seção. A primeira imagem do documento vira a foto do prato.

## Teste

```bash
.venv/Scripts/python server/test_core.py
```
