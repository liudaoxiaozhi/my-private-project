@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title XHBlogs 本地预览

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 20.9 或更高版本：https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% lss 20 (
    echo [错误] 当前 Node.js 版本过低，Next.js 16 需要 20.9 或更高版本。
    node -v
    pause
    exit /b 1
)

if not exist ".env.local" (
    if exist ".env.example" (
        copy ".env.example" ".env.local" >nul
        echo [提示] 已生成 .env.local，按需填写密钥（留空也能预览）。
    )
)

if not exist "node_modules" (
    echo [1/2] 首次运行，正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络或尝试：npm config set registry https://registry.npmmirror.com
        pause
        exit /b 1
    )
)

echo [2/2] 正在启动开发服务器，浏览器将自动打开 http://localhost:3000
start "" cmd /c "timeout /t 6 >nul && start http://localhost:3000"
call npm run dev
pause
