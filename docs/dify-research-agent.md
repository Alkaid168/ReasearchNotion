# Dify Tool Agent 配置

ResearchNotion 的桌面端只连接 Dify 中的 `ResearchNotion Tool Agent`。该应用必须是 `agent-chat` 模式；模型通过 function calling 自主调用运行在本机的论文工具服务，而不是接收一个固定的知识库召回结果。

## 运行边界

- 桌面端聊天：Dify Tool Agent -> 本地 OpenAPI 工具 -> SQLite 论文库与本地论文文件。
- 可选论文归档：Dify Knowledge API Key 可将论文副本同步到 Dify 知识库。它不用于默认聊天，也不会被 Agent 当作唯一证据来源。
- 用户可见界面只有 ResearchNotion 桌面软件；Dify 在后台提供 Agent 运行时。

## 初始化步骤

1. 启动本地 Dify：`scripts/start-dify.ps1 -NoOpen`。
2. 启动 ResearchNotion 工具服务：运行 `pnpm dev`，确认 `http://127.0.0.1:17777/openapi.json` 可访问。
3. 导入工具：`pnpm import:dify-tools`。Docker 内的 Dify 使用 `host.docker.internal:17777` 访问该服务。
4. 创建或更新 Tool Agent：`pnpm provision:dify-agent`。
5. 写入已有 Tool Agent 的本地配置：`pnpm use:dify-agent`，或双击 `use-dify-agent.bat`。
6. 检查：`pnpm check:dify`。

完整演示可直接运行：

```powershell
pnpm demo:prepare
```

## Tool Agent

Tool Agent 挂载 `ResearchNotion_Local_Tools` 提供者的 16 个 OpenAPI 工具。它可获取当前上下文、页面文本、论文章节、论文大纲、全文片段、当前论文搜索、跨库搜索、单篇调查、论文库调查和外网学术搜索等信息。

回答时，Dify 先将用户问题和系统提示词交给模型；模型根据工具的 JSON schema 输出工具调用；Dify 执行工具并把结果返回模型；模型可以继续调用其他工具，直到形成最终 Markdown 回答。桌面端显示的是最终回答和精简的执行进度，不显示函数调用 JSON。

## 设置页

设置页需要：

- Dify 服务地址，例如 `http://127.0.0.1:8080`
- Tool Agent App API Key

可选：

- Knowledge API Key：仅用于论文归档同步、删除归档副本等管理操作
- DeepSeek API Key：同步到本地 Dify 的模型提供者或本地桥接服务时使用

“测试连接”只接受 `agent-chat` 应用。若填入旧的非 Agent App Key，桌面端会提示当前配置不是 Tool Agent。

## 系统提示词要点

Tool Agent 的系统提示词位于 `scripts/provision-dify-tool-agent.mjs`，运行时还会由桌面端注入当前论文、论文库、选中文本和用户记忆。提示词约束如下：

1. 先判断需要哪些证据，再调用恰当的工具。
2. 涉及当前论文的事实优先读取论文原文、章节或全文证据。
3. 中文问题可以自行生成英文检索词，以改善英文论文召回。
4. 资料不足时明确说明证据边界，不编造作者、实验、页码和结论。
5. 不自我介绍、不复述任务、不把工具执行过程写进最终回答。

## 故障排查

- `Tool Agent not found`：先运行 `pnpm import:dify-tools` 与 `pnpm provision:dify-agent`。
- 工具无法连接：确认桌面端已启动，检查 `http://127.0.0.1:17777/openapi.json`；Dify Docker 容器应使用 `host.docker.internal:17777`。
- `check:dify` 显示工具数不匹配：重新运行 `pnpm import:dify-tools` 后再 provision Agent。
- 知识库归档失败：只影响归档同步，不影响 Agent 的本地论文问答；单独检查 Knowledge API Key。
