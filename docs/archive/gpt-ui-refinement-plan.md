<!-- 已归档（2026-08-15）：已完成的实施计划，两批次均已实施并通过验收（2026-08-13）。本文仅作历史留档，以 docs/ 根目录现行文档为准。 -->

# GPT 风格细腻度升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把对话页新功能(模型选择器、dock 排布、进度时间线、流式光标、空态)、AiDrawer 整合与设置页模型档管理打磨到新版 ChatGPT 的细腻度,守住"石墨墨 × 纯白"无彩色体系。

**Architecture:** 三层落地——tokens.css 扩展动效/阴影/圆角/z 序 token → 共享件(模型选择器、提示元素、进度块)一次打磨 → 页面级整合。全部动效纯 CSS(keyframes/transition + `::after`),TSX 仅两处最小改动(删冗余停止 pill、空态播放标记)。

**Tech Stack:** Electron + React 19 + TypeScript,纯 CSS(无动画库),Vitest + Testing Library,lucide-react 图标。

**Spec:** [docs/gpt-ui-refinement-design.md](gpt-ui-refinement-design.md)(六节已与用户确认)

**批次划分**(与设计文档一致):Task 1-6 = 批次 1(对话页 + 抽屉 + 空态/进度);Task 7 = 批次 2(设置页模型档);Task 8 = 全量验收。每批完成后均可独立跑全量测试并交用户真机验收。

## Global Constraints

- 工作目录与 git 仓库:`<仓库根目录>`(develop 分支;外壳 `research_notion` 不是仓库)
- 测试命令:`./node_modules/.bin/vitest run [文件过滤]`;类型检查:`./node_modules/.bin/tsc -p tsconfig.json --noEmit`。**禁止 `pnpm test`/`pnpm lint:types`**(pnpm 非 TTY 假 exit 0,见项目记忆)
- 根字号 15px 锁定(`tests/unit/desktopUxStyles.test.mjs` 断言),任何任务不得改动
- 无彩色体系:不引入暖色/彩色;阴影仅用于浮层(下拉、toast、编辑器面板);错误红 `--rn-error-text` 与链接蓝 `--rn-link` 是仅有的语义色
- 关闭态不带动效(下拉关闭直接卸载、toast 退场直接移除)
- 提交格式:中文 conventional commits(`feat:`/`fix:`/`test:`/`docs:`),提交在 ReasearchNotion 仓库
- 纯 CSS 动效不写单测(设计文档测试策略第 3 条),以真实运行验收;可测行为(token 存在、按钮删除)必须走 TDD
- `@media (prefers-reduced-motion: reduce)` 兜底已存在(app.css L325-334,含 `animation-duration: 0.01ms !important` 与 `transition-duration: 0.01ms !important`),新增动效自动被归零,无需新写兜底规则

---

### Task 1: tokens.css 细腻度 token 扩展(CSS 断言 TDD)

