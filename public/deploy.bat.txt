@echo off
title Exam Platform Deploy
cd /d C:\wwwroot\exam-platform

for /f "tokens=* delims=" %%i in ('npm config get prefix') do set "PATH=%PATH%;%%i"
where npm >nul 2>&1
if errorlevel 1 goto :no_node

echo [1/6] Writing config...
> .env.local echo COZE_SUPABASE_URL=https://br-brave-hoop-e37a86de.supabase2.aidap-global.cn-beijing.volces.com
>>.env.local echo COZE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJhbm9uIn0.9mU2DnfIw_6taCc8ZsXbtThb4DHfoIEZL1GyvFBUkiY
>>.env.local echo COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjQ2NDYwNTAsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.khKJViUAHiM04E3w2ooMHYUsPQaSehnnurm972xmwqI
>>.env.local echo COZE_WORKLOAD_API_TOKEN=sat_NAVoOHLPNxX3ndbpWGAVkVdoLn5LS9OG9RKFwMkWSEHkwwa7cYdNB3YBWpFnxzVA
>>.env.local echo PARSE_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
>>.env.local echo WORKER_API_TOKEN=ca2f1040f0f32eed40d1ea758e5290e5fc879933d6a8ca87916c87a4d891d9ce
>>.env.local echo COZE_PROJECT_ID=7662435305898786859
>>.env.local echo COZE_PROJECT_DOMAIN_DEFAULT=http://49.234.191.110:5000
>>.env.local echo COZE_PROJECT_ENV=PROD
>>.env.local echo PORT=5000

echo [2/6] Installing pnpm@9 ...
call npm install -g pnpm@9
if errorlevel 1 goto :fail

echo [3/6] Cleaning old files ...
if exist node_modules rd /s /q node_modules
if exist .next rd /s /q .next
if exist dist rd /s /q dist

echo [4/6] Installing dependencies - wait 3-5 min ...
call pnpm install
if errorlevel 1 goto :fail

echo [5/6] Building - wait 2-3 min ...
call pnpm next build
if errorlevel 1 goto :fail
call pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
if not exist dist\server.js goto :fail

echo [6/6] Starting service ...
where pm2 >nul 2>&1
if errorlevel 1 call npm install -g pm2
call pm2 delete exam-platform >nul 2>&1
call pm2 start dist\server.js --name exam-platform --cwd "C:\wwwroot\exam-platform"
call pm2 save

netsh advfirewall firewall delete rule name="exam-5000" >nul 2>&1
netsh advfirewall firewall add rule name="exam-5000" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1

echo Waiting for service to start ...
timeout /t 12 /nobreak >nul
curl -s -o nul -w "Local check: HTTP %%{http_code}\n" http://localhost:5000

echo.
echo ==========================================
echo   DEPLOY SUCCESS
echo   Browser: http://49.234.191.110:5000
echo ==========================================
pause
exit /b 0

:no_node
echo ERROR: npm not found. Open a NEW BaoTa terminal then retry.
pause
exit /b 1

:fail
echo.
echo FAILED! Screenshot this window and send to me.
pause
exit /b 1
