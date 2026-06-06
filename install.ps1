# =============================================================================
# install.ps1 — copilot-bridge-skill 用户入口
#
# 用户唯一要做的事：在仓库根目录右键 → "用 PowerShell 运行"，或：
#   pwsh -File install.ps1
#
# 做两件事：
#   1. 把 SKILL.md 和 SETUP.skill.md 拷到用户级 VS Code prompts 目录
#      （以后任意 workspace 的 Copilot 都能自动发现）
#   2. 设置 COPILOT_BRIDGE_HOME 环境变量指向本仓库根
#   3. 提示用户去 VS Code Copilot Chat 说一句"帮我装一下 copilot-bridge"
#      → AI 自动读 SETUP.skill.md 开始引导
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
$promptsRoot = Join-Path $env:APPDATA 'Code\User\prompts\skills\copilot-bridge'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  copilot-bridge-skill 安装器' -ForegroundColor Cyan
Write-Host "  仓库根：$repoRoot" -ForegroundColor Gray
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------- 1. 装 skill 文件到 VS Code user prompts ----------------
Write-Host "[1/3] 拷 SKILL.md / SETUP.skill.md 到 $promptsRoot ..." -ForegroundColor Yellow
if (-not (Test-Path $promptsRoot)) {
    New-Item -Path $promptsRoot -ItemType Directory -Force | Out-Null
}
Copy-Item (Join-Path $repoRoot 'SKILL.md') (Join-Path $promptsRoot 'SKILL.md') -Force
Copy-Item (Join-Path $repoRoot 'SETUP.skill.md') (Join-Path $promptsRoot 'SETUP.skill.md') -Force
Write-Host '  ✅ skill 文件已就位' -ForegroundColor Green
Write-Host ''

# ---------------- 2. 设置 COPILOT_BRIDGE_HOME 环境变量 ----------------
Write-Host "[2/3] 设置环境变量 COPILOT_BRIDGE_HOME = $repoRoot ..." -ForegroundColor Yellow
[Environment]::SetEnvironmentVariable('COPILOT_BRIDGE_HOME', $repoRoot, 'User')
$env:COPILOT_BRIDGE_HOME = $repoRoot
Write-Host '  ✅ 环境变量已设置（新开终端 / 重启 VS Code 后生效）' -ForegroundColor Green
Write-Host ''

# ---------------- 3. 提示下一步 ----------------
Write-Host '[3/3] 下一步该干什么 ...' -ForegroundColor Yellow

$configExists = Test-Path (Join-Path $repoRoot 'copilot-bridge.config.json')

# 顺手装桌面 Dashboard 快捷方式（无害，无依赖）
try {
    & (Join-Path $repoRoot 'scripts\install-dashboard-shortcut.ps1') | Out-Null
    Write-Host '  ✅ 桌面已生成 Copilot Bridge Dashboard.url 快捷方式' -ForegroundColor Green
} catch {
    Write-Host "  ⚠  Dashboard 快捷方式生成失败：$_" -ForegroundColor Yellow
}
Write-Host ''

if ($configExists) {
    Write-Host ''
    Write-Host '检测到 copilot-bridge.config.json 已存在（你可能是换电脑 copy 过来）。' -ForegroundColor Cyan
    Write-Host '建议跑自检确认环境完整：' -ForegroundColor Cyan
    Write-Host "  pwsh -File `"$repoRoot\scripts\doctor.ps1`"" -ForegroundColor White
} else {
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
    Write-Host '  3. AI 会自动读取 SETUP.skill.md 全程引导你装完' -ForegroundColor White
    Write-Host '     （装 Node / cloudflared / 配飞书 App / 起服务）' -ForegroundColor Gray
}

if ($Mode -eq 'All' -and -not $configExists) {
    Write-Host ''
    $openVs = Read-Host '现在帮你打开 VS Code? (Y/n)'
    if ($openVs -ne 'n' -and $openVs -ne 'N') {
        try {
            Start-Process 'code' -ArgumentList "`"$repoRoot`""
            Write-Host '  ✅ VS Code 已启动' -ForegroundColor Green
        } catch {
            Write-Host "  ⚠  打不开 VS Code（命令 'code' 不在 PATH）。请手动打开 $repoRoot" -ForegroundColor Yellow
        }
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  安装器跑完了。详情看 README.md' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
