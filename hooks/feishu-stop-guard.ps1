# feishu-stop-guard.ps1
# VS Code Stop hook: if comm_mode=feishu workspace and AI is ending the turn
# without having called feishu-send-and-wait.ps1, block to force a feishu push.
#
# Allow rules (any match -> allow):
#   1) workspace is not comm_mode: feishu
#   2) stop_hook_active=true (loop guard)
#   3) transcript already contains a feishu call marker
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
        $t = Get-Content $tp -Raw -ErrorAction SilentlyContinue
        if ($t -match 'feishu-send-and-wait|feishu_notify_and_wait|TASK_ID:|REPLY_JSON:') {
            Allow
        }
    }

    BlockTurn 'comm_mode=feishu but this turn has not called feishu-send-and-wait.ps1. Before ending, run: ps-client/feishu-send-and-wait.ps1 -Message "..." -Level ask -ProjectName "..." -WorkspacePath "..." to push the report to Feishu.'
}
catch {
    Allow
}