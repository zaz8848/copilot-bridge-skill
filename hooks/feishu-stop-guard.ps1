# feishu-stop-guard.ps1
# VS Code Stop hook: if comm_mode=feishu workspace and AI is ending the turn
# without having called feishu-send-and-wait.ps1, block to force a feishu push.
# Additionally: if feishu-send-and-wait was called via run_in_terminal with
# mode="sync" / isBackground=false, block — Skill requires mode="async".
#
# Allow rules (any match -> allow):
#   1) workspace is not comm_mode: feishu
#   2) stop_hook_active=true (loop guard)
#   3) transcript contains feishu call marker AND last call used async
#
# stdin: JSON (cwd, transcript_path, stop_hook_active, ...)
# stdout: {"continue":true} OR {"hookSpecificOutput":{"decision":"block",...}}
# exit code: always 0 (hook errors must not block the user)

$ErrorActionPreference = 'Stop'

# Lightweight debug log — every hook invocation writes one line so we can
# verify the hook actually fires when the model ends a turn.
$debugDir = Join-Path $env:USERPROFILE '.copilot\hooks\debug'
$debugFile = Join-Path $debugDir 'stop-guard.log'
if (-not (Test-Path $debugDir)) { New-Item -ItemType Directory -Force -Path $debugDir | Out-Null }

# 单行日志：整个触发过程把信息累加到 $script:logParts，最后由 Allow/BlockTurn 一次性打一行。
$script:logParts = [System.Collections.Generic.List[string]]::new()
function LogLine { param([string]$s) $script:logParts.Add($s.Trim()) }
function FlushLog {
    param([string]$decision)
    $line = "{0}  [{1}]  {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $decision, ($script:logParts -join '  |  ')
    Add-Content -Path $debugFile -Value $line
}

function Allow {
    param([string]$Why = 'allow')
    FlushLog "ALLOW $Why"
    Write-Output '{"continue":true}'
    exit 0
}

function BlockTurn {
    param([string]$Reason)
    # Reason 太长(给 AI 的提示)，log 里只记短标识
    $short = if ($Reason -match 'sync') { 'this-turn=sync->block' } else { 'this-turn=no-feishu->block' }
    FlushLog "BLOCK $short"
    $obj = @{
        hookSpecificOutput = @{
            hookEventName = 'Stop'
            decision      = 'block'
            reason        = $Reason
        }
    }
    Write-Output ($obj | ConvertTo-Json -Compress -Depth 4)
    exit 0
}

try {
    $raw = [Console]::In.ReadToEnd()
    LogLine ("INVOKE cwd-from-payload pending; raw-len={0}" -f $raw.Length)
    if ([string]::IsNullOrWhiteSpace($raw)) { Allow 'empty-stdin' }
    $payload = $raw | ConvertFrom-Json

    if ($payload.stop_hook_active -eq $true) { Allow 'stop_hook_active=true (loop guard)' }

    $cwd = $payload.cwd
    LogLine ("  cwd={0}  transcript={1}" -f $cwd, $payload.transcript_path)
    if (-not $cwd) { Allow 'no cwd' }
    $instr = Join-Path $cwd '.github\copilot-instructions.md'
    if (-not (Test-Path $instr)) { Allow 'no copilot-instructions.md' }
    $content = Get-Content $instr -Raw -ErrorAction Stop
    if ($content -notmatch '(?m)^comm_mode:\s*feishu\b') { Allow 'comm_mode != feishu' }

    $tp = $payload.transcript_path
    if ($tp -and (Test-Path $tp)) {
        # Read full file; if huge, take last 256KB to keep this fast.
        $bytes = (Get-Item $tp).Length
        if ($bytes -gt 262144) {
            $fs = [System.IO.File]::Open($tp, 'Open', 'Read', 'ReadWrite')
            try {
                $fs.Seek(-262144, 'End') | Out-Null
                $reader = New-Object System.IO.StreamReader($fs)
                $t = $reader.ReadToEnd()
            }
            finally { $fs.Dispose() }
        }
        else {
            $t = Get-Content $tp -Raw -ErrorAction SilentlyContinue
        }
        if (-not $t) { Allow 'transcript empty' }

        # Walk JSONL lines from end, find the last run_in_terminal tool call
        # whose command/arguments mention feishu-send-and-wait.
        $lines = $t -split "`r?`n"

        # --- 当前 turn 边界：定位最后一条 user.message，只在它之后(=本轮)判定 ---
        # 旧 bug：从整本 transcript 倒扫 feishu 调用，会扫到历史轮次的旧 async 调用 → 误放行。
        # 修复：先找最后一条 user 消息行号 lastUserIdx，扫描下界设为它，本轮内没有 feishu 调用就 block。
        $lastUserIdx = 0
        for ($u = $lines.Length - 1; $u -ge 0; $u--) {
            if ($lines[$u] -match '"type"\s*:\s*"user\.message"') { $lastUserIdx = $u; break }
        }
        LogLine ("  turn-boundary lastUserIdx={0} totalLines={1}" -f $lastUserIdx, $lines.Length)

        $lastFeishuMode = $null   # 'sync' / 'async' / $null (not found)
        for ($i = $lines.Length - 1; $i -ge $lastUserIdx; $i--) {
            $line = $lines[$i]
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            if ($line -notmatch 'feishu-send-and-wait|feishu_notify_and_wait') { continue }
            if ($line -notmatch '"toolName"\s*:\s*"run_in_terminal"' -and
                $line -notmatch '"name"\s*:\s*"run_in_terminal"') { continue }
            # Found the latest feishu call IN THIS TURN. Determine mode.
            if ($line -match '"mode"\s*:\s*"async"' -or $line -match '"isBackground"\s*:\s*true') {
                $lastFeishuMode = 'async'
            }
            elseif ($line -match '"mode"\s*:\s*"sync"' -or $line -match '"isBackground"\s*:\s*false') {
                $lastFeishuMode = 'sync'
            }
            else {
                # Default if neither specified: VS Code's default is sync.
                $lastFeishuMode = 'sync'
            }
            LogLine ("  matched idx={0} mode={1} (within turn, lastUserIdx={2})" -f $i, $lastFeishuMode, $lastUserIdx)
            break
        }

        if ($lastFeishuMode -eq 'async') { Allow 'this-turn feishu mode=async (OK)' }
        if ($lastFeishuMode -eq 'sync') {
            BlockTurn 'feishu-send-and-wait was invoked with mode="sync" / isBackground=false. Per copilot-bridge Skill it MUST run as mode="async" so VS Code keeps control while the user replies. Re-call run_in_terminal with mode="async" before ending the turn.'
        }
        # $lastFeishuMode -eq $null  -> 本轮(最后一条 user 之后)没有 feishu 调用; fall through to block.
    }

    BlockTurn 'comm_mode=feishu but THIS TURN (after your last message) has not called feishu-send-and-wait.ps1. Before ending, run: ps-client/feishu-send-and-wait.ps1 -Message "..." -Level ask with mode="async" to push the report to Feishu.'
}
catch {
    LogLine ("ERROR  {0}" -f $_.Exception.Message)
    Allow 'hook exception caught'
}