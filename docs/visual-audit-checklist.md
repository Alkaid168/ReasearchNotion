# ResearchNotion 桌面端视觉审计清单

> 依据：桌面 UX 改进计划 Task 9（Full Verification And Visual Audit）。
> 用途：每次重大改动后，按此清单验证桌面端视觉与交互未回归。
> 原则：自动化能挡的交给测试；自动化挡不住的，按此清单人工 inspect。答辩前必跑一遍。

---

## 1. 自动化验证（先跑通）

| 检查 | 命令 | 期望结果 |
|---|---|---|
| 类型检查 | `pnpm lint:types` | exit 0，无错误 |
| 单元 + 渲染测试 | `pnpm test` | 全部通过（基线 34 文件 / 243 用例） |
| 生产构建 | `pnpm build` | `dist/` 产出，无报错；PDF 标准字体已复制 |
| CSS 静态防御 | `tests/unit/desktopUxStyles.test.mjs` | 5 项通过（focus-visible / reduced-motion / 窄窗口 / 滚动隔离 / 字体层级） |

> Windows 上 `pnpm test` 会先经 vitest globalSetup 把 `better-sqlite3` 重编为 Node ABI，无需手工 `rebuild:node`。

---

## 2. 实地验证环境准备

1. Docker Desktop 处于 Running；本地 Dify 可访问 `http://localhost:8080`。
2. DeepSeek bridge 已启动（双击 `start-deepseek-bridge.bat` 或 `pnpm deepseek:bridge`）。
3. 演示数据就绪：`pnpm demo:prepare`（或手动 `use:deepseek-bridge` → `import:dify-tools` → `provision:dify-agent` → `use:dify-agent` → `seed:dify` → `check:dify`）。
4. 桌面端启动：`pnpm rebuild:native` 后 `pnpm dev`（或双击 `start-research-notion.bat`）。

---

## 3. 九项 UX 实地验证路径（对应 UX 计划 Task 1–8）

逐项打勾。每项都要在"默认状态"和"极限状态"各试一次。

- [ ] **Task 1 Stable Shell**：默认进入对话 tab；`Ctrl+B` 收起/展开侧栏；刷新后恢复上次 tab 与选中会话；侧栏宽度持久。
- [ ] **Task 2 Chat Timeline**：提问触发流式输出；自动滚到最新消息；复制助手消息；发送失败后重试且草稿不丢；输入框自动高度。
- [ ] **Task 3 Reader**：PDF 打开自动适宽；非编辑聚焦时左右键翻页；focus-mode 切换；重开同一论文恢复页码与缩放。
- [ ] **Task 4 Search**：`Ctrl+K` 打开统一搜索；过滤 conversations/folders/papers；上下键选择；回车跳转。
- [ ] **Task 5 Tree**：会话/文件夹右键 rename/delete/move；文件夹展开状态持久；拖拽到列表上下边缘自动滚动。
- [ ] **Task 6 Import Drop**：拖 PDF/Markdown 到知识库；拒收不支持的文件类型；单次导入结果通知。
- [ ] **Task 7 AI Context**：`Ctrl+I` 开关论文 AI 抽屉；可移除选中 context；切换论文时各恢复自己的对话 thread；抽屉宽度可调（夹紧区间）。
- [ ] **Task 8 Notifications / A11y**：设置页 Dify 状态可点击跳转；toast 可键盘关闭；`Tab` 焦点可见；`prefers-reduced-motion` 下动画关闭。

---

## 4. 截图审计（人工 inspect）

### 4.1 关键页面 × 断点

对下列每个页面，在 **1280×800** 与 **1440×900** 两个窗口尺寸各截一张图：

- [ ] 对话页：空状态 / 有历史 / 流式输出中
- [ ] 知识库页：无论文 / PDF 阅读中 / AI 抽屉打开
- [ ] 设置页：状态面板 ready / error
- [ ] 搜索 overlay（`Ctrl+K`）
- [ ] 右键上下文菜单 / 拖拽视觉反馈

### 4.2 inspect 维度（plan Task 9 原文）

每张截图逐项检查：

- [ ] **无 blank canvas**：没有意料之外的空白渲染区
- [ ] **无 clipping**：文字与控件未被裁切
- [ ] **无 overlap**：元素之间未互相遮挡
- [ ] **无 unstable widths**：侧栏、抽屉、列宽不抖动
- [ ] **无 unreadable text**：对比度与字号可读

### 4.3 截图存放与命名

- 路径：`docs/screenshots/<page>-<state>-<width>.png`（例：`chat-empty-1280.png`、`knowledge-pdfreader-1440.png`）。
- 仅保留最终、脱敏、命名稳定的截图；调试用图不入库（见 [github-submission-manifest.md](github-submission-manifest.md) §"UI 截图"）。

---

## 5. 通过标准

- 自动化 4 项全绿。
- 实地 8 条路径全部 ✓。
- 截图 inspect 5 个维度无异常。
- 任一异常 → 记 issue，修复后对本清单回归。

---

## 6. 常见回归信号速查

| 现象 | 首先检查 |
|---|---|
| 整页空白 / 仅顶栏 | renderer 未挂载、`#root` 高度未撑开、IPC 初始化抛错 |
| 侧栏宽度抖动 | `--conversation-sidebar-width` 是否首次渲染即注入（AppShell 默认 272） |
| 阅读器控件溢出 | `max-width: calc(100% - 44px)` 与 `@media (max-width: 900px)` 规则是否仍在 |
| toast 不消失 / 累积 | ToastRegion 的 live region 与键盘关闭逻辑 |
| 拖拽不落位 | Sidebar 拖拽算法与 native pointer 事件 |

---

## 7. 验收记录

### GPT 细腻度升级验收（2026-08-13）

- **范围**：GPT 风格细腻度升级两批次 8 任务（`docs/superpowers/specs/2026-08-13-gpt-ui-refinement-design.md` → `docs/gpt-ui-refinement-plan.md`），含流式光标、空态 stagger 入场、模型选择器弹性下拉、设置页模型档卡片、流式输出平滑打字机、输出速度三档切换。
- **自动化**：vitest 342/342 全绿；`pnpm lint:types` 零错误；`pnpm build` 产出正常。
- **实地验收**（应用内人工确认）：
  - [x] 流式光标跟随最后一个文本节点（不重叠、不脱节）
  - [x] 空态入场 stagger（仅播一次）、下拉弹性动画、选中项加粗
  - [x] 输出速度三档在真实 Dify 流下体感可辨（优雅逐字 / 常规流畅 / 性能直通）
  - [x] 流输出中途切档下一 tick 即时生效；切性能立即直通
  - [x] 优雅档回答结束时欠账快进收尾（不丢字、不拖沓）
  - [x] 档位重启后保留；论文抽屉（AiDrawer）跟随全局速度
- **修订记录**：首版速率表（gentle 2 字/tick、直通阈值 240）在真实 Workflow 大块 delta 到达下三档无区别，修订为 gentle 1 字/tick + 直通阈值 800 保险丝 + finish 欠账快进排空（见 `docs/stream-speed-control-design.md`「2026-08-13 验收修订」）。
