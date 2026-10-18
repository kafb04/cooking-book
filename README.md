# cooking-book

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
  O botão **Instalar app** mostra como pôr o ícone do livro na tela inicial.
- Se o Windows perguntar sobre o firewall na primeira vez, permita em rede privada.

## Cadeado

O livro abre trancado: receitas e fotos só saem do servidor depois da senha.
Fechar o navegador (ou o botão **Trancar**) tranca de novo; depois de 5 erros seguidos ele espera
30 s, 1 min, 2 min... antes de aceitar outra tentativa.

Trocar a senha (pergunta a nova sem mostrar na tela):

```bash
.venv/Scripts/python server/auth.py
```

A senha fica só como hash em `data/auth.json`. Sem esse arquivo, a primeira senha digitada vira a senha do livro.

> Digital no celular e app em tela cheia exigem o site em HTTPS (ex.: Tailscale). Pela rede de casa (http)
> o cadeado usa a senha e o ícone abre como atalho.

## Como funciona

| Onde | O quê |
|---|---|
| `server/store.py` | receitas em `data/recipes.parquet`, lidas/escritas com DuckDB |
| `server/docx_import.py` | lê um `.docx` e separa **Ingredientes / Modo de preparo / Observações** pelos títulos |
| `server/app.py` | API + serve o site; tudo em `/api` e `/media` exige o livro destrancado |
| `server/auth.py` | senha (PBKDF2), sessão e freio contra tentativas |
| `web/css/tokens.css` | paleta e fontes — toda cor sai daqui |
| `web/index.html` | `<template>`s das páginas; toda receita usa o mesmo layout |
| `web/js/book.js` | ordem das páginas, virada 3D, setas/teclado/swipe |
| `web/js/editor.js`, `ink.js` | editor, caneta com pressão (ignora a palma da mão quando a caneta está em uso) |

Fotos e manuscritos ficam em `data/media/`. **Backup = copiar a pasta `data/`.**

## Importar .docx

Uma receita por arquivo. A primeira linha vira o título; linhas como `Ingredientes`, `Modo de preparo`,
`Como fazer`, `Observações`, `Dicas` abrem cada seção. A primeira imagem do documento vira a foto do prato.

Foto da receita de exemplo: *Bolo de Fubá.jpg*, Wilfredor, Wikimedia Commons, CC0.

## Teste

```bash
.venv/Scripts/python server/test_core.py
```
