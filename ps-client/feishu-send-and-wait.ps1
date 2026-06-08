# feishu-send-and-wait.ps1
# 发飞书卡片 + 短挂续杯轮询等用户回复。结果打到 stdout 让 AI 通过 get_terminal_output 读。
#
# 用法（典型 async 调用）：
#   .\ps-client\feishu-send-and-wait.ps1 `
#       -Message "改完了，请确认" `
#       -Level ask `
#       -ProjectName "MyProject" `
#       -WorkspacePath "D:\A_Code\MyProject"
#
# 带图片：
#   .\ps-client\feishu-send-and-wait.ps1 -Message "看截图" -Level ask ``
#       -ProjectName Foo -WorkspacePath D:\X -ImagePaths "D:\1.png","D:\2.png"
#
# 输出关键行（AI 检测用）：
#   TASK_ID: <id>
#   REPLY_JSON: <json>      ← 收到回复
#   TIMEOUT: <id>           ← 达到 MaxWaitSeconds 仍未收到
#   ERROR: <msg>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet("ask", "done", "error")][string]$Level = "ask",
    [string]$ProjectName = "",      # 缺省 = 当前 cwd 的 leaf 名（VS Code 跑 run_in_terminal 时 cwd 必然是 workspace root）
    [string]$WorkspacePath = "",    # 缺省 = 当前 cwd 的绝对路径
    [string[]]$ImagePaths,
    [string]$BridgeUrl = "http://127.0.0.1:3000",
    [int]$PollTimeoutSec = 50,   # 每轮 wait 短挂时长（秒）
    [int]$MaxWaitSeconds = 0,    # 0 = 永不超时
    [string]$ResumeTaskId = ""   # 已有 task_id 时跳过发卡，直接接力 wait
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) { $WorkspacePath = $PWD.Path }
if ([string]::IsNullOrWhiteSpace($ProjectName)) { $ProjectName = Split-Path -Leaf $WorkspacePath }

function Invoke-JsonPost {
    param([string]$Url, [hashtable]$Body)
    $json = $Body | ConvertTo-Json -Compress -Depth 6
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri $Url -Method Post `
        -ContentType "application/json; charset=utf-8" -Body $bytes
}

# Step 1: 发卡 (or 接力)
$taskId = $ResumeTaskId
if ([string]::IsNullOrWhiteSpace($taskId)) {
    $body = @{
        message      = $Message
        level        = $Level
        project_name = $ProjectName
    }
    if ($WorkspacePath) { $body.workspace_path = $WorkspacePath }
    if ($ImagePaths -and $ImagePaths.Count -gt 0) { $body.image_paths = $ImagePaths }

    try {
        $notify = Invoke-JsonPost -Url "$BridgeUrl/api/notify" -Body $body
    }
    catch {
        Write-Host "ERROR: notify failed - $($_.Exception.Message)"
        exit 2
    }
    $taskId = $notify.task_id
    Write-Host "TASK_ID: $taskId"
    Write-Host "[feishu-send-and-wait] card sent  task_id=$taskId  feishu_message_id=$($notify.feishu_message_id)"
}
else {
    Write-Host "TASK_ID: $taskId"
    Write-Host "[feishu-send-and-wait] resuming existing task_id=$taskId"
}

# Step 2: short-hang long-poll loop
$startTs = Get-Date
$round = 0
while ($true) {
    $round++
    try {
        $r = Invoke-RestMethod -Uri "$BridgeUrl/api/wait/$taskId`?timeout=$PollTimeoutSec" -TimeoutSec ($PollTimeoutSec + 10)
        Write-Host "REPLY_JSON: $($r | ConvertTo-Json -Compress -Depth 6)"
        Write-Host "REPLY_TEXT: $($r.reply)"
        exit 0
    }
    catch {
        $resp = $_.Exception.Response
        $status = $null
        if ($resp -ne $null) { try { $status = [int]$resp.StatusCode } catch { } }

        if ($status -eq 408) {
            # short-hang timeout, normal, silently continue next round (avoid spamming AI context)
            $elapsed = [int]((Get-Date) - $startTs).TotalSeconds
            if ($MaxWaitSeconds -gt 0 -and $elapsed -ge $MaxWaitSeconds) {
                Write-Host "TIMEOUT: $taskId (MaxWaitSeconds=$MaxWaitSeconds reached)"
                exit 3
            }
            continue
        }

        if ($status -eq 410) {
            Write-Host "ERROR: task $taskId expired or cancelled (HTTP 410)"
            exit 4
        }
        if ($status -eq 404) {
            Write-Host "ERROR: task $taskId not found (HTTP 404)"
            exit 5
        }

        # network-level fetch failure: do NOT resend card, wait 2s then retry with same task_id (v0.0.11 hard rule)
        Write-Host "[feishu-send-and-wait] wait fetch failed (status=$status msg=$($_.Exception.Message)), retrying with task_id in 2s..."
        Start-Sleep -Seconds 2
        continue
    }
}
