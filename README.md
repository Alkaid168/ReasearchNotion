# ResearchNotion

ResearchNotion 是一个面向科研论文管理与问答的本地桌面软件。它借鉴 Notion AI 的对话入口和 Codex 式工作台体验，将本地论文库、PDF 阅读器和 Dify Tool Agent 组合为个人科研知识库。

当前桌面端只使用一条 AI 路线：`ResearchNotion Tool Agent`。Dify 知识库可以继续保存论文归档副本，但不参与桌面端的默认问答链路。

## 核心功能

### AI 科研助手

- Dify Agent Chat 自主调用 16 个本地工具，按问题决定读取当前页、全文、章节、大纲、当前论文库或跨库证据。
- 支持论文阅读、章节提取、跨库比较、术语解释、创新点分析，以及 arXiv / Semantic Scholar 外网检索。
- Agent 可在同一轮中连续调用多个工具；桌面端以流式方式显示回答、工具进度、思维链和证据引用，引用可一键跳回原文页。
- 三档输出速度（优雅 / 常规 / 性能）实时切换；研究偏好记忆按需注入对话。

### 论文管理

- 导入 PDF、Markdown；自动提取正文并生成论文卡片。
- 论文卡片包括作者、年份、一句话摘要、研究问题、方法、贡献和关键词。
- Notion 风格论文库导航：文件夹树拖拽整理、对话历史、阅读位置恢复。
- 侧栏支持拖拽移动/跨文件夹移动论文。

### 桌面端体验

- Electron + React 19 + TypeScript 桌面应用，石墨墨 × 纯白无彩色视觉体系。
- PDF canvas 阅读器，支持适宽、翻页、缩放和 `Ctrl+I` 呼出论文 AI。
- 自动检测并顺序阅读常见双栏 PDF。
- 设置页配置 Dify 地址、Tool Agent App API Key 与多模型档管理。
- Dify Knowledge API Key 仅用于可选的论文归档同步。

## 文档

### 使用与部署

| 文档 | 内容 |
| --- | --- |
| [Dify 本地部署](docs/dify-local-deploy.md) | 本地启动 Dify、模型配置、容器访问本机工具服务 |
| [Dify Tool Agent 配置](docs/dify-research-agent.md) | 创建/更新 Tool Agent、导入 16 个本地工具、设置页参数 |
| [MVP 演示手册](docs/mvp-runbook.md) | 一键演示准备、演示流程与常见问题 |

### 深入了解

| 文档 | 内容 |
| --- | --- |
| [技术说明与答辩学习手册](docs/research-notion-technical-guide.md) | 架构、Agent 原理、RAG 对比、提示词安全边界、评估方法 |
| [桌面端视觉审计清单](docs/visual-audit-checklist.md) | 重大改动后的视觉/交互回归清单与历次验收记录 |
| [全功能验收清单](docs/full-acceptance-checklist.md) | v0.1.0 版本的全功能运行与验收快照（含 TEI/知识库历史路线） |

### 历史归档

已完成或过时的实施计划、设计稿、合并记录与调试报告在 [docs/archive/](docs/archive/README.md)，仅作历史留档，不代表当前实现。

## 快速开始

### 前提

- Windows 10/11（全部启动脚本为 `.ps1`/`.bat`，未支持 macOS / Linux）
- [Node.js](https://nodejs.org) 22+ 与 [pnpm](https://pnpm.io) 10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)（运行本地 Dify）
- 一个 DeepSeek API Key

### 从零到能用问答的完整路径

```text
1. 克隆 Dify 并首次启动（仅首次，见部署文档"前置"章节）
2. 配置 DeepSeek 模型 Key（见部署文档"配置 DeepSeek 模型"章节）
3. pnpm demo:prepare（一键：启动 Dify → 导入工具 → 创建 Agent → 写入配置 → 演示论文 → 自检）
4. 双击 start-research-notion.bat，开始提问
```

### 运行（开发模式）

```bash
pnpm install
pnpm dev
```

或直接双击 `start-research-notion.bat`。

首次运行后，在设置页填写 Dify 地址和 `ResearchNotion Tool Agent` 的 App API Key（若已执行 `demo:prepare`，此步已自动完成）。完整的本地 Dify 部署与 Agent 配置见上表文档。

### 一键演示准备

```powershell
pnpm demo:prepare
```

该命令会启动 Dify、启动本地工具服务、导入工具、创建或更新 Tool Agent、写入本地 Agent 配置、准备演示论文并运行检查。可重复执行：各步骤幂等，中断后直接重跑即可。可选参数：

- `pnpm demo:prepare -DryRun`：只打印将执行的步骤，不实际执行
- `pnpm demo:prepare -SkipDifyStart`：跳过 Dify 启动（Dify 已在跑时）

单独配置已有 Agent 时使用：

```powershell
pnpm use:dify-agent
pnpm check:dify
```

### 构建 Windows 安装包

```bash
pnpm build:win
```

产出 Windows 安装包（NSIS）到 `release/`，普通用户安装后拥有独立用户数据目录，不包含开发者的论文、对话或 API Key。注意安装包仍需本机（或可达服务器）上运行着本地 Dify 才能使用 AI 功能。

## 验证命令

```bash
pnpm test          # 全部单元与界面测试
pnpm lint:types    # TypeScript 类型检查
pnpm build         # 生产构建
pnpm verify:mvp    # 本地论文库与 Dify Agent 配置校验
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 33 |
| 前端 | React 19 + TypeScript |
| 数据库 | SQLite（better-sqlite3） |
| PDF | pdfjs-dist |
| Markdown | react-markdown + remark + KaTeX |
| AI 后端 | Dify Agent Chat + OpenAPI 本地工具 |
| 模型 | DeepSeek |
| 外网搜索 | arXiv Atom API + Semantic Scholar Graph API |
| 测试 | Vitest + Testing Library |

## 项目结构

```text
src/
  main/
    agentTools/     # 本地 Agent 工具和 OpenAPI 服务
    dify/           # Dify 客户端、Agent 运行时提示与答案溯源
    workflows/      # 本地论文导入、提取、索引和卡片生成业务流程
    settings/       # 设置、记忆和模型 Key 同步
    conversations/  # 对话管理
    db/             # SQLite schema 与仓储
  renderer/         # React UI（对话、知识库、阅读器、设置）
  preload/          # Electron 安全桥
  shared/           # 共享类型和 IPC 类型
scripts/            # Agent 配置、工具导入、演示和部署脚本
tests/              # 单元和界面测试
docs/               # 现行文档
docs/archive/       # 历史归档（已过时）
```

## License

[MIT](LICENSE)
