# Copilot Bridge - 一键启动脚本
# 启动 bridge-core + cloudflared 临时隧道，并把临时 URL 打印出来供你贴进飞书后台。
#
# 用法：
#   .\scripts\start.ps1
#
# 关闭：在窗口里按 Ctrl+C 或直接关窗口。

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "[start] repo: $repoRoot" -ForegroundColor Cyan

# 0. 检查 .env (mock 模式跳过)
$mockMode = $env:FEISHU_MOCK -eq "1"
if (-not $mockMode -and -not (Test-Path ".env")) {
  Write-Host "[start] FATAL: .env 不存在。请先 cp .env.example .env，然后填入飞书 App ID/Secret/chat_id" -ForegroundColor Red
  exit 1
}
if ($mockMode) {
  Write-Host "[start] FEISHU_MOCK=1 模式：不调真飞书 API，仅用于离线测试" -ForegroundColor Magenta
}

# 1. 把 pnpm + cloudflared 加进 PATH
$pnpmBin = Join-Path $env:LOCALAPPDATA "pnpm\bin"
if (Test-Path $pnpmBin) {
  $env:PATH = "$pnpmBin;$env:PATH"
}
# winget 装的 cloudflared 路径
$cfWingetDir = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe"
if (Test-Path (Join-Path $cfWingetDir "cloudflared.exe")) {
  $env:PATH = "$cfWingetDir;$env:PATH"
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "[start] FATAL: 找不到 cloudflared。请先 winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

# (旧的 pnpm PATH 段)
$pnpmBin2 = Join-Path $env:LOCALAPPDATA "pnpm\bin"

# 2. 检查 dist 是否已 build
if (-not (Test-Path "bridge-core\dist\index.js")) {
  Write-Host "[start] 首次启动，编译中..." -ForegroundColor Yellow
  pnpm install
  if ($LASTEXITCODE -ne 0) { Write-Host "[start] pnpm install 失败" -ForegroundColor Red; exit 1 }
  pnpm build
  if ($LASTEXITCODE -ne 0) { Write-Host "[start] pnpm build 失败" -ForegroundColor Red; exit 1 }
}

# 2.5 自动清理：如果已有 bridge 占着 3000 / 旧 cloudflared 在跑 → 杀
# 注意：只杀 127.0.0.1:3000（bridge-core 的 binding）。如果另一个进程占 0.0.0.0:3000
# （比如别人项目的 server.js），不要杀别人的进程——只警告 + 让 bridge 失败暴露问题。
$port3000All = @(Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Where-Object State -eq Listen)
$ownPort = $port3000All | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1
$foreignPort = $port3000All | Where-Object { $_.LocalAddress -in @('0.0.0.0','::') } | Select-Object -First 1
if ($ownPort) {
  Write-Host "[start] 检测到端口 127.0.0.1:3000 被占用 (pid=$($ownPort.OwningProcess))，杀旧 bridge..." -ForegroundColor Yellow
  Stop-Process -Id $ownPort.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}
if ($foreignPort) {
  Write-Host "[start] 警告：另一个进程在监听 0.0.0.0:3000 (pid=$($foreignPort.OwningProcess))" -ForegroundColor Red
  Write-Host "[start]   这不会阻止 bridge 起来（bridge 绑 127.0.0.1），但会让 cloudflared 用 'localhost' 时静默转到错的进程。" -ForegroundColor Red
  Write-Host "[start]   确认 cloudflared config.yml 的 service 字段用 'http://127.0.0.1:3000' 而非 'http://localhost:3000'。" -ForegroundColor Red
}
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "[start] 杀旧 cloudflared pid=$($_.Id)" -ForegroundColor Yellow
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# 3. 起 bridge-core (后台进程)
Write-Host "[start] 启动 bridge-core..." -ForegroundColor Cyan
$coreLog = Join-Path $repoRoot "bridge-core.log"
$coreProc = Start-Process -FilePath "node" `
  -ArgumentList "bridge-core\dist\index.js" `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -RedirectStandardError $coreLog `
  -NoNewWindow

Start-Sleep -Seconds 2

# 等 core 起来 (最多 15s)
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 1 -ErrorAction Stop
    if ($r.ok) { $ok = $true; break }
  }
  catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) {
  Write-Host "[start] bridge-core 启动失败，看日志 $coreLog" -ForegroundColor Red
  if (-not $coreProc.HasExited) { Stop-Process -Id $coreProc.Id -Force }
  exit 1
}
Write-Host "[start] bridge-core ready (pid=$($coreProc.Id))" -ForegroundColor Green

# 4. 起 cloudflared 隧道
# 默认走命名隧道 (copilot-bridge → copilot-bridge.top)，URL 永久不变
# 若想退回临时隧道（trycloudflare.com），设 $env:BRIDGE_TUNNEL_MODE = "temp"
$tunnelMode = if ($env:BRIDGE_TUNNEL_MODE) { $env:BRIDGE_TUNNEL_MODE } else { "named" }
$cfLog = Join-Path $repoRoot "cloudflared.log"
if (Test-Path $cfLog) { Remove-Item $cfLog -Force }

if ($tunnelMode -eq "named") {
  Write-Host "[start] 启动 cloudflared 命名隧道 copilot-bridge → copilot-bridge.top..." -ForegroundColor Cyan
  $cfProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "run", "copilot-bridge" `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -RedirectStandardError $cfLog `
    -NoNewWindow

  # 等隧道建立连接 (最多 30s)
  $tunnelReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $cfLog) {
      $content = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
      if ($content -and ($content -match "Registered tunnel connection|Connection .* registered")) {
        $tunnelReady = $true
        break
      }
    }
  }

  if (-not $tunnelReady) {
    Write-Host "[start] cloudflared 命名隧道未建立连接，看日志 $cfLog" -ForegroundColor Red
    Write-Host "[start] 提示：若 NS 未生效（< 24h），命名隧道可能连不上；可临时切回 \$env:BRIDGE_TUNNEL_MODE='temp'" -ForegroundColor Yellow
    if (-not $cfProc.HasExited) { Stop-Process -Id $cfProc.Id -Force }
    if (-not $coreProc.HasExited) { Stop-Process -Id $coreProc.Id -Force }
    exit 1
  }

  $publicUrl = "https://copilot-bridge.top"
}
else {
  Write-Host "[start] 启动 cloudflared 临时隧道（兜底模式）..." -ForegroundColor Cyan
  $cfProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:3000" `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -RedirectStandardError $cfLog `
    -NoNewWindow

  # 等 URL 出现 (最多 30s)
  $publicUrl = $null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $cfLog) {
      $content = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
      if ($content -and ($content -match "https://[a-z0-9-]+\.trycloudflare\.com")) {
        $publicUrl = $Matches[0]
        break
      }
    }
  }

  if (-not $publicUrl) {
    Write-Host "[start] cloudflared 没拿到 URL，看日志 $cfLog" -ForegroundColor Red
    if (-not $cfProc.HasExited) { Stop-Process -Id $cfProc.Id -Force }
    if (-not $coreProc.HasExited) { Stop-Process -Id $coreProc.Id -Force }
    exit 1
  }
}

# 把 URL 写到根目录，方便你随手 cat
$webhookUrl = "$publicUrl/webhook/feishu"
$prevUrl = if (Test-Path ".cloudflared-url") { (Get-Content ".cloudflared-url" -Raw).Trim() } else { "" }
$urlChanged = ($prevUrl -ne "" -and $prevUrl -ne $webhookUrl)
"$webhookUrl" | Out-File -FilePath ".cloudflared-url" -Encoding utf8 -NoNewline

Write-Host "" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Copilot Bridge 已就绪" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "  本地 API : http://127.0.0.1:3000" -ForegroundColor White
Write-Host "  公网入口 : $publicUrl" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "  📋 把下面这个 URL 贴进飞书开放平台" -ForegroundColor Yellow
Write-Host "     『事件与回调 → 事件配置 → 请求地址』:" -ForegroundColor Yellow
Write-Host "" -ForegroundColor White
Write-Host "     $webhookUrl" -ForegroundColor Cyan
Write-Host "" -ForegroundColor White
Write-Host "  (URL 也已写入 .cloudflared-url)" -ForegroundColor DarkGray
Write-Host "" -ForegroundColor White
Write-Host "  ⚠️  关闭本窗口或 Ctrl+C 即停止 bridge" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green

if ($urlChanged) {
  Write-Host "" -ForegroundColor White
  Write-Host "⚠️  注意：cloudflared URL 跟上次不一样了！" -ForegroundColor Red
  Write-Host "   旧:  $prevUrl" -ForegroundColor DarkGray
  Write-Host "   新:  $webhookUrl" -ForegroundColor Cyan
  Write-Host "   必须打开飞书开放平台，把新 URL 贴到事件订阅请求地址，否则收不到回复！" -ForegroundColor Yellow
  Write-Host "" -ForegroundColor White

  # 自动跑同步辅助脚本：复制 URL 到剪贴板 + 打开浏览器
  if ($env:BRIDGE_AUTO_SYNC_URL -ne 'false' -and (Test-Path "$PSScriptRoot\sync-feishu-url.ps1")) {
    Write-Host "[start] 自动调起 sync-feishu-url.ps1（剪贴板已就绪，浏览器即将打开）" -ForegroundColor Cyan
    & "$PSScriptRoot\sync-feishu-url.ps1"
  }
}

# 监控两个进程，任一挂掉就一起停
try {
  while (-not $coreProc.HasExited -and -not $cfProc.HasExited) {
    Start-Sleep -Seconds 5
  }
}
finally {
  Write-Host "[start] 关闭子进程..." -ForegroundColor Yellow
  if (-not $cfProc.HasExited) { Stop-Process -Id $cfProc.Id -Force -ErrorAction SilentlyContinue }
  if (-not $coreProc.HasExited) { Stop-Process -Id $coreProc.Id -Force -ErrorAction SilentlyContinue }
}
