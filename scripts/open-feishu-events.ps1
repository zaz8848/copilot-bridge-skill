# 自动打开飞书 App 事件订阅配置页
# 用法：pwsh -File scripts/open-feishu-events.ps1 -AppId cli_xxxxxxxxxxxxxxxx
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppId
)

$url = "https://open.feishu.cn/app/$AppId/event"
Start-Process $url
Write-Host "[open-feishu-events] 已弹出浏览器：飞书事件订阅配置页" -ForegroundColor Green
Write-Host '请在 Request URL 框粘贴你的 webhook URL（剪贴板里已有），保存后等待 challenge 通过（绿色对勾）' -ForegroundColor Yellow
Write-Host '订阅的事件至少要包含：' -ForegroundColor Yellow
Write-Host '  - im.message.receive_v1（接收消息）' -ForegroundColor Yellow
Write-Host '  - card.action.trigger（按钮回调，可选）' -ForegroundColor Yellow
