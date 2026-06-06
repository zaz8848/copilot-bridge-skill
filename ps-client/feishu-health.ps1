# feishu-health.ps1
# 检查 bridge-core 是否存活。
#
# 用法：
#   .\ps-client\feishu-health.ps1
#
# 退出码：0=OK, 1=DOWN

[CmdletBinding()]
param(
    [string]$BridgeUrl = "http://127.0.0.1:3000",
    [int]$TimeoutSec = 5
)

$ErrorActionPreference = "Stop"

try {
    $r = Invoke-RestMethod -Uri "$BridgeUrl/health" -TimeoutSec $TimeoutSec
    Write-Host "[feishu-health] OK  version=$($r.version)  time=$($r.time)"
    $r | ConvertTo-Json -Compress | Write-Host
    exit 0
}
catch {
    Write-Host "[feishu-health] DOWN  $($_.Exception.Message)"
    Write-Host "[feishu-health] 请先在仓库根目录跑 .\scripts\start.ps1 启动 bridge-core"
    exit 1
}
