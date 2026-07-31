# Dify 科研学术问答智能体配置

这份文档对应 ResearchNotion MVP 当前的 Dify 接入方式：用户只看到桌面软件，Dify 在后台提供知识库检索、问答和论文卡片生成能力。

## Dify App 类型

在 Dify 中创建一个 Advanced Chat Workflow App，并在工作流里加入“知识库检索、任务分流、科研问答 LLM、论文卡片 LLM、回答输出”等节点。模型 Provider、模型名称、模型 API Key 暂时都在 Dify 控制台里配置；ResearchNotion 设置页只填写：

- Dify 服务地址
- Dify App API Key
- Dify Knowledge API Key

## App 变量

ResearchNotion 调用 `/v1/chat-messages` 时会通过 `inputs` 传入以下变量。请在 Dify Workflow 的开始节点中配置同名变量：

| 变量名 | 含义 |
| --- | --- |
| `task` | 当前任务类型，普通科研问答为 `research_chat`，论文卡片为 `paper_card`。 |
| `contextType` | 当前上下文类型：`free`、`folder` 或 `paper`。 |
| `contextLabel` | 当前论文库名、论文标题，或“未限定知识库”。 |
| `folderId` | 当前论文库在 ResearchNotion 本地数据库中的 ID，仅论文库上下文存在。 |
| `paperId` | 当前论文在 ResearchNotion 本地数据库中的 ID，仅单篇论文上下文或论文卡片任务存在。 |
| `emphasisContext` | 用户在阅读器中选中的强调上下文，可为空。 |

设置页的“测试连接”会检查这些变量是否存在。如果缺少变量，ResearchNotion 会提示具体变量名。完整节点搭建方式见 [Dify Workflow 搭建说明](dify-workflow-build-guide.md)。

## 引用返回

请在 Dify Workflow 中开启引用与归因返回，也就是让 `/v1/chat-messages` 的响应包含 `metadata.retriever_resources`。ResearchNotion 会读取其中的 `document_id`、`document_name`、`content` 和 `score`：

- `document_id` 用来尽量映射回本地论文。
- `document_name` 在无法映射时作为引用来源名称显示。
- `content` 作为引用片段保存。
- `score` 作为检索相关度保存。

如果 Dify App 没有开启引用返回，设置页的“测试连接”会提示需要开启。

## 命令行检查

如果是第一次配置本地 Dify，可以先运行初始化脚本。它会在本地 Dify 中创建或更新：

- `ResearchNotion Academic QA Agent` Advanced Chat Workflow App
- `ResearchNotion Demo Library` 知识库
- Dify App API Key
- Dify Knowledge API Key
- ResearchNotion 本地设置中的 Dify 地址和 Key
- ResearchNotion 本地论文库到 Dify dataset 的映射

```powershell
pnpm provision:dify
```

如果想在启动桌面软件前检查 Dify 配置，可以运行：

```powershell
pnpm check:dify
```

这个命令会优先读取环境变量；如果没有环境变量，会自动读取 `pnpm provision:dify` 写入 ResearchNotion 本地设置的 Dify 地址和 Key。它会检查 App API Key、Knowledge API Key、ResearchNotion 必需变量，以及引用返回开关。

当前本地演示环境使用 `economy` 索引模式上传文档，因为本机 Dify 尚未配置默认文本 embedding 模型。后续如果在 Dify 里配置好 embedding provider，可以再切换到 `high_quality` 向量索引。

## 系统提示词

把下面这段作为 Dify App 的系统提示词或核心角色提示词：

```text
你是 ResearchNotion 科研学术问答智能体，服务于论文阅读、文献综述、术语解释、创新点提取、方法比较和研究方案讨论。

回答原则：
1. 优先依据知识库检索结果、用户当前打开的论文、用户选中的强调上下文回答。
2. 如果知识库证据不足，要明确说“不知道”或“当前资料不足”，不要编造论文、作者、年份、实验数据或结论。
3. 回答要适合科研学习和小组作业展示，必要时按“结论、依据、局限、下一步问题”组织。
4. 解释术语时先给直观中文解释，再补充技术细节。
5. 分析创新点、方法比较、实验评价时，要说明它与已有工作的差异、适用场景和潜在局限。
6. 如果 Dify 返回引用来源，请在回答中自然提到依据，方便用户回到原论文核对。
```

## ResearchNotion 发给 Dify 的任务

普通问答会被包装成科研问答任务，包含当前论文库或当前论文信息。如果用户在阅读器里选中一段文字并按 `Ctrl+I` 提问，这段文字会作为 `emphasisContext` 同时进入 `inputs` 和 `query`。

