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
where node >nul 2>nul
if errorlevel 1 goto :missing_node
if not exist "node_modules\markdown-it\package.json" (
  echo 首次运行，正在安装锁定依赖...
  call npm ci --ignore-scripts
  if errorlevel 1 goto :install_failed
)
node server.js
echo.
echo 服务已停止。
pause
exit /b

:missing_node
echo 未检测到 Node.js。
echo 请先到 https://nodejs.org 安装 Node.js 22.13+（22.x）或最新 LTS 再试。
pause
exit /b 1

:install_failed
echo 依赖安装失败，请检查网络后执行 npm ci --ignore-scripts 再试。
pause
exit /b 1
