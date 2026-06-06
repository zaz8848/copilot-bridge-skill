---
name: copilot-bridge-setup
description: |
  傻瓜式安装 copilot-bridge。当用户首次使用本仓库、说"帮我装一下 copilot-bridge"
  / "初始化 bridge" / "setup copilot bridge" / "bootstrap copilot bridge" 等
  类似触发语时，AI 严格按本剧本一步步执行，每步用 vscode_askQuestions 跟用户互动，
  不要让用户自己去读 README。
applyTo: '**'
---

# Copilot-Bridge 傻瓜式安装剧本（给 AI 看，严格按步执行）

> 用户视角：他只要在 VS Code Copilot Chat 里说一句"帮我装一下"，剩下全 AI 完成。

---

## 总原则（必读）

1. **绝不要让用户自己读 README**。每一步你（AI）都要主动引导、自动跑命令、自动开浏览器
2. **每个交互步骤都用 `vscode_askQuestions`**（不是在聊天里发问），让用户在弹窗里选/填
3. **secret 类字段**（App Secret / Encrypt Key）—— 提示用户"直接贴到弹窗输入框，不要发给我"，但 vscode_askQuestions 是安全的，可以收
4. **每步完成立刻跑 `scripts/doctor.ps1` 重新自检**，决定下一步
5. **失败时**：把错误粘出来 + 给 2-3 个可能原因 + 问"自动重试 / 跳过 / 退出"

---

## Step 0：自检定位

```powershell
pwsh -File scripts/doctor.ps1
```

解析输出 JSON 的 `nextStep` 字段：

| nextStep 值 | 跳到 |
|---|---|
| `install-node` | Step 1 |
| `install-cloudflared` | Step 3 |
| `create-config` | Step 2 |
| `fill-feishu-credentials` | Step 4 |
| `pnpm-install` / `pnpm-build` | Step 5 |
| `start-bridge` | Step 6 |
| `install-skill` | Step 7 |
| `done` | Step 8（收尾） |

---

## Step 1：装 Node.js 20+ 和 pnpm

```powershell
# 检测
node -v  # 如果没装或 < v20

# 装（管理员权限）
winget install OpenJS.NodeJS.LTS
# pnpm
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
```

装完让用户 **重启 PowerShell 终端**（PATH 才会刷新），然后回 Step 0 重检。

---

## Step 2：选择运行模式（公网入口）

调用 `vscode_askQuestions`：

```
问题：你想用哪种公网入口让飞书把消息送到本机？
选项：
A) 临时隧道（trycloudflare）—— 推荐试用
   - 0 成本、不需要域名
   - 缺点：每次重启电脑或 cloudflared 进程，URL 会变，要重新粘到飞书后台

B) 命名隧道 + 自有域名（推荐长期用）
   - 需要：一个域名（任意注册商，腾讯云 / 阿里云 / Namecheap 都行）+ 免费 Cloudflare 账号
   - 优点：URL 永远固定，配一次就行

C) 手动 / 其他反代（高级用户）
   - 你自己搞 nginx / frp / ngrok，AI 不管
```

把用户的选择写进 `copilot-bridge.config.json` 的 `publicEndpoint.mode`：
- A → `"temp-tunnel"`
- B → `"named-tunnel"`（额外问 domain 和 tunnelName）
- C → `"manual"`

如果 `copilot-bridge.config.json` 还不存在，从 `copilot-bridge.config.example.json` 复制一份过去再改。

---

## Step 3：装 cloudflared

```powershell
winget install Cloudflare.cloudflared
```

如果选了 mode=B（named-tunnel），还要：

```powershell
# 3.1 登录 Cloudflare（弹浏览器）
cloudflared tunnel login
# 等用户在浏览器选完域名 → 回终端

# 3.2 建隧道
cloudflared tunnel create <用户填的 tunnelName>
# 拿到 tunnel UUID

# 3.3 DNS 路由
cloudflared tunnel route dns <tunnelName> <用户填的 domain>

# 3.4 写 config.yml 到 C:\ProgramData\Cloudflared\（要管理员）
# 3.5 装 Windows 服务
.\scripts\install-cloudflared-service.ps1
```

---

## Step 4：配飞书自建应用（手把手）

### 4.1 创建 App

```powershell
.\scripts\open-feishu-app.ps1
```

引导用户：
1. 点【创建企业自建应用】
2. 应用名随便取（比如 "Copilot Bridge"）
3. 创建后会跳详情页

### 4.2 收 4 个凭据

调用 `vscode_askQuestions`，**4 个独立问题**（不要 multi-select）：

1. App ID（详情页头部，`cli_xxxxxxxxxxxxxxxx`）
2. App Secret（详情页"凭证与基础信息"→"应用凭证"）
3. Encrypt Key —— **必须留空**（如果飞书后台已经填了，让用户去清空）
4. Verification Token（事件订阅页给的 token，可填可不填）

把 1/3/4 写进 `copilot-bridge.config.json` 的 `feishu` 节；
把 2 (App Secret) 写进 `.env` 的 `FEISHU_APP_SECRET=xxx`。

