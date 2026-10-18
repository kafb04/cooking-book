@echo off
rem Abre o Livro de Receitas. Deixe esta janela aberta enquanto usa o livro.
rem Celular: https://<nome-do-pc>.<sua-rede>.ts.net (o "tailscale serve --bg 8000" fica salvo no Tailscale)
cd /d "%~dp0"
title Livro de Receitas
.venv\Scripts\python -m uvicorn app:app --app-dir server --host 127.0.0.1 --port 8000
pause
