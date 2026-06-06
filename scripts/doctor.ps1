# =============================================================================
# scripts/doctor.ps1
#
# 自检 copilot-bridge 当前环境状态，输出 **严格 JSON** 到 stdout。
# 给 AI（copilot-bridge-setup skill 安装剧本）读，决定下一步该装什么。
#
# 用法：
#   pwsh -File scripts/doctor.ps1
#
# 退出码：
#   0 = 所有检查完成（不代表全 OK，AI 读 JSON 看 ready 字段）
#   1 = 脚本本身崩了
# =============================================================================
[CmdletBinding()]
param()

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-CmdExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-CmdVersion {
    param([string]$Name, [string]$Args = '--version')
    try {
        $out = & $Name $Args.Split(' ') 2>&1 | Out-String
        return ($out -split "`n")[0].Trim()
    }
    catch {
        return $null
    }
}

# ---------------- Node ----------------
$node = @{
    installed = Test-CmdExists 'node'
    version   = $null
    ok        = $false
}
if ($node.installed) {
    $node.version = Get-CmdVersion 'node' '-v'
    if ($node.version -match 'v(\d+)') {
        $major = [int]$Matches[1]
        $node.ok = $major -ge 20
    }
}

# ---------------- pnpm ----------------
$pnpm = @{
    installed = Test-CmdExists 'pnpm'
    version   = $null
}
if ($pnpm.installed) {
    $pnpm.version = Get-CmdVersion 'pnpm' '--version'
}

# ---------------- cloudflared ----------------
$cf = @{
    installed = Test-CmdExists 'cloudflared'
    version   = $null
    service   = $null
}
if ($cf.installed) {
    $cf.version = (Get-CmdVersion 'cloudflared' '--version') -replace 'cloudflared version ', ''
    $svc = Get-Service -Name 'Cloudflared' -ErrorAction SilentlyContinue
    if ($svc) {
        $cf.service = @{
            exists    = $true
            status    = $svc.Status.ToString()
            startType = $svc.StartType.ToString()
        }
    }
    else {
        $cf.service = @{ exists = $false }
    }
}

# ---------------- 配置文件 ----------------
$configPath = Join-Path $repoRoot 'copilot-bridge.config.json'
$envPath = Join-Path $repoRoot '.env'
$configFile = @{
    exists       = Test-Path $configPath
    envExists    = Test-Path $envPath
    feishuFilled = $false
    mode         = $null
}
if ($configFile.exists) {
    try {
        $raw = Get-Content $configPath -Raw
        $stripped = $raw -replace '(?m)^\s*//.*$', '' -replace '/\*[\s\S]*?\*/', ''
        $cfg = $stripped | ConvertFrom-Json
        $appId = $cfg.feishu.appId
        $appSecretRaw = $cfg.feishu.appSecret
        $appSecretResolved = if ($appSecretRaw -match '^\$\{env:([A-Z0-9_]+)\}$') {
            [System.Environment]::GetEnvironmentVariable($Matches[1])
        }
        else {
            $appSecretRaw
        }
        # 也从 .env 兜底
        if (-not $appSecretResolved -and $configFile.envExists) {
            $envContent = Get-Content $envPath -Raw
            if ($envContent -match 'FEISHU_APP_SECRET=(.+)') {
                $appSecretResolved = $Matches[1].Trim()
            }
        }
        $configFile.feishuFilled = (
            $appId -and -not $appId.StartsWith('cli_xxx') -and
            $appSecretResolved -and -not $appSecretResolved.Contains('xxxxxxxx')
        )
        $configFile.mode = $cfg.publicEndpoint.mode
        $configFile.chatIdFilled = ($cfg.feishu.targetChatId -and -not $cfg.feishu.targetChatId.StartsWith('oc_xxx'))
    }
    catch {
        $configFile.parseError = $_.Exception.Message
    }
}

# ---------------- bridge-core ----------------
$bridgeCore = @{
    sourceExists = Test-Path (Join-Path $repoRoot 'bridge-core\src\index.ts')
    built        = Test-Path (Join-Path $repoRoot 'bridge-core\dist\index.js')
    nodeModules  = Test-Path (Join-Path $repoRoot 'bridge-core\node_modules')
    running      = $false
    port         = 3000
    version      = $null
}
try {
    $health = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        $bridgeCore.running = $true
        $bridgeCore.version = ($health.Content | ConvertFrom-Json).version
    }
}
catch {
    # 没起来很正常
}

# ---------------- skill 全局安装（VS Code 官方 personal skills 路径）----------------
$skillsRoot = Join-Path $HOME '.copilot\skills'
$skill = @{
    skillsRoot          = $skillsRoot
    skillInstalled      = Test-Path (Join-Path $skillsRoot 'copilot-bridge\SKILL.md')
    setupSkillInstalled = Test-Path (Join-Path $skillsRoot 'copilot-bridge-setup\SKILL.md')
}

# ---------------- 汇总 ready ----------------
$ready = (
    $node.ok -and
    $cf.installed -and
    $configFile.feishuFilled -and
    $bridgeCore.built -and
    $bridgeCore.running
)

# ---------------- 输出 ----------------
$result = @{
    timestamp   = (Get-Date).ToString('o')
    repoRoot    = $repoRoot
    node        = $node
    pnpm        = $pnpm
    cloudflared = $cf
    config      = $configFile
    bridgeCore  = $bridgeCore
    skill       = $skill
    ready       = $ready
    nextStep    = if (-not $node.ok) { 'install-node' }
    elseif (-not $cf.installed) { 'install-cloudflared' }
    elseif (-not $configFile.exists) { 'create-config' }
    elseif (-not $configFile.feishuFilled) { 'fill-feishu-credentials' }
    elseif (-not $bridgeCore.nodeModules) { 'pnpm-install' }
    elseif (-not $bridgeCore.built) { 'pnpm-build' }
    elseif (-not $bridgeCore.running) { 'start-bridge' }
    elseif (-not $skill.skillInstalled) { 'install-skill' }
    else { 'done' }
}

$result | ConvertTo-Json -Depth 6