**Files:**
- Modify: `src/renderer/styles/tokens.css`(:root 块末尾追加)
- Test: `tests/unit/desktopUxStyles.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: CSS 变量 `--rn-ease-out`、`--rn-ease-in-out`、`--rn-duration-fast/normal/slow`、`--rn-shadow-dropdown/float`、`--rn-radius-sm/md/lg`、`--rn-z-dropdown/toast/modal`——Task 2/3/5/6/7 全部从这些变量取值

- [ ] **Step 1: 写失败测试**

在 `tests/unit/desktopUxStyles.test.mjs` 的 `describe` 块内、最后一个 `it` 之后追加:

```js
  it('provides GPT refinement tokens for motion, float shadows, radius and z-order', () => {
    expect(tokens).toContain('--rn-ease-out: cubic-bezier(0.16, 1, 0.3, 1);')
    expect(tokens).toContain('--rn-duration-normal: 200ms;')
    expect(tokens).toContain('--rn-shadow-dropdown: 0 8px 28px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);')
    expect(tokens).toContain('--rn-shadow-float: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);')
    expect(tokens).toContain('--rn-radius-md: 12px;')
    expect(tokens).toContain('--rn-z-toast: 40;')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `./node_modules/.bin/vitest run tests/unit/desktopUxStyles.test.mjs`
Expected: FAIL,新 `it` 报 `expected … toContain` 失败(tokens.css 尚无这些变量)

- [ ] **Step 3: 追加 token**

在 `src/renderer/styles/tokens.css` 的 `:root` 块内、`--rn-code-header: #0d0d0d;` 一行之后追加(不改任何现有行):

```css
  /* GPT 细腻度层（2026-08-13）：动效、浮层阴影、圆角阶梯、z 序 */
  --rn-ease-out: cubic-bezier(0.16, 1, 0.3, 1); /* GPT 式快出缓停 */
  --rn-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --rn-duration-fast: 120ms; /* hover 渐层 */
  --rn-duration-normal: 200ms; /* 下拉弹出、按钮反馈 */
  --rn-duration-slow: 320ms; /* 消息淡入 */

  /* 阴影：仅浮层脱离画布时用，静态元素仍靠发丝边 */
  --rn-shadow-dropdown: 0 8px 28px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  --rn-shadow-float: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);

  /* 圆角阶梯（--rn-radius: 10px 保持不动） */
  --rn-radius-sm: 6px;
  --rn-radius-md: 12px;
  --rn-radius-lg: 16px;

  /* z 序 */
  --rn-z-dropdown: 30;
  --rn-z-toast: 40;
  --rn-z-modal: 50;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `./node_modules/.bin/vitest run tests/unit/desktopUxStyles.test.mjs`
Expected: PASS(新旧断言全绿;根字号 15px 断言不受影响)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/tokens.css tests/unit/desktopUxStyles.test.mjs
git commit -m "feat: tokens.css 细腻度层（动效/浮层阴影/圆角阶梯/z 序）"
```

---

### Task 2: 模型选择器 chip + 下拉质感

**Files:**
- Modify: `src/renderer/styles/app.css`(替换 `.model-selector-*` 段落,约 L4298-4383)

**Interfaces:**
- Consumes: Task 1 的 `--rn-ease-out`、`--rn-duration-fast/normal`、`--rn-shadow-dropdown`、`--rn-radius-md`、`--rn-z-dropdown`、既有 `--rn-hover`、`--rn-border-strong`
- Produces: 无新增接口(纯样式);ModelSelector.tsx 结构不动

- [ ] **Step 1: 替换 chip 与下拉样式**

将 app.css 中 `.model-selector-chip { … }` 至 `.model-selector-option.active { … }`(含 `.model-selector-dropdown`、分组、选项的全部规则)整体替换为:

```css
.model-selector-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--rn-border, rgba(0, 0, 0, 0.1));
  border-radius: 9999px;
  background: var(--rn-surface, #ffffff);
  color: var(--rn-text, #0d0d0d);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), border-color var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease);
}

.model-selector-chip:hover {
  background: var(--rn-hover, rgba(0, 0, 0, 0.05));
  border-color: var(--rn-border-strong, rgba(0, 0, 0, 0.15));
}

.model-selector-chip:active {
  transform: scale(0.98);
}

.model-selector-chip svg {
  transition: transform var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}

.model-selector-chip[aria-expanded='true'] svg {
  transform: rotate(180deg);
}

.model-selector-chip:focus-visible {
  outline: 2px solid var(--rn-text, #0d0d0d);
  outline-offset: 2px;
}

.model-selector-label {
  font-weight: 500;
}

.model-selector-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 240px;
  max-width: 100%;
  max-height: 320px;
  overflow-y: auto;
  background: var(--rn-surface, #ffffff);
  border: 1px solid var(--rn-border, rgba(0, 0, 0, 0.1));
  border-radius: var(--rn-radius-md, 12px);
  box-shadow: var(--rn-shadow-dropdown, 0 8px 28px rgba(0, 0, 0, 0.12));
  padding: 6px;
  z-index: var(--rn-z-dropdown, 30);
  transform-origin: bottom left;
  animation: rn-dropdown-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}

@keyframes rn-dropdown-in {
  from {
    opacity: 0;
    transform: scale(0.98) translateY(4px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.model-selector-group + .model-selector-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--rn-border, rgba(0, 0, 0, 0.06));
}

.model-selector-group-label {
  padding: 6px 10px 4px;
  font-size: 11px;
  color: var(--rn-muted, rgba(13, 13, 13, 0.55));
  letter-spacing: 0.02em;
}

.model-selector-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--rn-text, #0d0d0d);
  border-radius: var(--rn-radius-sm, 6px);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  transition: background var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease);
}

.model-selector-option span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-selector-option small {
  font-size: 11px;
  color: var(--rn-muted, rgba(13, 13, 13, 0.5));
}

.model-selector-option:hover {
  background: var(--rn-hover, rgba(0, 0, 0, 0.05));
}

.model-selector-option.active {
  color: var(--rn-text, #0d0d0d);
  font-weight: 600;
}
```

注意:下拉从 chip 上方弹出(`bottom: calc(100% + 6px)`),`transform-origin: bottom left` 使缩放动画从 chip 方向生长。

- [ ] **Step 2: 跑相关测试确认无回归**

Run: `./node_modules/.bin/vitest run tests/renderer/chatPage.test.tsx tests/unit/desktopUxStyles.test.mjs`
Expected: PASS(chatPage 测试不依赖 model-selector 类名;desktopUxStyles 断言不受影响)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/app.css
git commit -m "feat: 模型选择器 GPT 质感（弹性下拉/浮层阴影/按压反馈）"
```

---

### Task 3: dock 排布——toast 浮层化 + 压缩提示收窄 + token 计数 12px

**Files:**
- Modify: `src/renderer/styles/app.css`(`.context-switch-notice`、`.compress-notice`、`.token-counter` 三段)

**Interfaces:**
- Consumes: Task 1 的 `--rn-shadow-float`、`--rn-radius-md`、`--rn-z-toast`、`--rn-ease-out`、`--rn-duration-normal`
- Produces: 无新增接口;ChatPage.tsx 结构不动(notice 仍渲染在 chat-dock 内,靠 `position: fixed` 脱离)

- [ ] **Step 1: 替换 context-switch-notice 为右上角浮层**

将 `.context-switch-notice { … }`(约 L1427-1437)整体替换为:

```css
.context-switch-notice {
  position: fixed;
  top: 12px;
  right: 16px;
  width: auto;
  max-width: min(420px, calc(100vw - 32px));
  margin: 0;
  padding: 8px 14px;
  border: 1px solid var(--rn-border);
  border-radius: var(--rn-radius-md, 12px);
  background: var(--rn-surface);
  box-shadow: var(--rn-shadow-float, 0 4px 20px rgba(0, 0, 0, 0.08));
  color: var(--rn-muted);
  font-size: 12px;
  line-height: 1.4;
  z-index: var(--rn-z-toast, 40);
  animation: rn-toast-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}

@keyframes rn-toast-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

(退场无动画:4 秒后组件卸载,与设计一致。`position: fixed` 相对 viewport,祖先 `.chat-page`/`.chat-dock` 均无 transform,定位不受影响。)

- [ ] **Step 2: 压缩提示收窄为居中 pill + 入场动效**

将 `.compress-notice { … }`(约 L4509-4523)整体替换为:

```css
.compress-notice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: auto;
  max-width: min(768px, 100%);
  margin: 0 auto 8px;
  padding: 6px 14px;
  border: 1px solid var(--rn-border, rgba(0, 0, 0, 0.1));
  border-radius: 9999px;
  background: rgba(192, 57, 43, 0.04);
  font-size: 12px;
  color: var(--rn-text, #0d0d0d);
  animation: rn-rise-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}

@keyframes rn-rise-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

注意:`rn-rise-in` 会被 Task 5(进度块入场)复用,keyframes 只需在本文件出现一次(此处定义)。

- [ ] **Step 3: token 计数字号 12px**

将 `.token-counter` 规则中的 `font-size: 11px;` 改为 `font-size: 12px;`(其余不变;`.drawer-token-row` 复用该类,自动同步)。

- [ ] **Step 4: 跑相关测试确认无回归**

Run: `./node_modules/.bin/vitest run tests/renderer/chatPage.test.tsx tests/unit/desktopUxStyles.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/app.css
git commit -m "feat: dock 排布 GPT 化（toast 浮层/压缩提示 pill/token 12px）"
```

---

### Task 4: 删除冗余 dock 停止 pill(行为测试 TDD)

**Files:**
- Modify: `src/renderer/pages/ChatPage.tsx`(删除 `chat-dock` 内 `sending` 时的 dock-stop-row 代码块)
- Modify: `src/renderer/styles/app.css`(删除 `.dock-stop-row` 与 `.stop-generate-pill` 规则,约 L1439-1461)
- Test: `tests/renderer/chatPage.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: 停止行为收敛到 composer 内发送按钮(aria-label 发送中为 `'停止'`,ChatPage.tsx Composer 内已有);`cancelSend` IPC 调用路径不变

- [ ] **Step 1: 写失败测试**

在 `tests/renderer/chatPage.test.tsx` 的 `stops the active generation with its progress request id` 测试(约 L1365)中,把点击目标从 dock pill 改为 composer 内停止按钮,并新增一条断言:

原行:

```tsx
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
```

改为:

```tsx
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
```

- [ ] **Step 2: 运行测试确认失败**

Run: `./node_modules/.bin/vitest run tests/renderer/chatPage.test.tsx`
Expected: FAIL——`queryByRole('button', { name: '停止生成' })` 仍能找到 dock pill,断言 `not.toBeInTheDocument()` 失败

- [ ] **Step 3: 删除 ChatPage.tsx 的 dock-stop-row 块**

删除 `chat-dock` 内以下整个代码块(含 `sending && activeProgressRequestId` 条件与 `dock-stop-row` div):

```tsx
          {sending && activeProgressRequestId ? (
            <div className="dock-stop-row">
              <button
                type="button"
                className="stop-generate-pill"
                onClick={() => {
                  if (activeProgressRequestId) void desktopApi.conversations.cancelSend?.(activeProgressRequestId)
                }}
              >
                <Square size={12} aria-hidden="true" fill="currentColor" />
                停止生成
              </button>
            </div>
          ) : null}
```

删除后 `chat-dock` 内顺序变为:contextSwitchNotice → modelSelectorRow → compressNotice → composer。`Square` 图标 import 仍在 Composer 的 send-button 中使用,不得删除 import。

- [ ] **Step 4: 删除对应 CSS 规则**

删除 app.css 中 `.dock-stop-row { … }` 与 `.stop-generate-pill { … }`、`.stop-generate-pill:hover { … }` 三整段规则(约 L1439-1461),不留空行残留。

- [ ] **Step 5: 运行测试确认通过**

Run: `./node_modules/.bin/vitest run tests/renderer/chatPage.test.tsx`
Expected: PASS(新断言通过;`停止` 按钮点击仍触发 `cancelSend` 且参数为 progressRequestId)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/ChatPage.tsx src/renderer/styles/app.css tests/renderer/chatPage.test.tsx
git commit -m "refactor: 删除冗余 dock 停止 pill，停止收敛到 composer 内按钮"
```

---

### Task 5: 进度时间线安静化 + 工具 chips + 抽屉整合

**Files:**
- Modify: `src/renderer/styles/app.css`(`.agent-progress`、`.drawer-progress`、`.tool-call-chip`、`.drawer-chip` 段落)

**Interfaces:**
- Consumes: Task 1 的 `--rn-radius-sm`、`--rn-ease-out`、`--rn-duration-fast/normal`;Task 3 定义的 `rn-rise-in` keyframes
- Produces: 无新增接口(AiDrawer.tsx 结构不动,DrawerProgress 类名不变)

- [ ] **Step 1: agent-progress 去卡片边框 + 入场**

将 `.agent-progress { … }` 规则(约 L1661-1670)替换为:

```css
.agent-progress {
  display: grid;
  gap: 8px;
  margin: -3px 14px 12px;
  border: 0;
  border-radius: var(--rn-radius-md, 12px);
  background: #f9f9f9;
  padding: 9px 10px;
  color: var(--rn-muted-2);
  font-size: 12.5px;
  line-height: 1.4;
  animation: rn-rise-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}
```

(呼吸 dot `rn-pulse` 已存在,保持不动;`.agent-progress-header`、`.agent-progress-steps` 及其 done/active/running 态保持不动。)

- [ ] **Step 2: drawer-progress 同步安静化**

将 `.drawer-progress { … }` 规则(约 L3759-3769)中的 `border: 1px solid rgba(0, 0, 0, 0.12);` 改为 `border: 0;`,`border-radius: 8px;` 改为 `border-radius: var(--rn-radius-md, 12px);`,并追加一行:

```css
  animation: rn-rise-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
```

- [ ] **Step 3: 工具 chips 圆角 token 化**

将 `.tool-call-chip` 规则(约 L4245-4255)中的 `border-radius: 4px;` 改为 `border-radius: var(--rn-radius-sm, 6px);`(其余不变)。

- [ ] **Step 4: 抽屉 chip 过渡 token 化**

将 `.drawer-chip` 规则(约 L3780-3791)追加一行 transition(规则内追加,不删现有属性):

```css
  transition: background var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), color var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), border-color var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease);
