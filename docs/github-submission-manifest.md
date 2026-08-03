# ResearchNotion GitHub 首次提交清单

> 盘点范围：`F:\Alkaid\作业\创新应用综合实训` 及其 `.worktrees\mvp-implementation`，日期 2026-07-22。
>
> 结论：**不要提交 `.worktrees` 目录本身。** 先在 `mvp-implementation` 分支提交，再合并到 `main`；合并后，下面“提交”栏中的文件应出现在仓库根目录。

## 1. 必须提交到 main

以下清单中的目录使用 `/**` 表示该目录下所有文件，避免遗漏。

### 根目录配置和启动入口

```text
.gitignore
README.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
electron.vite.config.ts
index.html
tsconfig.json
tsconfig.node.json
vitest.config.ts
prepare-demo.bat
start-deepseek-bridge.bat
start-dify.bat
start-research-notion.bat
use-dify-agent.bat
use-dify-workflow.bat
```

### 产品源代码

```text
src/**
```

这包含当前全部 Electron 主进程、preload、React 界面、SQLite、Dify 客户端、论文导入、OpenAPI 工具服务、PDF 解析、共享类型与最终 Logo：

```text
src/main/**
src/preload/**
src/renderer/**
src/shared/**
```

尤其不能漏掉：

```text
src/main/agentTools/**
src/main/agentTools/externalSearch.ts
src/main/conversations/**
src/main/dify/citations.ts
src/main/dify/conversationRuntime.ts
src/main/dify/researchAgent.ts
src/main/workflows/ensureFolderDataset.ts
src/main/workflows/paperCardSchema.ts
src/main/settings/memoriesService.ts
src/main/settings/modelKeySync.ts
src/renderer/assets.d.ts
src/renderer/assets/research-notion-mark.svg
src/renderer/components/AcademicMarkdown.tsx
src/renderer/components/CitationStatus.tsx
src/renderer/components/ToastRegion.tsx
src/renderer/components/WorkspaceSearch.tsx
src/renderer/state/workspacePreferences.ts
src/renderer/utils/userFacingError.ts
```

### 运行、配置、验证脚本

提交下列脚本，供同学复现 Dify、工具接入、演示数据和验证过程：

```text
scripts/benchmark-dify-agent-trust.mjs
scripts/benchmark-dify-tool-agent.mjs
scripts/benchmark-runner.mjs
scripts/benchmarkRunner.mjs
scripts/check-dify-research-agent.mjs
scripts/copy-pdf-standard-fonts.mjs
scripts/deepseek-bridge.mjs
scripts/demo-t7-deepseek.ts
scripts/import-dify-agent-tools.mjs
scripts/prepare-demo.ps1
scripts/provision-dify-research-agent.mjs
scripts/provision-dify-tool-agent.mjs
scripts/rebuild-node.cjs
scripts/research-notion-local-settings.mjs
scripts/seed-dify-demo-papers.mjs
scripts/smoke-dify-tool-agent-paper.mjs
scripts/start-dify.ps1
scripts/start-research-notion.ps1
scripts/tool-service-auth.mjs
scripts/use-deepseek-endpoint.mjs
scripts/use-dify-app.mjs
scripts/use-dify-app.ps1
scripts/verify-mvp-demo.mjs
```

### 最终品牌资源

```text
resources/research-notion.ico
resources/research-notion.png
src/renderer/assets/research-notion-mark.svg
```

`research-notion-mark.svg` 是界面中的 Deepsea Logo；PNG/ICO 是 Windows 应用图标。三者都应提交。

### 测试

```text
tests/**
```

包含当前所有 `tests/renderer/**`、`tests/unit/**`、`tests/setup.ts`。不要因为“课程项目”就删除测试；它们是协作时防止回归最有价值的说明。

### 面向项目成员的文档

```text
docs/mvp-runbook.md
docs/dify-research-agent.md
docs/dify-workflow-build-guide.md
docs/research-notion-technical-guide.md
docs/dify-local-deploy.md
docs/visual-audit-checklist.md
docs/github-submission-manifest.md
```

## 2. 不提交到 main

以下内容按目录或通配符完整排除；其中包含范围内的**所有后代文件**都不提交。

### Git、AI 工具和工作树元数据

```text
.git/**
.agents/**
.codex/**
.superpowers/**
.worktrees/**
```

说明：`.worktrees/mvp-implementation` 是 Git worktree，不是产品目录。它的有效源代码通过 Git commit + merge 进入 `main`，绝不能把整个工作树目录嵌套提交。

### 依赖、构建产物和运行时输出

```text
node_modules/**
dist/**
build/**
out/**
output/**
data/**
storage/**
uploads/**
logs/**
*.log
```

当前盘点中：`node_modules/**` 约 19,676 个文件，`dist/**` 83 个文件，`output/**` 424 个文件，`*.log` 38 个文件。它们都能通过安装、构建或测试重新生成；`output/fresh-user-data*/research-notion.sqlite` 和 `output/**/papers/**` 还可能包含个人聊天、测试论文或本机状态。

### 密钥、用户数据和本地环境文件

```text
.env
.env.*
*.local
**/research-notion.sqlite
**/research-notion.sqlite-shm
**/research-notion.sqlite-wal
**/tool-service-token
**/papers/**
```

