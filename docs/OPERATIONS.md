# Copilot Bridge - 日常操作手册

> 给用户日常用的操作手册。涵盖开机后怎么用、出问题怎么修、换电脑怎么搬。
> 版本：v0.0.25 ｜ 更新日期：2026-06-05

---

## 1. 日常使用

### 1.1 开机后要做什么

**只需要做 1 件事**：起 bridge-core。

```powershell
cd "D:\A_Code\Copilot Bridge"
node bridge-core\dist\index.js
```

或者用现成的：
```powershell
cd "D:\A_Code\Copilot Bridge PowerShell"
.\scripts\start.ps1
```

> `start.ps1` 会自动检测 cloudflared 服务在跑，不会再额外起隧道（避免冲突）。
> 隧道（cloudflared）已经是 Windows 服务，**开机自动启动，不用管**。

### 1.2 验证全链路通

```powershell
# 本地 bridge
Invoke-RestMethod http://127.0.0.1:3000/health
# 期望：{"ok":true,"version":"0.0.12",...}

# 公网入口
Invoke-WebRequest -Uri "https://copilot-bridge.top/webhook/feishu" -Method Post -Body "{}" -ContentType "application/json" -TimeoutSec 10 -UseBasicParsing
# 期望：StatusCode = 200
```

### 1.3 关机前要做什么

**啥都不用做**。

- bridge-core 关 PowerShell 时自动停（这是 OK 的）
- cloudflared 服务由 Windows 接管，跟你关不关 PowerShell 无关

---

## 2. 出问题怎么修（按现象排查）

### 2.1 飞书发消息我没收到

**可能 1：bridge-core 没跑**

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
# 失败 → 起 bridge：node "D:\A_Code\Copilot Bridge\bridge-core\dist\index.js"
```

**可能 2：cloudflared 服务挂了**

```powershell
Get-Service Cloudflared
# 不是 Running → Start-Service Cloudflared（要管理员）
```

**可能 3：飞书 webhook URL 改错了**

打开 [飞书开发者后台 → Events & Callbacks](https://open.feishu.cn/app/cli_aa8f452ed3799bcd/event)，
确认 Request URL 是 `https://copilot-bridge.top/webhook/feishu`。

### 2.2 公网域名访问不通

```powershell
# 测 DNS
nslookup copilot-bridge.top 1.1.1.1
# 应解析到 Cloudflare IP

# 测 HTTPS
Invoke-WebRequest -Uri "https://copilot-bridge.top/health" -TimeoutSec 10 -UseBasicParsing
```

**530 错误** = cloudflared 服务在跑但找不到隧道源 → 检查 `C:\ProgramData\Cloudflared\` 凭证文件还在
**502 错误** = bridge-core 没跑 → 起 bridge
**404 错误，且本地 `Invoke-RestMethod http://127.0.0.1:3000/health` 是 200** = cloudflared 转发到了**错的进程**。99% 是 config.yml 里 `service:` 写了 `http://localhost:3000`，且本机另一个项目占了 `0.0.0.0:3000`（Windows 上 localhost 优先解析到 0.0.0.0）。修法：把 config 里所有 `localhost` 改成 `127.0.0.1`（显式 IP 不走 hostname 解析），然后 `Restart-Service cloudflared`。检查谁占了 0.0.0.0:3000：`netstat -ano | findstr ":3000.*0.0.0.0"`
**超时** = 本机 → Cloudflare 网络抽风（GFW 等），换网络重试；飞书后端走不同路径一般不受影响

### 2.3 AI 发卡说"无法连接到远程服务器"

bridge-core 没跑。起 bridge（见 1.1）。

### 2.4 看 cloudflared 日志

```powershell
# 实时日志（Windows 事件查看器）
Get-WinEvent -ProviderName Cloudflared -MaxEvents 30 | Select-Object TimeCreated,Message | Format-List

# 看正在跑的进程
Get-Process cloudflared | Select-Object Id,StartTime
```

### 2.5 看 bridge-core 日志

```powershell
Get-Content "D:\A_Code\Copilot Bridge\bridge-core.log" -Tail 30
```

---

## 3. 常用命令速查

| 我要... | 命令 |
|---------|------|
| 起 bridge | `node "D:\A_Code\Copilot Bridge\bridge-core\dist\index.js"` |
| 看 bridge 健康 | `irm http://127.0.0.1:3000/health` |
| 看 cloudflared 状态 | `Get-Service Cloudflared` |
| 重启 cloudflared 服务（要管理员） | `Restart-Service Cloudflared` |
| 测公网入口 | `iwr https://copilot-bridge.top/webhook/feishu -Method Post -Body '{}' -ContentType 'application/json'` |
| 给飞书发测试卡 | `.\ps-client\feishu-send-and-wait.ps1 -Message "test" -Level ask -ProjectName "test" -WorkspacePath "$PWD"` |
| 拉离线消息 | `.\ps-client\feishu-resume.ps1 -ProjectName "test"` |

---

## 4. 换电脑搬迁（按顺序）

### 4.1 老电脑上要备份的东西

```powershell
# 1. 飞书 App 凭证
Copy-Item "D:\A_Code\Copilot Bridge\.env" "<U盘>\copilot-bridge-backup\"

# 2. 历史消息数据库（可选，不拷就丢历史）
Copy-Item "D:\A_Code\Copilot Bridge\bridge.db" "<U盘>\copilot-bridge-backup\"

# 3. cloudflared 凭证（隧道身份）
Copy-Item -Recurse "C:\Users\$env:USERNAME\.cloudflared" "<U盘>\copilot-bridge-backup\cloudflared-creds\"
Copy-Item -Recurse "C:\ProgramData\Cloudflared" "<U盘>\copilot-bridge-backup\cloudflared-programdata\"
```

