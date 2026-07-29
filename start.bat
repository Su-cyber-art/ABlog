@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   Mo Blog / 默·博客
echo   前台  http://localhost:3000
echo   后台  http://localhost:3000/admin
echo   首次启动会在终端显示随机后台密码
echo   (按 Ctrl+C 停止服务)
echo ============================================
node server.js
echo.
echo 服务已停止。若上方报错 “无法将node识别为命令”,
echo 请先到 https://nodejs.org 安装 Node.js 22.13+（22.x）或最新 LTS 再试。
pause
