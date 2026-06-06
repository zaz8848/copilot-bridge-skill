$ErrorActionPreference = "Continue"
$logPath = "C:\Users\ASUS\AppData\Local\Temp\cf-install-final.log"
"=== cloudflared service install ($(Get-Date)) ===" | Out-File $logPath -Encoding utf8

function Log($msg) {
    $msg | Out-File $logPath -Append -Encoding utf8
}

# Step 1: 清残留 service + EventLog 注册表
Log "[1] clean previous service"
sc.exe stop Cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
Start-Sleep 3
sc.exe delete Cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
sc.exe delete cloudflared 2>&1 | Out-File $logPath -Append -Encoding utf8
Start-Sleep 2
Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\cloudflared" -Recurse -Force -ErrorAction SilentlyContinue
Log "  EventLog reg cleaned"

# Step 2: 创建 ProgramData 目录 + 复制凭证
$dst = "C:\ProgramData\Cloudflared"
$src = "C:\Users\ASUS\.cloudflared"
Log "[2] copy creds to $dst"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\cert.pem" -Destination $dst -Force
Copy-Item "$src\8150c474-35df-4861-884c-5d695190b55e.json" -Destination $dst -Force

# Step 3: 写一个新的 config.yml 到 ProgramData，credentials-file 指向 ProgramData
$config = @"
tunnel: 8150c474-35df-4861-884c-5d695190b55e
credentials-file: C:\ProgramData\Cloudflared\8150c474-35df-4861-884c-5d695190b55e.json
origincert: C:\ProgramData\Cloudflared\cert.pem

# Path whitelist (Plan 3)
ingress:
  - hostname: copilot-bridge.top
    path: /webhook/feishu
    service: http://localhost:3000
  - hostname: copilot-bridge.top
    path: /health
    service: http://localhost:3000
  - service: http_status:404
"@
$config | Out-File -Encoding ascii -FilePath "$dst\config.yml"
Log "  config.yml written to $dst"
(Get-ChildItem $dst | Out-String) | Out-File $logPath -Append -Encoding utf8

# Step 4: 安装服务，带 --config 参数
Log "[4] service install with --config"
$cfExe = "C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
& $cfExe --config "$dst\config.yml" service install 2>&1 | Out-File $logPath -Append -Encoding utf8
Start-Sleep 3

# Step 5: 验证 service binary path 真的带 --config
Log "[5] sc qc"
(sc.exe qc Cloudflared 2>&1 | Out-String) | Out-File $logPath -Append -Encoding utf8

# Step 6: 启动
Log "[6] start service"
Start-Service Cloudflared
Start-Sleep 12

# Step 7: 状态
Log "[7] final status"
(Get-Service Cloudflared | Out-String) | Out-File $logPath -Append -Encoding utf8
(Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object Id, StartTime, Path | Out-String) | Out-File $logPath -Append -Encoding utf8

Log "=== done ==="
