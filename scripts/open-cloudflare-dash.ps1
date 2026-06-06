# 输出 Cloudflare Dashboard URL（不再跳系统浏览器）
# AI 解析 `OPEN_URL:` 行后用 VS Code Simple Browser (simpleBrowser.show) 打开。
# 独立运行时，用户自己复制下面的 URL。
# 用法：powershell -File scripts\open-cloudflare-dash.ps1
$url = 'https://dash.cloudflare.com/'
Write-Host "OPEN_URL: $url"
Write-Host '[open-cloudflare-dash] Cloudflare Dashboard' -ForegroundColor Green
Write-Host '如果是首次用 named-tunnel：' -ForegroundColor Yellow
Write-Host '  1. 注册 / 登录 Cloudflare 账号（免费）' -ForegroundColor Yellow
Write-Host '  2. 添加你的域名到 Sites（Free 方案）' -ForegroundColor Yellow
Write-Host '  3. 拿到 2 个 NS（如 xxx.ns.cloudflare.com）' -ForegroundColor Yellow
Write-Host '  4. 去你的域名注册商把 NS 改成 Cloudflare 给的两个' -ForegroundColor Yellow
