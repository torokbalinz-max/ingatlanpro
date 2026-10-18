@echo off
rem IngatlanPro iratok szinkron - egyszeri futtatas (a Feladatutemezo is ezt hivja, rejtve)
cd /d "%~dp0"
node "%~dp0iratok-szinkron.js" %*
