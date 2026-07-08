# ReasearchNotion

ReasearchNotion 是一个面向科研论文管理与问答的本地桌面软件设想。它借鉴 Notion AI 的对话入口和 Codex 式工作台体验，将本地论文库、阅读器和 Dify RAG 智能体组合成一个个人科研知识库。

当前阶段：本地桌面 MVP 原型实现中。

## MVP 方向

- 桌面软件，默认进入 AI 对话页。
- 知识库页采用阅读器优先布局。
- 支持 PDF 和 Markdown 论文导入。
- 每个论文文件夹对应一个 Dify 知识库 dataset。
- 上传后自动生成论文卡片。
- 对话页可选择论文库或单篇论文作为上下文。
- 知识库阅读页通过快捷键呼出 AI 问答栏。
- 设置页手动配置 Dify 地址和 API Key。

## 设计文档

- [ResearchNotion MVP Design](docs/superpowers/specs/2026-07-08-research-notion-design.md)
- [ResearchNotion MVP Implementation Plan](docs/superpowers/plans/2026-07-08-research-notion-mvp.md)
- [MVP Runbook](docs/mvp-runbook.md)

## 本地运行

```bash
pnpm install
pnpm dev
```

首次运行后，在设置页填写本地 Dify 地址、Dify App API Key 和 Dify Knowledge API Key。MVP 中的大模型 Provider API Key 仍在 Dify 控制台配置。

`pnpm dev` 会先为 Electron 重建 `better-sqlite3`。如果之后要跑单元测试，直接运行 `pnpm test`，测试脚本会切回 Node.js ABI。

## 验证命令

```bash
pnpm test
pnpm lint:types
pnpm build
```
