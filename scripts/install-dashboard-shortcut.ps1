#requires -Version 5.1
<#
.SYNOPSIS
    在仓库根目录生成 "Copilot Bridge Dashboard.url" 快捷方式，双击直接开浏览器到本地 dashboard。

.DESCRIPTION
    Dashboard 是 bridge-core 内置的本地 web UI（http://127.0.0.1:3000/dashboard），
    127.0.0.1 only，公网访问不到，安全。

    本脚本生成 .url 文件（Internet Shortcut）到仓库根目录，
    双击会用系统默认浏览器打开。已被 .gitignore 排除，不会进 git。

.PARAMETER Url
    Dashboard 完整 URL，默认从 copilot-bridge.config.json 读 server.port 拼出来。

.EXAMPLE
    .\scripts\install-dashboard-shortcut.ps1
    .\scripts\install-dashboard-shortcut.ps1 -Url http://127.0.0.1:3001/dashboard
#>
[CmdletBinding()]
param(
    [string]$Url
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

# 没传 URL 就从 config 读端口
if (-not $Url) {
    $configPath = Join-Path $repoRoot 'copilot-bridge.config.json'
    $port = 3000
    if (Test-Path $configPath) {
        try {
            $raw = Get-Content $configPath -Raw
            $stripped = $raw -replace '(?m)^\s*//.*$', '' -replace '/\*[\s\S]*?\*/', ''
            $cfg = $stripped | ConvertFrom-Json
            if ($cfg.server.port) { $port = $cfg.server.port }
        } catch {
            Write-Host "[WARN] 读 config 失败，用默认端口 3000: $_" -ForegroundColor Yellow
        }
    }
    $Url = "http://127.0.0.1:$port/dashboard"
}

Write-Host "Dashboard URL: $Url" -ForegroundColor Cyan

# .url 文件内容（Internet Shortcut 格式）
$urlContent = @"
[InternetShortcut]
URL=$Url
IconIndex=0
"@

# 目标位置：仓库根目录
$shortcutName = 'Copilot Bridge Dashboard.url'
$target = Join-Path $repoRoot $shortcutName

[System.IO.File]::WriteAllText($target, $urlContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Created: $target" -ForegroundColor Green

Write-Host ""
Write-Host "OK. 双击 '$shortcutName' 即可开 Dashboard。" -ForegroundColor Green
Write-Host "前提：bridge-core 在跑（计划任务 CopilotBridgeCore 已注册的话开机自启）。"
