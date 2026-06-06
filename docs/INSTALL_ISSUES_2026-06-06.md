# copilot-bridge-skill 安装踩坑清单（2026-06-06）

> **场景**：全新 Windows 10/11 机器（中文系统，PowerShell 5.1 默认），按 README + `SETUP.skill.md` 走一遍安装流程的实测踩坑记录。
> **目标读者**：负责修 `copilot-bridge-skill` 的 AI / 维护者。下面每一条都已标明 **症状 / 根因 / 改法 / 改动文件**，请按优先级 P0→P1→P2 顺序修。

---

## P0：直接卡住安装流程

### Issue 1：`install.ps1` 在中文 PowerShell 5.1 下解析崩

- **症状**
  - `pwsh -File install.ps1` 失败（多数机器没装 PowerShell 7）
  - 回退 `powershell.exe -ExecutionPolicy Bypass -File install.ps1` 报：
    ```
    所在位置 install.ps1:87 字符: 5
    表达式或语句中包含意外的标记 "}"
    UnexpectedToken
    ```
- **根因**
  - 脚本本身是 UTF-8 无 BOM
  - PowerShell 5.1 默认按系统 ANSI（中文系统是 GBK）解析 `.ps1`
  - 中文注释 / 字符串里的多字节字符被 GBK 解码后破坏了语法结构
- **改法**（任选其一）
  1. 把所有含中文的 `.ps1` 重新存成 **UTF-8 with BOM**（PS 5.1 见到 BOM 会切 UTF-8 解析）
  2. 每个 `.ps1` 顶部加：
     ```powershell
     #requires -Version 5.1
     [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
     $OutputEncoding = [System.Text.Encoding]::UTF8
     ```
     **并**把脚本本体改成 UTF-8 BOM
  3. README "Step 2 跑安装器" 处明确说明 `pwsh` 需要 PowerShell 7+，否则给一行 `powershell.exe` 的等价命令
- **改动文件**
  - 全仓所有 `.ps1`（重存 UTF-8 BOM）
  - `README.md` Step 2
  - 重点：`install.ps1`、`scripts/*.ps1`、`ps-client/*.ps1`

---

### Issue 2：`scripts/set-feishu-webhook-url.ps1` 同样的编码问题，直接 fail

- **症状**
  ```
  字符串缺少终止符: '。
  ParserError: TerminatorExpectedAtEndOfString
  ```
- **根因**：同 Issue 1，中文注释行被 GBK 截断
- **改法**：同 Issue 1，重存 UTF-8 BOM
- **影响**：`SETUP.skill.md` Step 6.3 让 AI 调用这个脚本帮用户开浏览器 + 复制 webhook URL，结果脚本直接挂，剧本断在这一步

---

### Issue 3：`scripts/install-cloudflared-service.ps1` 硬编码旧用户路径

- **症状**：脚本无法在任何不叫 `ASUS` 的用户上跑通
- **现状代码**
  ```powershell
  $src = "C:\Users\ASUS\.cloudflared"
  ...
  $cfExe = "C:\Users\ASUS\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
  ```
- **改法**
  ```powershell
  $src = Join-Path $env:USERPROFILE ".cloudflared"
  $cfExe = (Get-Command cloudflared -ErrorAction Stop).Source
  # 如果拿到的是 WinGet shim（...\WinGet\Links\cloudflared.exe），要回溯到真实 exe：
  if ($cfExe -match '\\WinGet\\Links\\') {
      $real = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
          -Recurse -Filter cloudflared.exe -ErrorAction SilentlyContinue |
          Select-Object -First 1
      if ($real) { $cfExe = $real.FullName }
  }
  ```
  日志路径同理用 `$env:TEMP` 或 `$PSScriptRoot\..\logs`
- **改动文件**：`scripts/install-cloudflared-service.ps1`

---

### Issue 4：`scripts/bridge-autostart.ps1` 硬编码旧仓库路径

- **症状**：计划任务起来后跑的是错的仓库路径
- **现状代码**
  ```powershell
  $repo = "D:\A_Code\Copilot Bridge"
  ```
  （显然是开发者本地路径）
- **改法**
  ```powershell
  $repo = Split-Path -Parent $PSScriptRoot
  ```
- **改动文件**：`scripts/bridge-autostart.ps1`
- **状态**：本次安装时已临时改过，建议入仓固化

---

### Issue 5：`scripts/install-bridge-autostart.ps1` 同样硬编码

- **症状**：脚本注册的计划任务指向不存在的路径
- **现状代码**
  ```powershell
  $scriptPath = "D:\A_Code\Copilot Bridge PowerShell\scripts\bridge-autostart.ps1"
  ```
- **改法**
  ```powershell
  $scriptPath = Join-Path $PSScriptRoot 'bridge-autostart.ps1'
  ```
