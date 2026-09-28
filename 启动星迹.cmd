@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE (
  echo 请先安装 Node.js 18 或更新版本，然后重新双击此文件。
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)
echo 正在启动星迹。使用期间请保持此窗口开启，关闭窗口会停止服务。
"%NODE_EXE%" server.cjs --open
if errorlevel 1 (
  echo 启动失败。请查看上方说明；端口被占用时可先关闭之前的星迹窗口。
  pause
)
endlocal
