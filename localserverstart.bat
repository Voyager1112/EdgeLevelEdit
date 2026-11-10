@echo off
chcp 65001 >nul
set "URL=http://localhost:8000/index.html"
start "" "%URL%"
echo 地址：%URL%
python -m http.server 8000
timeout /t 1 /nobreak >nul
