@echo off
chcp 65001 >nul
title Exam Platform - GitHub One-Click Deploy

set "PROJECT_DIR=C:\wwwroot\exam-platform"
set "PUBLIC_IP=49.234.191.110"
set "ZIPSZ=0"

echo ============================================
echo   Exam Platform - One-Click Deploy
echo   Total time: 5-8 minutes. DO NOT close!
echo ============================================
echo.

REM ---- 0. Fix PATH ----
for /f "tokens=* delims=" %%i in ('npm config get prefix') do set "NPM_PREFIX=%%i"
set "PATH=%PATH%;%NPM_PREFIX%"
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js v20 first.
    pause
    exit /b 1
)

REM ---- 1. Download code with 3 sources ----
echo [1/7] Downloading code from GitHub...
if exist "%PROJECT_DIR%" rd /s /q "%PROJECT_DIR%"
mkdir "%PROJECT_DIR%"
cd /d "%PROJECT_DIR%"
set "ZIPSZ=0"
curl -sL --connect-timeout 20 -o code.zip https://github.com/MIKE-ZHANG-520/exam-platform/archive/refs/heads/main.zip
for %%F in (code.zip) do set "ZIPSZ=%%~zF"
if %ZIPSZ% GTR 10000 goto :extract
echo   Direct download failed. Trying mirror 1...
set "ZIPSZ=0"
curl -sL --connect-timeout 20 -o code.zip https://ghproxy.net/https://github.com/MIKE-ZHANG-520/exam-platform/archive/refs/heads/main.zip
for %%F in (code.zip) do set "ZIPSZ=%%~zF"
if %ZIPSZ% GTR 10000 goto :extract
echo   Mirror 1 failed. Trying mirror 2...
set "ZIPSZ=0"
curl -sL --connect-timeout 20 -o code.zip https://gh-proxy.com/https://github.com/MIKE-ZHANG-520/exam-platform/archive/refs/heads/main.zip
for %%F in (code.zip) do set "ZIPSZ=%%~zF"
if %ZIPSZ% GTR 10000 goto :extract
echo   All download sources failed.
echo   Check server network access to GitHub.
goto :fail

:extract
echo   Download OK. Extracting...
tar -xf code.zip
if not exist exam-platform-main goto :fail
robocopy exam-platform-main . /E /MOVE /NFL /NDL /NJH /NJS >nul
if errorlevel 8 goto :fail
del code.zip >nul 2>&1
if not exist package.json goto :fail

REM ---- 2. Write env ----
echo [2/7] Writing environment config...
> .env.local (
echo COZE_SUPABASE_URL=https://br-brave-hoop-e37a86de.supabase2.aidap-global.cn-beijing.volces.com
echo COZE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJhbm9uIn0.9mU2DnfIw_6taCc8ZsXbtThb4DHfoIEZL1GyvFBUkiY
echo COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.khKJViUAHiM04E3w2ooMHYUsPQaSehnnurm972xmwqI
echo COZE_WORKLOAD_API_TOKEN=sat_NAVoOHLPNxX3ndbpWGAVkVdoLn5LS9OG9RKFwMkWSEHkwwa7cYdNB3YBWpFnxzVA
echo PARSE_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
echo WORKER_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
echo COZE_PROJECT_ID=7662435305898786859
echo COZE_PROJECT_DOMAIN_DEFAULT=http://49.234.191.110:5000
echo COZE_PROJECT_ENV=PROD
echo PORT=5000
)

REM ---- 3. pnpm 9 ----
echo [3/7] Preparing pnpm@9...
call npm install -g pnpm@9 --silent
if errorlevel 1 goto :fail

REM ---- 4. Install deps ----
echo [4/7] Installing dependencies - 3 to 5 min...
call pnpm install
if errorlevel 1 goto :fail

REM ---- 5. Build ----
echo [5/7] Building Next.js - 2 to 3 min...
if exist .next rd /s /q .next
call npx next build
if errorlevel 1 goto :fail

REM ---- 6. Bundle server ----
echo [6/7] Bundling server...
call npx tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
if not exist dist\server.js goto :fail

REM ---- 7. pm2 ----
echo [7/7] Starting service...
where pm2 >nul 2>&1
if errorlevel 1 call npm install -g pm2 --silent
call pm2 delete exam-platform >nul 2>&1
call pm2 start dist\server.js --name exam-platform --cwd "%PROJECT_DIR%"
call pm2 save
call pm2 list

echo.
echo ============================================
echo   DEPLOY SUCCESS!
echo.
echo   Local:   http://localhost:5000
echo   Public:  http://%PUBLIC_IP%:5000
echo.
echo   FINAL STEP - Tencent Cloud Console:
echo   Security Group - add INBOUND rule:
echo   TCP / Port 5000 / Source 0.0.0.0/0
echo ============================================
pause
exit /b 0

:fail
echo.
echo [FAILED] Check error messages above.
pause
exit /b 1
