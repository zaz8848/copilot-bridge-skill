#requires -Version 5.1
<#
.SYNOPSIS
    bridge-core 开机自启脚本。由计划任务 CopilotBridgeCore 在用户登录时调用。

.DESCRIPTION
    通用版（v0.0.45+）—— 仓库路径自动从脚本所在位置推导，不再硬编码。

    流程：
    1. 推导仓库根 = 本脚本上一级目录
    2. cd 到 bridge-core
    3. node dist/index.js 启动（stderr 写日志到仓库根 bridge-core.log）
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

# 仓库根 = scripts/ 的父目录
$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeCoreDir = Join-Path $repoRoot 'bridge-core'
$entryPoint = Join-Path $bridgeCoreDir 'dist\index.js'
$logFile = Join-Path $repoRoot 'bridge-core.log'

Set-Location $bridgeCoreDir

# 找 node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    "[$(Get-Date)] FATAL: node not in PATH" | Out-File $logFile -Append -Encoding utf8
    exit 1
}

if (-not (Test-Path $entryPoint)) {
    "[$(Get-Date)] FATAL: $entryPoint not found. Run 'pnpm build' first." | Out-File $logFile -Append -Encoding utf8
    exit 2
}

"[$(Get-Date)] starting bridge-core: $entryPoint" | Out-File $logFile -Append -Encoding utf8

# 启动 node，stderr 和 stdout 都写日志
& $nodeCmd.Source $entryPoint *>> $logFile
