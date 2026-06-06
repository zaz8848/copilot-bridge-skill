# cloudflared 命名隧道安装指南（接力 AI 阅读用）

> **用途**：在一台新电脑上把 `copilot-bridge.top` 命名隧道装成 Windows 服务，开机自启 + 崩了自重启。
> **读者**：接手这个项目的 AI / 运维工程师。
> **预计耗时**：5-10 分钟（含用户两次交互：UAC + Cloudflare 浏览器授权）。

---

## 0. 前置条件

| 项 | 说明 | 验证命令 |
|----|------|---------|
| Windows 10/11 | 必须有 Service Control Manager | `Get-Service` 能跑 |
| 管理员权限 | 装 Windows 服务必需 | 让用户用管理员 PowerShell |
| 网络能连 Cloudflare | 用于 OAuth + 隧道 QUIC | `Test-NetConnection api.cloudflare.com -Port 443` |
| 域名 `copilot-bridge.top` 已在 Cloudflare 接管 | NS 已生效，dashboard 状态 Active | `nslookup -type=ns copilot-bridge.top 1.1.1.1` 出现 `*.ns.cloudflare.com` |
| `bridge-core` 跑在本机 `localhost:3000` | 隧道转发的目标 | `Invoke-RestMethod http://127.0.0.1:3000/health` |

如果 NS 没生效或域名还在腾讯云：先回去做 NS 切换（见 `PROJECT_STATUS.md` 第十五批"P0 #1"）。

---

## 1. 装 cloudflared 二进制

```powershell
# 检查
cloudflared --version

# 没装就用 winget
winget install Cloudflare.cloudflared
```

装完重开 PowerShell（PATH 才生效）。验证：
```powershell
cloudflared --version
# 应输出类似：cloudflared version 2025.8.1
```

---

## 2. Cloudflare 账号登录

```powershell
cloudflared tunnel login
```

**这步会自动弹浏览器**让用户登录 Cloudflare 账号并选择 `copilot-bridge.top` 域名授权。

**AI 注意**：
- 这是用户交互步骤，AI 不能代点
- 浏览器没自动弹就把命令打的那个 URL 用 `open_browser_page` 工具开给用户
- 等用户授权完，命令行会自动结束并打印：`You have successfully logged in. ... cert.pem ... C:\Users\<USER>\.cloudflared\cert.pem`
- 看到这一行才算成功，没看到就别往下走

---

## 3. 创建或确认命名隧道

```powershell
# 看有没有现成的
cloudflared tunnel list

# 没有就创建
cloudflared tunnel create copilot-bridge
```

`create` 会输出隧道 UUID（如 `8150c474-35df-4861-884c-5d695190b55e`）和凭证文件路径
（`C:\Users\<USER>\.cloudflared\<UUID>.json`）。

**记录这两个值**，下一步要用。

**AI 注意**：
- 如果原电脑上已经有这个隧道（同名），create 会报 `tunnel with name already exists`，**不要重复 create**
- 改用 `cloudflared tunnel list` 拿现有 UUID
- 凭证文件 (`<UUID>.json`) 是从原电脑迁移过来的或重新 create 后生成的，**新电脑没有就重新 create**（旧 UUID 会作废，要在 dashboard 手动删除老隧道）

---

## 4. 配 DNS 路由（域名 → 隧道）

```powershell
cloudflared tunnel route dns copilot-bridge copilot-bridge.top
```

执行后 Cloudflare DNS 会自动加一条 CNAME：`copilot-bridge.top` → `<UUID>.cfargotunnel.com`。

如果报"already exists"，先去 Cloudflare dashboard 删掉旧 CNAME 再重跑。

---

## 5. 凭证 + config 搾到 ProgramData（重要！避开“LocalSystem 读不到 user profile”坑）

service 以 `LocalSystem` 身份跑，读不到 `C:\Users\<USER>\.cloudflared\`。把三个文件搾到 LocalSystem 天然能读的 `C:\ProgramData\Cloudflared\`：

用管理员 PowerShell：
```powershell
$src = "C:\Users\$env:USERNAME\.cloudflared"
$dst = "C:\ProgramData\Cloudflared"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\cert.pem" $dst -Force
Copy-Item "$src\<UUID>.json" $dst -Force
```

然后在 `$dst\config.yml` 里写（路径都用 ProgramData）：

```yaml
tunnel: <UUID>
credentials-file: C:\ProgramData\Cloudflared\<UUID>.json
origincert: C:\ProgramData\Cloudflared\cert.pem