```

- [ ] **Step 5: 跑相关测试确认无回归**

Run: `./node_modules/.bin/vitest run tests/renderer/ tests/unit/desktopUxStyles.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/app.css
git commit -m "feat: 进度时间线安静化 + 工具 chips/抽屉 chip 细腻度"
```

---

### Task 6: 流式光标 + 空态 stagger 入场 + 建议卡 hover

**Files:**
- Modify: `src/renderer/styles/app.css`(streaming 光标 keyframes、`.chat-hero` 入场动画、`.suggestion-card` hover)
- Modify: `src/renderer/pages/ChatPage.tsx`(空态播放一次标记,约 3 行)

**Interfaces:**
- Consumes: Task 1 的 `--rn-ease-out`、`--rn-duration-slow`、`--rn-shadow-float`
- Produces: ChatPage 内新增 `heroPlayedRef`(模块内私有,无外部消费者);`.chat-hero.hero-played` class 供 CSS 关闭重播

- [ ] **Step 1: 流式光标 CSS**

在 app.css 末尾追加:

```css
/* ============ 流式光标（GPT 标志性细节） ============ */
.message.streaming .markdown-content > :last-child::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 1.1em;
  margin-left: 2px;
  border-radius: 1px;
  background: var(--rn-text);
  vertical-align: -0.15em;
  animation: rn-cursor-blink 1s steps(2, start) infinite;
}

