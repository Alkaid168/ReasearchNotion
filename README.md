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
- [Dify 科研学术问答智能体配置](docs/dify-research-agent.md)
- [Dify Workflow 搭建说明](docs/dify-workflow-build-guide.md)

## 本地运行

Windows 上可以直接双击：

```text
start-research-notion.bat
```

启动脚本会后台检查并启动本地 Dify，同时自动启动一个本机 DeepSeek bridge：Dify 容器访问 `http://host.docker.internal:17778`，再由主机转发到 DeepSeek 官方接口。这样可以绕过部分 Windows Docker 环境中容器直连 `api.deepseek.com` 出现 TLS EOF 的问题。

答辩或演示前可以先双击：

```text
prepare-demo.bat
```

它会静默启动本地 Dify，创建/更新 Dify Workflow 智能体，临时启动 ResearchNotion 工具服务来导入 Agent 工具，上传真实演示论文，运行配置检查和 MVP 演示检查，然后把原生依赖切回桌面端可启动状态。

或在终端运行：

```bash
pnpm install
pnpm dev
```

首次运行后，在设置页填写本地 Dify 地址、Dify App API Key 和 Dify Knowledge API Key。MVP 中的大模型 Provider API Key 仍在 Dify 控制台配置。

本地 Dify 已启动并初始化后，也可以直接运行：

```bash
pnpm demo:prepare
pnpm provision:dify
pnpm use:deepseek-bridge
pnpm import:dify-tools
pnpm provision:dify-agent
pnpm seed:dify
pnpm check:dify
```

这会创建/更新 Dify Workflow 智能体，把本地 ResearchNotion 设置指向它，导入 `ResearchNotion_Local_Tools` Agent 工具，额外创建一个 `ResearchNotion Tool Agent` 工具调用型 Agent Chat，并向演示知识库上传 RAG、Transformer、BERT 三篇真实论文用于调试。`prepare-demo.bat` 会临时启动 ResearchNotion 工具服务；如果手动运行 `pnpm import:dify-tools`，需要先确保 `http://127.0.0.1:17777/openapi.json` 可访问。

如果需要手动切换 Dify 的 DeepSeek endpoint：

```bash
pnpm use:deepseek-bridge
pnpm use:deepseek-official
pnpm deepseek:bridge
```

`pnpm use:deepseek-bridge` 会把 Dify DeepSeek Provider 的 `endpoint_url` 指向 `http://host.docker.internal:17778`，并清理 Dify Redis 中的 Provider 缓存；`pnpm use:deepseek-official` 会切回 `https://api.deepseek.com`。`pnpm deepseek:bridge` 只负责启动本机转发服务，平时双击 `start-research-notion.bat` 会自动启动它。

`pnpm dev` 会先为 Electron 重建 `better-sqlite3`。如果之后要跑单元测试，直接运行 `pnpm test`，测试脚本会切回 Node.js ABI。

## 验证命令

```bash
pnpm test
pnpm lint:types
pnpm build
```
