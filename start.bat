@echo off
title LingoStream — Starting...

echo =============================================
echo  LingoStream — Starting all services
echo =============================================
echo.
echo  This will build and start:
echo    - PostgreSQL (port 5432)
echo    - Redis (port 6379)
echo    - Backend API (port 8000)
echo    - Frontend (port 80)
echo.
echo  Once ready, open:
echo    http://localhost        (this machine)
echo    http://<YOUR_LAN_IP>  (other devices)
echo.
echo =============================================
echo.

docker-compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start. Check Docker Desktop is running.
    pause
    exit /b 1
)

echo.
echo [OK] Services starting up...
echo.
echo  Check status: docker-compose ps
echo  View logs:    docker-compose logs -f
echo  Stop:         double-click stop.bat
echo.

timeout /t 3 /nobreak >nul
echo  Waiting for backend health check...
timeout /t 5 /nobreak >nul

echo.
echo  Attempting to connect...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost/api/v1/auth/me' -ErrorAction Stop; if ($r.StatusCode -eq 200) { Write-Host '✓ Frontend + Backend are LIVE!' -ForegroundColor Green } } catch { Write-Host 'Waiting for services... (run docker-compose logs -f)' -ForegroundColor Yellow }"

echo.
echo =============================================
echo  LingoStream is running!
echo  http://localhost
echo =============================================
echo.
pause