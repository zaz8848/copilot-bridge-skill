# 自动打开 Cloudflare Dashboard
# 用法：pwsh -File scripts/open-cloudflare-dash.ps1
Start-Process 'https://dash.cloudflare.com/'
Write-Host '[open-cloudflare-dash] 已弹出浏览器：Cloudflare Dashboard' -ForegroundColor Green
Write-Host '如果是首次用 named-tunnel：' -ForegroundColor Yellow
Write-Host '  1. 注册 / 登录 Cloudflare 账号（免费）' -ForegroundColor Yellow
Write-Host '  2. 添加你的域名到 Sites（Free 方案）' -ForegroundColor Yellow
Write-Host '  3. 拿到 2 个 NS（如 xxx.ns.cloudflare.com）' -ForegroundColor Yellow
Write-Host '  4. 去你的域名注册商把 NS 改成 Cloudflare 给的两个' -ForegroundColor Yellow
