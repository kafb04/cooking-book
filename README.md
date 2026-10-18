# cooking-book

Meu livro de receitas: capa, sumário clicável, páginas que viram e contracapa. Receitas digitadas
ou escritas com a caneta, com foto do prato.

## Rodar

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app:app --app-dir server --port 8000
```

No PC: http://localhost:8000

## Celular (Tailscale: HTTPS privado, funciona até fora de casa)

1. Instale o Tailscale no PC e no celular e entre com a mesma conta.
2. Em https://login.tailscale.com/admin/dns ative **MagicDNS** e **HTTPS Certificates**.
3. Com o livro rodando, no PC:

   ```bash
   tailscale serve --bg 8000
   ```

   Ele mostra o endereço `https://<nome-do-pc>.<sua-rede>.ts.net` — é esse que se abre no celular
   (o PC precisa estar ligado). Só aparelhos da sua conta Tailscale conseguem abrir.
4. No celular, abra o endereço e toque em **Instalar app**: o livro vira um app com ícone na tela inicial.

## Cadeado

O livro abre trancado: receitas e fotos só saem do servidor depois de destrancar.

- **PC:** senha.
- **Celular:** na primeira vez, senha; o livro oferece **ativar a digital** e, dali em diante, abre com o dedo
  (a senha continua valendo). A digital fica presa ao endereço `…ts.net`.
- Fechar o app/navegador ou tocar em **Trancar** tranca de novo. Depois de 5 senhas erradas seguidas ele espera
  30 s, 1 min, 2 min... antes de aceitar outra.

Trocar a senha (pergunta a nova sem mostrar na tela; as digitais continuam):

```bash
.venv/Scripts/python server/auth.py
```

Senha (só o hash) e digitais (só as chaves públicas) ficam em `data/auth.json`.

## Como funciona

| Onde | O quê |
|---|---|
| `server/store.py` | receitas em `data/recipes.parquet`, lidas/escritas com DuckDB |
| `server/app.py` | API + serve o site; tudo em `/api` e `/media` exige o livro destrancado |
| `server/auth.py` | senha (PBKDF2), digital (passkey/WebAuthn), sessão e freio contra tentativas |
| `web/css/tokens.css` | paleta e fontes — toda cor sai daqui |
| `web/index.html` | `<template>`s das páginas; toda receita usa o mesmo layout |
| `web/js/book.js` | ordem das páginas, virada 3D, setas/teclado, arrastar a folha |
| `web/js/lock.js`, `web/sw.js` | cadeado (senha/digital) e o que deixa instalar como app |
| `web/js/editor.js`, `ink.js` | editor, caneta com pressão (ignora a palma da mão quando a caneta está em uso) |

Fotos e manuscritos ficam em `data/media/`. **Backup = copiar a pasta `data/`.**


Foto da receita de exemplo: *Bolo de Fubá.jpg*, Wilfredor, Wikimedia Commons, CC0.

## Teste

```bash
.venv/Scripts/python server/test_core.py
```
