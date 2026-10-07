@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title XHBlogs 正式模式预览

rem 正式模式：先完整构建，再以线上相同的方式运行。速度和流畅度与部署后一致，适合检查性能。
rem 改了文章或代码后需要重新运行本脚本才能看到变化（开发时请用「本地预览.bat」）。

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 20.9 或更高版本：https://nodejs.org/
    pause
    exit /b 1
)

if not exist ".env.local" (
    if exist ".env.example" copy ".env.example" ".env.local" >nul
)

call npm ls --depth=0 >nul 2>&1
if errorlevel 1 (
    echo [1/3] 正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络或尝试：npm config set registry https://registry.npmmirror.com
        pause
        exit /b 1
    )
)

echo [2/3] 正在构建（约 1-3 分钟）...
call npm run build
if errorlevel 1 (
    echo [错误] 构建失败，请把上面的报错截图发给开发者。
    pause
    exit /b 1
)

echo [3/3] 启动完成后浏览器将打开 http://localhost:3000
start "" cmd /c "timeout /t 4 >nul && start http://localhost:3000"
call npm run start
pause
