@echo off
title ID Photo Studio - Auto-Grid Print Server
cd /d "%~dp0"
echo ========================================================
echo   Starting ID Photo Studio Mobile Web App...
echo ========================================================
echo.
echo Local PC:       http://localhost:8000
echo Access on Phone via your local Wi-Fi (see console below)
echo.
echo Press Ctrl+C in this window to stop the server anytime.
echo.
start "" http://localhost:8000
"C:\Users\aleja\AppData\Local\hermes\installs\c8bc79585a8fdea7\environments\7d27db3ebe5241398232d4cc3b3c3203\venv\Scripts\python.exe" app.py
pause
