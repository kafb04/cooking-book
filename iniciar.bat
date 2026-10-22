@echo off
rem Abre o Livro de Receitas. Deixe esta janela aberta enquanto usa o livro.
rem PC: http://localhost:8000   Celular (com Tailscale ligado): https://<nome-do-pc>.<sua-rede>.ts.net
cd /d "%~dp0"
title Livro de Receitas
rem Religa o endereço HTTPS do Tailscale (não faz mal se já estiver ligado)
"C:\Program Files\Tailscale\tailscale.exe" serve --bg 8000
.venv\Scripts\python -m uvicorn app:app --app-dir server --host 127.0.0.1 --port 8000
pause
