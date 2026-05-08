@echo off
title LingoStream — Stopping...

echo =============================================
echo  LingoStream — Stopping all services
echo =============================================
echo.
echo  Stopping containers (data will be preserved)...
echo.

docker-compose down

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to stop services.
    pause
    exit /b 1
)

echo.
echo [OK] All services stopped. Database volume is preserved.
echo  To restart, double-click start.bat
echo.
pause