@keyframes rn-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
```

(AcademicMarkdown 无包裹 div,直接渲染 markdown 块到 `.markdown-content`,`:last-child` 即最后一段内容;`prefers-reduced-motion` 下既有兜底 `animation-iteration-count: 1 !important` 使光标常亮。流式结束组件卸载,无清理负担。)

- [ ] **Step 2: 空态 stagger 入场 CSS**

将 `.suggestion-card { … }` 规则(约 L1499-1511)中的 transition 行替换为:

```css
  transition: border-color var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), background var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), transform var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), box-shadow var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease);
```

将 `.suggestion-card:hover { … }` 规则替换为:

```css
.suggestion-card:hover {
  border-color: var(--rn-border-strong);
  background: var(--rn-surface);
  transform: translateY(-1px);
  box-shadow: var(--rn-shadow-float, 0 4px 20px rgba(0, 0, 0, 0.08));
}
```

然后在 app.css 末尾追加空态入场动画:

```css
/* ============ 空态入场序列（仅播一次） ============ */
.chat-hero .empty-avatar,
.chat-hero h1,
.chat-hero .suggestion-card,
.chat-hero .dock-model-row,
.chat-hero .composer {
  animation: rn-hero-in 150ms var(--rn-ease-out, ease) both;
}

.chat-hero h1 {
  animation-delay: 40ms;
}

