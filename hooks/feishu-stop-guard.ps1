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

function Allow {
    Write-Output '{"continue":true}'
    exit 0
}

function BlockTurn {
    param([string]$Reason)
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
    if ([string]::IsNullOrWhiteSpace($raw)) { Allow }
    $payload = $raw | ConvertFrom-Json

    if ($payload.stop_hook_active -eq $true) { Allow }

    $cwd = $payload.cwd
    if (-not $cwd) { Allow }
    $instr = Join-Path $cwd '.github\copilot-instructions.md'
    if (-not (Test-Path $instr)) { Allow }
    $content = Get-Content $instr -Raw -ErrorAction Stop
    if ($content -notmatch '(?m)^comm_mode:\s*feishu\b') { Allow }

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
            } finally { $fs.Dispose() }
        } else {
            $t = Get-Content $tp -Raw -ErrorAction SilentlyContinue
        }
        if (-not $t) { Allow }

        # Walk JSONL lines from end, find the last run_in_terminal tool call
        # whose command/arguments mention feishu-send-and-wait.
        $lines = $t -split "`r?`n"
        $lastFeishuMode = $null   # 'sync' / 'async' / $null (not found)
        for ($i = $lines.Length - 1; $i -ge 0; $i--) {
            $line = $lines[$i]
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            if ($line -notmatch 'feishu-send-and-wait|feishu_notify_and_wait') { continue }
            if ($line -notmatch '"toolName"\s*:\s*"run_in_terminal"' -and
                $line -notmatch '"name"\s*:\s*"run_in_terminal"') { continue }
            # Found the latest feishu call. Determine mode.
            if ($line -match '"mode"\s*:\s*"async"' -or $line -match '"isBackground"\s*:\s*true') {
                $lastFeishuMode = 'async'
            } elseif ($line -match '"mode"\s*:\s*"sync"' -or $line -match '"isBackground"\s*:\s*false') {
                $lastFeishuMode = 'sync'
            } else {
                # Default if neither specified: VS Code's default is sync.
                $lastFeishuMode = 'sync'
            }
            break
        }

        if ($lastFeishuMode -eq 'async') { Allow }
        if ($lastFeishuMode -eq 'sync') {
            BlockTurn 'feishu-send-and-wait was invoked with mode="sync" / isBackground=false. Per copilot-bridge Skill it MUST run as mode="async" so VS Code keeps control while the user replies. Re-call run_in_terminal with mode="async" before ending the turn.'
        }
        # $lastFeishuMode -eq $null  -> no feishu call found this turn; fall through to original block.
    }

    BlockTurn 'comm_mode=feishu but this turn has not called feishu-send-and-wait.ps1. Before ending, run: ps-client/feishu-send-and-wait.ps1 -Message "..." -Level ask -ProjectName "..." -WorkspacePath "..." to push the report to Feishu.'
}
catch {
    Allow
}