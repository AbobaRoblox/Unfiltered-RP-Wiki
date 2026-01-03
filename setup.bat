@echo off
chcp 65001
echo ================================
echo   UNFILTERED RP FORUM - Setup
echo ================================
echo.

if not exist "uploads" mkdir uploads
echo [OK] Uploads folder created

cd server

echo Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed successfully!
echo.
echo Starting server...
call npm start

