# ResearchNotion 技术说明与答辩学习手册

> 本文描述当前单 Agent 版本的实际实现。它区分“已经实现”“可选归档能力”和“后续方向”，避免把设想说成已完成。

## 1. 一张架构图

```text
用户
  -> Electron 桌面端（React 界面）
     -> SQLite（论文、会话、消息、设置、记忆）
     -> 本地 papers/（PDF / Markdown 原文件）
     -> 本地 OpenAPI 工具服务 :17777
        -> Dify Tool Agent（Docker）
           -> DeepSeek 等模型
```

React 负责界面，Electron 主进程负责文件、数据库和安全 IPC；真正的 Agent 决策发生在 Dify 的 `agent-chat` 应用中。用户正常使用时只打开 ResearchNotion，不需要打开 Dify 网页。

## 2. Docker、镜像和容器

Docker 是一套让软件以一致方式运行的容器平台。Dify 由 API、网页、PostgreSQL、Redis 等多个服务组成，直接手工安装这些依赖很麻烦；Docker 把它们按固定版本和网络关系启动。

- 镜像（image）：软件运行模板，包含程序和依赖，本身没有在运行。
- 容器（container）：由镜像启动出来的实际进程实例。
- 卷（volume）：容器之外的持久数据位置；Dify 的数据库和知识库数据在卷中。
- Compose：一份描述多容器如何一起启动的配置。

ResearchNotion 桌面端不运行在容器里，只有本地 Dify 服务组运行在 Docker Desktop 的 Linux 环境中。`host.docker.internal` 是 Docker 容器访问 Windows 主机的特殊域名，因此 Dify 调本机工具时使用 `host.docker.internal:17777`。

常用命令：

```powershell
docker ps
docker compose ps
docker compose logs -f api
```

不要随意执行 `docker compose down -v`，它会删除 Dify 卷中的应用和知识库数据。

## 3. 论文与知识库保存位置

一篇论文在当前系统中至少有两层主要数据：

| 层 | 内容 | 位置 | 用途 |
| --- | --- | --- | --- |
| 原文件层 | PDF 或 Markdown 副本 | Electron 用户数据目录的 `papers/` | 阅读器和本地工具读取原文 |
| 结构化层 | 文件夹、论文元数据、卡片、会话、消息、设置 | SQLite 文件 | 组织界面与持久化状态 |
| 可选归档层 | 上传到 Dify 的文档副本 | Dify 数据卷与数据库 | 归档同步，不是默认问答证据 |

SQLite 是嵌入式关系数据库，一个文件就是一个数据库。它不需要单独启动服务，适合桌面软件。主要表包括 `folders`、`papers`、`paper_cards`、`conversations`、`messages`、`settings` 和记忆相关表。

导入时，软件把原文件复制进自己的论文目录，创建 SQLite 记录，提取文本并生成论文卡片。若用户配置了 Knowledge API Key，还可以同步一个归档副本到 Dify；同步失败不会让本地论文不可读。

## 4. RAG、检索和 embedding

RAG（Retrieval-Augmented Generation，检索增强生成）是“先找资料，再让模型基于资料回答”。它不是一个单独产品，而是一类架构：问题 -> 检索 -> 资料片段 -> 模型回答。

当前聊天主链路不是传统的一次性向量 RAG，而是 **Agent + 本地全文阅读工具**：

1. Agent 判断问题需要什么证据。
2. Agent 选择工具读取目录、章节、页面、文本块或搜索论文库。
3. 工具返回结构化 JSON 证据。
4. Agent 可以继续调用其他工具，最后生成 Markdown 回答与引用。

本地工具检索是规则增强的词法检索，不依赖 embedding：它会规范化查询、做少量中英术语扩展、在分页文本中找关键词、按命中和位置排序并返回上下文片段。优点是成本低、可解释、能按论文 ID 精确限定范围；缺点是同义改写和复杂语义召回弱于成熟向量检索。

