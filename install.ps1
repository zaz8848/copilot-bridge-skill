# =============================================================================
# install.ps1 — copilot-bridge-skill 用户入口
#
# 用户唯一要做的事：在仓库根目录右键 → "用 PowerShell 运行"，或：
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   （PowerShell 5.1 上 Windows 默认装；PS 7+ 用 `pwsh -File install.ps1` 也行）
#
# 做两件事：
#   1. 把两个 skill 拷到官方 personal skills 路径：
#        ~/.copilot/skills/copilot-bridge/SKILL.md
#        ~/.copilot/skills/copilot-bridge-setup/SKILL.md
#      （以后任意 workspace 的 Copilot 都能自动发现）
#   2. 设置 COPILOT_BRIDGE_HOME 环境变量指向本仓库根
#   3. 提示用户去 VS Code Copilot Chat 说一句"帮我装一下 copilot-bridge"
#      → AI 自动读 copilot-bridge-setup skill 开始引导
#
# 参数：
#   -Mode All        默认。装 skill + 提示开 VS Code
#   -Mode SkillOnly  只装 skill（不弹 VS Code 提示）
# =============================================================================

[CmdletBinding()]
param(
    [ValidateSet('All', 'SkillOnly')]
    [string]$Mode = 'All'
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
# 官方 personal skills / hooks 路径（VS Code 文档钦定）
# 参考：https://code.visualstudio.com/docs/agent-customization/agent-skills
#       https://code.visualstudio.com/docs/agent-customization/hooks
$skillsRoot = Join-Path $HOME '.copilot\skills'
$hooksRoot = Join-Path $HOME '.copilot\hooks'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  copilot-bridge-skill 安装器' -ForegroundColor Cyan
Write-Host "  仓库根：$repoRoot" -ForegroundColor Gray
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------- 1. 装 skill 文件到 ~/.copilot/skills/<name>/SKILL.md ----------------
Write-Host "[1/4] 装 skill 到 $skillsRoot ..." -ForegroundColor Yellow
$skillNames = @('copilot-bridge', 'copilot-bridge-setup')
foreach ($name in $skillNames) {
    $src = Join-Path $repoRoot "skills\$name\SKILL.md"
    $dstDir = Join-Path $skillsRoot $name
    $dst = Join-Path $dstDir 'SKILL.md'
    if (-not (Test-Path $src)) {
        throw "源文件不存在：$src"
    }
    if (-not (Test-Path $dstDir)) {
        New-Item -Path $dstDir -ItemType Directory -Force | Out-Null
    }
    Copy-Item $src $dst -Force
    Write-Host "  ✅ $name -> $dst" -ForegroundColor Green
}
Write-Host '  装完后在 VS Code 命令面板跑 "Developer: Reload Window"，' -ForegroundColor Gray
Write-Host '  然后 Chat 输入 "/" 应能看到 copilot-bridge 和 copilot-bridge-setup' -ForegroundColor Gray
Write-Host ''

# ---------------- 2. 装 Stop hook 到 ~/.copilot/hooks/ ----------------
Write-Host "[2/4] 装 Stop hook 到 $hooksRoot ..." -ForegroundColor Yellow
if (-not (Test-Path $hooksRoot)) {
    New-Item -Path $hooksRoot -ItemType Directory -Force | Out-Null
}

# 2a. ps1 脚本：直接 copy（仓里就是最终版）
$ps1Src = Join-Path $repoRoot 'hooks\feishu-stop-guard.ps1'
$ps1Dst = Join-Path $hooksRoot 'feishu-stop-guard.ps1'
if (Test-Path $ps1Src) {
    Copy-Item $ps1Src $ps1Dst -Force
    Write-Host "  ✅ feishu-stop-guard.ps1 -> $ps1Dst" -ForegroundColor Green
}
else {
    Write-Host "  ⚠  源文件不存在：$ps1Src" -ForegroundColor Yellow
}

# 2b. json 配置：用当前用户的绝对路径生成（不能 copy 模板，因为 VS Code spawn 不展开 %USERPROFILE%）
$jsonDst = Join-Path $hooksRoot 'feishu-stop-guard.json'
$cmdLine = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + $ps1Dst + '"'
$cfg = @{
    hooks = @{
        Stop = @(
            @{
                type    = 'command'
                windows = $cmdLine
                timeout = 10
            }
        )
    }
}
$json = $cfg | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($jsonDst, $json, $utf8NoBom)
Write-Host "  ✅ feishu-stop-guard.json -> $jsonDst（绝对路径已写死）" -ForegroundColor Green

# 2c. 关键：把 ~/.copilot/hooks 加到 VS Code chat.hookFilesLocations
# VS Code 文档列了这个路径，但 default 不扫，不加 setting hook 完全不会被加载（暗坑）
# 用文本注入而不是 JSON parse/serialize，避免：
#   - PS 5.1 ConvertFrom-Json 没有 -AsHashtable
#   - JSONC 注释 / trailing comma 解析失败
#   - 反序列化丢失原始格式 + key 顺序
$vscodeSettingsPaths = @(
    (Join-Path $env:APPDATA 'Code\User\settings.json'),
    (Join-Path $env:APPDATA 'Code - Insiders\User\settings.json')
)
foreach ($settingsPath in $vscodeSettingsPaths) {
    $parent = Split-Path -Parent $settingsPath
    if (-not (Test-Path $parent)) { continue }
    $raw = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw -ErrorAction SilentlyContinue } else { $null }
    if ($null -eq $raw -or $raw.Trim() -eq '') { $raw = "{`r`n}" }
    # 已经设置过就跳过
    if ($raw -match '"~/\.copilot/hooks"\s*:\s*true') {
        Write-Host "  ✓ $settingsPath 已含 ~/.copilot/hooks" -ForegroundColor Gray
        continue
    }
    # 备份
    if (Test-Path $settingsPath) {
        Copy-Item $settingsPath "$settingsPath.bak-$(Get-Date -Format 'yyyyMMddHHmmss')" -Force
    }
    $newContent = $null
    if ($raw -match '"chat\.hookFilesLocations"\s*:\s*\{') {
        # 已有 chat.hookFilesLocations 对象，往里加一行
        $newContent = $raw -replace '("chat\.hookFilesLocations"\s*:\s*\{)', "`$1`r`n        `"~/.copilot/hooks`": true,"
    }
    else {
        # 没有该 key，在最外层 `}` 前插入完整块
        # 找最后一个 `}`，前面加逗号 + 新 key
        $idx = $raw.LastIndexOf('}')
        if ($idx -lt 0) {
            Write-Host "  ⚠  $settingsPath 不是 JSON 对象，跳过" -ForegroundColor Yellow
            continue
        }
        # 前面如果是 `{` 直接接，不加逗号；否则补逗号
        $before = $raw.Substring(0, $idx).TrimEnd()
        $needComma = $before -notmatch '[\{,]\s*$'
        $comma = if ($needComma) { ',' } else { '' }
        $newContent = $before + $comma + "`r`n    `"chat.hookFilesLocations`": {`r`n        `"~/.copilot/hooks`": true`r`n    }`r`n}"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($settingsPath, $newContent, $utf8NoBom)
    Write-Host "  ✅ 加 chat.hookFilesLocations[~/.copilot/hooks]=true -> $settingsPath" -ForegroundColor Green
}

Write-Host '  Stop hook 只在 workspace `.github/copilot-instructions.md` 含 `comm_mode: feishu` 时生效。' -ForegroundColor Gray
Write-Host '  其它 workspace 零影响。临时禁用：重命名 feishu-stop-guard.json 加 .disabled 后缀。' -ForegroundColor Gray
Write-Host '  装完后需要 Reload VS Code Window 让新 hook 配置生效。' -ForegroundColor Gray
Write-Host ''

# ---------------- 3. 设置 COPILOT_BRIDGE_HOME 环境变量 ----------------
Write-Host "[3/4] 设置环境变量 COPILOT_BRIDGE_HOME = $repoRoot ..." -ForegroundColor Yellow
[Environment]::SetEnvironmentVariable('COPILOT_BRIDGE_HOME', $repoRoot, 'User')
$env:COPILOT_BRIDGE_HOME = $repoRoot
Write-Host '  ✅ 环境变量已设置（新开终端 / 重启 VS Code 后生效）' -ForegroundColor Green
Write-Host ''

# ---------------- 4. 提示下一步 ----------------
Write-Host '[4/4] 下一步该干什么 ...' -ForegroundColor Yellow

$configExists = Test-Path (Join-Path $repoRoot 'copilot-bridge.config.json')

# 顺手装 Dashboard 快捷方式到仓库根（无害，无依赖）
try {
    & (Join-Path $repoRoot 'scripts\install-dashboard-shortcut.ps1') | Out-Null
    Write-Host '  ✅ 仓库根已生成 Copilot Bridge Dashboard.url 快捷方式（双击开 Dashboard）' -ForegroundColor Green
}
catch {
    Write-Host "  ⚠  Dashboard 快捷方式生成失败：$_" -ForegroundColor Yellow
}
Write-Host ''

if ($configExists) {
    Write-Host ''
    Write-Host '检测到 copilot-bridge.config.json 已存在（你可能是换电脑 copy 过来）。' -ForegroundColor Cyan
    Write-Host '建议跑自检确认环境完整：' -ForegroundColor Cyan
    Write-Host "  powershell -File `"$repoRoot\scripts\doctor.ps1`"" -ForegroundColor White
}
else {
    Write-Host ''
    Write-Host '检测到首次安装（没有 copilot-bridge.config.json）。' -ForegroundColor Cyan
    Write-Host '推荐流程：' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  1. 用 VS Code 打开本仓库目录：' -ForegroundColor White
    Write-Host "       code `"$repoRoot`"" -ForegroundColor Gray
    Write-Host ''
    Write-Host '  2. 在 Copilot Chat 里说一句：' -ForegroundColor White
    Write-Host '       帮我装一下 copilot-bridge' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  3. AI 会自动加载 copilot-bridge-setup skill 全程引导你装完' -ForegroundColor White
    Write-Host '     （装 Node / cloudflared / 配飞书 App / 起服务）' -ForegroundColor Gray
}

if ($Mode -eq 'All' -and -not $configExists) {
    Write-Host ''
    $openVs = Read-Host '现在帮你打开 VS Code? (Y/n)'
    if ($openVs -ne 'n' -and $openVs -ne 'N') {
        try {
            Start-Process 'code' -ArgumentList "`"$repoRoot`""
            Write-Host '  ✅ VS Code 已启动' -ForegroundColor Green
        }
        catch {
            Write-Host "  ⚠  打不开 VS Code（命令 'code' 不在 PATH）。请手动打开 $repoRoot" -ForegroundColor Yellow
        }
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  安装器跑完了。详情看 README.md' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
