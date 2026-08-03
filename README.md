# ResearchNotion

ResearchNotion 是一个面向科研论文管理与问答的本地桌面软件。它借鉴 Notion AI 的对话入口和 Codex 式工作台体验，将本地论文库、阅读器和 Dify RAG 智能体组合成一个个人科研知识库。

当前阶段：MVP + P2 功能完成（向量检索 / 评测集 / 用户记忆 / 外网搜索 / 模型 Key 桌面端配置 / 双栏 PDF）。

## 核心功能

### AI 科研助手（两条路径）
- **Workflow RAG**（稳定路径）：Dify 知识库检索 → LLM 回答 / 论文卡片。支持**向量检索**（bge-m3 via 本地 TEI GPU 容器）。
- **Tool Agent**（自治路径）：Dify Agent Chat 自主调用 **14 个本地工具**（论文阅读、章节抽取、跨库取证、**arXiv / Semantic Scholar 外网搜索**），最多 12 轮 function-call 迭代。

### 论文管理
- PDF / Markdown 导入，自动生成论文卡片（Zod schema 校验 + jsonrepair + LLM repair retry）。
- 论文卡片包含作者、年份、一句话摘要、研究问题、方法、贡献、关键词。
- 支持 Notion 风格论文库导航、对话历史管理。

### 桌面端体验
- Electron + React 19 + TypeScript 桌面应用。
- PDF canvas 阅读器（适宽、翻页、缩放、Ctrl+I 呼出 AI）。
- **双栏 PDF 排序**（自动检测 IEEE/ACM/Springer 双栏布局，左栏读完再右栏）。
- Settings 页一站式配置（Dify 地址 + App/Knowledge Key + **DeepSeek 模型 Key 桌面端同步**）。
- **研究偏好记忆**（5 类：身份 / 偏好 / 纠正 / 课题 / 资源，每次对话自动注入）。

### 评测与质量
- **Agent benchmark**（pass^k 可靠性 + JSON 报告 + baseline diff）：11 个能力 case + 5 个安全 case。
- 论文卡片 Zod schema + jsonrepair + repair retry（18 测试覆盖各类坏 JSON）。

## 设计文档

- [ResearchNotion 技术说明与答辩学习手册](docs/research-notion-technical-guide.md) — 核心文档，1112+ 行，严格区分已实现/未实现
- [Dify 本地部署笔记](docs/dify-local-deploy.md) — 命令行部署全流程（含 TEI 向量检索 + SSRF + 签名绕 marketplace）
- [MVP Runbook](docs/mvp-runbook.md) — 演示准备与验证流程
- [Dify 科研学术问答智能体配置](docs/dify-research-agent.md)
- [Dify Workflow 搭建说明](docs/dify-workflow-build-guide.md)
- [桌面端视觉审计清单](docs/visual-audit-checklist.md)

## 本地运行

### 快速启动（Windows）
```text
双击 start-research-notion.bat
```

### 从源码运行
```bash
pnpm install
pnpm dev    # Electron dev（含工具服务 17777）
```

首次运行后在 Settings 页填写：Dify 地址、App API Key、Knowledge API Key、DeepSeek API Key（保存时自动同步到 Dify）。

> **Windows 用户注意**：如果 IDE 是 Trae CN，需先 `unset ELECTRON_RUN_AS_NODE`（否则 electron.exe 退化为 node）。

### 完整 Dify 部署（含向量检索）
参见 [docs/dify-local-deploy.md](docs/dify-local-deploy.md) §9（TEI bge-m3 GPU + high_quality 向量索引）。

## 验证命令

```bash
pnpm test         # 38 文件 / 294+ 测试
pnpm lint:types   # TypeScript 类型检查
pnpm build        # 生产构建

# Agent benchmark（需 Dify + 工具服务运行）
node scripts/benchmark-runner.mjs    # tool k=3 + trust k=2，合并 JSON 报告
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 33 |
| 前端 | React 19 + TypeScript 5.9 |
| 数据库 | SQLite（better-sqlite3） |
| PDF | pdfjs-dist（含双栏排序） |
| Markdown | react-markdown + remark + KaTeX |
| AI 后端 | Dify 1.16.1（Workflow + Tool Agent） |
| 模型 | DeepSeek（v4-flash / chat / reasoner） |
| 向量检索 | 本地 TEI bge-m3（GPU，OpenAI-compatible） |
| 外网搜索 | arXiv Atom API + Semantic Scholar Graph API |
| 测试 | Vitest + Testing Library |

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── agentTools/     # 14 个 Agent 工具 + OpenAPI 服务
│   ├── dify/           # Dify 客户端 + 研究助手提示词
│   ├── workflows/      # 论文导入/索引/卡片生成（Zod schema + repair）
│   ├── settings/       # 设置 / 用户记忆 / 模型 Key 同步
│   ├── conversations/  # 对话管理
│   └── ipc.ts          # IPC 路由
├── renderer/           # React UI
│   ├── pages/          # Chat / Knowledge / Settings
│   ├── components/     # AppShell / PaperReader / AiDrawer / ...
│   └── state/          # 工作区偏好
├── preload/            # Electron 安全桥
└── shared/             # 共享类型 + IPC 类型
scripts/                # Dify provision / benchmark / seed / 部署脚本
tests/                  # 38 个测试文件（unit + renderer）
docs/                   # 技术说明 + 部署笔记 + 审计清单
```

## License

Private.
