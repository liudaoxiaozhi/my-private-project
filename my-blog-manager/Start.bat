@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title 星辉云端控制台

rem 依次寻找 Python 3.13 / 3.12 / 3.11 / 3.10（桌面窗口组件对这些版本支持最好），
rem 都没有时再用任意 3.10 以上版本（例如 3.14：后台照常可用，只是可能改为在浏览器中打开）。
set "PY_CMD="
for %%v in (3.13 3.12 3.11 3.10) do (
    if not defined PY_CMD (
        py -%%v -c "import sys" >nul 2>&1 && set "PY_CMD=py -%%v"
    )
)
if not defined PY_CMD (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "PY_CMD=python"
)

if not defined PY_CMD (
    echo [错误] 没有找到 Python 3.10 或更高版本。
    echo        请到 https://www.python.org/downloads/ 安装，安装时勾选 "Add Python to PATH"，然后重新运行。
    pause
    exit /b 1
)

echo [状态] 使用以下 Python 启动控制台：
%PY_CMD% --version
%PY_CMD% run_me.py
if errorlevel 1 (
    echo [错误] 控制台启动失败，请把上面的报错截图发给开发者。
    pause
    exit /b 1
)
exit /b 0
