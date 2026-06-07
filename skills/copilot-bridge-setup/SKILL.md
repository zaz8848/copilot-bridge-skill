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
6. **打开任何网页一律用 VS Code 内置浏览器（Simple Browser），禁止跳系统外部浏览器**
   - 正确做法：`run_vscode_command` 调 `simpleBrowser.show` 传 URL
   - 禁止：`Start-Process <url>` / `Start-Process 'msedge' <url>` / `Start-Process 'chrome' <url>` / 让用户自己复制 URL 去外部浏览器
   - 原因：用户全程在 VS Code 内完成安装，不被弹外部窗口打断；飞书 / Cloudflare / 文档页都能在 Simple Browser 里完成登录和配置
   - **`scripts/open-*.ps1` 和 `set-feishu-webhook-url.ps1` 的协议**：脚本不再自动开浏览器，只在 stdout 打印一行 `OPEN_URL: <url>`。AI 跑完脚本 → 用正则 `^OPEN_URL: (.+)$` 抠出 URL → 调 `simpleBrowser.show` 在 VS Code 内打开

---

## Step 0：自检定位

```powershell
powershell -File scripts\doctor.ps1
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

## Step 1：装 Node.js 22 LTS（**最佳兼容**） 和 pnpm

```powershell
# 检测
node -v  # 期望 v22.x

# better-sqlite3 v12 的 prebuild 矩阵覆盖：Node 22 / Node 24 ✅，Node 20 ❌
# 不要装 Node 20（v12 prebuild 不覆盖，会强制源码编译要 MSVC + Python）
# 不要装 Node 21/23（odd LTS 不稳定）
winget install OpenJS.NodeJS --version 22.11.0

# pnpm
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression

# 刷新当前 shell 的 PATH（不用重启终端）
$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('PATH','User')

# 一次性放开 PowerShell 脚本执行权限（仅当前用户）
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```

装完跑 `node -v` 验证拿到 v22.x，回 Step 0 重检。

**如果你装错了 Node 版本**：
- 卡在 `pnpm install` 时报 `gyp ERR! find VS` → 说明 better-sqlite3 prebuild 不命中
- 修法：`winget uninstall OpenJS.NodeJS`，重装到 22.x

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

# 刷新当前 shell PATH
$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')
cloudflared --version  # 验证
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

# 3.4 把 cert.pem 和 <UUID>.json 从 ~/.cloudflared/ 拷到 C:\ProgramData\Cloudflared\
# 3.5 写 config.yml 到 C:\ProgramData\Cloudflared\（用 templates/cloudflared-config.example.yml 改）
# 3.6 装 Windows 服务（管理员 PowerShell！）
#     注意：这个脚本会自动解析 winget shim 找真实 cloudflared.exe + 强制重写 binPath，
#     避免常见的"服务跑了但隧道没连接"问题
Start-Process powershell -Verb RunAs -ArgumentList "-NoExit","-File","$PWD\scripts\install-cloudflared-service.ps1"
```

**已知坑（P1 #8 #9 历史踩过）**：
- cloudflared 装 service 时，winget 给的是 `WinGet\Links\cloudflared.exe` shim，shim 不会把 service install 时的参数透传 → 服务进程跑成空壳，公网返 530
- 第二次装会撞到上次留下的 `EventLog\Application\Cloudflared` 注册表残留 → install 直接报 "registry key already exists"
- 我们的 `install-cloudflared-service.ps1` 已经处理这两个问题，**不要绕过它直接 `cloudflared service install`**

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

**单文件设计：4 个值直接写进 `copilot-bridge.config.json` 的 `feishu` 节。不要创建 `.env`**。

```jsonc
{
    "feishu": {
        "appId": "<用户贴的 App ID>",
        "appSecret": "<用户贴的 App Secret>",
        "encryptKey": "",
        "verificationToken": "<用户贴的 token>"
    }
}
```

