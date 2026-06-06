# 一键注册 / 卸载 Windows 计划任务：开机自动起 bridge-core
#
# 用法（无需管理员）：
#   .\scripts\install-bridge-autostart.ps1            # 安装
#   .\scripts\install-bridge-autostart.ps1 -Uninstall # 卸载
#
# 装完后效果：
#   - 用户登录 Windows 时自动运行 bridge-autostart.ps1
#   - bridge-core 起来；如果已在跑就跳过，绝不重复起
#   - 跑在当前用户身份下（能读 .env / bridge.db）
#   - 看日志：D:\A_Code\Copilot Bridge\bridge-autostart.log + bridge-core.log

[CmdletBinding()]
param(
    [switch]$Uninstall
)

$taskName = "CopilotBridgeCore"
$scriptPath = "D:\A_Code\Copilot Bridge PowerShell\scripts\bridge-autostart.ps1"

if ($Uninstall) {
    Write-Host "卸载计划任务 $taskName ..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "已卸载" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $scriptPath)) {
    Write-Host "FATAL: 找不到 $scriptPath" -ForegroundColor Red
    exit 1
}

# 已存在就先删
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Auto-start Copilot Bridge core (Node.js) at user logon" | Out-Null

Write-Host "" -ForegroundColor White
Write-Host "✅ 计划任务已注册：$taskName" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "  触发：当前用户登录时" -ForegroundColor White
Write-Host "  执行：$scriptPath" -ForegroundColor White
Write-Host "  自重启：失败时 1 分钟内重试，最多 3 次" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "  立即测一次：" -ForegroundColor Yellow
Write-Host "    Start-ScheduledTask -TaskName CopilotBridgeCore" -ForegroundColor Yellow
Write-Host "" -ForegroundColor White
Write-Host "  看任务历史：任务计划程序 → 任务计划程序库 → $taskName" -ForegroundColor White
