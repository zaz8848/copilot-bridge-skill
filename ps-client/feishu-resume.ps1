# feishu-resume.ps1
# 拉取当前项目的离线收件箱（AI 离线期间用户在飞书发来的消息）。
#
# 用法：
#   .\ps-client\feishu-resume.ps1 -ProjectName "MyProject"
#
# 输出：先打人类可读摘要，再打一行 JSON（前缀 RESUME_JSON:），方便 AI 解析。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectName,
    [string]$BridgeUrl = "http://127.0.0.1:3000"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$payload = @{ project_name = $ProjectName } | ConvertTo-Json -Compress
$bytes   = [System.Text.Encoding]::UTF8.GetBytes($payload)

try {
    $r = Invoke-RestMethod -Uri "$BridgeUrl/api/resume" `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $bytes
} catch {
    Write-Host "[feishu-resume] ERROR  $($_.Exception.Message)"
    exit 1
}

$count = if ($r.replies) { $r.replies.Count } else { 0 }
if ($count -eq 0) {
    Write-Host "[feishu-resume] 收件箱为空 (project=$ProjectName)"
} else {
    Write-Host "[feishu-resume] 收件箱有 $count 条消息 (project=$ProjectName):"
    $i = 0
    foreach ($m in $r.replies) {
        $i++
        Write-Host "  [$i] $($m.text)"
    }
}
Write-Host ("RESUME_JSON: " + ($r | ConvertTo-Json -Compress -Depth 6))
exit 0
