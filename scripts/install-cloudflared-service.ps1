#requires -Version 5.1
<#
.SYNOPSIS
    Install cloudflared as Windows service (named tunnel mode).

.DESCRIPTION
    通用版本（v0.0.45+）—— 不再硬编码任何用户名 / 路径 / 隧道 UUID。

    需要：
    - C:\ProgramData\Cloudflared\ 已放好：cert.pem / <UUID>.json / config.yml
    - cloudflared.exe 可在 PATH 找到（winget install Cloudflare.cloudflared）

    流程：
    1. 清残留服务 + EventLog 注册表
    2. 找到 cloudflared.exe 真实路径（绕过 WinGet shim）
    3. service install
    4. 强制重写 binPath 加上 --config + tunnel run（避免 shim 不透传）
    5. 启动 + 验证

.NOTES
    必须管理员权限运行。
#>
[CmdletBinding()]
param(
    [string]$ConfigDir = "C:\ProgramData\Cloudflared"
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---- 管理员权限检查 ----
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Re-run from an elevated PowerShell." -ForegroundColor Yellow
    exit 1
}

$logPath = Join-Path $env:TEMP 'cf-install.log'
"=== cloudflared service install ($(Get-Date)) ===" | Out-File $logPath -Encoding utf8

function Log($msg) {
    Write-Host $msg
    $msg | Out-File $logPath -Append -Encoding utf8
}

# ---- Step 0: 前置检查 ----
Log "[0] preflight check: ConfigDir=$ConfigDir"
if (-not (Test-Path $ConfigDir)) {
    Log "[FATAL] $ConfigDir does not exist. Please copy cert.pem / <UUID>.json / config.yml there first."
    exit 2
}
$configYml = Join-Path $ConfigDir 'config.yml'
if (-not (Test-Path $configYml)) {
    Log "[FATAL] $configYml not found."
    exit 2
}
$cert = Join-Path $ConfigDir 'cert.pem'
if (-not (Test-Path $cert)) {
    Log "[FATAL] $cert not found."
    exit 2
}
$jsonFiles = Get-ChildItem $ConfigDir -Filter '*.json' -ErrorAction SilentlyContinue
if ($jsonFiles.Count -eq 0) {
    Log "[FATAL] No <UUID>.json found in $ConfigDir"
    exit 2
}
Log "  Found: $($jsonFiles[0].Name)"

# ---- Step 1: 找 cloudflared.exe 真实路径（绕过 winget shim）----
Log "[1] locate cloudflared.exe"
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Log "[FATAL] cloudflared not in PATH. Run: winget install Cloudflare.cloudflared"
    exit 3
}
$cfExe = $cf.Source
Log "  Get-Command found: $cfExe"

# WinGet shim 不会把 service install 时的参数透传给真实 exe，
# 必须找真实 .exe（在 WinGet\Packages\ 下面）
if ($cfExe -match '\\WinGet\\Links\\') {
    $realExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
        -Recurse -Filter 'cloudflared.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($realExe) {
        $cfExe = $realExe.FullName
        Log "  Resolved shim -> $cfExe"
    } else {
        Log "[WARN] WinGet shim detected but real exe not found in WinGet\Packages\"
    }
}

# ---- Step 2: 清残留 ----
Log "[2] clean previous service + EventLog reg"
sc.exe stop Cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
Start-Sleep 3
sc.exe delete Cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
sc.exe delete cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
Start-Sleep 2
Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared" `
    -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\cloudflared" `
    -Recurse -Force -ErrorAction SilentlyContinue
Log "  cleaned"

# ---- Step 3: service install ----
Log "[3] cloudflared service install"
& $cfExe --config $configYml service install 2>&1 | Tee-Object -Append -FilePath $logPath
Start-Sleep 3

# ---- Step 4: 强制重写 binPath（核心修复 P1 #8）----
# cloudflared service install 注册服务时可能用 Get-Command 找路径，
# 在 PATH 里如果是 WinGet shim 会被注册成 shim，导致服务跑了不连隧道。
# 这里 sc.exe config 强制改成真实 exe + 完整参数。
Log "[4] force rewrite binPath to bypass any shim issue"
Stop-Service Cloudflared -ErrorAction SilentlyContinue
Start-Sleep 2
$binPath = "`"$cfExe`" --config `"$configYml`" --no-autoupdate tunnel run"
Log "  new binPath: $binPath"
sc.exe config Cloudflared binPath= $binPath 2>&1 | Tee-Object -Append -FilePath $logPath
sc.exe config Cloudflared start= auto 2>&1 | Tee-Object -Append -FilePath $logPath

# ---- Step 5: 验证 sc qc ----
Log "[5] sc qc Cloudflared"
sc.exe qc Cloudflared 2>&1 | Tee-Object -Append -FilePath $logPath

# ---- Step 6: 启动 + 验证 ----
Log "[6] start service"
Start-Service Cloudflared
Start-Sleep 8

$svc = Get-Service Cloudflared
Log "  service status: $($svc.Status)"

# health check via tunnel
try {
    # 从 config.yml 抓 hostname
    $yml = Get-Content $configYml -Raw
    if ($yml -match 'hostname:\s*([^\s]+)') {
        $hostname = $Matches[1]
        Log "[7] health check: https://$hostname/health"
        $r = Invoke-WebRequest "https://$hostname/health" -UseBasicParsing -TimeoutSec 8
        Log "  HTTP $($r.StatusCode): $($r.Content)"
    }
} catch {
    Log "[WARN] health check failed: $_"
    Log "  bridge-core may not be running yet (start it first)"
}

Log "=== done ==="
Write-Host "`nLog saved to: $logPath" -ForegroundColor Cyan
