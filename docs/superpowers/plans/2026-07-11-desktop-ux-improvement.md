# ResearchNotion Desktop UX Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver nine coherent desktop experience improvements across navigation, persistence, search, chat, import, reading, paper AI, and feedback.

**Architecture:** Keep business data in the existing SQLite/IPC layers and add a small renderer-only preferences boundary for disposable workspace state. Add focused UI components for search, message actions, notifications, and reader controls while preserving the current App/AppShell/Sidebar/KnowledgePage ownership model.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Testing Library, lucide-react, pdfjs-dist, CSS.

---

### Task 1: Workspace Preferences And Stable Shell

**Files:**
- Create: `src/renderer/state/workspacePreferences.ts`
- Create: `tests/renderer/workspacePreferences.test.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/chatPage.test.tsx`

- [ ] Write failing tests that load defaults for malformed storage, persist `activeTab` and selected conversation ids, restore the last valid tab in `App`, and assert a stable sidebar track in CSS.
- [ ] Run `corepack pnpm vitest run tests/renderer/workspacePreferences.test.ts tests/renderer/chatPage.test.tsx --reporter=verbose` and confirm the new expectations fail.
- [ ] Implement a versioned `readWorkspacePreferences()` / `updateWorkspacePreferences()` module with guarded storage access, wire it into `App`, and set the shell track to `clamp(248px, 20vw, 288px)` with `min-width: 0` on every grid child.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Chat Timeline Continuity

**Files:**
- Modify: `src/renderer/pages/ChatPage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/chatMessage.test.tsx`

- [ ] Write failing tests for automatic latest-message scrolling, a progress placeholder inside the message list, copying assistant output, and retrying a failed send without losing the draft.
- [ ] Run `corepack pnpm vitest run tests/renderer/chatMessage.test.tsx --reporter=verbose` and confirm each new behavior fails for the intended reason.
- [ ] Add a message-list end ref, move compact progress into the timeline while messages exist, add an assistant copy action using `navigator.clipboard`, add a retry action bound to the retained draft, and auto-size the textarea up to a fixed maximum.
- [ ] Re-run the targeted test and confirm it passes.

### Task 3: Reader Fit, Keyboard Navigation And Restoration

**Files:**
- Modify: `src/renderer/state/workspacePreferences.ts`
- Modify: `src/renderer/components/PaperReader.tsx`
- Modify: `src/renderer/pages/KnowledgePage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/paperReader.test.tsx`
- Test: `tests/renderer/knowledgePage.test.tsx`

- [ ] Write failing tests for initial fit-to-width, left/right page navigation outside editable controls, restored page/scale, and a focus-mode toggle.
- [ ] Run the two targeted test files and confirm the new expectations fail.
- [ ] Add `initialPage`, `initialScale`, `onViewStateChange` and focus-mode props; fit after PDF load and resize with `ResizeObserver`; persist per-paper view state and restore the active paper when still present.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 4: Unified Search

**Files:**
- Create: `src/renderer/components/WorkspaceSearch.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/chatPage.test.tsx`

- [ ] Write failing tests that open search from the sidebar and `Ctrl+K`, filter conversations/folders/papers, and navigate to the selected result.
- [ ] Run the targeted test and confirm the search layer is absent.
- [ ] Add a searchable overlay with keyboard navigation and callbacks into App; replace the inert sidebar search button with the real command.
- [ ] Re-run the targeted test and confirm it passes.

### Task 5: Conversation Tree Menus And Drag Feedback

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/chatPage.test.tsx`

- [ ] Write failing tests for right-click rename/delete/move commands, persisted folder expansion, and drag auto-scroll near the list edges.
- [ ] Run the targeted tests and confirm the new controls are missing.
- [ ] Add a compact context menu, local expansion persistence, and edge scrolling during pointer/native drag while retaining the current tested reorder algorithm.
- [ ] Re-run all sidebar drag and menu tests.

### Task 6: Paper Import Drop Surface

**Files:**
- Modify: `src/renderer/pages/KnowledgePage.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify only if required by Electron file paths: `src/shared/ipcTypes.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/files/importPaper.ts`
- Test: `tests/renderer/knowledgePage.test.tsx`
- Test: `tests/unit/importAndIndexPaper.test.ts`

- [ ] Write failing tests for drag-over feedback, accepting PDF/Markdown paths, rejecting unsupported files, and a single import result notification.
- [ ] Run renderer and import workflow tests and confirm the drop path fails.
- [ ] Add a drop target to the knowledge sidebar and the smallest IPC extension needed to import explicit local paths; reuse the existing import/index workflow.
- [ ] Re-run targeted tests and confirm picker import remains unchanged.

### Task 7: Resizable Paper AI Context

**Files:**
- Modify: `src/renderer/components/AiDrawer.tsx`
- Modify: `src/renderer/pages/KnowledgePage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/knowledgePage.test.tsx`

- [ ] Write failing tests for removing selected context, replacing it on the next `Ctrl+I`, retaining per-paper drawer messages, and clamped drawer resizing.
- [ ] Run the targeted test and confirm the controls/state do not exist.
- [ ] Add a resize handle and context remove button; lift per-paper drawer session state to `KnowledgePage` or store it in a keyed hook so switching papers restores the right thread.
- [ ] Re-run targeted tests and confirm current Enter/Shift+Enter behavior remains green.

### Task 8: Notifications, Actionable Health And Accessibility

**Files:**
- Create: `src/renderer/components/ToastRegion.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/pages/KnowledgePage.tsx`
- Modify: `src/renderer/styles/app.css`
- Test: `tests/renderer/chatPage.test.tsx`
- Test: `tests/renderer/knowledgePage.test.tsx`

- [ ] Write failing tests for actionable Dify status, import/copy success notifications, keyboard dismissal, visible focus, and reduced-motion CSS.
- [ ] Run targeted tests and confirm the behavior is absent.
- [ ] Add a single live toast region, route status activation to settings, replace duplicate operation messages with notifications, and add `:focus-visible` / `prefers-reduced-motion` rules.
- [ ] Re-run targeted tests.

### Task 9: Full Verification And Visual Audit

**Files:**
- Modify if evidence reveals defects: files touched by Tasks 1-8 only
- Create: `output/desktop-ux-chat.png`
- Create: `output/desktop-ux-reader.png`
- Create: `output/desktop-ux-search.png`

- [ ] Run `corepack pnpm lint:types`.
- [ ] Run `corepack pnpm test` after aligning `better-sqlite3` for Node.
- [ ] Run `corepack pnpm build`.
- [ ] Rebuild the Electron native module, start `corepack pnpm dev`, and verify chat, search, narrow shell, paper restore, PDF keyboard navigation, AI context, and drag/import paths in the live window.
- [ ] Capture desktop screenshots and inspect them for blank canvases, clipping, overlap, unstable widths and unreadable text.
