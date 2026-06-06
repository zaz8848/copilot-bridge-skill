#requires -Version 5.1
<#
.SYNOPSIS
    注册 Windows 计划任务 CopilotBridgeCore（登录时自启 bridge-core）。

.DESCRIPTION
    通用版（v0.0.45+）—— 脚本路径自动推导，不再硬编码。

.NOTES
    不需要管理员权限（计划任务以当前用户身份注册）。
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'CopilotBridgeCore'
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 自启脚本路径 = 本脚本同目录下 bridge-autostart.ps1
$autostartScript = Join-Path $PSScriptRoot 'bridge-autostart.ps1'

if (-not (Test-Path $autostartScript)) {
    Write-Host "[FATAL] $autostartScript not found" -ForegroundColor Red
    exit 1
}

Write-Host "[install-bridge-autostart] registering task '$TaskName'" -ForegroundColor Yellow
Write-Host "  script: $autostartScript"

# 删旧任务（不报错）
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 注册
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$autostartScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Auto-start copilot-bridge-skill bridge-core on user logon" | Out-Null

Write-Host "[install-bridge-autostart] OK. Task registered." -ForegroundColor Green
Write-Host ""
Write-Host "Verify: Get-ScheduledTask -TaskName $TaskName"
Write-Host "Test now: Start-ScheduledTask -TaskName $TaskName"
Write-Host "Unregister: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
