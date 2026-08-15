<!-- 已归档（2026-08-15）：已实现的特性设计稿，验收修订记录见 docs/visual-audit-checklist.md。本文仅作历史留档，以 docs/ 根目录现行文档为准。 -->

# 输出速度三档切换设计

- **日期**:2026-08-13
- **状态**:用户已批准(批准后压缩上下文再开工)
- **关联**:[gpt-ui-refinement-design.md](./gpt-ui-refinement-design.md)(GPT 细腻度升级主设计)、打字机输出(commit `f703462`)

## 背景

流式输出打字机节奏已落地:`useStreamingOutput` hook,25ms/tick、常规 4 字/tick、积压 >80 字加速 12 字/tick、>240 字直通、push 同步吐首片、finish 置 drained 定格。用户新增需求:让用户自行调整输出速度,三档切换。

## UI 设计

- **位置**:composer 顶部工具行,上下文选择框(`.composer-context`,`<label>` 内含 LibraryBig 图标 + "上下文" + select)的**右侧**
- **结构**:三段 pill 切换(segmented control),`<div class="stream-speed" role="group" aria-label="输出速度">` 内三个 `<button>`,每档 aria-pressed 表达选中态
- **文案与图标**(lucide,12px 字号):
  - 优雅:Feather 图标 + "优雅"
  - 常规:Gauge 图标 + "常规"
  - 性能:Zap 图标 + "性能"
- **样式**:沿用 tokens(石墨墨×纯白体系):`--rn-radius-sm` 圆角、hover 渐层、active 石墨底白字、紧凑高度约 28px、与模型选择器 chip 同视觉语言

## 三档语义(速率表)

| 档 | 基础速率 | 加速档(积压 >120 字) | 防积压直通(>800 字保险丝) |
|---|---|---|---|
| `gentle` 优雅 | 1 字/tick(≈40 字/秒,GPT 打字机节奏) | 2 字/tick | 仍直通 |
| `normal` 常规 | 4 字/tick(≈160 字/秒) | 12 字/tick | 直通 |
| `fast` 性能 | 直通:不缓冲,出一个显一个 | — | — |

> **2026-08-13 验收修订**:原 gentle=2 字/tick、直通阈值 240 下,真实 Dify 流
> 大块到达(Workflow 非 token 级流式),显示端总能在下一块到达前吐完,三档
> 速率上限从未生效——用户验收"看不出区别"。修订:gentle 降到 1 字/tick
> (明显慢于典型生成速率,积压自然形成欠账),直通阈值抬到 800 作为极端欠账
> 保险丝(单条回答数百字,正常不触发)。代价:慢档会在回答结束后继续打印
> 欠账——`finish` 语义相应改为"欠账排空后才 drained"(排空期间忽略新 push)。

实现统一路径:`SPEED_RATES` 表,fast 档 base/accel 均为 `Infinity` → `Math.min(shown + Infinity, len) = len` 一次全吐,零特判。fast 档 push 同步 tick 全吐后无积压,不排程定时器。

**切换生效时机**:进行中的流,下一 tick 即用新速率(interval 回调经 tickRef 取最新 tick);切到性能档立即直通。

**finish 语义**:`finish(finalText)` 置 finishedRef 后,若显示已追平全文则立即 drained;否则继续排空(定时器按档位推进),排空完成后 drained,调用方落库切换——文字打印到最后一个字才定格,与 GPT 一致。

## 数据模型与持久化

- `src/shared/types.ts`:
  - 新增导出:`export type StreamSpeed = 'gentle' | 'normal' | 'fast'`
  - `AppSettings` 加字段:`streamSpeed: StreamSpeed`(默认 `'normal'`)
- `src/main/settings/settingsService.ts`(key-value 存储,加 key 即可):
  - `keys` 加 `streamSpeed: 'streamSpeed'`
  - `readSettings`:`` (getRaw(keys.streamSpeed) || 'normal') as StreamSpeed ``
  - `save`:`` setRaw(keys.streamSpeed, settings.streamSpeed) ``
