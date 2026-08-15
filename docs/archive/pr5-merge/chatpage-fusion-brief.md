<!-- 已归档（2026-08-15）：PR#5 合并冲突处理过程稿，问题均已解决。本文仅作历史留档。 -->

# ChatPage 双流式深度融合 Brief（integrate-pr5 分支）

## 任务
在 `integrate-pr5` 分支（git merge 进行中）解决两个文件的合并冲突：
- `src/renderer/pages/ChatPage.tsx`：18 个冲突 hunk
- `tests/renderer/chatPage.test.tsx`：2 个冲突 hunk（与 ChatPage UI 强耦合）

仓库根：`<仓库根目录>`。其余 15 个冲突文件已全部解决，只剩这两个。**不要改这两个以外的文件。**

## 获取两边版本
- ours（当前 main，含已验收的 GPT 细腻度）：`git show :2:src/renderer/pages/ChatPage.tsx`
- theirs（PR #5 by ao-5941）：`git show :3:src/renderer/pages/ChatPage.tsx`
- 工作区当前文件含 18 个 `<<<<<<< HEAD / ======= / >>>>>>> pr5-head` 标记，可用 `grep -n '^<<<<<<<\|^=======\|^>>>>>>>' src/renderer/pages/ChatPage.tsx` 定位。

## 已合并的数据层（类型依据，已定稿，勿改）
- `Message`（`src/shared/types.ts`）现有 `tokenUsage?: TokenUsage` + `researchProcess?: ResearchProcess | null`（两者并存）
- `ConversationProgressEvent.phase` / `DifyChatProgressEvent.phase`：`'thought' | 'tool' | 'answer' | 'delta' | 'done' | 'usage'`（thought 来自 PR5，usage 来自 main）
- `src/shared/researchProcess.ts`（PR5 新增已合入）：`buildResearchProgressEvent` 把工具事件映射成 scope/search/read/answer/verify 五阶段叙事；`buildResearchProcess(events, { question, answer, durationMs })` 聚合
- `src/main/dify/answerGrounding.ts`（PR5 新增已合入）：引用接地校验，返回 `GroundedAnswer = { answer, blocked }`
- `src/main/main.ts` sendMessage 已用 `grounded.answer` + `answerCitations` + `tokenUsage` + `researchProcess` 落库
- 样式：`src/renderer/styles/app.css` 已含 `.live-research-trace`（中性化石墨色）；`tokens.css` 保留 GPT 石墨 token（`--rn-accent:#0d0d0d` 等）

## useStreamingOutput hook 接口（ours，已验收，勿改）
位于 `src/renderer/hooks/useStreamingOutput.ts`：
```ts
type StreamOutput = {
  content: string | null      // 当前应显示文本（节流后，打字机效果）
  drained: boolean            // finish 后是否排空完
  push(delta: string, opts?: { replace?: boolean }): void  // 吃 delta
  finish(finalText: string): void  // 流结束，用最终全文排空
  reset(): void
}
const stream = useStreamingOutput(streamSpeed)  // streamSpeed: 'gentle'|'normal'|'fast'
```
**吃 delta、输出节流后的 content**。三档：gentle=1字/tick、normal=4字/tick、fast=直通。保险丝 STREAM_FLUSH_BACKLOG=800。

## 融合总原则（两边能力并存，不丢弃任一侧功能）
| 维度 | ours(main，保留) | theirs(PR5，叠加) |
|---|---|---|
| 流式控速 | `useStreamingOutput(streamSpeed)` 三档+打字机+欠账快进 | `streamingAnswer` state（完整已到达内容）+ `liveResearchEvents` |
| 进度组件 | `AgentProgress` 吃 `toolCalls` | `AgentProgress` 吃 `events`（live thinking） |
| 光标 | `StreamingCursor` 紧跟最后文本节点 | — |
| 空态 | `heroPlayedRef` stagger 入场（仅播一次） | — |
| 模型 | `ModelSelector` + `tokenUsage` 透传 | — |
| 推理可视化 | — | `ResearchProcess` / `live-research-trace` 面板 |
| 引用接地 | — | `CitationStatus` + `citationRequestRef` + 接地 |
| 上下文 | composer `combobox` 切上下文 | `disabledContext`（有对话历史时固定） |

**基底选择：以 ours（:2）为基底叠加 PR5 能力** —— 保护刚验收的 GPT 细腻度（三档速度、流式光标、空态动画），把 PR5 的推理可视化/接地作为新能力接入。

## 双流式架构（关键设计决策）
`streamingAnswer`（数据源）+ `useStreamingOutput`（控速）两层串联：
1. SSE/进度 `delta` 事件到达：同时 `stream.push(delta)`（控速缓冲）和 `setStreamingAnswer(prev => ({ ...prev, content: (prev?.content ?? '') + delta }))`（拼接完整内容）
2. `tool`/`thought` 事件：push 到 `liveResearchEvents`（供 AgentProgress 的 events 区与 buildResearchProcess）
3. UI 流式中的当前条：显示 `stream.content`（打字机），不是 `streamingAnswer.content`
4. 流结束：`stream.finish(finalText)`；`streamingAnswer` 此时已是完整内容；最终落库内容一致
- **必须保证三档速度在真实流下体感可辨**（上一轮刚验收，不能回归）
- 流式中与流结束的视觉连续：`stream.content` 排空后(drain)== `streamingAnswer.content` == 落库 content

