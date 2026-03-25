@echo off
cd /d "%~dp0"
git add -A
git commit -m "fix: corrections et améliorations Lumera"
git push
echo.
echo Push terminé !
pause