- **ChatPage 数据流**(ChatPage 不直接碰 settings,遵循 props 模式,与 `onActivateModel` 一致):
  - `ChatPageProps` 加 `streamSpeed: StreamSpeed` 与 `onStreamSpeedChange: (speed: StreamSpeed) => void`
  - `App.tsx` 已有 settings state(`Promise.all([settings.get(), modelProfiles.list()])` 加载):把 `settings.streamSpeed` 传下;`onStreamSpeedChange` 实现为合并 settings → `desktopApi.settings.save(merged)` → setSettings(注意 save 传全量对象,不能只传 streamSpeed 字段,否则其余字段被覆盖为空)
- **AiDrawer(论文抽屉)**:无切换 UI,但跟随全局速度——组件内 `useEffect` 挂载时 `desktopApi.settings.get()` 读 `streamSpeed` 传入 hook(一次性 IPC,轻量)
- **emptySettings 波及**:`AppSettings` 加字段后,TS 会强制所有构造点补齐。已知构造点(压缩后以 grep 为准):`SettingsPage.tsx` 的 `emptySettings`、`tests/` 各测试的 `emptySettings` mock(chatPage.test.tsx、chatMessage.test.tsx、settingsPage 测试等)、`src/main` 若有 seed 逻辑。全部补 `streamSpeed: 'normal'`

## Hook 改动(useStreamingOutput)

- 签名:`useStreamingOutput(speed: StreamSpeed = 'normal')`,StreamSpeed 从 `shared/types` import
- 速率表:
  ```ts
  const SPEED_RATES: Record<StreamSpeed, { base: number; accel: number }> = {
    gentle: { base: 2, accel: 6 },
    normal: { base: STREAM_RATE, accel: STREAM_ACCEL_RATE },
    fast: { base: Number.POSITIVE_INFINITY, accel: Number.POSITIVE_INFINITY }
  }
  ```
- `tick` 用 `SPEED_RATES[speed]` 取 base/accel;`useCallback` 依赖加 `speed`
- `push` 后仅当积压存在才 `ensureTimer`(fast 档同步全吐后无需排程;对 gentle/normal 无行为变化)
- 保留 `STREAM_RATE = 4` / `STREAM_ACCEL_RATE = 12` 导出作为 normal 档常量(现有测试引用),`STREAM_TICK_MS = 25` / 阈值常量不变

## 文件影响面

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | + `StreamSpeed` 类型;`AppSettings` + `streamSpeed` |
| `src/main/settings/settingsService.ts` | + key、读写、缺省 normal |
| `src/renderer/hooks/useStreamingOutput.ts` | + speed 参数 + `SPEED_RATES` + tick/push 微调 |
| `src/renderer/pages/ChatPage.tsx` | + props;hook 传参;Composer 传 speed/onSpeedChange |
| `src/renderer/components/AiDrawer.tsx` | 挂载读 settings.streamSpeed → hook 传参 |
| `src/renderer/App.tsx` | 传 `streamSpeed`/`onStreamSpeedChange`(合并保存) |
| `src/renderer/styles/app.css` | `.stream-speed` 三档样式 |
| `tests/renderer/useStreamingOutput.test.ts` | + 三档速率用例 |
| `tests/`(settings 相关) | settingsService 读写/缺省用例;ChatPage 三档渲染+切换用例 |
| 各处 `emptySettings` | 补 `streamSpeed: 'normal'` |

## 测试计划(TDD)

1. **hook**:gentle 档 1 字/tick;fast 档 push 即全显且无积压;rerender 切换档位即时生效(换参数后 tick 用新速率);finish 后欠账继续排空、排空完成才 drained
2. **settingsService**:save 后 get 读回 `streamSpeed`;旧库无该 key 时缺省 `'normal'`(注意该测试需真实或 mock DB,沿用现有 settings 测试风格)
3. **ChatPage/Composer**:三档按钮渲染、选中态 aria-pressed、点击调用 `onStreamSpeedChange` 且 hook 收到新档
4. 全量 vitest + tsc 零错误;`npm run rebuild:native` 后重启应用

## 验收标准

- [ ] 速度条位于上下文选择框右侧,三档清晰可见
- [ ] 优雅档明显慢于常规(1 字/tick,GPT 打字机节奏),光标停留更从容
- [ ] 性能档即时全显(无打字机感,出一个显一个)
- [ ] 进行中的流切换档位即时生效
- [ ] 重启应用后速度档保留
- [ ] 论文抽屉流式输出跟随全局速度
