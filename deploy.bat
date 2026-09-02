@echo off
chcp 65001 >nul
title Exam Platform - One-Click Deploy

REM ============================================================
REM  智慧培训考试平台 Windows 一键部署脚本
REM  等价于 scripts/build.sh + scripts/start.sh（不依赖 bash）
REM ============================================================

cd /d C:\wwwroot\exam-platform
if errorlevel 1 (
    echo [ERROR] Project directory not found: C:\wwwroot\exam-platform
    pause
    exit /b 1
)

echo ============================================================
echo   [1/6] Configuring npm global PATH...
echo ============================================================
for /f "tokens=* delims=" %%i in ('npm config get prefix') do set "NPM_PREFIX=%%i"
set "PATH=%PATH%;%NPM_PREFIX%"
set "PORT=5000"
set "COZE_PROJECT_ENV=PROD"
echo   npm global path: %NPM_PREFIX%

echo ============================================================
echo   [2/6] Checking pnpm...
echo ============================================================
where pnpm >nul 2>&1
if errorlevel 1 (
    echo   Installing pnpm...
    call npm install -g pnpm
    if errorlevel 1 goto :fail
)
pnpm --version

echo ============================================================
echo   [3/6] Installing dependencies - takes 3-5 minutes, DO NOT close this window
echo ============================================================
call pnpm install --prefer-offline
if errorlevel 1 goto :fail

echo ============================================================
echo   [4/6] Building Next.js - takes 2-3 minutes, DO NOT close this window
echo ============================================================
if exist .next rd /s /q .next
if exist .turbo rd /s /q .turbo
call npx next build
if errorlevel 1 goto :fail

echo ============================================================
echo   [5/6] Bundling server entry...
echo ============================================================
call npx tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
if errorlevel 1 goto :fail
if not exist dist\server.js goto :fail

if not exist .env.local (
    echo   [WARN] .env.local not found, database connection may fail.
)

echo ============================================================
echo   [6/6] Starting service with pm2...
echo ============================================================
where pm2 >nul 2>&1
if errorlevel 1 (
    call npm install -g pm2
    if errorlevel 1 goto :fail
)
call pm2 delete exam-platform >nul 2>&1
call pm2 start dist\server.js --name exam-platform
call pm2 save
call pm2 list

echo.
echo ============================================================
echo   DEPLOY SUCCESS!
echo.
echo   Local:   http://localhost:5000
echo   Public:  http://49.234.191.110:5000
echo.
echo   If public URL not reachable:
echo   Open Tencent Cloud Console - Security Group,
echo   add INBOUND rule: TCP port 5000, allow all sources.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo   [FAILED] Deploy stopped. Check error messages above.
echo ============================================================
pause
exit /b 1
