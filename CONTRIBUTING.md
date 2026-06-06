# Contributing to copilot-bridge-skill

谢谢愿意贡献！本项目目标：让 GitHub Copilot 通过飞书跟用户异步对话。

## 提 Issue

- **Bug**：贴 doctor.ps1 输出的 JSON + bridge-core 报错日志
- **新功能 / 优化**：先说"要解决什么问题"再说"怎么做"

## 提 PR

1. Fork → `git checkout -b feat/your-thing`
2. 改完跑 `cd bridge-core; pnpm build` 验证编译
3. PS 脚本改了的话，跑 `scripts/doctor.ps1` 看输出正常
4. commit message 用 [Conventional Commits](https://www.conventionalcommits.org/)：
   - `feat:` 新功能
   - `fix:` bug 修复
   - `docs:` 只改文档
   - `chore:` 杂项
5. push + 开 PR，PR 描述里说清楚 "改了啥 / 为啥 / 怎么验"

## 代码风格

- TypeScript：跟现有 `bridge-core/src/*.ts` 一致（4 空格缩进、双引号）
- PowerShell：跟现有 `ps-client/*.ps1` 一致（CmdletBinding、参数验证）
- 不要引入新的依赖除非必要

## 不接受的 PR

- 改飞书 chat_id / App ID 等用户私有字段
- 加遥测 / 用户追踪
- 把 secret 类配置打到 stdout
- 改 `comm_mode` 默认值（项目级 opt-in 是核心设计）

## 安全披露

发现安全问题（凭据泄漏路径、命令注入等）请**不要开公开 issue**，
直接邮件 zaz8848@gmail.com（或 GitHub Security Advisory 私有报告）。