## 18 hunk 逐个融合方向（签名级，落地读两边确认）
- **H1 import 图标**：合并图标集（ours 的 + theirs 的 `BrainCircuit` 等新图标）
- **H2 import 组件**：都要——保留 ours 的 `useStreamingOutput`/`StreamingMarkdown`/`StreamingCursor`/`ModelSelector`/`ModelProfile`；加 theirs 的 `PaperReader`/`ResearchProcess`/`researchProcess` 等
- **H3 `StreamingAnswer` 类型**：采纳 theirs（PR5 新增类型）
- **H4 流式状态**：`const stream = useStreamingOutput(streamSpeed)`（ours）+ `const [streamingAnswer, setStreamingAnswer] = useState<StreamingAnswer | null>(null)` + `liveResearchEvents` state（theirs）。三者并存
- **H5 refs**：`heroPlayedRef`（ours）+ `citationRequestRef`（theirs）都保留
- **H6/H7 重置**：发新消息时 `stream.reset()` + `setStreamingAnswer(null)` + 清 `liveResearchEvents`，三者都调
- **H8 自动滚动 useEffect**：依赖数组合并；`stream.content` 是可见内容，作为滚动触发主信号；如 theirs 还依赖 `liveThinking` 也并入
- **H9 发送起始**：ours `finalAssistantRef.current = null` + theirs `setSendProgress({ step: 'scope' })`，都执行
- **H10 进度 verify/save**：把 theirs 的 `verify` 阶段（接地校验，~22 行）插在 ours 的 `save` 之前。步骤序：`scope → (tool/thought) → verify → save`
- **H11 输入区/列表 props**：合并——ours 的 `tokenUsage`/`streamSpeed` + theirs 的 `disabledContext`
- **H12 消息渲染（最关键）**：保留 ours 的 `message-avatar` + `StreamingMarkdown` + `StreamingCursor`（流式光标跟随最后文本节点）；叠加 theirs 的 `CitationStatus` + `researchProcess` 展示。流式中的当前条用 `stream.content` 驱动，历史条用 `message.content`
- **H13 AgentProgress 调用**：`<AgentProgress progress={sendProgress} toolCalls={toolCalls} events={liveResearchEvents} ... />`，双数据源
- **H14/H15 子组件 props 类型**：`tokenUsage`（ours）+ `disabledContext`（theirs）都加
- **H16 composer 工具条**：保留 ours 的 `composer-toolbar`（含速度三档 segmented control）；叠加 theirs 的上下文控件（`composer-context` / `disabledContext`）。两控件共处工具条，不互斥
- **H17/H18 AgentProgress 函数体**：签名改为 `{ progress, toolCalls, events }`；渲染 ours 的 toolCalls 进度格 + theirs 的 `live-research-trace`（events 思考轨迹）。两块都显示（toolCalls 区 + research trace 区）

## chatPage.test.tsx（2 hunk，跟随融合后真实 UI）
定位：`grep -n '^<<<<<<<' tests/renderer/chatPage.test.tsx`
- 两处都围绕"上下文切换 UI"：ours 用 `combobox { name:'问答上下文' }` 可切换；theirs 用"当前论文范围"input + `disabledContext` 固定
- 融合策略：保留 ours 的 combobox 可切换上下文 + 叠加 theirs 的"有对话历史时 disabledContext 禁切"
- 测试处理：让测试反映融合后真实 UI。若保留 combobox 可切 → 保留 HEAD 断言；若额外实现 disabledContext 场景 → 补测。**不要保留测已不存在行为的死断言**
- 测试文件当前两个 hunk 之间（L1212 `fireEvent.change(contextSelect, ...)`）引用了 contextSelect 变量，必须保证融合后该变量定义存在或改写

## 约束
- 保留 GPT 石墨 token：用 `var(--rn-*)`，不硬编码颜色字面量
- 不可变更新（spread，不 mutate state）
- 无 `console.log`
- 无任何 `<<<<<<<`/`=======`/`>>>>>>>` 残留
- **不要 git commit**（由主控统一提交）
- 解决完后 `git add` 这两个文件

## 验收（必做，在报告里给结果）
1. `git add src/renderer/pages/ChatPage.tsx tests/renderer/chatPage.test.tsx`
2. 全仓库无冲突标记：`git diff --name-only --diff-filter=U`（应为空）
3. `pnpm lint:types`（零错误）
4. `pnpm test`（全绿；重点关注 chatPage.test / chatMessage.test / streaming 相关）
5. 报告内容：每个 hunk 最终融合决策一句话 + 测试通过数/失败数 + 任何折中说明

## 若遇架构冲突
若发现 ours 的 `useStreamingOutput` 与 theirs `streamingAnswer` 无法简单串联，优先保证：① 三档速度不回归 ② researchProcess/live-research-trace 能显示 ③ 引用接地生效。折中方案在报告说明理由。