.chat-hero .suggestion-card:nth-child(1) {
  animation-delay: 80ms;
}

.chat-hero .suggestion-card:nth-child(2) {
  animation-delay: 120ms;
}

.chat-hero .suggestion-card:nth-child(3) {
  animation-delay: 160ms;
}

.chat-hero .suggestion-card:nth-child(4) {
  animation-delay: 200ms;
}

.chat-hero .dock-model-row {
  animation-delay: 240ms;
}

.chat-hero .composer {
  animation-delay: 280ms;
}

.chat-hero.hero-played .empty-avatar,
.chat-hero.hero-played h1,
.chat-hero.hero-played .suggestion-card,
.chat-hero.hero-played .dock-model-row,
.chat-hero.hero-played .composer {
  animation: none;
}

@keyframes rn-hero-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 3: ChatPage 加播放一次标记**

在 `ChatPage` 组件内、`const messageListRef = useRef<HTMLElement | null>(null)` 之后追加:

```tsx
  const heroPlayedRef = useRef(false)

  useEffect(() => {
    if (!hasTimeline) heroPlayedRef.current = true
  }, [hasTimeline])
```

将空态 `<section className="chat-hero">` 改为:

```tsx
        <section className={heroPlayedRef.current ? 'chat-hero hero-played' : 'chat-hero'}>
```

