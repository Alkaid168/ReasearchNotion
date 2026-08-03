# ResearchNotion

ResearchNotion 是一个面向科研论文管理与问答的本地桌面软件。它借鉴 Notion AI 的对话入口和 Codex 式工作台体验，将本地论文库、阅读器和 Dify Tool Agent 组合为个人科研知识库。

当前桌面端只使用一条 AI 路线：`ResearchNotion Tool Agent`。Dify 知识库可以继续保存论文归档副本，但不参与桌面端的默认问答链路。

## 核心功能

### AI 科研助手

- Dify Agent Chat 自主调用 16 个本地工具，按问题决定读取当前页、全文、章节、大纲、当前论文库或跨库证据。
- 支持论文阅读、章节提取、跨库比较、术语解释、创新点分析，以及 arXiv / Semantic Scholar 外网检索。
- Agent 可在同一轮中连续调用多个工具；桌面端以流式方式显示回答、工具进度和证据引用。

### 论文管理

- 导入 PDF、Markdown；自动提取正文并生成论文卡片。
- 论文卡片包括作者、年份、一句话摘要、研究问题、方法、贡献和关键词。
- 支持 Notion 风格论文库导航、对话历史和阅读位置恢复。

### 桌面端体验

- Electron + React 19 + TypeScript 桌面应用。
- PDF canvas 阅读器，支持适宽、翻页、缩放和 `Ctrl+I` 呼出论文 AI。
- 自动检测并顺序阅读常见双栏 PDF。
- 设置页配置 Dify 地址、Tool Agent App API Key；Dify Knowledge API Key 仅用于可选的论文归档同步。
- 支持研究偏好记忆，并在对话中按需注入。

## 文档

- [技术说明与答辩学习手册](docs/research-notion-technical-guide.md)
- [Dify Tool Agent 配置](docs/dify-research-agent.md)
- [Dify 本地部署](docs/dify-local-deploy.md)
- [MVP 演示手册](docs/mvp-runbook.md)
- [桌面端视觉审计清单](docs/visual-audit-checklist.md)

## 本地运行

Windows 下双击 `start-research-notion.bat`，或执行：

```bash
pnpm install
pnpm dev
```

首次运行后，在设置页填写 Dify 地址和 `ResearchNotion Tool Agent` 的 App API Key。若要把本地论文同步到保留的 Dify 知识库，再额外填写 Knowledge API Key。

## Dify 演示准备

```powershell
pnpm demo:prepare
```

该命令会启动 Dify、启动本地工具服务、导入工具、创建或更新 Tool Agent、写入本地 Agent 配置、准备演示论文并运行检查。单独配置已有 Agent 时使用：

```powershell
pnpm use:dify-agent
pnpm check:dify
```

## 验证命令

```bash
pnpm test
pnpm lint:types
pnpm build
pnpm verify:mvp
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
    dify/           # Dify 客户端和 Agent 运行时提示
    workflows/      # 本地论文导入、提取、索引和卡片生成业务流程
    settings/       # 设置、记忆和模型 Key 同步
    conversations/  # 对话管理
  renderer/         # React UI
  preload/          # Electron 安全桥
  shared/           # 共享类型和 IPC 类型
scripts/            # Agent 配置、工具导入、演示和部署脚本
tests/              # 单元和界面测试
docs/               # 技术和部署文档
```

## License

Private.
