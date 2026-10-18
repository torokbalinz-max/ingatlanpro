@echo off
chcp 65001 >nul
title IngatlanPro iratok szinkron - telepites
echo.
echo  IngatlanPro - iratok automatikus letoltese a gepre
echo  ==================================================
echo.
echo  Hova: %USERPROFILE%\Documents\IngatlanPro iratok
echo  Mikor: oranként, ha a gep be van kapcsolva
echo.
where node >/dev/null 2>nul
if errorlevel 1 (
  echo  HIBA: a Node.js nincs telepitve. Toltsd le: https://nodejs.org  ^(LTS^), utana futtasd ujra.
  pause
  exit /b 1
)
echo  1. lepes: az oldal cime es a kulcs
echo     ^(a kulcs: Admin - Irattar - Szinkron a gepre - Uj kulcs^)
echo.
node "%~dp0iratok-szinkron.js" --beallit
if errorlevel 1 (
  echo.
  echo  Nem sikerult. Nezd meg a fenti uzenetet, es probald ujra.
  pause
  exit /b 1
)
echo.
echo  2. lepes: oranként automatikusan ^(Windows Feladatutemezo^)
schtasks /Create /F /SC HOURLY /MO 1 /TN "IngatlanPro iratok szinkron" /TR "wscript.exe \"%~dp0iratok-szinkron-rejtett.vbs\""
if errorlevel 1 (
  echo  A feladat letrehozasa nem sikerult - a szinkront kezzel is futtathatod: iratok-szinkron.bat
) else (
  echo  Kesz! Oranként magatol letolti az uj iratokat.
)
echo.
echo  Leallitas: szinkron-eltavolitas.bat
echo.
pause
