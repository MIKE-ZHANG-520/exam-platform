@echo off
chcp 65001 >nul
title Exam Platform One-Click Deploy

set "PROJECT_DIR=C:\wwwroot\exam-platform"
set "PUBLIC_IP=49.234.191.110"

echo ==================================================
echo   Exam Platform One-Click Deploy
echo   Total 5-8 minutes. Do NOT close this window.
echo ==================================================
echo.

where npm >nul 2>&1
if errorlevel 1 goto :no_node

for /f "tokens=* delims=" %%i in ('npm config get prefix') do set "NPM_PREFIX=%%i"
set "PATH=%PATH%;%NPM_PREFIX%"

if not exist "%PROJECT_DIR%" mkdir "%PROJECT_DIR%"
cd /d "%PROJECT_DIR%"

echo [1/8] Checking project code...
if exist package.json goto :write_env
echo   Code not found. Downloading from GitHub mirror...
curl -sL --connect-timeout 20 -o code.zip https://ghproxy.net/https://github.com/MIKE-ZHANG-520/exam-platform/archive/refs/heads/main.zip
set "ZIPSZ=0"
if exist code.zip for %%F in (code.zip) do set "ZIPSZ=%%~zF"
if %ZIPSZ% GTR 10000 goto :unzip
curl -sL --connect-timeout 20 -o code.zip https://github.com/MIKE-ZHANG-520/exam-platform/archive/refs/heads/main.zip
set "ZIPSZ=0"
if exist code.zip for %%F in (code.zip) do set "ZIPSZ=%%~zF"
if %ZIPSZ% GTR 10000 goto :unzip
echo [ERROR] Code download failed. Network problem.
goto :fail

:unzip
echo   Extracting...
tar -xf code.zip
robocopy exam-platform-main . /E /MOVE /NFL /NDL /NJH /NJS >nul
del code.zip >nul 2>&1
if not exist package.json goto :fail

:write_env
cd /d "%PROJECT_DIR%"
echo [2/8] Writing environment config...
>.env.local echo COZE_SUPABASE_URL=https://br-brave-hoop-e37a86de.supabase2.aidap-global.cn-beijing.volces.com
>>.env.local echo COZE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJhbm9uIn0.9mU2DnfIw_6taCc8ZsXbtThb4DHfoIEZL1GyvFBUkiY
>>.env.local echo COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.khKJViUAHiM04E3w2ooMHYUsPQaSehnnurm972xmwqI
>>.env.local echo COZE_WORKLOAD_API_TOKEN=sat_NAVoOHLPNxX3ndbpWGAVkVdoLn5LS9OG9RKFwMkWSEHkwwa7cYdNB3YBWpFnxzVA
>>.env.local echo PARSE_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
>>.env.local echo WORKER_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
>>.env.local echo COZE_PROJECT_ID=7662435305898786859
>>.env.local echo COZE_PROJECT_DOMAIN_DEFAULT=http://49.234.191.110:5000
>>.env.local echo COZE_PROJECT_ENV=PROD
>>.env.local echo PORT=5000

echo [3/8] Installing pnpm@9 ...
call npm install -g pnpm@9
if errorlevel 1 goto :fail

echo [4/8] Cleaning previous attempt...
if exist node_modules rd /s /q node_modules
if exist .next rd /s /q .next
if exist dist rd /s /q dist

echo [5/8] Installing dependencies (3-5 minutes)...
call pnpm install
if errorlevel 1 goto :fail

echo [6/8] Building application (2-3 minutes)...
call pnpm next build
if errorlevel 1 goto :fail

echo [7/8] Bundling server...
call pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
if not exist dist\server.js goto :fail

echo [8/8] Starting service with pm2...
where pm2 >nul 2>&1
if errorlevel 1 call npm install -g pm2
call pm2 delete exam-platform >nul 2>&1
call pm2 start dist\server.js --name exam-platform --cwd "%PROJECT_DIR%"
call pm2 save

echo   Opening firewall port 5000...
netsh advfirewall firewall delete rule name="exam-5000" >nul 2>&1
netsh advfirewall firewall add rule name="exam-5000" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1

echo   Waiting for service to start...
timeout /t 12 /nobreak >nul
curl -s -o nul -w "   Local test: HTTP %%{http_code}\n" http://localhost:5000

echo.
echo ==================================================
echo   DEPLOY SUCCESS!
echo.
echo   Open in browser:  http://%PUBLIC_IP%:5000
echo.
echo   If not reachable, add inbound rule in Tencent
echo   Cloud Console - Security Group:
echo   TCP  port 5000  source 0.0.0.0/0
echo ==================================================
pause
exit /b 0

:no_node
echo [ERROR] Node.js not found in this terminal.
echo Open a NEW terminal from BaoTa panel and retry.
goto :fail

:fail
echo.
where pm2 >nul 2>&1
if not errorlevel 1 call pm2 logs exam-platform --lines 15 --nostream
echo.
echo [FAILED] Screenshot this window and send it to me.
pause
exit /b 1
