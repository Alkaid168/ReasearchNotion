# ResearchNotion MVP 演示手册

## 演示前准备

1. 启动 Docker Desktop。
2. 在项目根目录运行：

```powershell
pnpm demo:prepare
```

该脚本会启动本地 Dify、将 DeepSeek 配置指向本地桥接服务、短暂启动 ResearchNotion 本地工具服务、导入 OpenAPI 工具、创建或更新 `ResearchNotion Tool Agent`、写入桌面端配置、准备演示论文、检查 Agent 合约并重建 Electron 原生模块。

演示论文归档到 Dify 知识库是可选兼容能力；桌面端问答只通过 Tool Agent 的本地论文工具完成。

## 手动准备

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dify.ps1 -NoOpen
pnpm use:deepseek-bridge
pnpm dev
pnpm import:dify-tools
pnpm provision:dify-agent
pnpm use:dify-agent
pnpm seed:dify
pnpm check:dify
pnpm verify:mvp
```

`pnpm dev` 提供 `http://127.0.0.1:17777/openapi.json`。工具导入完成后，Dify Docker 容器通过 `host.docker.internal:17777` 调用桌面端本地服务。

## 演示流程

1. 双击 `start-research-notion.bat`。
2. 打开设置页，确认 Dify App 显示为 `ResearchNotion Tool Agent (agent-chat)`。
3. 在论文库中打开一篇 PDF，按 `Ctrl+I` 打开论文 AI。
4. 提问“这篇论文有多少个主要小节”“总结第 3 节的方法”“创新点是什么”，观察工具进度和页码引用。
5. 选中一段原文后再次提问，确认 Agent 会把该段作为强调上下文。
6. 切换到论文库对话，提问跨论文比较或综述问题。
7. 可提问最近相关工作，确认 Agent 按需使用 arXiv 或 Semantic Scholar 工具。

## 验证命令

```powershell
pnpm check:dify
pnpm verify:mvp
pnpm smoke:dify-agent-paper
pnpm lint:types
pnpm test
pnpm build
```

`check:dify` 验证当前 App 是否为 `agent-chat`、工具提供者与 Agent 是否都挂载了预期 16 个工具。`verify:mvp` 验证本地论文库、论文文件和当前 Dify Agent 配置。`smoke:dify-agent-paper` 用真实论文上下文跑一次 Tool Agent 冒烟回归，确认读取状态、工具调用与证据引用仍按预期工作。

## 常见问题

- Dify 没启动：运行 `scripts/start-dify.ps1 -NoOpen`，然后重新执行 `pnpm use:dify-agent`。
- Agent 不调用工具：确认本地工具服务可访问，再运行 `pnpm import:dify-tools` 与 `pnpm provision:dify-agent`。
- 论文无法读取：检查本地论文文件是否仍在原路径，重新导入后再提问。
- 知识库归档 Key 缺失：不影响 Tool Agent；仅同步或清理 Dify 归档副本时才需要。