论文导入后，ResearchNotion 会调用同一个 Chat App 生成论文卡片。此时 `task` 为 `paper_card`，并要求 Dify 只返回 JSON：

```json
{
  "authors": "",
  "year": "",
  "oneSentenceSummary": "",
  "researchProblem": "",
  "methodSummary": "",
  "contributions": [],
  "keywords": []
}
```

如果证据不足，字段应返回空字符串或空数组，不要编造。

## 后续可增强

- 将论文卡片生成拆成 Dify Workflow，提高 JSON 稳定性。
- 在 Dify 中为 `research_chat` 和 `paper_card` 走不同分支。
- 将 Dify 返回的引用与本地 `paperId` 做更强映射，点击引用直接跳回论文阅读位置。
- 增加“综述生成”“方法对比表”“创新点雷达图”等独立任务类型。

## Agent 工具路线

当前桌面端已经内置一组本地 OpenAPI 工具，供 Dify Agent 主动调用。它和旧的“知识库检索节点”不是同一件事：旧流程是先固定召回一批片段，再把片段交给 LLM；Agent 工具路线是让模型先判断应该读当前页、当前章节、整篇论文，还是搜索当前论文库，再调用对应工具。

使用步骤：

1. 演示准备推荐直接运行 `prepare-demo.bat` 或 `pnpm demo:prepare`，脚本会临时启动 ResearchNotion 工具服务并导入工具。
2. 如果在浏览器或宿主机上查看 OpenAPI，地址是 `http://127.0.0.1:17777/openapi.json`。
3. 如果 Dify 跑在 Docker 里，导入地址建议使用 `http://host.docker.internal:17777/openapi.json?server=http%3A%2F%2Fhost.docker.internal%3A17777`。
4. 运行 `pnpm import:dify-tools`，把 11 个本地工具导入 Dify 自定义 API 工具提供者。
5. 运行 `pnpm provision:dify-agent`，创建或更新 `ResearchNotion Tool Agent` 工具调用型 Agent Chat，并自动挂载这些工具。

`pnpm provision:dify` 仍然会创建可演示的 Advanced Chat Workflow，并把桌面端设置指向这个稳定工作流。`pnpm import:dify-tools` 会创建或更新 `ResearchNotion_Local_Tools` 自定义 API 工具提供者。`pnpm provision:dify-agent` 则会额外创建 `agent-chat` 模式的 `ResearchNotion Tool Agent`，把这些 API 工具写入 `agent_mode.tools`，让 Dify 旧 Agent 运行器以函数调用方式自主选择工具。

如果不使用 `prepare-demo.bat`，手动导入工具时需要先启动 Dify，并确认 ResearchNotion 工具服务 `http://127.0.0.1:17777/openapi.json` 可访问，然后运行：

```powershell
pnpm import:dify-tools
pnpm provision:dify-agent
```

第一条命令会在 Dify 中创建或更新 `ResearchNotion_Local_Tools` 自定义 API 工具提供者，并导入 11 个本地阅读工具，其中 `investigate_paper` 会为宽泛论文问题一次返回元数据、大纲和页级证据。第二条命令会创建或更新 `ResearchNotion Tool Agent`，并验证 Dify 能为每个工具构建 Agent 运行时。

桌面端默认仍使用 `pnpm provision:dify` 写入的旧 Workflow App Key，作为稳定演示链路。如果要在桌面端直接试用工具型 Agent，双击 `use-dify-agent.bat` 或运行 `pnpm use:dify-agent` 即可把本地设置切到 `ResearchNotion Tool Agent`；需要回到稳定 Workflow 时双击 `use-dify-workflow.bat` 或运行 `pnpm use:dify-workflow`。桌面端会自动兼容 `agent-chat` 的 streaming 响应。

`pnpm verify:mvp` 同时认可这两条路线：旧 Workflow App 会检查 ResearchNotion 输入变量和引用返回，`agent-chat` Tool Agent 则按工具调用型 Agent 检查，不再要求旧 Workflow 的变量表。

说明：Dify 1.15 的新版 Agent App / Agent V2 工具层更偏向 Plugin Tool；ResearchNotion 当前的 OpenAPI 自定义工具在旧 `agent-chat` 运行器里有明确支持路径。因此现阶段自动化选择旧 Agent Chat，后续如果要在新版 Agent App 画布中展示更漂亮的节点式配置，可以继续研究 Plugin 化或 Agent V2 适配。