- [ ] **Step 4: 跑相关测试确认无回归**

Run: `./node_modules/.bin/vitest run tests/renderer/ tests/unit/desktopUxStyles.test.mjs && ./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 测试全 PASS,tsc 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/app.css src/renderer/pages/ChatPage.tsx
git commit -m "feat: 流式光标 + 空态 stagger 入场（仅播一次）+ 建议卡 hover 浮起"
```

---

### Task 7: 设置页模型档卡片 + 编辑器浮起面板

**Files:**
- Modify: `src/renderer/styles/app.css`(`.settings-model-card`、`.settings-memory-editor` 段落)

**Interfaces:**
- Consumes: Task 1 的 `--rn-radius-md`、`--rn-shadow-float`、`--rn-ease-out`、`--rn-duration-fast/normal`;Task 3 定义的 `rn-rise-in` keyframes
- Produces: 无新增接口(SettingsPage.tsx 结构不动;MemoryEditor 与 ModelProfileEditor 共用 `.settings-memory-editor`,统一浮起)

**规格修正说明**:设计文档写"input 统一 36px 高",实测现状 `.settings-field input` 已是 44px、focus ring 已存在(`box-shadow: 0 0 0 3px rgb(0 0 0 / 10%)`),均已达宽松标准——**保持 44px 不动**,只做卡片与编辑器面板。

- [ ] **Step 1: 模型档卡片质感 + 入场**

将 `.settings-model-card { … }` 规则(约 L4417-4425)替换为:

```css
.settings-model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--rn-border, rgba(0, 0, 0, 0.1));
  border-radius: var(--rn-radius-md, 12px);
  background: var(--rn-surface, #ffffff);
  transition: border-color var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease), background var(--rn-duration-fast, 120ms) var(--rn-ease-out, ease);
  animation: rn-rise-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}
```