### 4.2 新电脑装环境

```powershell
# 1. 装 Node.js 20+（去 nodejs.org）
# 2. 装 pnpm
npm install -g pnpm

# 3. 装 cloudflared
winget install Cloudflare.cloudflared

# 4. 把源码 git clone 下来
git clone <your-repo-url> "D:\A_Code\Copilot Bridge"
git clone <your-repo-url-powershell> "D:\A_Code\Copilot Bridge PowerShell"

# 5. 装依赖 + 编译
cd "D:\A_Code\Copilot Bridge"
pnpm install
pnpm build

# 6. 还原 .env / bridge.db
Copy-Item "<U盘>\copilot-bridge-backup\.env" "D:\A_Code\Copilot Bridge\"
Copy-Item "<U盘>\copilot-bridge-backup\bridge.db" "D:\A_Code\Copilot Bridge\" -ErrorAction SilentlyContinue

# 7. 还原 cloudflared 凭证
Copy-Item -Recurse "<U盘>\copilot-bridge-backup\cloudflared-creds\*" "C:\Users\$env:USERNAME\.cloudflared\"
Copy-Item -Recurse "<U盘>\copilot-bridge-backup\cloudflared-programdata\*" "C:\ProgramData\Cloudflared\"
```

### 4.3 新电脑装 cloudflared 服务

按 [INSTALL_CLOUDFLARED_SERVICE.md](INSTALL_CLOUDFLARED_SERVICE.md) §5-§6 走，**重点**：
- 凭证已经在 `C:\ProgramData\Cloudflared\`（从 U 盘还原过来的）
- 用管理员 PowerShell 跑 `cloudflared service install` + `sc.exe config Cloudflared binPath=...`

### 4.4 验收

```powershell
# 1. bridge 起来
cd "D:\A_Code\Copilot Bridge"; node bridge-core\dist\index.js
# 另一个窗口：irm http://127.0.0.1:3000/health → 应返回 ok

# 2. cloudflared 服务起来
Get-Service Cloudflared  # Running

# 3. 公网入口通
iwr https://copilot-bridge.top/webhook/feishu -Method Post -Body '{}' -ContentType 'application/json'  # 200

# 4. 真机端到端
# 飞书给机器人发"测试"，bridge.log 应该出现 [router] 日志
```

**飞书后台不用动**：因为 webhook URL 是固定域名 `copilot-bridge.top`，新电脑 cloudflared 用同一个隧道凭证连上 → 飞书的请求自动路由到新电脑。

---

## 5. 关键路径速查

| 东西 | 路径 |
|------|------|
| bridge-core 源码 | `D:\A_Code\Copilot Bridge\bridge-core\` |
| bridge-core 编译产物 | `D:\A_Code\Copilot Bridge\bridge-core\dist\index.js` |
| .env（飞书凭证） | `D:\A_Code\Copilot Bridge\.env` |
| 历史消息 SQLite | `D:\A_Code\Copilot Bridge\bridge.db` |
| bridge 日志 | `D:\A_Code\Copilot Bridge\bridge-core.log` |
| PowerShell 客户端 | `D:\A_Code\Copilot Bridge PowerShell\ps-client\` |
| cloudflared user 凭证 | `C:\Users\ASUS\.cloudflared\` |
| cloudflared service 配置 | `C:\ProgramData\Cloudflared\config.yml` |
| cloudflared 日志 | `Get-WinEvent -ProviderName Cloudflared` |

---

## 6. 危险操作清单（做之前先想想）

| 操作 | 后果 |
|------|------|
| 删 `.env` | 飞书凭证丢，要重去飞书后台拿 App Secret |
| 删 `bridge.db` | 历史消息丢，pending task 全没（但功能能用） |
| 删 `C:\Users\ASUS\.cloudflared\cert.pem` | 隧道身份丢，要 `cloudflared tunnel login` 重新认证 |
| 删 `C:\ProgramData\Cloudflared\` | service 起不来，公网立刻 530 |
| `sc.exe delete Cloudflared` | service 没了，按 [INSTALL_CLOUDFLARED_SERVICE.md](INSTALL_CLOUDFLARED_SERVICE.md) 重装 |
| 飞书后台改 webhook URL | 公网入口失效，飞书消息收不到（除非改回 `https://copilot-bridge.top/webhook/feishu`） |
| 在 Cloudflare 后台删 `copilot-bridge.top` site | 域名 NS 失效；要重新加 site + 等 NS 生效 |

---

## 7. 紧急联系信息

| 服务 | 入口 | 用途 |
|------|------|------|
| 飞书开放平台 | https://open.feishu.cn/app/cli_aa8f452ed3799bcd | 看 App ID/Secret、改 webhook、看事件订阅 |
| Cloudflare Dashboard | https://dash.cloudflare.com | DNS / 隧道 / 站点 |
| 腾讯云域名控制台 | https://console.cloud.tencent.com/domain | 域名 NS / 续费 |

域名信息：
- `copilot-bridge.top` — 腾讯云购，2027 续费
- NS 已切到 Cloudflare（`summer.ns.cloudflare.com` / `tate.ns.cloudflare.com`）
- 命名隧道 UUID：`8150c474-35df-4861-884c-5d695190b55e`