**写文件务必用 `[System.IO.File]::WriteAllText(<path>, <content>, [System.Text.UTF8Encoding]::new($false))`（无 BOM UTF-8）**，用 PowerShell `Out-File` 会加 BOM 让 `JSON.parse` 崩。

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
# v0.0.45+ 已 ship pnpm-workspace.yaml 配 onlyBuiltDependencies，
# 不会再出现 ERR_PNPM_IGNORED_BUILDS。如果还是报错（用户改了 lockfile），手动跑：
pnpm approve-builds --all   # 非交互；pnpm 11+ 推荐
pnpm build
```

**已知坑 1**：`pnpm install` 末尾若出现 `ERR_PNPM_IGNORED_BUILDS: better-sqlite3, esbuild` →
跑 `pnpm approve-builds --all` 把这两个加白名单后重新 `pnpm install`，否则启动时报
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

**⚠️ 重要：bridge-core 收到一个新 `project_name` 时会自动创建一个同名飞书群（拉用户 + bot 进群），不会发到 4.4 配的单聊。**
`targetChatId` 的单聊只是"种子人"，用来知道把谁拉进新群。

引导用户：
1. 等 5 秒看手机飞书 —— 会有个新群「setup-test」弹出（不是单聊！）
2. 在那个新群里回个 "ok"
3. 终端看到 `REPLY_TEXT: ok` = 端到端通了 ✅

---

## Step 7：装服务 + 装全局 skill

### 7.1 bridge-core 开机自启

```powershell
.\scripts\install-bridge-autostart.ps1
```

注册 Windows 计划任务 `CopilotBridgeCore`，登录时自启。

### 7.2 装全局 skill + Stop hook

```powershell
.\install.ps1 -Mode SkillOnly
```

`install.ps1` 干 4 件事：
1. 拷 2 个 skill 到 `$HOME\.copilot\skills\<name>\SKILL.md`
2. 拷 Stop hook 到 `$HOME\.copilot\hooks\feishu-stop-guard.{json,ps1}`
3. **关键**：往 `%APPDATA%\Code\User\settings.json` 加 `chat.hookFilesLocations["~/.copilot/hooks"] = true`（VS Code 默认不扫这个路径，必须显式打开，否则 hook 完全不触发）
4. 设 `COPILOT_BRIDGE_HOME` 环境变量

**Stop hook 的作用**：comm_mode=feishu 的 workspace 里，AI 本轮要结束但没调过 `feishu-send-and-wait.ps1` → VS Code 强制 block 让 AI 必须先发飞书再结束。AI 自觉与否无关，引擎层兜底。详见 [hooks/feishu-stop-guard.ps1](../../hooks/feishu-stop-guard.ps1)。

**目标路径（官方 personal skills 位置，VS Code 文档钦定）**：
- `copilot-bridge` 主 skill → `$HOME\.copilot\skills\copilot-bridge\SKILL.md`
- `copilot-bridge-setup` 安装 skill → `$HOME\.copilot\skills\copilot-bridge-setup\SKILL.md`
- Stop hook → `$HOME\.copilot\hooks\feishu-stop-guard.{json,ps1}`
- VS Code setting → `%APPDATA%\Code\User\settings.json` 里 `"chat.hookFilesLocations": {"~/.copilot/hooks": true}`

> ⚠️ **坑（必读，下一个用户不要再踩）**：
> - 不是 `%APPDATA%\Code\User\prompts\skills\...` —— 那是 prompts 目录，VS Code 不当 skill 加载，扔进去等于死文件
> - 每个 skill **必须**独立目录 + 文件名必须叫 `SKILL.md`；不能多个 skill 塞同一目录、也不能叫 `SETUP.skill.md` 之类
> - YAML frontmatter 的 `name` 字段必须跟父目录名完全一致（`copilot-bridge` 目录 → `name: copilot-bridge`）
> - 官方 personal skills 还认 `~/.claude/skills/` 和 `~/.agents/skills/`，但我们统一用 `~/.copilot/skills/`
> - hook 脚本必须用无 BOM UTF-8 但**纯 ASCII 内容**（PS 5.1 控制台默认 GBK 读 UTF-8 中文会乱码导致语法错；reason 字段允许中文是 string literal 不影响）
> - **`~/.copilot/hooks` 在 VS Code 官方文档列着，但 default `chat.hookFilesLocations` 不包含它**——必须显式加。这是 VS Code 文档暗坑：文档表格"User scope"列出此路径，但 defaults 只有 `.github/hooks` + 3 个 `.claude` 路径。install.ps1 已自动处理；手工部署的话 README 必须写明
> - hook 配置 json 的 windows 命令字段不能用 `%USERPROFILE%`（VS Code spawn 不走 cmd.exe，不展开），也不能 `cmd /c "..."` 包嵌套引号；install.ps1 用 `ConvertTo-Json` 把绝对路径写死最干净
> - 装完让用户在命令面板跑 `Developer: Reload Window`，然后在 Chat 输入 `/` 应能看到 `copilot-bridge` 和 `copilot-bridge-setup` 两条；看不到 = 路径错或文件名错
> - 验证 hook：Output 面板 → 频道选 `GitHub Copilot Chat Hooks`，每次 AI 结束本轮应有日志

**install.ps1 应当做的事**（如果还没实现，按这个逻辑写）：
```powershell
$target = Join-Path $HOME '.copilot\skills'
New-Item -ItemType Directory -Force -Path "$target\copilot-bridge","$target\copilot-bridge-setup" | Out-Null
Copy-Item "$PSScriptRoot\skills\copilot-bridge\SKILL.md"       "$target\copilot-bridge\SKILL.md"       -Force
Copy-Item "$PSScriptRoot\skills\copilot-bridge-setup\SKILL.md" "$target\copilot-bridge-setup\SKILL.md" -Force
```

### 7.3 Dashboard 快捷方式

```powershell
.\scripts\install-dashboard-shortcut.ps1
```

在**仓库根目录**生成 `Copilot Bridge Dashboard.url`，双击直接开浏览器到 `http://127.0.0.1:3000/dashboard`。
Dashboard 显示：每个 project_name 的状态 / 未读卡 / 历史回复 / 人工 reply/cancel 按钮。
127.0.0.1 only，公网访问不到。`.gitignore` 已排除，不会进 git。

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