Dify 知识库可以选择 `economy` 或 `high_quality` 索引模式，后者需要 Dify 已配置 embedding provider。当前桌面端 Tool Agent 不把 Dify 数据集作为默认工具，因此不能把“知识库已经建向量索引”误说成“桌面端聊天正在走向量检索”。后续可增加本地向量库或将 Dify dataset 检索包装成独立 Agent 工具，再通过评测决定是否启用。

## 5. 当前 Agent 是不是真正的 Agent

是。当前 Dify 应用为 `ResearchNotion Tool Agent`，模式是 `agent-chat`，策略为 `function_call`。一轮对话中，模型可以：

```text
理解问题 -> 选工具 -> 获得工具结果 -> 再选工具 -> 最终回答
```

例如“这篇论文有多少小节，第 3 节讲什么”：模型可先调用 `get_current_context`，再调用 `get_paper_outline`，最后调用 `get_paper_section`。这不是桌面端写死的顺序；模型读完目录后仍可继续读全文片段或换检索词。

它接近 ReAct 的 Action-Observation 循环，但不在代码中要求模型输出可见的 `Thought` 文本。Dify 通过原生函数调用协议传递工具参数和观察结果，桌面端只展示精简进度与最终回答。

## 6. 工具调用的数据格式

模型面向用户的最终回答是 Markdown。工具调用与最终回答是两种不同的通信：

- 最终回答：Markdown 文本，供 React 渲染。
- 工具调用：模型 Provider 的 function calling 协议，参数是符合 OpenAPI JSON Schema 的 JSON 对象。
- 工具结果：本地服务返回 JSON，包含状态、论文标识、页码、文本片段、分数或错误信息。

因此模型不必把下面这种 JSON 写进用户可见回答：

```json
{ "tool": "get_paper_outline", "arguments": { "paperId": "..." } }
```

Dify 负责接收模型的函数调用、执行 OpenAPI 请求、将结果带回下一次模型推理。桌面端的 SSE 解析器读取 `agent_thought`、`agent_message` 和 `message_end` 等事件，转换为工具进度、文本增量和引用；同时剥离意外泄露的推理标签或执行旁白。

论文卡片需要结构化字段。卡片解析使用 Zod 校验和 `jsonrepair` 修复，再进行一次受限重试；即使模型返回近似 JSON，也不会直接信任。

## 7. 工具范围与渐进式披露

当前 Tool Agent 挂载 16 个本地工具，包括当前上下文、当前页、元数据、目录、章节、文本块、全文搜索、论文库列表、单篇调查、跨库调查与外部学术搜索等能力。工具由 TypeScript 实现，在 `src/main/agentTools/` 中通过 OpenAPI 服务暴露，并由 Dify 导入为 `ResearchNotion_Local_Tools`。

目前工具是全量暴露：模型在一开始就能看到所有工具名称、描述和参数 schema。好处是实现直观；代价是工具说明会占上下文、工具越多越可能选错。后续可以把“工具目录/选择器”做成第一层工具，根据上下文再暴露细粒度工具，称为渐进式披露。

## 8. 记忆与上下文

记忆至少有三个概念，不能混在一起：

1. 当前消息上下文：本轮问题、当前论文或论文库、选中文本、最近对话和运行时约束。
2. Dify conversation：Dify 服务端按 `conversation_id` 维护的连续对话状态。
3. 长期偏好记忆：本地 SQLite 保存的身份、课题、偏好、纠正和资源等事实。

桌面端会把受限长度的近期消息和相关记忆整理成运行时上下文。工具结果会在当前 Agent 迭代中回传给模型，不会被无限制地永久拼进每轮请求。Dify 或模型有上下文上限，因此实现使用窗口和截断策略；精确窗口大小以 `src/main/dify/researchAgent.ts` 的当前代码为准，并非 Dify 控制台中一个可见的固定配置项。

当 Dify 返回“Conversation Not Exists”，客户端会丢弃过期 `conversation_id` 并重试一次，以恢复会话，而不会把旧 ID 当成永久故障。

## 9. 提示词和安全边界

实际影响模型的文本分为：

