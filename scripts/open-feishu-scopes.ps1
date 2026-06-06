# 自动打开飞书 App 权限申请页（一键勾选 6 个必需权限）
# 用法：pwsh -File scripts/open-feishu-scopes.ps1 -AppId cli_xxxxxxxxxxxxxxxx
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppId
)

$scopes = @(
    'im:message',
    'im:message:send_as_bot',
    'im:chat',
    'im:resource',
    'im:message.group_at_msg:readonly',
    'im:message.p2p_msg:readonly'
) -join ','

$url = "https://open.feishu.cn/app/$AppId/auth?q=$scopes&op_from=openapi&token_type=tenant"
Write-Host "OPEN_URL: $url"
Write-Host "[open-feishu-scopes] 飞书权限申请页（6 个权限已勾选）" -ForegroundColor Green
Write-Host '请点【Add Scopes】→ 立即生效（个人租户秒批，不需要发版）' -ForegroundColor Yellow
