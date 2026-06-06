# ps-client — Copilot Bridge PowerShell 客户端

> PowerShell 脚本集合，让 VS Code Copilot Agent 通过 `run_in_terminal` 调用 bridge-core HTTP API，零依赖、无需 MCP 注册。

## 前置条件

1. bridge-core 已启动：在仓库根目录跑 `.\scripts\start.ps1`
2. 健康检查通过：`.\ps-client\feishu-health.ps1` 返回 OK
3. cloudflared 隧道已同步到飞书后台（看 `.cloudflared-url`）

## 脚本清单

| 脚本 | 用途 | 阻塞？ |
|------|------|--------|
| `feishu-health.ps1` | 检查 bridge-core 在线 + 版本号 | 否（秒级） |
| `feishu-resume.ps1` | 拉离线收件箱（AI 离线期间用户发的消息） | 否（秒级） |
| `feishu-send-and-wait.ps1` | **核心**：发卡片并轮询等用户回复（**只在需要用户回复时用**） | 是（直到回复） |

> 设计原则：AI **只在需要用户回复下一步**时才发卡打扰用户；fire-and-forget 通知场景已下线（`feishu-notify.ps1` 已删除），所有卡片都期待回复。`-Level` 取值：`ask` / `done` / `error`。

## 典型用法

### 开局自检 + 拉离线
```powershell
.\ps-client\feishu-health.ps1
.\ps-client\feishu-resume.ps1 -ProjectName "MyProject"
```

### 需要用户确认（AI 走 async 模式）
AI 调用方式：
```
run_in_terminal(
  command: '.\ps-client\feishu-send-and-wait.ps1 -Message "改完了，请确认" -Level ask -ProjectName MyProject -WorkspacePath "D:\A_Code\MyProject"',
  mode: "async"
)
# AI 继续干其他活
get_terminal_output(id: <terminal_id>)
# 看到 REPLY_TEXT: xxx 就消费
```

### 带图片发送
```powershell
.\ps-client\feishu-send-and-wait.ps1 `
    -Message "请看截图" -Level ask `
    -ProjectName MyProject `
    -ImagePaths "D:\screenshots\1.png","D:\screenshots\2.png"
```

### fetch 失败时接力（不要重发卡）
脚本已内置自动续杯。如果 PowerShell 进程被杀，外部接力用：
```powershell
.\ps-client\feishu-send-and-wait.ps1 -Message "" -Level ask -ProjectName Foo -ResumeTaskId "a3f2"
```

## stdout 协议（AI 解析用）

`feishu-send-and-wait.ps1` 会按行打出关键标记：

| 标记 | 含义 |
|------|------|
| `TASK_ID: xxxx` | 卡片已发出去的 task_id |
| `REPLY_JSON: {...}` | 收到回复，JSON 形式 |
| `REPLY_TEXT: ...` | 收到回复的纯文本（含 `[图片](images/...)`） |
| `TIMEOUT: xxxx` | 达到 `-MaxWaitSeconds` 仍未收到 |
| `ERROR: ...` | 异常 |

`feishu-resume.ps1` 末尾打 `RESUME_JSON: {...}`。

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | bridge 不在线 / 网络错 |
| 2 | notify 调用失败 |
| 3 | 等待超时（仅当 `-MaxWaitSeconds > 0`） |
| 4 | task 已过期/取消 |
| 5 | task not found |

## 已知坑

- **中文乱码**：PowerShell 5.1 `Invoke-RestMethod -Body $string` 默认 CP936。脚本统一用 `[System.Text.Encoding]::UTF8.GetBytes()` 字节流避坑。
- **408 抛异常**：`Invoke-RestMethod` 收到 408 会扔异常而不是返回 408。脚本捕获后视为"短挂超时正常情况"继续轮询。
- **wait fetch 失败**：Windows TCP 偶尔会切断长挂连接，**不要重发卡**，脚本内自动用 `task_id` 续杯。
- **图片回收**：用户在飞书发图 → bridge 自动下载到 `images/inbound_*.png`，REPLY_TEXT 含 `[图片](images/inbound_xxx.png)` → AI 调 `view_image` 查看。

## 跟原版 MCP server 的关系

`mcp-server/` 仍可用（user-level 注册）。本目录是**替代方案**，适用场景：
- 不想配 user-level MCP
- 想在同一 workspace 里 VS Code 端和飞书端**同时**对话
- MCP server 启动异常时的兜底
