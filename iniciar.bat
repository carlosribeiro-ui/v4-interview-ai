@echo off
setlocal enabledelayedexpansion
title V4 Interview AI
cd /d "%~dp0"

echo ============================================
echo       V4 Interview AI - Iniciar
echo ============================================
echo.

:: --- Verificar / instalar dependencias Node ---
if not exist "node_modules\" (
    echo [*] Instalando dependencias Node...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

:: --- .env.local ---
if not exist ".env.local" (
    echo [*] Criando .env.local de exemplo...
    copy ".env.local.example" ".env.local" >nul
    echo.
    echo ============================================
    echo   .env.local criado.
    echo   Preencha GEMINI_API_KEY.
    echo ============================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Tudo pronto!
echo.
echo   Dashboard:  http://localhost:3001
echo   Analisar:   http://localhost:3001/admin/perguntas
echo   LLM:        Gemini 2.5 Flash (Google)
echo   Visao:      Gemini 2.5 Flash (frames)
echo   Transcricao: Gemini 2.5 Flash (audio nativo)
echo   Custo:      ~R$ 0,05 por entrevista (5min)
echo ============================================
echo.
start http://localhost:3001
npm run dev

pause