- **改动文件**：`scripts/install-bridge-autostart.ps1`

---

### Issue 6：仓库提交的 `bridge-core/pnpm-lock.yaml` 锁了 npmmirror，pnpm 11 严格校验拒绝

- **症状**：新用户在官方 registry 下 `pnpm install` 直接 fail
  ```
  ✗ Lockfile failed supply-chain policy check (155 entries in 4.1s)
  [ERR_PNPM_TARBALL_URL_MISMATCH] 155 lockfile entries failed verification:
    @esbuild/aix-ppc64@0.28.0 has a tarball URL (https://registry.npmmirror.com/...)
    that does not match the registry's published metadata (https://registry.npmjs.org/...)
  ```
- **根因**：开发者用了 `registry.npmmirror.com`，提交的 lockfile 把 npmmirror URL 写死了，pnpm 11 不接受跨 registry 的 lockfile
- **改法**（任选其一）
  1. **重新用官方源生成 lockfile** 并提交：
     ```powershell
     cd bridge-core
     Remove-Item pnpm-lock.yaml
     pnpm config set registry https://registry.npmjs.org/
     pnpm install
     git add pnpm-lock.yaml
     ```
  2. 仓库根加 `bridge-core/.npmrc`：
     ```
     registry=https://registry.npmjs.org/
     ```
     然后重生成 lockfile
  3. 把 `bridge-core/pnpm-lock.yaml` 从 git 移除并加进 `.gitignore`（不推荐，但能解）
- **改动文件**：`bridge-core/pnpm-lock.yaml`、（可选）`bridge-core/.npmrc`

---

### Issue 7：`better-sqlite3@11` 在 Node 24 上没 prebuild，强制走 node-gyp 编译

- **症状**
  ```
  prebuild-install warn install No prebuilt binaries found (target=24.16.0 runtime=node)
  gyp ERR! find Python You need to install the latest version of Python.
  gyp ERR! configure error
  ```
- **根因**
  - README 写「Node.js 20+」
  - winget 装 `OpenJS.NodeJS.LTS` 给到的实际是 Node 24（当前 LTS）
  - `better-sqlite3@11.10.0` 的 prebuild 矩阵不含 Node 24 → 走源码编译 → 需要 Python + MSVC Build Tools → 默认 Windows 没有 → 直接挂
- **改法**（任选其一）
  1. **升 `bridge-core/package.json` 的 `better-sqlite3` 到 `^12`**（v12 有 Node 24 prebuild，本次实测能直接装上）
     ```jsonc
     "dependencies": {
         "better-sqlite3": "^12",
         ...
     }
     ```
     同步把 `@types/better-sqlite3` 升到 `^7.6.13`（兼容 v12）
  2. README 把「Node.js 20+」改成 **「Node.js 20 LTS（必须 20.x，不要装最新 LTS 24）」**，并把 `install.ps1` 的 winget 命令改成 `winget install --id OpenJS.NodeJS.LTS --version 20.x.x` 之类的精确版本
- **推荐**：方案 1（直接升 better-sqlite3），最干净
- **改动文件**：`bridge-core/package.json`、`bridge-core/pnpm-lock.yaml`

---

## P1：AI 引导失败 / 路径走不通

### Issue 8：cloudflared `service install` 把 BINARY_PATH 写成 winget shim，导致服务跑了没连接

- **症状**
  - `Get-Service Cloudflared` = Running，但 `cloudflared tunnel info <id>` 显示 "does not have any active connection"
  - 公网 health 返回 530
  - `sc qc Cloudflared` 的 `BINARY_PATH_NAME` 是 `C:\Users\<U>\AppData\Local\Microsoft\WinGet\Links\cloudflared.exe`
  - Application 事件日志只有 `Cloudflared service arguments: [<shim path>]`，没有 `--config`，没有 `tunnel run`
