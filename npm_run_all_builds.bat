@echo off
title Compiling OpenWire Distributions...
cd /d "%~dp0"

echo ===================================================
echo  Compiling OpenWire News Aggregator Distributions
echo ===================================================
echo.
echo Running: npm run build
echo.

call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed with error code %ERRORLEVEL%.
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo  Build Successful!
echo   - Root copy:        dist\root\
echo   - Subfolder copy:   dist\news_aggregator\
echo   - GitHub Pages:     docs\
echo ===================================================
echo.
pause
