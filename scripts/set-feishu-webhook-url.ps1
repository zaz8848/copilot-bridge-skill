# 半自动设置飞书 webhook URL：复制 URL 到剪贴板 + 打开飞书后台
# 用法：pwsh -File scripts/set-feishu-webhook-url.ps1 -AppId cli_xxx -PublicUrl https://xxx.trycloudflare.com
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppId,

    [Parameter(Mandatory = $true)]
    [string]$PublicUrl
)

$webhookUrl = "$($PublicUrl.TrimEnd('/'))/webhook/feishu"
Set-Clipboard -Value $webhookUrl
Write-Host "[set-feishu-webhook-url] 已复制到剪贴板：" -ForegroundColor Green
Write-Host "  $webhookUrl" -ForegroundColor Cyan

$url = "https://open.feishu.cn/app/$AppId/event"
Write-Host "OPEN_URL: $url"
Write-Host '飞书事件配置页：' -ForegroundColor Yellow
Write-Host '  1. 在【请求地址 / Request URL】框 Ctrl+V 粘贴' -ForegroundColor Yellow
Write-Host '  2. 点【保存】' -ForegroundColor Yellow
Write-Host '  3. 等 challenge 通过（绿色对勾）' -ForegroundColor Yellow
