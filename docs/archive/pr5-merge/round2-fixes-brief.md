<!-- 已归档（2026-08-15）：PR#5 合并冲突处理过程稿，问题均已解决。本文仅作历史留档。 -->

# 第二轮体验修复 Brief（integrate-pr5）

## 背景
PR5 与 main 融合后实测发现的 3 个剩余问题。`integrate-pr5` 分支，dev 已在跑（清 VS Code ELECTRON env 后启动）。**只改下面 3 个问题涉及的文件，不要破坏已修复的部分**（B 布局/D 删除 hover/F 工具栏常驻/G 思考正文不并行 已修）。

## dev 验证（VS Code 环境会崩，必须清 env）
```
env -u ELECTRON_RUN_AS_NODE -u ELECTRON_FORCE_IS_PACKAGED -u VSCODE_RUN_IN_ELECTRON -u ICUBE_IS_ELECTRON -u ICUBE_ELECTRON_PATH node_modules/.bin/electron-vite dev
```
改代码后 dev HMR 自动刷新；改 main 进程文件会触发 main rebuild。tsc 验证：`node_modules/.bin/tsc -p tsconfig.json --noEmit`。

## 问题 A：思维链成块出现（不像正文流式）
- **现象**：`LiveThinkingDisclosure`（src/renderer/pages/ChatPage.tsx ~712 行）的思考内容**一次性整块弹出**，而正文是流式逐字。用户反馈"像固定开场白"。
- **根因**：`ThinkingContent` 直接渲染 `liveParagraphs`（整段 AcademicMarkdown），thought 事件到达时整段出现，没有逐字展开。
- **期望**：思维链至少**逐段平滑淡入**（每个 thought 段落到达时淡入/滑入，而非整块）；若 thought 文本较长，最新一条可逐字打字机（参考已有的 `useStreamingOutput` hook，src/renderer/hooks/useStreamingOutput.ts，它吃 delta 输出节流 content）。
- **范围**：只改 `LiveThinkingDisclosure` / `ThinkingContent` 的渲染与 CSS（src/renderer/styles/app.css 的 `.thinking-content`/`.thinking-summaries`）。不要改 send 函数的事件处理（已调好）。

## 问题 E：AiDrawer 内容行宽不随侧栏拖宽
- **现象**：拖宽 AiDrawer（resize handle），drawer 本身变宽（inline `style={{ width }}` 已生效），但**内部 markdown/code 行宽不跟随**，需横向拉 drawer 才能读完。
- **相关文件**：src/renderer/components/AiDrawer.tsx（`<aside className="ai-drawer" style={{ width }}>`，内部 `.ai-thread`/`.ai-message`/`.markdown-content`）；CSS 在 src/renderer/styles/app.css（`.ai-thread` ~3743、`.ai-message` ~3753）。
- **排查方向**：drawer 内某元素有固定 `width`/`max-width`/`min-width`，或 `pre`/`code`/长行 `white-space: pre` 不换行溢出。确认 `.ai-message` 及其内部 `pre/code` 随 drawer 宽度自适应换行（`overflow-x: auto` 仅限 code 块，普通文本 `word-break`/`overflow-wrap` 正常）。
- **期望**：drawer 拖宽，正文行宽跟随；拖窄，正文换行不溢出。

## 问题 接地：AiDrawer 提问返回"无可定位原文证据"警告
- **现象**：在论文抽屉（AiDrawer）问论文事实，回复以"⚠️ 这次没有取得《论文标题》的可定位原文证据……其中的论文事实尚未由本地原文核实"开头。
- **怀疑**：AiDrawer 的对话**没有走 Tool Agent 检索当前论文**（或检索了但 citations 不含当前论文 paperId/paperTitle），导致 `answerGrounding.hasAllowedEvidence`（src/main/dify/answerGrounding.ts）判定无证据 → 触发警告。
- **排查**：
  1. AiDrawer 的 send（src/renderer/components/AiDrawer.tsx ~366 行 form）调用哪个 IPC？是否 `conversations.sendMessage`？传的 context 是否是当前论文（`{ type: 'paper', paperId, paperTitle }`）？
  2. main 进程 sendMessage（src/main/main.ts）在 paper context 下是否启用 Tool Agent + 论文工具（get_paper_metadata / get_paper_page_text / investigate_paper 等）？
  3. 实际返回的 `citations` 字段：有没有 `paperId`？是否等于当前论文 id？或 `paperTitle` 是否匹配（answerGrounding 用 `normalizedTitle` 比对）？
  4. 对比 ChatPage（主对话）问同一论文是否也这样——如果 ChatPage 正常、AiDrawer 异常，差异在 AiDrawer 的 send 路径。
- **期望**：AiDrawer 问当前论文事实时，能检索到该论文并带可定位引用，不误报"无证据"。若确实是 Tool Agent 在 AiDrawer 路径没启用，修复启用；若 answerGrounding 过严（有 title 匹配但判 false），修正判定。

## 约束
- 保留 GPT 石墨 token（`var(--rn-*)`），不硬编码颜色
- 不可变更新，无 console.log，无冲突标记
- **不要 git commit**（主控统一提交）
- 不要改已修复的：ChatPage 完成态 `.message-content` 容器、`.library-paper-delete` hover、`AgentProgress` 始终显示、delta 清 liveThinking
- 改完 `git add` 涉及文件，报告每个问题的修复方式 + tsc 结果

## 验收
- `node_modules/.bin/tsc -p tsconfig.json --noEmit` 零错误
- dev（清 env）reload 后：A 思维链平滑（不再整块）、E drawer 拖宽内容跟随、接地 AiDrawer 问论文事实不再误报
- 报告每个问题的根因 + 修复 + 若有折中说明
