# 输出飞书开放平台「创建自建应用」页 URL（不再跳系统浏览器）
# AI 解析 `OPEN_URL:` 行后用 VS Code Simple Browser 打开。
# 用法：powershell -File scripts\open-feishu-app.ps1
$url = 'https://open.feishu.cn/app'
Write-Host "OPEN_URL: $url"
Write-Host '[open-feishu-app] 飞书开放平台' -ForegroundColor Green
Write-Host '请点【创建企业自建应用】→ 填名字 → 创建后会跳到详情页' -ForegroundColor Yellow
