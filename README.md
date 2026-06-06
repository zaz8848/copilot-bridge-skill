# copilot-bridge-skill

> 让 VS Code Copilot Agent 在干完活 / 要确认时，**通过飞书推消息到你手机**。
> 你在飞书回一句话，Copilot 接着干。**人不用一直坐在电脑前**。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)
![Node](https://img.shields.io/badge/Node-20%2B-green.svg)
![GitHub Stars](https://img.shields.io/github/stars/zaz8848/copilot-bridge-skill?style=social)
![GitHub Forks](https://img.shields.io/github/forks/zaz8848/copilot-bridge-skill?style=social)
![Release](https://img.shields.io/github/v/release/zaz8848/copilot-bridge-skill?include_prereleases)

---

## 这是什么

一个让 GitHub Copilot 跟你「异步对话」的桥。Copilot 在 VS Code 里跑任务，到了
"我做完了你看看"或"我有两个方案选哪个"的时刻，自动把消息推到你飞书。
你在地铁上 / 床上 / 厕所 回一句话，Copilot 在你电脑上继续干。

**典型场景**：
- 派活后离开电脑，回来直接看结果
- 长任务（重构 / 大改）做完一段就通知你确认下一段
- 多个 VS Code 窗口同时跑，每个项目独立飞书群

---

## 5 分钟上手（傻瓜模式）

> 全程 AI 引导你装。你只要点鼠标 + 在飞书后台抄几个值贴回来。

### Step 0：一次性放开 PowerShell 脚本执行（仅当前用户）

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```

> 不做这一步，下面的 `pnpm` / `npm` / `install.ps1` 全部会因为默认 ExecutionPolicy=Restricted 报「无法加载文件…在此系统上禁止运行脚本」。

### Step 1：把仓库 clone 到任意位置

```powershell
git clone https://github.com/zaz8848/copilot-bridge-skill.git
cd copilot-bridge-skill
```

### Step 2：跑安装器

```powershell
# 推荐用 PowerShell 7+（pwsh）。如果只有 PowerShell 5.1（Windows 默认）：
powershell.exe -ExecutionPolicy Bypass -File install.ps1
# PowerShell 7+：
pwsh -File install.ps1
```

它会：
1. 把 `SKILL.md` + `SETUP.skill.md` 拷到 `%APPDATA%\Code\User\prompts\skills\copilot-bridge\`
2. 设置环境变量 `COPILOT_BRIDGE_HOME` 指向当前仓库
3. 提示你下一步

### Step 3：在 VS Code 里让 AI 帮你装

打开本仓库目录，在 Copilot Chat 说一句：

```
帮我装一下 copilot-bridge
```

AI 会自动读取 `SETUP.skill.md` 一步一步引导你：
- 装 Node.js 22 LTS（**必须 22.x**，better-sqlite3 v12 的 prebuild 矩阵覆盖 Node 22/24，不覆盖 Node 20，否则强制源码编译要 MSVC + Python） / pnpm / cloudflared
- 引导你去飞书后台创建自建应用（自动弹浏览器）
- 收你飞书 App 凭据，写到 `.env` / `copilot-bridge.config.json`
- 装 cloudflared 隧道、注册 Windows 服务
- build bridge-core、注册开机自启
- 跑一次端到端烟测

完事告诉你"装好了"。

### Step 4：在任意项目里启用

编辑 **你想用 bridge 的项目** 根目录的 `.github/copilot-instructions.md`，
顶部加一行 YAML（没有该文件就新建）：

```markdown
---
comm_mode: feishu
---
```

Copilot 下次开会话自动激活 `copilot-bridge` skill，开始走飞书通信。

---

## 你需要自备什么

| 必备 | 难度 | 一次配置 vs 每电脑 |
|---|---|---|
| Windows 10/11 | - | - |
| Node.js 22 LTS | 低 | install.ps1 帮你装（v22 是 better-sqlite3 v12 prebuild 覆盖的最佳版本） |
| 一个免费飞书账号 | 低 | 一次性 |
| 飞书自建应用（App ID/Secret） | 中 | 5 分钟拿，AI 引导 |
| 公网入口（cloudflared，免费够用） | 中 | install.ps1 帮你装 |
| （可选）自有域名 | 中 | 长期用更稳，不必须 |

**配置文件**：`copilot-bridge.config.json`（你自己的，不进 git；换电脑 copy 一份就跳过引导）。

> **单文件设计**：所有凭据（含 App Secret）直接写在这一份 JSON 里。`.gitignore` 已拦截，不会泄露。
> 如果你偏好把 secret 拆到 `.env`，在 JSON 里写 `"appSecret": "${env:FEISHU_APP_SECRET}"` 即可——代码向后兼容。

---

## 三种运行模式（公网入口）

| 模式 | 是否要域名 | 重启后要不要更新飞书 | 推荐场景 |
|---|---|---|---|
| `temp-tunnel` | 否 | **要**（trycloudflare URL 会变） | 临时试用 |
| `named-tunnel` | 是 | 不要（URL 永远固定） | 长期使用（推荐） |
| `manual` | 自己搞 | 看你的反代 | 高级 |

> ⚠️ **完全内网用不了**。飞书 webhook 必须从公网 POST 到你电脑，没法绕开。

---

## 文件结构

```
copilot-bridge-skill/
├── README.md                              ← 你正在看
├── LICENSE                                ← MIT
├── install.ps1                            ← 用户入口
├── SETUP.skill.md                         ← AI 安装剧本（拷到 user prompts）
├── SKILL.md                               ← AI 运行规则（拷到 user prompts）
├── copilot-bridge.config.example.json     ← 配置模板（带字段注释）
├── .env.example                           ← secret 模板
├── .gitignore                             ← 排除 .env / bridge.db / config.json
│
├── bridge-core/                           ← Node TS 服务（vendor）
│   ├── src/                               ← 源码（含改造过的 config.ts）
│   ├── package.json
│   └── tsconfig.json
│
├── ps-client/                             ← 给 Copilot 用的 3 个 PS 脚本
│   ├── feishu-health.ps1
│   ├── feishu-resume.ps1
│   └── feishu-send-and-wait.ps1
│
├── scripts/
│   ├── doctor.ps1                         ← 自检（JSON 输出给 AI 读）
│   ├── open-feishu-app.ps1                ← 自动开浏览器
│   ├── open-feishu-scopes.ps1
│   ├── open-feishu-events.ps1
│   ├── open-cloudflare-dash.ps1
│   ├── set-feishu-webhook-url.ps1
│   ├── install-cloudflared-service.ps1
│   ├── install-bridge-autostart.ps1
│   ├── bridge-autostart.ps1
│   └── start.ps1
│
├── templates/
│   ├── project-instructions-snippet.md    ← 复制到你项目 .github/copilot-instructions.md
│   └── cloudflared-config.example.yml
│
└── docs/
    ├── OPERATIONS.md
    └── INSTALL_CLOUDFLARED_SERVICE.md
```

---

## 配置文件字段（哪些必填 / 哪些可选）

完整模板：[copilot-bridge.config.example.json](copilot-bridge.config.example.json)

| 字段 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `feishu.appId` | ✅ | - | 飞书自建应用 ID `cli_xxx` |
| `feishu.appSecret` | ✅ | - | 直接写凭据；或写 `${env:FEISHU_APP_SECRET}` 从 .env 读 |
| `feishu.targetChatId` | ✅ | - | bot 跟你的单聊 chat_id `oc_xxx` |
| `feishu.encryptKey` | ❌ | `""` | **必须留空**（不支持加密回调） |
| `feishu.verificationToken` | ❌ | `""` | 可填可不填 |
| `publicEndpoint.mode` | ✅ | `temp-tunnel` | `temp-tunnel` / `named-tunnel` / `manual` |
| `publicEndpoint.domain` | mode=B 时必填 | `""` | 自有域名 |
| `publicEndpoint.tunnelName` | mode=B 时必填 | `""` | cloudflared 隧道名 |
| `server.port` | ❌ | `3000` | bridge-core HTTP 端口 |
| `server.host` | ❌ | `127.0.0.1` | 只本机，公网走 cloudflared |
| `paths.dbFile` | ❌ | `./bridge.db` | SQLite 文件 |
| `paths.imageInboundDir` | ❌ | `./images` | 入站图片下载目录 |
| `behavior.waitPollIntervalMs` | ❌ | `1500` | wait 轮询间隔 |
| `behavior.maxRetries` | ❌ | `3` | 飞书 API 重试次数 |

---

## 自检 & 故障排查

```powershell
pwsh -File scripts/doctor.ps1
```

输出 JSON，关键字段：
- `ready: true` → 全好
- `nextStep` → 当前缺什么（`install-node` / `pnpm-build` / `start-bridge` / ...）

日常运维：[docs/OPERATIONS.md](docs/OPERATIONS.md)

---

## 换电脑迁移（旧机 → 新机）

**一个 cloudflared 隧道同一时刻只能由一台机器服务**。两台机同时连同一个 tunnel 会被 Cloudflare 负载均衡，50% 飞书回调会落到旧机，新机收不到。

### 旧机：先关 cloudflared
```powershell
# 管理员 PowerShell
Stop-Service Cloudflared
Set-Service Cloudflared -StartupType Manual   # 或 Disabled
```

### 要搬到新机的 4 个文件（其它都能 git clone 或重装）
| 旧机路径 | 新机放到 | 作用 |
|---|---|---|
| `<仓库>/copilot-bridge.config.json` | 同 | 飞书凭据 + 隧道域名 |
| `C:\ProgramData\Cloudflared\cert.pem` | 同 | Cloudflare 账号 token |
| `C:\ProgramData\Cloudflared\<UUID>.json` | 同 | 隧道密钥 |
| `C:\ProgramData\Cloudflared\config.yml` | 同 | ingress 白名单 |

**搬运渠道**：U 盘 / 微信文件传输助手 / 加密 zip。**禁公网明文传输**。

### 新机：跑 SETUP，AI 自动识别已配
```powershell
git clone https://github.com/zaz8848/copilot-bridge-skill.git
cd copilot-bridge-skill
# 把上面 4 个文件粘到对应位置
powershell.exe -ExecutionPolicy Bypass -File install.ps1
# 在 VS Code Copilot Chat 说："帮我装一下 copilot-bridge"
# AI 跑 doctor.ps1 检测到配置已就位，自动跳过引导直奔 pnpm install + build + cloudflared service install
```

---

## 安全提醒

- `copilot-bridge.config.json` / `bridge.db` / cloudflared 凭据 **绝不能进 git**
  （`.gitignore` 已默认排除）
- 每个用户必须自建飞书 App，**不要共享 App Secret**（一旦泄漏，任何人能冒充你 bot 发消息）
- cloudflared 默认只暴露 `/webhook/feishu` 和 `/health`，其它路径返 404
- Dashboard (`/dashboard`) 只绑 127.0.0.1，公网访问不到

---

## 卸载

```powershell
# 1. 卸全局 skill
Remove-Item -Recurse -Force "$env:APPDATA\Code\User\prompts\skills\copilot-bridge"

# 2. 删环境变量
[Environment]::SetEnvironmentVariable('COPILOT_BRIDGE_HOME', $null, 'User')

# 3. 卸 Windows 服务和计划任务（管理员）
sc.exe delete Cloudflared
Unregister-ScheduledTask -TaskName CopilotBridgeCore -Confirm:$false

# 4. 删本仓库
Remove-Item -Recurse -Force <仓库路径>
```

---

## 贡献

PR / Issue 欢迎。详细架构 + 黑盒决策见 [docs/](docs/)。

## License

MIT
