<!-- 已归档（2026-08-15）：已实施的设计稿，验收结论沉淀在 docs/visual-audit-checklist.md。本文仅作历史留档，以 docs/ 根目录现行文档为准。 -->

# GPT 风格细腻度升级 — 新功能前端优化设计

- **日期**:2026-08-13
- **状态**:已与用户分节确认(六节全部通过)
- **范围**:对话页新功能、抽屉内模型选择、空态 + 发送进度、设置页模型档管理
- **方向**:守住现有"石墨墨 × 纯白"无彩色体系,把新版 ChatGPT 的细腻度做出来(排版层级、弹性动效、柔和浮层阴影、大圆角、流式光标、hover 渐层)

## 背景

[tokens.css](../../src/renderer/styles/tokens.css) 已有一套 ChatGPT 风格 token 体系(层级靠字重与 1px 发丝边,无彩色,只有错误红与链接蓝)。但新功能(模型选择器、token 计数、压缩提示、停止生成、AgentProgress 时间线、设置页模型档)的样式在 [app.css](../../src/renderer/styles/app.css) 末尾堆叠,细节偏平:无动效、无浮层阴影、排布拼贴感重。

## 方案:token 扩展 + 分层打磨(三选一中的方案 A)

1. **第一层 — 设计 token 扩展**:tokens.css 补动效/阴影/圆角阶梯/z 序,所有新组件从 token 取值
2. **第二层 — 共享件一次打磨**:模型选择器 chip/下拉、按钮、卡片统一 GPT 级质感,三处共用
3. **第三层 — 页面级整合**:dock 区排布、进度时间线、设置页、抽屉、空态

分 **2 批提交**(批次 1 = 对话页 + 抽屉 + 空态/进度;批次 2 = 设置页模型档),每批独立验证。

## 设计原则

- 延续 tokens.css 既有 GPT 提炼:静态元素层级靠字重与发丝边,**不用阴影**;阴影仅用于脱离画布的浮层(下拉、toast、内联编辑器面板)
- 无彩色体系不动:不引入暖色、不新增彩色强调;错误红是唯一语义色
- 动效克制:一条精心编排的入场序列胜过零散 hover;关闭不带动效(与 GPT 一致)
- 所有动效从 token 取值,`prefers-reduced-motion` 一条全局规则即可归零
- 根字号 15px 被 `tests/unit/desktopUxStyles.test.mjs` 锁定,本轮不触碰

## 第 1 层:tokens.css 扩展

新增(不改任何现有值):

```css
/* 动效 */
--rn-ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* GPT 式快出缓停 */
--rn-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--rn-duration-fast: 120ms;    /* hover 渐层 */
--rn-duration-normal: 200ms;  /* 下拉弹出、按钮反馈 */
--rn-duration-slow: 320ms;    /* 消息淡入 */

/* 阴影:仅浮层脱离画布时用 */
--rn-shadow-dropdown: 0 8px 28px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
--rn-shadow-float: 0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);

/* 圆角阶梯 */
--rn-radius-sm: 6px;    /* chip 内小元素 */
--rn-radius-md: 12px;   /* 卡片、下拉面板 */
--rn-radius-lg: 16px;   /* composer 面板 */

/* z 序 */
--rn-z-dropdown: 30;  --rn-z-toast: 40;  --rn-z-modal: 50;
```

**刻意不加**:字号变量(现有 11/12/13/15/16px 用量分散,变量化收益低);不改 `--rn-radius: 10px` 现有值。

**全局兜底**:新增 `@media (prefers-reduced-motion: reduce)` 规则,动效 token 全部归零。

## 第 2 层:模型选择器(chip + 下拉)

三处共用(对话页 dock、AiDrawer、空态),一次打磨全受益。

### chip

- 高度 28px → 30px,字号 12px → 13px(500 字重)
- hover:背景 `--rn-hover` + 边框加深 `--rn-border-strong`
- pressed:`scale(0.98)` 按压反馈
- chevron 展开时旋转 180°(200ms)
- focus-visible:2px 石墨 ring

### 下拉面板

| 维度 | 目标 |
|---|---|
| 弹出动效 | `scale(0.98)→1` + `translateY(4px)→0` + 淡入,200ms `--rn-ease-out`,origin 锚定 chip |
| 阴影 | `--rn-shadow-dropdown` |
| 圆角 | `--rn-radius-md`(12px) |
| 选项 | hover 黑纱;选中项 font-weight 600 + Check 图标(保留) |
| 滚动 | `max-height: 320px` + 细滚动条 |
| 宽度 | 对话页 240px;抽屉内 `min-width: 220px; max-width: 100%`(不超抽屉边界) |

**刻意不加**:键盘导航、点击外部关闭动画、分组折叠(YAGNI)。

## 第 3 层:dock 区功能性元素排布

按性质分流:全局反馈进浮层、与对话相关的贴 composer、冗余的删。

