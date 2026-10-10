@echo off
title ADB Remote Keyboard Companion Server
cls
echo ==============================================================
echo       ADB Remote Keyboard - Windows Companion Server
echo ==============================================================
echo.

echo [*] Checking connected ADB devices...
adb devices
echo.

echo [*] Setting up ADB port forwarding (reverse tcp:8080 tcp:8080)...
adb reverse tcp:8080 tcp:8080
if %errorlevel% neq 0 (
    echo [!] WARNING: 'adb reverse' failed or no device detected yet.
    echo     Make sure your phone is connected with USB Debugging enabled.
    echo     (Wi-Fi mode will still work if both devices are on the same network)
) else (
    echo [+] ADB port forwarding active! (Phone 'localhost:8080' -^> Laptop '8080')
)
echo.

echo [*] Launching Companion Server...
python "%~dp0server\companion_server.py"

pause
