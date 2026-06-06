# 自动打开飞书开放平台「创建自建应用」页
# 用法：pwsh -File scripts/open-feishu-app.ps1
Start-Process 'https://open.feishu.cn/app'
Write-Host '[open-feishu-app] 已弹出浏览器：https://open.feishu.cn/app' -ForegroundColor Green
Write-Host '请点【创建企业自建应用】→ 填名字 → 创建后会跳到详情页' -ForegroundColor Yellow
