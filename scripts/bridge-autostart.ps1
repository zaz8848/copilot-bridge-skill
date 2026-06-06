# bridge-core 开机自启脚本（被 Windows 计划任务调用）
#
# 注册方式见 scripts/install-bridge-autostart.ps1
# 卸载方式：Unregister-ScheduledTask -TaskName "CopilotBridgeCore" -Confirm:$false

$ErrorActionPreference = "Stop"
$repo = "D:\A_Code\Copilot Bridge"
$log = "$repo\bridge-core.log"
$node = "C:\Program Files\nodejs\node.exe"
$entry = "$repo\bridge-core\dist\index.js"

# 1) 已在 3000 跑就退出，避免重复起
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 2 -ErrorAction Stop
    if ($r.ok) {
        "[bridge-autostart] $(Get-Date -Format o) skip: already running version=$($r.version)" | Out-File -Append -Encoding utf8 "$repo\bridge-autostart.log"
        exit 0
    }
}
catch { }

# 2) 起 node
"[bridge-autostart] $(Get-Date -Format o) starting bridge-core..." | Out-File -Append -Encoding utf8 "$repo\bridge-autostart.log"
# Start-Process 的 ArgumentList 给单字符串时不会自动 quote 带空格的路径，必须显式打引号
$p = Start-Process -FilePath $node -ArgumentList "`"$entry`"" `
    -WorkingDirectory $repo `
    -PassThru `
    -RedirectStandardError $log `
    -WindowStyle Hidden
"[bridge-autostart] started pid=$($p.Id)" | Out-File -Append -Encoding utf8 "$repo\bridge-autostart.log"

# 3) 等 health
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($r.ok) { $ready = $true; break }
    }
    catch {}
}
if ($ready) {
    "[bridge-autostart] $(Get-Date -Format o) READY version=$($r.version)" | Out-File -Append -Encoding utf8 "$repo\bridge-autostart.log"
}
else {
    "[bridge-autostart] $(Get-Date -Format o) NOT READY after 20s, look at $log" | Out-File -Append -Encoding utf8 "$repo\bridge-autostart.log"
}
