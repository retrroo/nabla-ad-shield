@echo off
title Nabla Ad Shield - Installer
echo ========================================================
echo        NABLA AD SHIELD - QUICK INSTALLATION
echo ========================================================
echo.
echo 1. Opening Google Chrome Extensions page...
start chrome chrome://extensions
echo.
echo 2. Instructions:
echo    a. Enable "Developer mode" toggle in the top-right corner.
echo    b. Click "Load unpacked" in the top-left toolbar.
echo    c. Select THIS folder:
echo       %~dp0
echo.
echo ========================================================
echo Done! Enjoy pure, distraction-free browsing with Nabla.
echo ========================================================
echo.
pause
