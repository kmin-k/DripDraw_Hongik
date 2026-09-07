@echo off
REM 개발 서버 두 개를 각각 새 창에서 띄웁니다. 이 파일을 더블클릭하면 됩니다.
REM
REM 서버는 각자의 창에서 계속 돌아갑니다. 끄려면 그 창에서 Ctrl+C 를 누르거나 창을 닫으세요.
REM 앱 설치(PWA)를 시험하려면 개발 서버가 아니라 빌드본이 필요합니다 (README 참고).

cd /d "%~dp0"

start "DripDraw 백엔드" cmd /k "cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
start "DripDraw 프론트" cmd /k "cd frontend && npm run dev"

echo.
echo   백엔드  http://localhost:8000/docs
echo   프론트  http://localhost:5180
echo.
echo   두 창이 열렸습니다. 잠시 뒤 브라우저에서 http://localhost:5180 을 여세요.
echo   (Chrome 또는 Edge - 저울 연결에 Web Bluetooth가 필요합니다)
echo.
pause