### 4.3 开权限

```powershell
.\scripts\open-feishu-scopes.ps1 -AppId <用户填的 AppId>
```

浏览器自动开权限申请页，6 个权限已勾选。让用户点【Add Scopes】，秒批。

### 4.4 加 bot 到群 + 拿 chat_id

引导用户：
1. 在飞书 App "权限管理" 旁的 "添加应用能力" 启用 "机器人"
2. 在飞书 App 概览页有版本管理，**点【创建版本】→ 提交发布**（个人租户秒过）
3. 在飞书里搜你的 bot 名 → 发起单聊 / 加到一个群 → @bot 一次
4. 跑：
```powershell
cd bridge-core
pnpm install
pnpm get-chat-id
```
   会打印你能推的 chat_id，挑 `chat_type=p2p` 的复制
5. 把 chat_id 写进 `copilot-bridge.config.json` 的 `feishu.targetChatId`

---

## Step 5：build bridge-core

```powershell
cd bridge-core
pnpm install
# pnpm 11+ 默认拒绝跑 native build，必须显式批准 better-sqlite3 + esbuild
pnpm approve-builds   # 交互选 better-sqlite3, esbuild → y 全部
pnpm build
```

**已知坑 1**：`pnpm install` 末尾若出现 `ERR_PNPM_IGNORED_BUILDS: better-sqlite3, esbuild` →
跑 `pnpm approve-builds` 把这两个加白名单后重新 `pnpm install`，否则启动时报
`Could not locate the bindings file` (`better_sqlite3.node`)。

**已知坑 2**：`copilot-bridge.config.json` 必须是无 BOM 的 UTF-8。
用 PowerShell `Out-File -Encoding utf8` 会带 BOM 让 JSON.parse 失败 →
应该用 `[System.IO.File]::WriteAllText(<path>, <content>, [System.Text.UTF8Encoding]::new($false))`。

build 报错 → 把第一段错粘给用户 + 大概率是 TypeScript 版本，让他升 Node。

---

## Step 6：启动 bridge + 配 webhook

### 6.1 启动 bridge

```powershell
# 前台启（方便看日志）
cd bridge-core
node dist/index.js
```

新开一个终端，跑 `scripts/doctor.ps1`，看 `bridgeCore.running=true` ✅

### 6.2 启动 cloudflared 拿公网 URL

mode=A 的话：
```powershell
cloudflared tunnel --url http://localhost:3000
```
从输出 grep `https://*.trycloudflare.com`，记下来。

mode=B 的话：URL 就是 `https://<你的 domain>`，cloudflared service 已在跑。

### 6.3 把 URL 设到飞书后台

```powershell
.\scripts\set-feishu-webhook-url.ps1 -AppId <AppId> -PublicUrl <上面的 URL>
```

- 自动复制 `<URL>/webhook/feishu` 到剪贴板
- 自动开飞书事件配置页

引导用户：
1. 在【请求地址】框 Ctrl+V 粘贴
2. 保存 → 等 challenge 通过（绿色对勾）
3. 在【事件订阅】添加 `im.message.receive_v1` 事件
4. 回头跟你说"配好了"

### 6.4 烟测

发一张测试卡：
```powershell
.\ps-client\feishu-send-and-wait.ps1 -Message "安装测试，请回个 ok" -Level ask -ProjectName "setup-test" -WorkspacePath (Get-Location).Path
```

让用户在手机飞书回个 "ok" → 看到 `REPLY_TEXT: ok` = 端到端通了。

---

## Step 7：装服务 + 装全局 skill

### 7.1 bridge-core 开机自启

```powershell
.\scripts\install-bridge-autostart.ps1
```

注册 Windows 计划任务 `CopilotBridgeCore`，登录时自启。

### 7.2 装全局 SKILL.md

```powershell
.\install.ps1 -Mode SkillOnly
```

把 `SKILL.md` 拷到 `%APPDATA%\Code\User\prompts\skills\copilot-bridge\` —— 任何 workspace 的 Copilot 都能自动发现。

---

## Step 8：收尾告知

告诉用户：

```
🎉 安装完成！

【日常用法】在你想用 bridge 的项目里：
  1. 编辑 .github/copilot-instructions.md
  2. 顶部加一行 YAML：comm_mode: feishu
  3. AI 自动加载 SKILL.md，开始走飞书通信

【验证】跑 scripts/doctor.ps1 —— ready=true 就齐活

【日常运维】docs/OPERATIONS.md
```

---

## 异常处理通用规则

- **任何步骤报错**：把错误第一段贴出来 + 给 2-3 个可能原因 + `vscode_askQuestions` 让用户选 "自动重试 / 跳过 / 退出"
- **用户中途关 VS Code**：下次进来 doctor.ps1 看 nextStep，从上次卡住的步骤继续
- **用户已经配过一部分**（比如你换电脑时 copy 了 config.json 过来）：doctor.ps1 会跳过已完成的步骤直接到 install-skill