这些文件可能保存 Dify API Key、工具令牌、论文路径、个人会话或缓存。即便某个测试数据库暂时没有秘密，也不应上传。

### 过程性开发计划与 AI 工具内部记录

```text
docs/superpowers/**
```

其中包括现有已跟踪的：

```text
docs/superpowers/plans/2026-07-08-research-notion-mvp.md
docs/superpowers/plans/2026-07-11-desktop-ux-improvement.md
docs/superpowers/specs/2026-07-08-research-notion-design.md
docs/superpowers/specs/2026-07-11-desktop-ux-improvement-design.md
```

以及当前未跟踪的各份 `2026-07-09`、`2026-07-10`、`2026-07-16` 计划。这些不是软件运行或协作必需材料。若要保留课程过程证据，应另行提炼成普通 `docs/` 下的架构说明或测试报告，不能把工具执行计划直接作为产品源码提交。

### Logo 候选、生成脚本和可视化试验稿

```text
assets/brand/**
scripts/generate-abstract-logo-atlas.py
scripts/generate-brand-candidates.py
scripts/generate-brand-direction-catalog.py
scripts/generate-commercial-logo-exploration.py
scripts/generate-hexflare-round-four.py
scripts/generate-hexstar-round-three.py
scripts/generate-interlaced-ribbon-marks.py
scripts/generate-knot-refinements.py
scripts/generate-monochrome-logo-marks.py
scripts/generate-reference-led-marks.py
scripts/generate-refined-logo-exploration.py
scripts/generate-rn-monograms.py
scripts/generate-signature-logo-exploration.py
scripts/generate-solid-brand-marks.py
scripts/generate-starburst-round-one.py
scripts/generate-starburst-round-two.py
scripts/generate-triad-refinements.py
```

`assets/brand/**` 包含所有 v2-v19、候选图、颜色变体和 HTML 图集。最终采用的 Deepsea Logo 已经有运行时副本：`src/renderer/assets/research-notion-mark.svg`、`resources/research-notion.png`、`resources/research-notion.ico`，因此不需要把数百份候选稿一同提交。

### UI 截图、临时预览和根目录的 Logo 图集

```text
chat-preview.png
knowledge-*.png
ResearchNotion-*.png
output-deepseek-reference.svg
output/**
```

这完整覆盖当前根仓库和工作树里的聊天/知识库预览、PDF 调试截图、Logo 图集、视觉审计图和 Playwright 输出。它们不是运行时资源。

若后续 README 需要展示效果，只挑选 **1-3 张最终、脱敏、命名稳定** 的截图，移动到 `docs/screenshots/` 后再单独提交；当前这些调试截图全部不提交。

### 与课程源码无关的材料

```text
教学通知/**
```

该目录已在根仓库 `.gitignore` 中排除，属于课程通知材料，不属于 ResearchNotion 产品。

## 3. 当前根目录中已存在但需要处理的文件

根仓库的 `main` 目前已跟踪：

```text
.gitignore
README.md
docs/superpowers/plans/2026-07-08-research-notion-mvp.md
docs/superpowers/specs/2026-07-08-research-notion-design.md
```

其中前两项保留；后两项按本清单建议不保留在最终 main。正式合并前，应将这两份 `docs/superpowers/**` 从 Git 索引移除或迁移为面向协作的普通文档，避免主分支留下 AI 工具过程文件。

根目录当前未跟踪的以下文件都不提交：

```text
ResearchNotion-Hexflare-Round-4.png
ResearchNotion-Logo-Atlas.png
ResearchNotion-Logo-Commercial.png
ResearchNotion-Logo-Complete-Catalog.png
ResearchNotion-Logo-Finalists.png
ResearchNotion-Logo-In-App.png
ResearchNotion-Logo-Interlaced.png
ResearchNotion-Logo-Knot-Refinements.png
ResearchNotion-Logo-Monochrome.png
ResearchNotion-Logo-Monograms.png
ResearchNotion-Logo-Reference-Led.png
ResearchNotion-Logo-Refined.png
ResearchNotion-Logo-Signature.png
ResearchNotion-Logo-Solid-Marks.png
ResearchNotion-Logo-v2.png
ResearchNotion-Logo-候选.png
ResearchNotion-Starburst-Round-1.png
ResearchNotion-Starburst-Round-2.png
ResearchNotion-Starburst-Round-3.png
output-deepseek-reference.svg
```

## 4. 合并与首次提交的正确顺序

1. 在 `.worktrees/mvp-implementation` 中按本清单暂存“必须提交”项；
2. 确认没有 API Key、SQLite、论文、日志、截图、`node_modules` 或 `output` 被暂存；
3. 运行 `pnpm lint:types`、`pnpm build` 与关键测试；
4. 在 `mvp-implementation` 分支创建一个或多个清晰提交；
5. 合并该分支到根仓库的 `main`；
6. 在 `main` 移除既有 `docs/superpowers/**`，并补全 `.gitignore` 中对品牌候选、预览截图的规则；
7. 再推送 `main` 到 GitHub。

## 5. 结论

这份清单是合理的：GitHub 保存可复现的源码、配置、测试、正式文档和最终品牌资源；不保存个人数据、密钥、依赖、构建结果、临时截图、Logo 探索和 AI 工具工作状态。