- **上下文切换 toast → 右上角浮层**:`position: fixed` 脱离 dock 流,从顶部滑入 20px + 淡入 200ms,z 序 `--rn-z-toast`,4 秒自动退场逻辑不变。纯 CSS 实现,TSX 结构不动
- **dock-stop-row → 删除**:与 composer 内发送按钮(发送中已变停止方块)冗余,ChatPage.tsx 删除 `chat-dock` 内 `sending` 时渲染的 dock-stop-row 代码块
- **压缩提示 → 居中窄 pill**:`inline-flex` 内容宽度自适应,淡入 + 上移 4px 200ms;配色保持错误红系(唯一语义色)
- **token 计数**:字号 11px → 12px;≥80% 变红不变;验收时在 1280px 窄窗实测不换行不遮挡(修复历史问题)
- **模型选择器行**:位置不变(composer 上方居中,GPT 的"输入框上方工具行"),仅受益于 chip 打磨

## 第 4 层:进度时间线 + 流式光标 + 空态

### AgentProgress 时间线(对话页与抽屉 DrawerProgress 同步)

- 容器:去掉卡片边框感,背景 `--rn-blue-soft`(#f9f9f9),对齐 assistant 消息正文宽度
- 状态点:静态 dot → 1.2s 呼吸动画(pulse),完成步实心
- 步骤行:当前步 600 字重、完成步 400
- 工具 chips:圆角统一 `--rn-radius-sm`,间距微调
- 入场:淡入 + 上移 4px,200ms

### 流式光标(GPT 标志性细节)

streaming 消息正文尾部:8px 宽、1.1em 高、石墨色闪烁块,1s 步进闪烁(半亮半灭):

- 纯 CSS `::after` + `steps(2)`,不加 JS 定时器
- 流式结束(`streamingAnswer` 清空)自动消失
- `prefers-reduced-motion` 下常亮不闪

### 空态入场(一条克制的加载序列)

头像+标题、4 张建议卡各错峰 40ms 淡入 + 上移 8px(每段 150ms),composer 最后入场,总时长 < 600ms:

- **仅播放一次**:chat-hero 随 `hasTimeline` 切换会重新挂载(切换会话回到空态 = 重新 mount),因此用 session 级 ref 标记"已播过",标记后挂载不再播动画;新开会话/重启应用重置
- 建议卡 hover:边框加深 + `translateY(-1px)` + `--rn-shadow-float`,120ms

## 第 5 层:设置页模型档管理

| 元素 | 目标 |
|---|---|
| 模型档卡片 | 圆角 `--rn-radius-md`(12px);hover 边框加深 + `--rn-hover` 黑纱 120ms;active 卡 `#fafafa` 底色 |
| 卡片入场 | 保存新档后淡入 200ms |
| 内联编辑器 | 浮起面板:白底 + `--rn-shadow-float` + 12px 圆角 + 16px 内边距 |
| 表单字段 | input 统一 36px 高;label 与控件间距 8px;聚焦态石墨 ring |
| 分组标题 | 保持(13px strong + 发丝线已是 GPT 语言) |

**刻意不加**:设为默认的 loading spinner、模型档拖拽排序(YAGNI)。

## 文件影响面(刻意让 TSX 改动最小)

| 文件 | 改动 |
|---|---|
| `src/renderer/styles/tokens.css` | 扩展动效/阴影/圆角/z 序 token + reduced-motion 兜底 |
| `src/renderer/styles/app.css` | 改新功能相关段落:dock 区、agent-progress、drawer、模型选择器、token/压缩提示、设置页模型档 |
| `src/renderer/pages/ChatPage.tsx` | **仅删 dock-stop-row** |
| 其余 TSX | 不动 |

toast 浮层化、流式光标、空态 stagger、下拉动效全部纯 CSS(`position: fixed` / `::after` + `animation-delay` / keyframes),组件结构不变,回归面极小。

## 测试策略

1. **存量全绿**(回归基线):`tests/renderer/chatPage.test.tsx`、`tests/renderer/settingsPage.test.tsx`、`tests/renderer/chatMessage.test.tsx`、`tests/renderer/academicMarkdown.test.tsx`、`tests/unit/desktopUxStyles.test.mjs`(根字号 15px 锁定不破坏)
2. **新增/更新测试**:
   - chatPage:发送中 dock 停止 pill 不再渲染、composer 内停止按钮仍存在(删除冗余的行为断言)
   - desktopUxStyles:新 token 存在性 + `prefers-reduced-motion` 规则存在性(读 CSS 文本断言,与现有风格一致)
3. **纯 CSS 动效不写单测**,靠真实运行验收(见下)

## 验收清单(真实运行)

- [ ] 1280px 窄窗:token 计数不换行、不遮挡
- [ ] 下拉弹性弹出动画 + 阴影 + 选中项加粗
- [ ] 流式光标闪烁,回答完成消失
- [ ] 空态 stagger 入场,只播一次
- [ ] 上下文切换 toast 右上角浮层滑入
- [ ] 发送中 dock 无停止 pill,composer 内停止可点
- [ ] 压缩提示窄 pill,红系配色
- [ ] 设置页模型档卡片 hover/active 态、编辑器浮起面板
- [ ] 抽屉内下拉不超出边界
- [ ] 系统开启"减少动态效果"时全部动效停用

## 实施批次

- **批次 1**:token 扩展 + 模型选择器 + dock 排布 + 进度/光标/空态 + 抽屉整合(对话页相关全量)
- **批次 2**:设置页模型档卡片与编辑器

每批完成跑全量 vitest + tsc,再交用户真实运行验收。