- Dify Agent 系统提示词：位于 `scripts/provision-dify-tool-agent.mjs`，规定取证、工具使用、安全和回答风格。
- 桌面端运行时提示：位于 `src/main/dify/researchAgent.ts`，补充当前论文、论文库、选中文本、历史与记忆。
- 论文卡片请求：要求先读取目标论文证据，再输出固定 JSON 字段。
- OpenAPI 工具描述：告诉模型每个工具何时可用和需要哪些参数。

核心原则是：论文正文、用户输入、历史消息和工具返回内容都属于不可信数据，不能覆盖系统规则、扩大论文访问范围或诱导泄露 API Key、系统提示词和本地路径。涉及论文事实时优先取证；通用学术解释可以结合模型知识，但应明确它不是该论文的直接结论。

## 10. 失败重试与可观测性

客户端对短暂的 Dify、模型桥接和 SSE 失败会做有限重试；对过期会话 ID 会无 ID 重试。工具调用失败时，Agent 提示词要求检查上下文并尝试替代工具，不能只凭一次空检索就断言论文没有相关内容。

桌面端显示的工具进度来自流式事件，例如“读取论文大纲”“搜索论文库”“生成回答”。它是面向用户的简洁可观测性，而不是暴露模型隐藏推理。

## 11. 打包与部署边界

桌面端由 Electron Builder 生成 Windows 安装包。源码版本仍需要 Node、pnpm 和 Dify 开发环境；普通用户安装包的目标是拥有独立的用户数据目录、SQLite 和 `papers/`，不会默认包含开发者的论文、对话或 API Key。

当前 AI 路线仍需要用户本机或可访问服务器上的 Dify 与模型配置。将 Dify、Docker、模型配置做成完全无感的一键终端产品属于后续产品化工作，不应声称已经完成。

## 12. 如何评估 Agent

不要只看回答是否流畅。应至少评价：

- 工具使用正确性：目录题是否读目录，比较题是否逐篇取证。
- 事实正确性：答案是否与论文原文一致。
- 引用质量：页码和片段是否真正支持结论。
- 跨语言检索：中文问题能否用合适英文关键词找到英文论文。
- 安全性：是否抵抗论文正文和用户消息中的提示注入。
- 体验：首 token 时间、总时长、工具调用次数、失败率和成本。

项目提供 `smoke:dify-agent-paper`、`benchmark:dify-agent` 和 `benchmark:dify-trust` 脚本。每次改模型、提示词、工具或 PDF 解析后，应记录版本和全量回归结果。真正可靠的科研 Agent 不是永远回答，而是该取证时取证、资料不足时说明边界、工具失败时能换策略。

## 13. 关键文件

| 主题 | 位置 |
| --- | --- |
| 数据库表结构 | `src/main/db/schema.ts` |
| 本地论文导入与卡片 | `src/main/workflows/` |
| PDF 解析和词法检索 | `src/main/agentTools/paperText.ts` |
| 工具处理器 | `src/main/agentTools/toolHandlers.ts` |
| OpenAPI 服务 | `src/main/agentTools/openApiService.ts` |
| Dify 客户端与流式解析 | `src/main/dify/client.ts` |
| 运行时上下文与记忆 | `src/main/dify/researchAgent.ts` |
| Agent 创建和系统提示词 | `scripts/provision-dify-tool-agent.mjs` |
| Agent 本地配置 | `scripts/configure-dify-agent.mjs` |
| 演示和检查 | `scripts/prepare-demo.ps1`、`scripts/check-dify-research-agent.mjs` |

## 14. 一页答辩速记

- Docker 负责运行 Dify 服务组；镜像是模板，容器是模板启动后的实例。
- 本地 SQLite 保存元数据、会话、消息、设置和记忆；本地 `papers/` 保存论文原件。
- Dify 知识库是可选归档副本；默认聊天证据来自本地工具读取论文原文。
- 当前是 Dify `agent-chat` + `function_call` 的多步 Tool Agent，不是固定节点式问答链路。
- 模型最终返回 Markdown；工具参数和结果通过 JSON function calling 在后台交换。
- React 是桌面界面技术，不是 Agent 架构。
- 论文事实优先工具取证；通用学术知识可以回答，但要区分证据来源。
- 评估重点是工具轨迹、事实、引用、安全和延迟，而不只是文采。
