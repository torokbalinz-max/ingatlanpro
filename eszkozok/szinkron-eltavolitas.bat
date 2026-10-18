@echo off
schtasks /Delete /F /TN "IngatlanPro iratok szinkron"
echo A szinkron leallitva. A mar letoltott iratok megmaradnak.
pause