# Plan 3 路径白名单
ingress:
  - hostname: copilot-bridge.top
    path: /webhook/feishu
    service: http://localhost:3000
  - hostname: copilot-bridge.top
    path: /health
    service: http://localhost:3000
  - service: http_status:404
```

**为什么要路径白名单**：bridge-core 默认暴露 `/api/*`、`/console` 等内部端点，不能暴露给公网。详见 [PROJECT_BLUEPRINT.md](../PROJECT_BLUEPRINT.md) §8.5。

---

## 6. 装服务 + 手动填 binPath 参数（必需！）

**重要**：`cloudflared service install` 装出来的 service **其 binPath 不会自动烘 `--config` 参数**，需要装完后手动修。

**三步（全部在管理员 PowerShell）**：

```powershell
# Step 6.1 装服务本身
$cfExe = "C:\Users\$env:USERNAME\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
& $cfExe --config "C:\ProgramData\Cloudflared\config.yml" service install

# Step 6.2 补上 binPath（这是刚有装但不会生效的参数）
Stop-Service Cloudflared
Start-Sleep 3
$newPath = '"' + $cfExe + '" --config "C:\ProgramData\Cloudflared\config.yml" tunnel run'
sc.exe config Cloudflared binPath= $newPath

# Step 6.3 验证 binPath 真的改了
sc.exe qc Cloudflared
# 期望BINARY_PATH_NAME 中出现：... cloudflared.exe --config C:\ProgramData\Cloudflared\config.yml tunnel run

# Step 6.4 强杀老进程（如果有）后重启服务
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 3
Start-Service Cloudflared
Start-Sleep 12
Get-Service Cloudflared    # 期望 Status=Running
```

**为什么不能只 `Restart-Service`**：binPath 改了但临时退出的老进程会拖死服务动作，必须强杀后重起。

---

## 7. 验收（必须全过）

### 7.1 公网 webhook 通
```powershell
Invoke-WebRequest -Uri "https://copilot-bridge.top/webhook/feishu" -Method Post -Body "{}" -ContentType "application/json" -TimeoutSec 15 -UseBasicParsing
# 期望：StatusCode = 200
```

### 7.2 公网 /api/* 被挡（Plan 3 路径白名单生效）
```powershell
try {
  Invoke-WebRequest -Uri "https://copilot-bridge.top/api/notify" -Method Post -TimeoutSec 15 -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__
  # 期望：404
}
```

### 7.3 服务崩溃自动重启
```powershell
# 找 cloudflared 进程
$p = Get-Process cloudflared
Stop-Process -Id $p.Id -Force
Start-Sleep -Seconds 35
# Windows 服务的 Recovery 配置默认在崩溃后 30s 内重启
Get-Service cloudflared
# 期望：Status = Running，进程 ID 变了
```

### 7.4 真机端到端
- 飞书给机器人发一条消息
- 看 `bridge-core.log` 是否有 `[router] reply ...` 日志
- 飞书收到回流响应

---

## 8. 常见问题排查

| 现象 | 原因 | 修复 |
|------|------|------|
| `service install` 报 access denied | 不是管理员 | 用管理员 PowerShell 重跑 |
| `tunnel login` 浏览器不弹 | 没默认浏览器 / 远程登录环境 | 复制命令行打印的 URL 手动开 |
| 公网访问 502 Bad Gateway | bridge-core 没起 | 先 `start.ps1` 起 bridge，再访问域名 |
| 公网访问超时 | NS 还没生效 / Cloudflare 抽风 | `nslookup ns` 确认，或换个网络重试 |
| `Get-Service cloudflared` 不存在 | service install 没成功 | 看上一步报错 |
| 公网访问 530 （但本机 200） | **service 以 LocalSystem 身份跑，读不到 user profile 的 .cloudflared/** — 见下面"難坑"一节 | 见下面 |
| 日志在哪 | Windows 事件查看器 → 应用程序 → 来源 "cloudflared" | 或用 `Get-WinEvent -ProviderName cloudflared -MaxEvents 20` |

## 8.5 service install 難坑（2026-06-05 踩过的坑记录）

以下是今天实战演进发现的，Windows 下 cloudflared 装 service 比官方文档複杂，下次重装的人要面对：

### 坑 1：service install 不带 `--config` 参数 → service 启动后不读 config.yml
- **现象**：`Get-Service cloudflared` = Running，但公网访问返 530 "no source tunnel"
- **原因**：`cloudflared service install` 默认没把 `--config <path>` 烘进 BINARY_PATH，服务以裸 `cloudflared.exe` 启动→不知道用哪个隧道凭证
- **修复**：装服务时添参数：`cloudflared --config C:\Users\<USER>\.cloudflared\config.yml service install`
- **验证**：`sc qc Cloudflared` 看 BINARY_PATH 里应该有 `--config` 字样

### 坑 2：LocalSystem 账户读不到 user profile 的 `.cloudflared/`
- **现象**：即使 BINARY_PATH 带了 `--config`，服务仍可能报凭证找不到
- **原因**：service 默认以 `LocalSystem` 身份跑，它的 `%USERPROFILE%` 是 `C:\Windows\System32\config\systemprofile\`；config.yml 里 `credentials-file` 如果写的是 `C:\Users\ASUS\.cloudflared\xxx.json`，LocalSystem 能读，但只要 `cert.pem` 也拾不到就走不下去
- **修复三选一**：
  1. **推荐**：把 `cert.pem` + `<UUID>.json` 复制到 `C:\Windows\System32\config\systemprofile\.cloudflared\`（需管理员权限，且要确保不被 Windows Defender 实时清理）
  2. 用 `Set-Service Cloudflared -Credential <你的用户账号>`（要输入密码）让 service 跑在你用户身份下，能读 `C:\Users\ASUS\.cloudflared/`
  3. 把 config.yml + cert.pem + <UUID>.json 全都挪到 `C:\ProgramData\Cloudflare\` 这种机器级目录，config.yml 里路径同步改
- **今天实战有个额外怪事**：Copy 进 LocalSystem profile 后几秒后重启 service，文件又消失了（可能 Windows Defender 调用 ASR 规则推了）。最靠谱的还是选项 2 或 3

### 坑 3：sc delete 后 EventLog 注册表残留
- **现象**：重装 service 报 `Cannot install event logger: ... Cloudflared registry key already exists`
- **修复**：管理员 PowerShell 跑 `Remove-Item HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared -Recurse -Force`后再 service install

### 坑 4：sc.exe 对服务名大小写敏感
- **现象**：`sc.exe qc cloudflared` 返“未安装”，但 `sc.exe qc Cloudflared` 返正常
- **原因**：`cloudflared service install` 装出来的 windowsServiceName 是 `Cloudflared`（首字母大写）
- **修复**：完全匹配下面几个名字之一：`Cloudflared`、`cloudflared`（PowerShell `Get-Service` 不问大小写但 `sc.exe` 问）

### 坑 5：service 被退出时重启 service 会拖死手动 cloudflared
- **现象**：`Restart-Service Cloudflared` 后发现手动启动的 cloudflared 进程也一起死了
- **原因**：底层有服务控制句柄在，stop service 会发 SIGTERM 给同名进程
- **修复**：要么全跑服务要么全跑手动，不要混跑

---

## 9. 卸载（备用）

```powershell
# 管理员 PowerShell
cloudflared service uninstall
Get-Service cloudflared  # 应报 cannot find service
```

卸载后命名隧道本身还在 Cloudflare 账号里（`cloudflared tunnel list` 还能看到），只是不会自动启动了。

---

## 10. 跟其它组件的关系

| 组件 | 是否需要服务 | 怎么起 |
|------|------------|--------|
| bridge-core (node) | 否 | 仍走 `scripts/start.ps1`，由用户手动 / 后续自动化处理 |
| cloudflared | **是**（装服务后无需手动管） | Windows 自动 |
| `scripts/start.ps1` 中的 cloudflared 启动段 | **跳过** | start.ps1 已加判断（检测到服务存在就不再手动起） |

装完服务后日常流程：
1. 开机 → cloudflared 服务自动起（你啥都不用管）
2. 跑 `scripts/start.ps1` → 它只起 bridge-core，不碰 cloudflared
3. 关机 → cloudflared 服务自动停（Windows 接管）

---

## 11. 跟 Plan 1（Cloudflare Access）的关系

本文档只装到 Plan 3（路径白名单）。如果未来用户办了 Visa 卡想升级 Plan 1（邮箱鉴权）：
- **不影响**已装的服务，Plan 1 是在 Cloudflare 云端配的，本机 cloudflared 不用动
- 见 [PROJECT_BLUEPRINT.md](../PROJECT_BLUEPRINT.md) §8.5 DR-005

---

**做完所有验收 → 在 PROJECT_STATUS.md 加一条"第 X 批：cloudflared 服务化"开发日志，并把 P0 #0 标记为已完成。**