- **根因**
  - winget 把 cloudflared 真实 exe 放在 `WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe`，并在 `WinGet\Links\` 下放了一个 shim
  - `cloudflared service install` 注册 Windows 服务时用的是 `Get-Command cloudflared` 返回的路径（= shim）
  - shim 是个 launcher，不会把参数透传给真实 exe，导致服务进程跑成了空壳 `cloudflared.exe`（没读 config、没启 tunnel）
- **改法**
  - `scripts/install-cloudflared-service.ps1` 在 `service install` 之后**显式重写 binPath**：
    ```powershell
    # 1) 找真实 exe
    $exe = (Get-Command cloudflared).Source
    if ($exe -match '\\WinGet\\Links\\') {
        $exe = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
            -Recurse -Filter cloudflared.exe | Select-Object -First 1).FullName
    }

    # 2) 用真实 exe 装服务
    & $exe --config "C:\ProgramData\Cloudflared\config.yml" service install

    # 3) 关键：覆写 binPath，强制带上 --config + tunnel run
    Stop-Service Cloudflared -Force
    $binPath = "`"$exe`" --config `"C:\ProgramData\Cloudflared\config.yml`" --no-autoupdate tunnel run"
    sc.exe config Cloudflared binPath= $binPath
    Start-Service Cloudflared
    ```
  - SETUP.skill.md Step 3 / Step 6 / Step 7 在 "已知坑" 里加这一条
- **影响**：本次安装在这一步卡了 30 分钟，最后只能手动改 binPath 才通
- **改动文件**：`scripts/install-cloudflared-service.ps1`、`SETUP.skill.md`、`docs/INSTALL_CLOUDFLARED_SERVICE.md`

---

### Issue 9：cloudflared `EventLog` 注册表残留导致 `service install` 二次失败

- **症状**：第一次 install 失败后再装一次直接报：
  ```
  Cannot install event logger: SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared
  registry key already exists
  ```
- **改法**：`install-cloudflared-service.ps1` 一开始就清残留（旧版本脚本里已有此逻辑，但被 Issue 3 的硬编码路径问题盖过）：
  ```powershell
  sc.exe stop Cloudflared 2>$null
  sc.exe delete Cloudflared 2>$null
  Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\Cloudflared" `
      -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Services\EventLog\Application\cloudflared" `
      -Recurse -Force -ErrorAction SilentlyContinue
  ```
- **改动文件**：`scripts/install-cloudflared-service.ps1`、`SETUP.skill.md` 异常处理章节

---

### Issue 10：`pnpm approve-builds` 在 pnpm 11+ 的配置方式变了

- **症状**
  - SETUP 写「跑 `pnpm approve-builds` → 交互选 → y 全部」
  - 实际：pnpm 11 在没有 `pnpm-workspace.yaml` 配 `onlyBuiltDependencies` 的情况下，每次 `pnpm install` 都重报：
    ```
    [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: better-sqlite3, esbuild
    Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
    ```
  - `package.json` 里写 `"pnpm": { "onlyBuiltDependencies": [...] }` 字段，pnpm 11 直接 WARN：
    ```
    [WARN] The "pnpm" field in package.json is no longer read by pnpm.
    The following keys were ignored: "pnpm.onlyBuiltDependencies".
    ```
- **改法**（推荐组合）
  1. 仓库 ship `bridge-core/pnpm-workspace.yaml`：
     ```yaml
     packages:
       - .
     onlyBuiltDependencies:
       - better-sqlite3
       - esbuild
     ```
  2. SETUP Step 5 把 `pnpm approve-builds` 改成非交互：
     ```powershell
     pnpm install
     pnpm approve-builds --all   # 非交互；pnpm 11 必备
     ```
  3. 文档说明：pnpm 11+ 必须用 `pnpm-workspace.yaml` 配 `onlyBuiltDependencies`，`package.json` 的 `pnpm` 字段已废弃
- **改动文件**：新增 `bridge-core/pnpm-workspace.yaml`、`SETUP.skill.md` Step 5

---

### Issue 11：SETUP Step 4.4 让用户用单聊，但 bridge-core 实际按 `project_name` 自动建群

- **症状**
  - 配置里 `feishu.targetChatId` 填的是与 bot 的单聊 `chat_id`
  - 但烟测 `feishu-send-and-wait.ps1 -ProjectName setup-test` 跑完，bridge-core 日志：
    ```
    [feishu] creating group chat name="setup-test" users=1
    [feishu] group created chat_id=oc_5986...
    [db] map project "setup-test" -> chat oc_5986...
    ```
  - 卡片发到了**自动创建的群**，不是单聊
  - 用户按文档预期去单聊里看，干等 5 分钟超时
- **改法**：SETUP Step 4.4 和 Step 6.4 都要说清楚：
  > bridge-core 收到一个新 `project_name` 时会自动创建一个同名飞书群（拉你和 bot 进群）。`targetChatId` 只是当 `project_name` 第一次出现、需要拉人进群时用作"种子人"。**烟测请去新创建的 `setup-test` 群里回复，而不是单聊。**
- **改动文件**：`SETUP.skill.md`、`README.md`

---

## P2：体验问题 / 文档补充

### Issue 12：所有 PS 脚本中文输出乱码

- **症状**：`feishu-send-and-wait.ps1` 在 PS 5.1 下输出
  ```
  鍗＄墖宸插彂閫?task_id=...
  缁х画绛?..
  ```
- **根因**：脚本输出是 UTF-8，PS 5.1 控制台默认 GBK
- **改法**：所有会被 AI 读输出做判断的脚本顶部加：
  ```powershell
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
  ```
  或把关键状态行改成纯英文（`task_id=...`、`waiting...`、`REPLY_TEXT:` 等），中文只用于人看的标题
- **改动文件**：`ps-client/*.ps1`、`scripts/doctor.ps1`、所有 SETUP 剧本里要让 AI 读输出的脚本

---

### Issue 13：README 没说 `Set-ExecutionPolicy` 前置

- **症状**：npm / pnpm 是 `.ps1` shim，默认 ExecutionPolicy=Restricted 下报：
  ```
  无法加载文件 C:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本
  ```
- **改法**：README "前置准备" 章节加：
  ```powershell
  # 一次性放开 .ps1 执行权限（仅当前用户）
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
  ```
- **改动文件**：`README.md`

---

### Issue 14：Node MSI 装完当前 shell 看不到 PATH

- **症状**：`winget install OpenJS.NodeJS.LTS` 成功，但当前 PowerShell 里 `node -v` 报 CommandNotFound
- **根因**：MSI 写进 Machine PATH，但 PowerShell 进程的 PATH 是启动时快照
- **改法**：SETUP Step 1 末尾加：
  ```powershell
  # 当前 shell 立刻刷 PATH（不用重启终端）
  $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('PATH','User')
  ```
  比叫用户「重启终端」省事得多
- **改动文件**：`SETUP.skill.md` Step 1

---

### Issue 15：换电脑迁移没说 "先停旧机 cloudflared"

- **症状**：迁移完新机后烟测发不出来，因为旧机 cloudflared 还连着同一个 tunnel，Cloudflare 把回调随机路由到旧机
- **改法**：README / `docs/OPERATIONS.md` 加「换电脑迁移」章节：
  > 一个 tunnel 只能由一台机器服务。迁移到新机前，先在旧机执行：
  > ```powershell
  > Stop-Service Cloudflared
  > Set-Service Cloudflared -StartupType Disabled
  > ```
  > 否则两台机同时连同一个 tunnel，Cloudflare 会负载均衡，50% 的飞书回调会落到旧机，新机这边一直收不到。
- **改动文件**：`README.md`、新增章节或 `docs/OPERATIONS.md`

---

## 优先级总览

| 优先级 | Issue | 一句话 | 影响 |
|---|---|---|---|
| P0 | #1 | `install.ps1` PS 5.1 解析崩 | 装不上 |
| P0 | #2 | `set-feishu-webhook-url.ps1` PS 5.1 崩 | webhook 配置走不通 |
| P0 | #3 | install-cloudflared-service 硬编码 ASUS 路径 | 装不上 cloudflared 服务 |
| P0 | #4 | bridge-autostart 硬编码旧路径 | 计划任务跑不了 |
| P0 | #5 | install-bridge-autostart 硬编码旧路径 | 装不上计划任务 |
| P0 | #6 | pnpm-lock.yaml 锁 npmmirror | `pnpm install` 直接 fail |
| P0 | #7 | better-sqlite3@11 在 Node 24 上要源码编译 | `pnpm install` fail |
| P1 | #8 | cloudflared 服务 binPath 是 winget shim | 服务跑了不工作 |
| P1 | #9 | EventLog 注册表残留 | 二次安装失败 |
| P1 | #10 | pnpm 11+ approve-builds 配置变了 | 装不上 native deps |
| P1 | #11 | bridge 自动建群 vs 文档说单聊 | 烟测干等超时 |
| P2 | #12 | 脚本中文输出乱码 | AI 难判断状态 |
| P2 | #13 | README 没提 ExecutionPolicy | npm/pnpm 起不来 |
| P2 | #14 | SETUP 没教刷 PATH | 用户要重启终端 |
| P2 | #15 | 没写迁移要停旧机 | 新机烟测莫名失败 |

---

## 修改后建议的回归测试

1. 在一台**全新干净的 Windows 11 中文版**上（最好用 Hyper-V 快照），按 README 走一遍：
   - `git clone`
   - `pwsh -File install.ps1`（或 `powershell.exe -ExecutionPolicy Bypass -File install.ps1`）
   - 在 VS Code 里说 "帮我装一下 copilot-bridge"
   - 跑完 `doctor.ps1` 看 `ready: true`
2. 在一台**已装过的机器**上模拟迁移：把 `~/.cloudflared/*` 和 `copilot-bridge.config.json` copy 过去，跑 `doctor.ps1` 应该直接到 `install-skill` 或 `done`，不要再问凭据
3. 烟测：`ps-client/feishu-send-and-wait.ps1 -Message test -Level ask -ProjectName smoke -WorkspacePath .` 应在 1 分钟内端到端往返

---

*生成于 2026-06-06，基于一次完整的全新机安装实测。*
