---
name: copilot-bridge
description: |
  让 VS Code Copilot Agent 通过飞书把消息推到用户手机，用户在飞书回一句话就能让
  Copilot 继续干。当用户要求"通知我"/"等我回复"/"派活后告诉我"/"做完叫我看一下"
  /"我离开电脑了"等需要异步沟通的场景时使用。
  
  **激活条件（重要）**：当前 workspace 根目录的 `.github/copilot-instructions.md`
  顶部 YAML frontmatter 含 `comm_mode: feishu` 时启用本 skill。没有该标记的
  workspace 完全不触发，对用户零侵入。
  
  **前置依赖**：用户本机必须已安装并配好 copilot-bridge（跑 copilot-bridge-setup
  skill 一次性安装）。环境变量 `COPILOT_BRIDGE_HOME` 指向 copilot-bridge-skill
  仓库根目录。
applyTo: '**'
---

# Copilot Bridge - 飞书异步通信 Skill

> 本 skill 描述「如何调 PS 客户端跟用户在飞书对话」。  
> 安装见姊妹 skill `copilot-bridge-setup`。

---

## 激活检查（每次会话第一动作）

1. 读当前 workspace 根目录 `.github/copilot-instructions.md`
2. 找顶部 YAML `comm_mode` 字段
3. `comm_mode: feishu` → 激活本 skill，按下文规则工作
4. 其它值或缺字段 → **不激活**，按 VS Code 默认对话

---

## 环境路径

PS 脚本所在路径从环境变量读：

```powershell
$env:COPILOT_BRIDGE_HOME  # 例如 D:\A_Code\_DevTool\copilot-bridge-skill
$psClient = "$env:COPILOT_BRIDGE_HOME\ps-client"
```

如果 `$env:COPILOT_BRIDGE_HOME` 未设置，提示用户跑 `install.ps1 -Mode SkillOnly` 重新设置环境变量。

---

## 开局自检（第一句话之前必做）

```powershell
# 1. 健康检查
& "$env:COPILOT_BRIDGE_HOME\ps-client\feishu-health.ps1"
# 期望: [feishu-health] OK  version=0.0.x

# 2. 拉离线收件箱（用当前 workspace 名做 project_name）
& "$env:COPILOT_BRIDGE_HOME\ps-client\feishu-resume.ps1"
# 脚本会从当前 cwd 推导 ProjectName（VS Code agent 跑时 cwd = workspace root）
# 看到 RESUME_JSON: {"count":0,...} 就空盒；count>0 先消化离线消息
```

bridge 不在线 → 提示用户跑 `scripts/doctor.ps1` 看问题，或手动 `cd bridge-core; node dist/index.js`

---

## 核心调用：收尾 / 派活 / 询问必走 send-and-wait

任何"我做完了请你确认" / "我有几个方案选哪个" / "我有问题问你"的收尾动作，**必须**走 PS 客户端发飞书卡，**不允许只在 VS Code Chat 答**。

```powershell
run_in_terminal(
  command: '& "$env:COPILOT_BRIDGE_HOME\ps-client\feishu-send-and-wait.ps1" -Message "改完了，请确认部署" -Level ask',
  mode: "async"          # ← 硬规则：必须 async / isBackground=true
)
```

> ✅ **`-ProjectName` / `-WorkspacePath` 不要手传**。脚本默认从 `$PWD` 自动推导（VS Code agent 跑 `run_in_terminal` 时 cwd 必然 = workspace root）。手传反而容易拼错名字 → bridge 会自动建错群，卡发错地方。仅在明确要跨项目发卡时手动覆盖。

> ⚠️ **MUST use `mode: "async"` (即 `isBackground: true`)**。
> 用 `mode: "sync"` 会把 VS Code agent 阻塞在 long-poll 上几十分钟，期间你无法跟它交流、它无法用任何其它工具，等于死锁。Stop hook 会引擎层 block 任何最后一次 feishu 调用是 sync 的 turn，强制 AI 重新用 async 调。

带图片：`-ImagePaths "D:\screenshots\1.png","D:\screenshots\2.png"`

### stdout 协议（AI 解析必看）

脚本输出**全 ASCII**（避免 PS 5.1 GBK 乱码），且**沉默等回复**（不每轮打 heartbeat，省 AI 上下文）：

| 标记 | 何时出现 | AI 该怎么办 |
|------|---------|-----------|
| `TASK_ID: xxxxx` | 卡发出后立即 | 记下，fetch 失败时用 ResumeTaskId 接力 |
| `[feishu-send-and-wait] card sent task_id=... feishu_message_id=...` | 卡发出后立即 | 仅日志 |
| `REPLY_JSON: {...}` | 收到回复时 | 消费、退出循环 |
| `REPLY_TEXT: 内容` | 收到回复时（含 `[图片](path)` 字面量） | 看到 `[图片](xxx)` 立刻调 `view_image` |
| `TIMEOUT: xxxxx` | 达到 `-MaxWaitSeconds` 仍未回复 | 默认 `-MaxWaitSeconds 0` = **永等**，正常不会出现 |
| `ERROR: 错误` | notify 失败或 task 已过期 | **不重发卡**，调 resume 看是否已路由 |
| `[... wait fetch failed ...retrying...]` | 偶发网络断 | 仅日志，脚本自动用 task_id 续杯 |

> 等回复期间脚本**完全沉默**——没新行 ≠ 卡住，而是 long-poll 在底层 50s/轮无声续杯。看到 stdout 不增长就耐心等，看到新行才动作。

---

## 三条硬规则（违反过、不能再犯）

### 规则 1：fetch 失败时**绝不重发卡**

`feishu-send-and-wait.ps1` 内部已实现 wait fetch 失败自动续杯。
看到 `ERROR:` 或终端意外关闭，**先调 feishu-resume 看是否已路由到 pending_replies**，不要重发同一张卡。

### 规则 2：永远留在飞书模式

凡 workspace 顶部 `comm_mode: feishu`，AI 跟用户的全部对话默认在飞书发生。
- 任何收尾、解释、询问、汇报、确认 → 必须走 PS 客户端发飞书
- VS Code 只留 `卡 #xxxx 已发，等回复` 一行状态
- **禁止**自作主张退出飞书模式；只有用户明确同意才能切

### 规则 3：每轮自检

写完草稿、按发送之前，扫一遍：
- 这轮是不是调过 `feishu-send-and-wait.ps1` 把话发到飞书了？
- 没调、且本轮不是纯工具状态行 → **这轮就是违规**，必须补发飞书再说话

---

## ProjectName / WorkspacePath 怎么传

- **ProjectName**：当前 workspace 文件夹名（剥掉 `VibeCoding-` / `VibeCoding ` 前缀）
- **WorkspacePath**：workspace 绝对路径（反斜杠）

bridge-core 按 `project_name` 自动建群、路由消息，不同项目互不串话。

---

## 入站图片处理

bridge-core 自动下载用户发的图到 `images/inbound_<ts>_<key>.<ext>`，
REPLY_TEXT 包含 markdown 字面量 `[图片](D:/A_Code/.../images/inbound_xxx.png)`。
看到这种文本 → 立刻 `view_image` 打开本地绝对路径。

---

## 完整 ps-client/ 入口

| 脚本 | 用途 | 阻塞？ |
|------|------|--------|
| `feishu-health.ps1` | bridge 健康检查 | 否（秒级） |
| `feishu-resume.ps1` | 拉离线收件箱 | 否（秒级） |
| `feishu-send-and-wait.ps1` | **核心**：发卡 + 等回复 | 是 |