在其后追加 hover 规则,并将 `.settings-model-card.active` 规则(约 L4427-4429)替换为:

```css
.settings-model-card:hover {
  border-color: var(--rn-border-strong, rgba(0, 0, 0, 0.15));
  background: var(--rn-hover, rgba(0, 0, 0, 0.05));
}

.settings-model-card.active {
  border-color: var(--rn-text, #0d0d0d);
  background: #fafafa;
}
```

- [ ] **Step 2: 编辑器浮起面板**

将 `.settings-memory-editor { … }` 规则(约 L3963-3972)替换为:

```css
.settings-memory-editor {
  width: min(780px, 100%);
  display: grid;
  gap: 12px;
  border: 1px solid var(--rn-border-strong);
  border-radius: var(--rn-radius-md, 12px);
  background: var(--rn-surface);
  box-shadow: var(--rn-shadow-float, 0 4px 20px rgba(0, 0, 0, 0.08));
  padding: 16px;
  margin-bottom: 4px;
  animation: rn-rise-in var(--rn-duration-normal, 200ms) var(--rn-ease-out, ease);
}
```

(记忆编辑器与模型档编辑器共用此类,一并浮起,视觉统一。)

- [ ] **Step 3: 跑相关测试确认无回归**

Run: `./node_modules/.bin/vitest run tests/renderer/settingsPage.test.tsx tests/unit/desktopUxStyles.test.mjs`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/app.css
git commit -m "feat: 设置页模型档卡片 GPT 化 + 内联编辑器浮起面板"
```

---

### Task 8: 全量回归 + 类型检查 + 验收交接

**Files:**
- Modify: 无(纯验证)

**Interfaces:**
- Consumes: Task 1-7 全部产出
- Produces: 全量测试通过记录 + 用户验收清单

- [ ] **Step 1: 全量测试**

Run: `./node_modules/.bin/vitest run`
Expected: PASS(34+ 文件全部通过,包括 chatPage/settingsPage/chatMessage/academicMarkdown/desktopUxStyles)

- [ ] **Step 2: 类型检查**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: 无输出(零错误)

- [ ] **Step 3: 用户真实运行验收(交接给用户)**

按设计文档验收清单逐项过,重点:

1. 1280px 窄窗 token 计数不换行、不遮挡(历史 bug 复验)
2. 下拉弹性弹出动画 + 阴影 + 选中项加粗
3. 流式光标闪烁,回答完成消失
4. 空态 stagger 入场;切走再切回不重播
5. 上下文切换 toast 右上角滑入
6. 发送中 dock 无停止 pill,composer 内停止可点
7. 压缩提示窄 pill 红系
8. 设置页模型档卡片 hover/active、编辑器浮起面板
9. 抽屉内下拉不超边界
10. Windows 系统开启"减少动态效果"后动效全部停用

- [ ] **Step 4: 验收通过后记录并提交**

在 `docs/visual-audit-checklist.md` 末尾追加一节:

```markdown
## GPT 细腻度升级验收(2026-08-13)

- [ ] 1280px 窄窗 token 计数不遮挡
- [ ] 模型下拉弹性弹出/阴影/选中加粗
- [ ] 流式光标闪烁并随回答完成消失
- [ ] 空态 stagger 入场仅播一次
- [ ] 上下文切换 toast 右上角浮层
- [ ] 发送中仅 composer 内停止按钮
- [ ] 压缩提示窄 pill
- [ ] 设置页模型档卡片 hover/active + 编辑器浮起面板
- [ ] 抽屉内下拉不超边界
- [ ] 系统"减少动态效果"下动效全停
```

```bash
git add docs/visual-audit-checklist.md
git commit -m "docs: GPT 细腻度升级验收清单"
```

(若验收发现视觉问题,回到对应 Task 修改后重跑 Step 1-2。)
