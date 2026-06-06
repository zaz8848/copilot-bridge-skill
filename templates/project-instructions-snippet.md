# 当前 workspace `.github/copilot-instructions.md` 启用 copilot-bridge 的代码片段
#
# 用法：复制本文件 **顶部 YAML 那段** 贴到你项目的 .github/copilot-instructions.md
# 文件顶部（如果没有该文件就新建）。

---
comm_mode: feishu
project_name: <你的项目名，留空就用 workspace 文件夹名>
---

# 我的项目（标题随你定）

> 这是你的项目级 Copilot 指令文件。Copilot 看到顶部 YAML `comm_mode: feishu` 后会自动激活 `copilot-bridge` skill。

## 用本 skill 的好处
- AI 干完活会主动给你飞书发消息，不用一直盯着电脑
- 你在飞书回一句话，AI 接着干

## 不想再用了
- 把 `comm_mode: feishu` 改成 `comm_mode: vscode-only`（或删掉）
- skill 立刻停用，对话回 VS Code Chat

## 进阶
- skill 完整规则：`~/.copilot/skills/copilot-bridge/SKILL.md`
- 自检：在 copilot-bridge-skill 仓库根目录跑 `scripts/doctor.ps1`
