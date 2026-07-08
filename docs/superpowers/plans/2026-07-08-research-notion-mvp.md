# ResearchNotion MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working desktop MVP of ResearchNotion: a Notion-like local research knowledge workspace connected to a local Dify instance.

**Architecture:** Use Electron as the desktop shell, React as the renderer UI, SQLite for local metadata, local file storage for imported papers, and Dify HTTP APIs for datasets, document indexing, RAG chat, and paper-card generation. The MVP keeps Dify in the background; users interact with ResearchNotion only.

**Tech Stack:** Electron, electron-vite, React, TypeScript, SQLite, Vitest, Testing Library, pdf.js, react-markdown, lucide-react, Dify HTTP API.

---

## Scope

This plan implements the confirmed MVP only:

- Desktop app shell.
- Default chat page.
- Knowledge page with reader-first layout.
- Settings page for Dify connection.
- Local folders mapped to Dify datasets.
- PDF and Markdown import.
- Paper cards generated after import.
- Context-aware chat for one folder or one paper.
- Hidden AI drawer on the reader page, opened by shortcut or button.

The plan does not implement LaTeX, cloud multi-user accounts, collaboration permissions, online paper search, Zotero/BibTeX import, local LLM inference, or a custom RAG backend.

## File Structure

Create this structure during implementation:

```text
.
├── package.json
├── pnpm-lock.yaml
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vitest.config.ts
├── index.html
├── src
│   ├── main
│   │   ├── main.ts
│   │   ├── ipc.ts
│   │   ├── shortcuts.ts
│   │   ├── db
│   │   │   ├── database.ts
│   │   │   ├── schema.ts
│   │   │   └── repositories.ts
│   │   ├── dify
│   │   │   ├── client.ts
│   │   │   ├── errors.ts
│   │   │   └── types.ts
│   │   ├── files
│   │   │   ├── importPaper.ts
│   │   │   └── storage.ts
│   │   ├── settings
│   │   │   ├── secretBox.ts
│   │   │   └── settingsService.ts
│   │   └── workflows
│   │       ├── generatePaperCard.ts
│   │       └── importAndIndexPaper.ts
│   ├── preload
│   │   └── index.ts
│   ├── renderer
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api
│   │   │   └── desktopApi.ts
│   │   ├── components
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── PaperReader.tsx
│   │   │   ├── AiDrawer.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── pages
│   │   │   ├── ChatPage.tsx
│   │   │   ├── KnowledgePage.tsx
│   │   │   ├── ReportsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── styles
│   │       ├── tokens.css
│   │       └── app.css
│   └── shared
│       ├── context.ts
│       ├── ipcTypes.ts
│       └── types.ts
└── tests
    ├── unit
    │   ├── context.test.ts
    │   ├── difyClient.test.ts
    │   ├── repositories.test.ts
    │   └── settingsService.test.ts
    └── renderer
        ├── chatPage.test.tsx
        ├── knowledgePage.test.tsx
        └── settingsPage.test.tsx
```

Responsibility boundaries:

- `src/shared`: cross-process data shapes and pure helpers.
- `src/main`: Electron main process, local database, Dify calls, file import, workflows.
- `src/preload`: safe IPC bridge exposed to the renderer.
- `src/renderer`: React UI only; no direct filesystem or Dify calls.
- `tests/unit`: pure logic, database, service, and API-client tests.
- `tests/renderer`: React rendering and interaction tests.

---

### Task 1: Scaffold Electron React TypeScript App

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main/main.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/app.css`

- [ ] **Step 1: Create project package metadata**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "research-notion",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc -p tsconfig.json && electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint:types": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.1",
    "better-sqlite3": "^11.8.1",
    "electron-store": "^10.0.1",
    "lucide-react": "^0.468.0",
    "pdfjs-dist": "^4.10.38",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@electron-toolkit/tsconfig": "^1.0.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 3: Add build configuration**

Create `electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
```

Create `tsconfig.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@renderer/*": ["src/renderer/*"]
    },
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.ts", "src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts"],
  "compilerOptions": {
    "composite": true,
    "types": ["node", "electron"]
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: []
  }
})
```

- [ ] **Step 4: Add minimal Electron and React entrypoints**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ResearchNotion</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

Create `src/main/main.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: 'ResearchNotion',
    backgroundColor: '#fbfaf8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

Create `src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('researchNotion', {
  version: '0.1.0'
})
```

Create `src/renderer/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

Create `src/renderer/App.tsx`:

```tsx
export function App(): JSX.Element {
  return (
    <main className="app-root">
      <section className="empty-page">
        <div className="empty-avatar">R</div>
        <h1>今天研究点什么？</h1>
        <p>ResearchNotion MVP shell is running.</p>
      </section>
    </main>
  )
}
```

Create `src/renderer/styles/tokens.css`:

```css
:root {
  --rn-bg: #fbfaf8;
  --rn-surface: #ffffff;
  --rn-sidebar: #f7f6f3;
  --rn-border: #ebe7df;
  --rn-text: #2d2925;
  --rn-muted: #817970;
  --rn-muted-2: #aaa39b;
  --rn-accent: #256f5b;
  --rn-radius: 8px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Create `src/renderer/styles/app.css`:

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
  background: var(--rn-bg);
  color: var(--rn-text);
}

button,
input,
textarea {
  font: inherit;
}

.app-root {
  min-height: 100%;
  display: grid;
  place-items: center;
}

.empty-page {
  text-align: center;
}

.empty-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin: 0 auto 20px;
  border: 1px solid var(--rn-border);
  background: var(--rn-surface);
  box-shadow: 0 6px 20px rgb(0 0 0 / 8%);
  font-size: 32px;
  font-weight: 700;
}
```

- [ ] **Step 5: Verify shell builds**

Run: `pnpm lint:types`

Expected: command exits with code 0.

Run: `pnpm build`

Expected: command exits with code 0 and creates `dist/`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts index.html src
git commit -m "chore: scaffold electron react app"
```

---

### Task 2: Define Shared Domain Types and Context Selection

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/context.ts`
- Create: `src/shared/ipcTypes.ts`
- Create: `tests/unit/context.test.ts`

- [ ] **Step 1: Write failing tests for context labels and validation**

Create `tests/unit/context.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getContextLabel, isContextReadyForChat } from '../../src/shared/context'
import type { ChatContext } from '../../src/shared/types'

describe('chat context helpers', () => {
  it('labels free, folder, and paper contexts', () => {
    expect(getContextLabel({ type: 'free' })).toBe('未选择知识库')
    expect(getContextLabel({ type: 'folder', folderId: 'folder-1', folderName: '毕业设计' })).toBe('毕业设计')
    expect(getContextLabel({ type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' })).toBe('RAG Survey')
  })

  it('requires a Dify-backed context for chat', () => {
    const freeContext: ChatContext = { type: 'free' }
    const folderContext: ChatContext = { type: 'folder', folderId: 'folder-1', folderName: '毕业设计' }
    const paperContext: ChatContext = { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' }

    expect(isContextReadyForChat(freeContext)).toBe(false)
    expect(isContextReadyForChat(folderContext)).toBe(true)
    expect(isContextReadyForChat(paperContext)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/context.test.ts`

Expected: FAIL because `src/shared/context.ts` does not exist.

- [ ] **Step 3: Add shared types and helpers**

Create `src/shared/types.ts`:

```ts
export type FileType = 'pdf' | 'markdown'
export type IndexStatus = 'local-only' | 'indexing' | 'indexed' | 'failed'
export type ReadingStatus = 'unread' | 'reading' | 'finished'

export type Folder = {
  id: string
  name: string
  parentId: string | null
  difyDatasetId: string | null
  createdAt: string
  updatedAt: string
}

export type Paper = {
  id: string
  folderId: string
  title: string
  fileType: FileType
  filePath: string
  difyDocumentId: string | null
  indexStatus: IndexStatus
  createdAt: string
  updatedAt: string
}

export type PaperCard = {
  id: string
  paperId: string
  authors: string
  year: string
  oneSentenceSummary: string
  researchProblem: string
  methodSummary: string
  contributions: string[]
  keywords: string[]
  readingStatus: ReadingStatus
  updatedAt: string
}

export type ChatContext =
  | { type: 'free' }
  | { type: 'folder'; folderId: string; folderName: string }
  | { type: 'paper'; paperId: string; paperTitle: string }

export type Conversation = {
  id: string
  title: string
  folderId: string | null
  context: ChatContext
  createdAt: string
  updatedAt: string
}

export type Citation = {
  paperId: string | null
  paperTitle: string
  snippet: string
  score: number | null
}

export type Message = {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  createdAt: string
}

export type AppSettings = {
  difyBaseUrl: string
  difyAppApiKey: string
  difyKnowledgeApiKey: string
  defaultFolderId: string | null
}
```

Create `src/shared/context.ts`:

```ts
import type { ChatContext } from './types'

export function getContextLabel(context: ChatContext): string {
  if (context.type === 'folder') return context.folderName
  if (context.type === 'paper') return context.paperTitle
  return '未选择知识库'
}

export function isContextReadyForChat(context: ChatContext): boolean {
  return context.type === 'folder' || context.type === 'paper'
}
```

Create `src/shared/ipcTypes.ts`:

```ts
import type { AppSettings, Conversation, Folder, Message, Paper, PaperCard } from './types'

export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export type DesktopApi = {
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<ConnectionTestResult>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string, parentId: string | null): Promise<Folder>
  }
  papers: {
    list(folderId: string): Promise<Array<Paper & { card: PaperCard | null }>>
    import(folderId: string): Promise<Paper>
    read(paperId: string): Promise<{ paper: Paper; markdownText: string | null }>
  }
  conversations: {
    list(): Promise<Conversation[]>
    create(input: Pick<Conversation, 'title' | 'folderId' | 'context'>): Promise<Conversation>
    sendMessage(conversationId: string, content: string): Promise<Message>
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/context.test.ts`

Expected: PASS.

- [ ] **Step 5: Run type check**

Run: `pnpm lint:types`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/shared tests/unit/context.test.ts
git commit -m "feat: define shared domain types"
```

---

### Task 3: Add SQLite Schema and Repositories

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/database.ts`
- Create: `src/main/db/repositories.ts`
- Create: `tests/unit/repositories.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `tests/unit/repositories.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-db-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('repositories', () => {
  it('creates folders and persists Dify dataset ids', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    const repos = createRepositories(db)

    const folder = repos.folders.create({ name: '毕业设计', parentId: null })
    repos.folders.setDifyDatasetId(folder.id, 'dataset-123')

    const folders = repos.folders.list()
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ name: '毕业设计', difyDatasetId: 'dataset-123' })
  })

  it('creates papers and paper cards', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })

    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'pdf',
      filePath: path.join(tempDir, 'rag.pdf')
    })
    repos.papers.setIndexStatus(paper.id, 'indexed', 'doc-1')
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: ['Combines retrieval and generation'],
      keywords: ['RAG', 'retrieval']
    })

    const rows = repos.papers.listByFolder(folder.id)
    expect(rows[0].indexStatus).toBe('indexed')
    expect(rows[0].card?.keywords).toEqual(['RAG', 'retrieval'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/repositories.test.ts`

Expected: FAIL because database files do not exist.

- [ ] **Step 3: Create schema**

Create `src/main/db/schema.ts`:

```ts
export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  dify_dataset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'markdown')),
  file_path TEXT NOT NULL,
  dify_document_id TEXT,
  index_status TEXT NOT NULL CHECK(index_status IN ('local-only', 'indexing', 'indexed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paper_cards (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  authors TEXT NOT NULL,
  year TEXT NOT NULL,
  one_sentence_summary TEXT NOT NULL,
  research_problem TEXT NOT NULL,
  method_summary TEXT NOT NULL,
  contributions_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  reading_status TEXT NOT NULL CHECK(reading_status IN ('unread', 'reading', 'finished')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder_id TEXT,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
```

- [ ] **Step 4: Create database bootstrap**

Create `src/main/db/database.ts`:

```ts
import Database from 'better-sqlite3'
import { schemaSql } from './schema'

export type AppDatabase = Database.Database

export function createDatabase(dbPath: string): AppDatabase {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(schemaSql)
  return db
}
```

- [ ] **Step 5: Create repositories**

Create `src/main/db/repositories.ts` with focused repository objects:

```ts
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { FileType, Folder, IndexStatus, Paper, PaperCard } from '../../shared/types'

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

type CreateFolderInput = { name: string; parentId: string | null }
type CreatePaperInput = { folderId: string; title: string; fileType: FileType; filePath: string }
type PaperCardInput = Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'> & { readingStatus?: PaperCard['readingStatus'] }

export function createRepositories(db: Database.Database) {
  function getCard(paperId: string): PaperCard | null {
    const row = db.prepare(
      `SELECT id, paper_id as paperId, authors, year, one_sentence_summary as oneSentenceSummary,
              research_problem as researchProblem, method_summary as methodSummary,
              contributions_json as contributionsJson, keywords_json as keywordsJson,
              reading_status as readingStatus, updated_at as updatedAt
       FROM paper_cards WHERE paper_id = ?`
    ).get(paperId) as
      | (Omit<PaperCard, 'contributions' | 'keywords'> & { contributionsJson: string; keywordsJson: string })
      | undefined
    if (!row) return null
    return {
      ...row,
      contributions: JSON.parse(row.contributionsJson) as string[],
      keywords: JSON.parse(row.keywordsJson) as string[]
    }
  }

  return {
    folders: {
      create(input: CreateFolderInput): Folder {
        const row: Folder = {
          id: id('folder'),
          name: input.name,
          parentId: input.parentId,
          difyDatasetId: null,
          createdAt: now(),
          updatedAt: now()
        }
        db.prepare(
          `INSERT INTO folders (id, name, parent_id, dify_dataset_id, created_at, updated_at)
           VALUES (@id, @name, @parentId, @difyDatasetId, @createdAt, @updatedAt)`
        ).run(row)
        return row
      },
      list(): Folder[] {
        return db.prepare(
          `SELECT id, name, parent_id as parentId, dify_dataset_id as difyDatasetId,
                  created_at as createdAt, updated_at as updatedAt
           FROM folders ORDER BY created_at ASC`
        ).all() as Folder[]
      },
      setDifyDatasetId(folderId: string, datasetId: string): void {
        db.prepare(`UPDATE folders SET dify_dataset_id = ?, updated_at = ? WHERE id = ?`).run(datasetId, now(), folderId)
      }
    },
    papers: {
      create(input: CreatePaperInput): Paper {
        const row: Paper = {
          id: id('paper'),
          folderId: input.folderId,
          title: input.title,
          fileType: input.fileType,
          filePath: input.filePath,
          difyDocumentId: null,
          indexStatus: 'local-only',
          createdAt: now(),
          updatedAt: now()
        }
        db.prepare(
          `INSERT INTO papers (id, folder_id, title, file_type, file_path, dify_document_id, index_status, created_at, updated_at)
           VALUES (@id, @folderId, @title, @fileType, @filePath, @difyDocumentId, @indexStatus, @createdAt, @updatedAt)`
        ).run(row)
        return row
      },
      setIndexStatus(paperId: string, status: IndexStatus, difyDocumentId: string | null): void {
        db.prepare(`UPDATE papers SET index_status = ?, dify_document_id = ?, updated_at = ? WHERE id = ?`).run(
          status,
          difyDocumentId,
          now(),
          paperId
        )
      },
      listByFolder(folderId: string): Array<Paper & { card: PaperCard | null }> {
        const papers = db.prepare(
          `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                  dify_document_id as difyDocumentId, index_status as indexStatus,
                  created_at as createdAt, updated_at as updatedAt
           FROM papers WHERE folder_id = ? ORDER BY created_at DESC`
        ).all(folderId) as Paper[]
        return papers.map((paper) => ({ ...paper, card: getCard(paper.id) }))
      },
      getCard(paperId: string): PaperCard | null {
        return getCard(paperId)
      }
    },
    paperCards: {
      upsert(input: PaperCardInput): PaperCard {
        const row: PaperCard = {
          id: id('card'),
          paperId: input.paperId,
          authors: input.authors,
          year: input.year,
          oneSentenceSummary: input.oneSentenceSummary,
          researchProblem: input.researchProblem,
          methodSummary: input.methodSummary,
          contributions: input.contributions,
          keywords: input.keywords,
          readingStatus: input.readingStatus ?? 'unread',
          updatedAt: now()
        }
        db.prepare(
          `INSERT INTO paper_cards
             (id, paper_id, authors, year, one_sentence_summary, research_problem, method_summary,
              contributions_json, keywords_json, reading_status, updated_at)
           VALUES
             (@id, @paperId, @authors, @year, @oneSentenceSummary, @researchProblem, @methodSummary,
              @contributionsJson, @keywordsJson, @readingStatus, @updatedAt)
           ON CONFLICT(paper_id) DO UPDATE SET
             authors = excluded.authors,
             year = excluded.year,
             one_sentence_summary = excluded.one_sentence_summary,
             research_problem = excluded.research_problem,
             method_summary = excluded.method_summary,
             contributions_json = excluded.contributions_json,
             keywords_json = excluded.keywords_json,
             reading_status = excluded.reading_status,
             updated_at = excluded.updated_at`
        ).run({
          ...row,
          contributionsJson: JSON.stringify(row.contributions),
          keywordsJson: JSON.stringify(row.keywords)
        })
        return row
      }
    }
  }
}
```

- [ ] **Step 6: Run repository tests**

Run: `pnpm test tests/unit/repositories.test.ts`

Expected: PASS.

- [ ] **Step 7: Run type check**

Run: `pnpm lint:types`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/main/db tests/unit/repositories.test.ts
git commit -m "feat: add local sqlite repositories"
```

---

### Task 4: Add Settings Storage and Dify Connection Test

**Files:**
- Create: `src/main/settings/secretBox.ts`
- Create: `src/main/settings/settingsService.ts`
- Create: `tests/unit/settingsService.test.ts`

- [ ] **Step 1: Write failing settings tests**

Create `tests/unit/settingsService.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/db/database'
import { createSettingsService } from '../../src/main/settings/settingsService'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-settings-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('settings service', () => {
  it('returns empty settings by default and persists Dify settings', async () => {
    const db = createDatabase(path.join(tempDir, 'settings.sqlite'))
    const service = createSettingsService(db, {
      seal: (value) => `sealed:${value}`,
      unseal: (value) => value.replace(/^sealed:/, '')
    })

    await expect(service.get()).resolves.toEqual({
      difyBaseUrl: '',
      difyAppApiKey: '',
      difyKnowledgeApiKey: '',
      defaultFolderId: null
    })

    await service.save({
      difyBaseUrl: 'http://localhost:8080',
      difyAppApiKey: 'app-key',
      difyKnowledgeApiKey: 'knowledge-key',
      defaultFolderId: 'folder-1'
    })

    await expect(service.get()).resolves.toEqual({
      difyBaseUrl: 'http://localhost:8080',
      difyAppApiKey: 'app-key',
      difyKnowledgeApiKey: 'knowledge-key',
      defaultFolderId: 'folder-1'
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/settingsService.test.ts`

Expected: FAIL because settings service files do not exist.

- [ ] **Step 3: Add secret wrapper**

Create `src/main/settings/secretBox.ts`:

```ts
import { safeStorage } from 'electron'

export type SecretBox = {
  seal(value: string): string
  unseal(value: string): string
}

export function createElectronSecretBox(): SecretBox {
  return {
    seal(value: string): string {
      if (!value) return ''
      if (!safeStorage.isEncryptionAvailable()) return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
      return `safe:${safeStorage.encryptString(value).toString('base64')}`
    },
    unseal(value: string): string {
      if (!value) return ''
      if (value.startsWith('safe:')) {
        return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
      }
      if (value.startsWith('plain:')) {
        return Buffer.from(value.slice(6), 'base64').toString('utf8')
      }
      return value
    }
  }
}
```

- [ ] **Step 4: Add settings service**

Create `src/main/settings/settingsService.ts`:

```ts
import type Database from 'better-sqlite3'
import type { AppSettings } from '../../shared/types'
import type { SecretBox } from './secretBox'

const keys = {
  difyBaseUrl: 'difyBaseUrl',
  difyAppApiKey: 'difyAppApiKey',
  difyKnowledgeApiKey: 'difyKnowledgeApiKey',
  defaultFolderId: 'defaultFolderId'
} as const

export function createSettingsService(db: Database.Database, secretBox: SecretBox) {
  function getRaw(key: string): string {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
    return row?.value ?? ''
  }

  function setRaw(key: string, value: string): void {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value)
  }

  return {
    async get(): Promise<AppSettings> {
      return {
        difyBaseUrl: getRaw(keys.difyBaseUrl),
        difyAppApiKey: secretBox.unseal(getRaw(keys.difyAppApiKey)),
        difyKnowledgeApiKey: secretBox.unseal(getRaw(keys.difyKnowledgeApiKey)),
        defaultFolderId: getRaw(keys.defaultFolderId) || null
      }
    },
    async save(settings: AppSettings): Promise<AppSettings> {
      setRaw(keys.difyBaseUrl, settings.difyBaseUrl.trim().replace(/\/+$/, ''))
      setRaw(keys.difyAppApiKey, secretBox.seal(settings.difyAppApiKey.trim()))
      setRaw(keys.difyKnowledgeApiKey, secretBox.seal(settings.difyKnowledgeApiKey.trim()))
      setRaw(keys.defaultFolderId, settings.defaultFolderId ?? '')
      return this.get()
    }
  }
}
```

- [ ] **Step 5: Run settings tests**

Run: `pnpm test tests/unit/settingsService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main/settings tests/unit/settingsService.test.ts
git commit -m "feat: add local settings storage"
```

---

### Task 5: Add Dify API Client

**Files:**
- Create: `src/main/dify/types.ts`
- Create: `src/main/dify/errors.ts`
- Create: `src/main/dify/client.ts`
- Create: `tests/unit/difyClient.test.ts`

- [ ] **Step 1: Write failing Dify client tests with mocked fetch**

Create `tests/unit/difyClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDifyClient } from '../../src/main/dify/client'

describe('Dify client', () => {
  it('creates datasets with the knowledge key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'dataset-1', name: '毕业设计' })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.createDataset('毕业设计')).resolves.toEqual({ id: 'dataset-1', name: '毕业设计' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/datasets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-key' })
      })
    )
  })

  it('sends chat messages with the app key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '这篇论文提出了检索增强生成。',
        conversation_id: 'dify-conv-1',
        retriever_resources: [
          { document_name: 'rag.pdf', content: 'retrieval augmented generation', score: 0.91 }
        ]
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '总结创新点',
      user: 'local-user',
      inputs: { contextType: 'folder', contextId: 'folder-1' }
    })

    expect(result.answer).toContain('检索增强生成')
    expect(result.citations[0].paperTitle).toBe('rag.pdf')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat-messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer app-key' })
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/difyClient.test.ts`

Expected: FAIL because Dify client files do not exist.

- [ ] **Step 3: Add Dify types and error class**

Create `src/main/dify/types.ts`:

```ts
import type { Citation } from '../../shared/types'

export type DifyDataset = {
  id: string
  name: string
}

export type SendChatInput = {
  query: string
  user: string
  inputs: Record<string, string>
  conversationId?: string
}

export type SendChatResult = {
  answer: string
  difyConversationId: string | null
  citations: Citation[]
}
```

Create `src/main/dify/errors.ts`:

```ts
export class DifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message)
    this.name = 'DifyApiError'
  }
}
```

- [ ] **Step 4: Add Dify client**

Create `src/main/dify/client.ts`:

```ts
import { DifyApiError } from './errors'
import type { DifyDataset, SendChatInput, SendChatResult } from './types'
import type { Citation } from '../../shared/types'

type FetchImpl = typeof fetch

type DifyClientOptions = {
  baseUrl: string
  appApiKey: string
  knowledgeApiKey: string
  fetchImpl?: FetchImpl
}

async function readJson(response: Response): Promise<unknown> {
  if (response.ok) return response.json()
  const body = await response.text()
  throw new DifyApiError(`Dify request failed with status ${response.status}`, response.status, body)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function mapCitations(resources: unknown): Citation[] {
  if (!Array.isArray(resources)) return []
  return resources.map((item) => {
    const resource = item as Record<string, unknown>
    return {
      paperId: null,
      paperTitle: String(resource.document_name ?? resource.documentName ?? 'Unknown source'),
      snippet: String(resource.content ?? ''),
      score: typeof resource.score === 'number' ? resource.score : null
    }
  })
}

export function createDifyClient(options: DifyClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async createDataset(name: string): Promise<DifyDataset> {
      const response = await fetchImpl(`${baseUrl}/v1/datasets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.knowledgeApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      })
      const json = (await readJson(response)) as Record<string, unknown>
      return { id: String(json.id), name: String(json.name ?? name) }
    },
    async sendChatMessage(input: SendChatInput): Promise<SendChatResult> {
      const response = await fetchImpl(`${baseUrl}/v1/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.appApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: input.inputs,
          query: input.query,
          response_mode: 'blocking',
          conversation_id: input.conversationId,
          user: input.user
        })
      })
      const json = (await readJson(response)) as Record<string, unknown>
      return {
        answer: String(json.answer ?? ''),
        difyConversationId: typeof json.conversation_id === 'string' ? json.conversation_id : null,
        citations: mapCitations(json.retriever_resources)
      }
    }
  }
}
```

- [ ] **Step 5: Run Dify client tests**

Run: `pnpm test tests/unit/difyClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main/dify tests/unit/difyClient.test.ts
git commit -m "feat: add dify api client"
```

---

### Task 6: Wire IPC Bridge and Main Services

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/api/desktopApi.ts`

- [ ] **Step 1: Add preload API typing**

Create `src/renderer/api/desktopApi.ts`:

```ts
import type { DesktopApi } from '../../shared/ipcTypes'

declare global {
  interface Window {
    researchNotion: DesktopApi
  }
}

export const desktopApi: DesktopApi = window.researchNotion
```

- [ ] **Step 2: Update preload bridge with IPC channels**

Replace `src/preload/index.ts` with:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, Conversation } from '../shared/types'
import type { DesktopApi } from '../shared/ipcTypes'

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
    testConnection: (settings: AppSettings) => ipcRenderer.invoke('settings:testConnection', settings)
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name: string, parentId: string | null) => ipcRenderer.invoke('folders:create', { name, parentId })
  },
  papers: {
    list: (folderId: string) => ipcRenderer.invoke('papers:list', { folderId }),
    import: (folderId: string) => ipcRenderer.invoke('papers:import', { folderId }),
    read: (paperId: string) => ipcRenderer.invoke('papers:read', { paperId })
  },
  conversations: {
    list: () => ipcRenderer.invoke('conversations:list'),
    create: (input: Pick<Conversation, 'title' | 'folderId' | 'context'>) => ipcRenderer.invoke('conversations:create', input),
    sendMessage: (conversationId: string, content: string) =>
      ipcRenderer.invoke('conversations:sendMessage', { conversationId, content })
  }
}

contextBridge.exposeInMainWorld('researchNotion', api)
```

- [ ] **Step 3: Add main IPC registration skeleton**

Create `src/main/ipc.ts`:

```ts
import { ipcMain } from 'electron'
import type { AppSettings } from '../shared/types'

export type IpcServices = {
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<{ ok: boolean; message: string }>
  }
}

export function registerIpc(services: IpcServices): void {
  ipcMain.handle('settings:get', () => services.settings.get())
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => services.settings.save(settings))
  ipcMain.handle('settings:testConnection', (_event, settings: AppSettings) => services.settings.testConnection(settings))
}
```

- [ ] **Step 4: Initialize database and settings in main**

Modify `src/main/main.ts` so `app.whenReady()` creates an app data directory database, settings service, and IPC handlers before creating the window:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { createDatabase } from './db/database'
import { registerIpc } from './ipc'
import { createElectronSecretBox } from './settings/secretBox'
import { createSettingsService } from './settings/settingsService'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: 'ResearchNotion',
    backgroundColor: '#fbfaf8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const db = createDatabase(path.join(app.getPath('userData'), 'research-notion.sqlite'))
  const settingsService = createSettingsService(db, createElectronSecretBox())
  registerIpc({
    settings: {
      get: () => settingsService.get(),
      save: (settings) => settingsService.save(settings),
      testConnection: async (settings) => {
        if (!settings.difyBaseUrl || !settings.difyAppApiKey || !settings.difyKnowledgeApiKey) {
          return { ok: false, message: '请填写 Dify 地址、App API Key 和 Knowledge API Key。' }
        }
        return { ok: true, message: '配置格式完整。下一步将连接 Dify API。' }
      }
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: Run verification**

Run: `pnpm lint:types`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main src/preload src/renderer/api
git commit -m "feat: wire desktop ipc bridge"
```

---

### Task 7: Build Notion-Style App Shell

**Files:**
- Create: `src/renderer/components/AppShell.tsx`
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/EmptyState.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/app.css`
- Create: `tests/renderer/chatPage.test.tsx`

- [ ] **Step 1: Write renderer test for default chat landing**

Create `tests/renderer/chatPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/renderer/App'

describe('App shell', () => {
  it('opens on the chat page with Notion-like prompt', () => {
    render(<App />)
    expect(screen.getByText('科研工作空间')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('今天研究点什么？')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/renderer/chatPage.test.tsx`

Expected: FAIL because shell components are not implemented.

- [ ] **Step 3: Add shell components**

Create `src/renderer/components/EmptyState.tsx`:

```tsx
type EmptyStateProps = {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-avatar">R</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  )
}
```

Create `src/renderer/components/Sidebar.tsx`:

```tsx
export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="workspace-title">
        <div className="workspace-mark">R</div>
        <span>科研工作空间</span>
      </div>
      <nav className="sidebar-nav" aria-label="历史对话">
        <div className="sidebar-section-title">最近</div>
        <button className="sidebar-item active">Notion 和模型功能介绍</button>
        <button className="sidebar-item">RAG 评估指标讨论</button>
        <button className="sidebar-item">论文摘要草稿</button>
        <div className="sidebar-section-title">文件夹</div>
        <button className="sidebar-item">毕业设计</button>
        <button className="sidebar-item">创新实训</button>
      </nav>
      <button className="new-chat-button">全新对话</button>
    </aside>
  )
}
```

Create `src/renderer/components/AppShell.tsx`:

```tsx
import { Sidebar } from './Sidebar'

type AppTab = 'chat' | 'knowledge' | 'reports' | 'settings'

type AppShellProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: React.ReactNode
}

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'chat', label: '对话' },
  { id: 'knowledge', label: '知识库' },
  { id: 'reports', label: '报告' },
  { id: 'settings', label: '设置' }
]

export function AppShell({ activeTab, onTabChange, children }: AppShellProps): JSX.Element {
  return (
    <div className="app-frame">
      <header className="topbar" role="tablist">
        <span className="topbar-title">ResearchNotion</span>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'topbar-tab active' : 'topbar-tab'}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <span className="topbar-status">Dify 本地连接</span>
      </header>
      <div className="app-layout">
        <Sidebar />
        <section className="main-panel">{children}</section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement chat landing in App**

Replace `src/renderer/App.tsx`:

```tsx
import { useState } from 'react'
import { AppShell } from './components/AppShell'

type AppTab = 'chat' | 'knowledge' | 'reports' | 'settings'

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('chat')

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'chat' ? (
        <div className="chat-hero">
          <div className="empty-avatar">R</div>
          <h1>今天研究点什么？</h1>
          <div className="composer">
            <div className="composer-notice">选择论文库后，回答会优先引用你上传的资料。</div>
            <textarea placeholder="询问论文、比较方法、提取创新点、解释术语..." />
            <div className="quick-actions">
              <button>摘要</button>
              <button>术语解释</button>
              <button>创新点</button>
              <button>方法对比</button>
              <button>综述提纲</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h1>{activeTab}</h1>
        </div>
      )}
    </AppShell>
  )
}
```

- [ ] **Step 5: Add shell CSS**

Append to `src/renderer/styles/app.css`:

```css
.app-frame {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-rows: 42px 1fr;
  background: var(--rn-surface);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-bottom: 1px solid var(--rn-border);
  background: var(--rn-bg);
}

.topbar-title {
  font-weight: 700;
  margin-right: 12px;
}

.topbar-tab {
  border: 0;
  background: transparent;
  color: var(--rn-muted);
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
}

.topbar-tab.active {
  background: var(--rn-surface);
  color: var(--rn-text);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--rn-border);
}

.topbar-status {
  margin-left: auto;
  color: var(--rn-muted-2);
  font-size: 12px;
}

.app-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 286px 1fr;
}

.sidebar {
  min-height: 0;
  background: var(--rn-sidebar);
  border-right: 1px solid var(--rn-border);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
}

.workspace-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #e9ded2;
  display: grid;
  place-items: center;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-section-title {
  color: var(--rn-muted-2);
  font-size: 12px;
  font-weight: 700;
  margin: 12px 6px 4px;
}

.sidebar-item {
  min-height: 32px;
  border: 0;
  background: transparent;
  text-align: left;
  border-radius: 7px;
  color: var(--rn-muted);
  padding: 6px 8px;
}

.sidebar-item.active {
  background: #ece9e3;
  color: var(--rn-text);
  font-weight: 700;
}

.new-chat-button {
  margin-top: auto;
  height: 42px;
  border-radius: 22px;
  border: 1px solid var(--rn-border);
  background: var(--rn-surface);
  color: var(--rn-muted);
  font-weight: 700;
}

.main-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.chat-hero {
  height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  transform: translateY(-36px);
}

.chat-hero h1 {
  margin: 0 0 28px;
  font-size: 34px;
  letter-spacing: 0;
}

.composer {
  width: min(760px, calc(100% - 96px));
  border: 1px solid var(--rn-border);
  border-radius: 22px;
  background: var(--rn-surface);
  box-shadow: 0 8px 28px rgb(0 0 0 / 8%);
  overflow: hidden;
}

.composer-notice {
  background: #edf7ff;
  color: #48759e;
  padding: 10px 22px;
  font-size: 13px;
}

.composer textarea {
  width: calc(100% - 44px);
  min-height: 96px;
  border: 0;
  outline: 0;
  resize: none;
  padding: 22px;
  font-size: 18px;
  color: var(--rn-text);
}

.quick-actions {
  display: flex;
  gap: 12px;
  padding: 0 18px 16px;
}

.quick-actions button {
  border: 0;
  background: transparent;
  color: var(--rn-muted);
  cursor: pointer;
}
```

- [ ] **Step 6: Run renderer test**

Run: `pnpm test tests/renderer/chatPage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/renderer tests/renderer/chatPage.test.tsx
git commit -m "feat: add notion style app shell"
```

---

### Task 8: Implement Settings Page

**Files:**
- Create: `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `tests/renderer/settingsPage.test.tsx`

- [ ] **Step 1: Write settings page test**

Create `tests/renderer/settingsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../../src/renderer/pages/SettingsPage'

beforeEach(() => {
  window.researchNotion = {
    settings: {
      get: vi.fn().mockResolvedValue({
        difyBaseUrl: '',
        difyAppApiKey: '',
        difyKnowledgeApiKey: '',
        defaultFolderId: null
      }),
      save: vi.fn().mockImplementation(async (settings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: '连接配置有效。' })
    },
    folders: { list: vi.fn(), create: vi.fn() },
    papers: { list: vi.fn(), import: vi.fn(), read: vi.fn() },
    conversations: { list: vi.fn(), create: vi.fn(), sendMessage: vi.fn() }
  }
})

describe('SettingsPage', () => {
  it('saves Dify settings through desktop API', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.type(await screen.findByLabelText('Dify 服务地址'), 'http://localhost:8080')
    await user.type(screen.getByLabelText('Dify App API Key'), 'app-key')
    await user.type(screen.getByLabelText('Dify Knowledge API Key'), 'knowledge-key')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(window.researchNotion.settings.save).toHaveBeenCalledWith({
      difyBaseUrl: 'http://localhost:8080',
      difyAppApiKey: 'app-key',
      difyKnowledgeApiKey: 'knowledge-key',
      defaultFolderId: null
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/renderer/settingsPage.test.tsx`

Expected: FAIL because `SettingsPage` does not exist.

- [ ] **Step 3: Add SettingsPage**

Create `src/renderer/pages/SettingsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { desktopApi } from '../api/desktopApi'
import type { AppSettings } from '../../shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  defaultFolderId: null
}

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(emptySettings)
  const [status, setStatus] = useState('')

  useEffect(() => {
    void desktopApi.settings.get().then(setSettings)
  }, [])

  function updateField(field: keyof AppSettings, value: string): void {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  async function save(): Promise<void> {
    const saved = await desktopApi.settings.save(settings)
    setSettings(saved)
    setStatus('设置已保存。')
  }

  async function testConnection(): Promise<void> {
    const result = await desktopApi.settings.testConnection(settings)
    setStatus(result.message)
  }

  return (
    <div className="settings-page">
      <h1>设置</h1>
      <p>在这里配置本地 Dify。大模型 Provider API Key 先在 Dify 控制台中配置。</p>
      <label>
        Dify 服务地址
        <input value={settings.difyBaseUrl} onChange={(event) => updateField('difyBaseUrl', event.target.value)} />
      </label>
      <label>
        Dify App API Key
        <input value={settings.difyAppApiKey} onChange={(event) => updateField('difyAppApiKey', event.target.value)} />
      </label>
      <label>
        Dify Knowledge API Key
        <input value={settings.difyKnowledgeApiKey} onChange={(event) => updateField('difyKnowledgeApiKey', event.target.value)} />
      </label>
      <div className="settings-actions">
        <button onClick={save}>保存设置</button>
        <button onClick={testConnection}>测试连接</button>
      </div>
      {status ? <p role="status">{status}</p> : null}
    </div>
  )
}
```

- [ ] **Step 4: Route settings tab**

Modify `src/renderer/App.tsx` so `activeTab === 'settings'` renders `<SettingsPage />`.

- [ ] **Step 5: Add CSS for settings form**

Append to `src/renderer/styles/app.css`:

```css
.settings-page {
  max-width: 760px;
  margin: 56px auto;
  padding: 0 32px;
}

.settings-page h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.settings-page p {
  color: var(--rn-muted);
}

.settings-page label {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  color: var(--rn-text);
  font-weight: 700;
}

.settings-page input {
  height: 38px;
  border: 1px solid var(--rn-border);
  border-radius: 8px;
  padding: 0 12px;
  background: var(--rn-surface);
}

.settings-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.settings-actions button {
  min-height: 36px;
  border: 1px solid var(--rn-border);
  border-radius: 8px;
  background: var(--rn-surface);
  padding: 0 14px;
}
```

- [ ] **Step 6: Run tests and type check**

Run: `pnpm test tests/renderer/settingsPage.test.tsx`

Expected: PASS.

Run: `pnpm lint:types`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/renderer tests/renderer/settingsPage.test.tsx
git commit -m "feat: add dify settings page"
```

---

### Task 9: Implement Knowledge Reader Page

**Files:**
- Create: `src/renderer/pages/KnowledgePage.tsx`
- Create: `src/renderer/components/PaperReader.tsx`
- Create: `src/renderer/components/AiDrawer.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `tests/renderer/knowledgePage.test.tsx`

- [ ] **Step 1: Write knowledge page layout test**

Create `tests/renderer/knowledgePage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgePage } from '../../src/renderer/pages/KnowledgePage'

beforeEach(() => {
  window.researchNotion = {
    settings: { get: vi.fn(), save: vi.fn(), testConnection: vi.fn() },
    folders: {
      list: vi.fn().mockResolvedValue([{ id: 'folder-1', name: '毕业设计', parentId: null, difyDatasetId: 'dataset-1', createdAt: '', updatedAt: '' }]),
      create: vi.fn()
    },
    papers: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'paper-1',
          folderId: 'folder-1',
          title: 'RAG Survey',
          fileType: 'markdown',
          filePath: 'rag.md',
          difyDocumentId: 'doc-1',
          indexStatus: 'indexed',
          createdAt: '',
          updatedAt: '',
          card: null
        }
      ]),
      import: vi.fn(),
      read: vi.fn().mockResolvedValue({
        paper: {
          id: 'paper-1',
          folderId: 'folder-1',
          title: 'RAG Survey',
          fileType: 'markdown',
          filePath: 'rag.md',
          difyDocumentId: 'doc-1',
          indexStatus: 'indexed',
          createdAt: '',
          updatedAt: ''
        },
        markdownText: '# RAG Survey\\n\\nRetrieval augmented generation.'
      })
    },
    conversations: { list: vi.fn(), create: vi.fn(), sendMessage: vi.fn() }
  }
})

describe('KnowledgePage', () => {
  it('shows folders, papers, reader, and hidden AI drawer trigger', async () => {
    const user = userEvent.setup()
    render(<KnowledgePage />)

    expect(await screen.findByText('毕业设计')).toBeInTheDocument()
    await user.click(await screen.findByText('RAG Survey'))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '打开 AI 问答栏' }))
    expect(screen.getByText('对当前论文提问')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/renderer/knowledgePage.test.tsx`

Expected: FAIL because page and components do not exist.

- [ ] **Step 3: Add PaperReader**

Create `src/renderer/components/PaperReader.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'
import type { Paper } from '../../shared/types'

type PaperReaderProps = {
  paper: Paper | null
  markdownText: string | null
}

export function PaperReader({ paper, markdownText }: PaperReaderProps): JSX.Element {
  if (!paper) {
    return (
      <div className="reader-empty">
        <h1>选择一篇论文开始阅读</h1>
        <p>支持 PDF 和 Markdown。LaTeX 不在 MVP 范围内。</p>
      </div>
    )
  }

  if (paper.fileType === 'markdown') {
    return (
      <article className="paper-page">
        <ReactMarkdown>{markdownText ?? ''}</ReactMarkdown>
      </article>
    )
  }

  return (
    <article className="paper-page">
      <h1>{paper.title}</h1>
      <p>PDF 预览组件将在文件导入流程完成后接入 pdf.js。</p>
    </article>
  )
}
```

- [ ] **Step 4: Add AiDrawer**

Create `src/renderer/components/AiDrawer.tsx`:

```tsx
type AiDrawerProps = {
  open: boolean
  onClose: () => void
}

export function AiDrawer({ open, onClose }: AiDrawerProps): JSX.Element | null {
  if (!open) return null
  return (
    <aside className="ai-drawer">
      <header>
        <strong>对当前论文提问</strong>
        <button onClick={onClose}>关闭</button>
      </header>
      <div className="ai-suggestions">
        <button>解释当前论文的核心创新点</button>
        <button>把 Method 部分转成中文阅读笔记</button>
        <button>分析实验指标和局限性</button>
      </div>
      <textarea placeholder="对当前论文提问..." />
    </aside>
  )
}
```

- [ ] **Step 5: Add KnowledgePage**

Create `src/renderer/pages/KnowledgePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { desktopApi } from '../api/desktopApi'
import { AiDrawer } from '../components/AiDrawer'
import { PaperReader } from '../components/PaperReader'
import type { Folder, Paper, PaperCard } from '../../shared/types'

type PaperRow = Paper & { card: PaperCard | null }

export function KnowledgePage(): JSX.Element {
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [activePaper, setActivePaper] = useState<Paper | null>(null)
  const [markdownText, setMarkdownText] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    void desktopApi.folders.list().then((rows) => {
      setFolders(rows)
      setActiveFolderId(rows[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!activeFolderId) return
    void desktopApi.papers.list(activeFolderId).then(setPapers)
  }, [activeFolderId])

  async function openPaper(paperId: string): Promise<void> {
    const result = await desktopApi.papers.read(paperId)
    setActivePaper(result.paper)
    setMarkdownText(result.markdownText)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setDrawerOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-list">
        <h2>我的论文库</h2>
        <div className="folder-list">
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={folder.id === activeFolderId ? 'folder-row active' : 'folder-row'}
              onClick={() => setActiveFolderId(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
        <h3>论文</h3>
        <div className="paper-list">
          {papers.map((paper) => (
            <button key={paper.id} className="paper-row" onClick={() => void openPaper(paper.id)}>
              <strong>{paper.title}</strong>
              <span>{paper.fileType.toUpperCase()} · {paper.indexStatus}</span>
            </button>
          ))}
        </div>
        <button className="import-button">导入 PDF / Markdown</button>
      </aside>
      <main className="reader-panel">
        <header className="reader-header">
          <span>{activePaper?.title ?? '知识库'}</span>
          <button aria-label="打开 AI 问答栏" onClick={() => setDrawerOpen(true)}>AI</button>
        </header>
        <PaperReader paper={activePaper} markdownText={markdownText} />
        <AiDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Route knowledge tab and add CSS**

Modify `src/renderer/App.tsx` so `activeTab === 'knowledge'` renders `<KnowledgePage />`.

Append CSS for `.knowledge-layout`, `.knowledge-list`, `.reader-panel`, `.paper-page`, and `.ai-drawer` following the visual companion mockup: left pane width `330px`, reader max width `780px`, drawer width `360px`, white surfaces, `var(--rn-border)`, and 8-12px radii.

- [ ] **Step 7: Run tests**

Run: `pnpm test tests/renderer/knowledgePage.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/renderer tests/renderer/knowledgePage.test.tsx
git commit -m "feat: add reader first knowledge page"
```

---

### Task 10: Implement File Import and Dify Index Workflow

**Files:**
- Create: `src/main/files/storage.ts`
- Create: `src/main/files/importPaper.ts`
- Create: `src/main/workflows/importAndIndexPaper.ts`
- Modify: `src/main/dify/client.ts`
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Extend Dify client with file upload**

Add this method to `createDifyClient` in `src/main/dify/client.ts`:

```ts
async uploadDocumentByFile(input: {
  datasetId: string
  file: File | Blob
  filename: string
}): Promise<{ documentId: string }> {
  const form = new FormData()
  form.append('data', JSON.stringify({
    indexing_technique: 'high_quality',
    process_rule: { mode: 'automatic' }
  }))
  form.append('file', input.file, input.filename)

  const response = await fetchImpl(`${baseUrl}/v1/datasets/${input.datasetId}/document/create-by-file`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.knowledgeApiKey}`
    },
    body: form
  })
  const json = (await readJson(response)) as Record<string, unknown>
  const document = json.document as Record<string, unknown> | undefined
  return { documentId: String(document?.id ?? json.id) }
}
```

- [ ] **Step 2: Add local file storage helper**

Create `src/main/files/storage.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

export function getPapersDir(userDataDir: string): string {
  return path.join(userDataDir, 'papers')
}

export async function ensurePapersDir(userDataDir: string): Promise<string> {
  const dir = getPapersDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function copyPaperToStorage(input: {
  userDataDir: string
  sourcePath: string
  paperId: string
  extension: string
}): Promise<string> {
  const dir = await ensurePapersDir(input.userDataDir)
  const target = path.join(dir, `${input.paperId}${input.extension}`)
  await fs.copyFile(input.sourcePath, target)
  return target
}
```

- [ ] **Step 3: Add import workflow**

Create `src/main/workflows/importAndIndexPaper.ts`:

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileType, Paper } from '../../shared/types'
import { copyPaperToStorage } from '../files/storage'

type ImportWorkflowInput = {
  folderId: string
  folderDatasetId: string
  sourcePath: string
  userDataDir: string
  repos: ReturnType<typeof import('../db/repositories').createRepositories>
  dify: {
    uploadDocumentByFile(input: { datasetId: string; file: Blob; filename: string }): Promise<{ documentId: string }>
  }
}

function detectFileType(sourcePath: string): FileType {
  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  throw new Error('MVP 仅支持 PDF 和 Markdown 文件。')
}

export async function importAndIndexPaper(input: ImportWorkflowInput): Promise<Paper> {
  const fileType = detectFileType(input.sourcePath)
  const title = path.basename(input.sourcePath, path.extname(input.sourcePath))
  const paper = input.repos.papers.create({
    folderId: input.folderId,
    title,
    fileType,
    filePath: input.sourcePath
  })
  const storedPath = await copyPaperToStorage({
    userDataDir: input.userDataDir,
    sourcePath: input.sourcePath,
    paperId: paper.id,
    extension: path.extname(input.sourcePath)
  })
  const bytes = await fs.readFile(storedPath)
  input.repos.papers.setIndexStatus(paper.id, 'indexing', null)
  const result = await input.dify.uploadDocumentByFile({
    datasetId: input.folderDatasetId,
    file: new Blob([bytes]),
    filename: path.basename(storedPath)
  })
  input.repos.papers.setIndexStatus(paper.id, 'indexed', result.documentId)
  return { ...paper, filePath: storedPath, difyDocumentId: result.documentId, indexStatus: 'indexed' }
}
```

- [ ] **Step 4: Wire IPC import**

Modify `src/main/ipc.ts` to add `papers:import` handler that:

1. Opens an Electron file dialog limited to `pdf`, `md`, `markdown`.
2. Loads the selected folder from repositories.
3. Rejects the import if the folder has no `difyDatasetId`.
4. Calls `importAndIndexPaper`.
5. Returns the created paper.

Use `dialog.showOpenDialog` and a single-file selection.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`

Expected:

- App opens.
- Knowledge page import button opens file picker.
- Selecting a PDF or Markdown stores the paper locally.
- Paper status becomes `indexed` when Dify upload returns successfully.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main/files src/main/workflows src/main/dify src/main/ipc.ts
git commit -m "feat: import and index papers with dify"
```

---

### Task 11: Implement Paper Card Generation

**Files:**
- Create: `src/main/workflows/generatePaperCard.ts`
- Modify: `src/main/workflows/importAndIndexPaper.ts`
- Modify: `src/main/db/repositories.ts`

- [ ] **Step 1: Add paper-card generation workflow**

Create `src/main/workflows/generatePaperCard.ts`:

```ts
import type { PaperCard } from '../../shared/types'

type GeneratePaperCardInput = {
  paperId: string
  title: string
  dify: {
    sendChatMessage(input: {
      query: string
      user: string
      inputs: Record<string, string>
    }): Promise<{ answer: string }>
  }
}

function parseList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

export async function generatePaperCard(input: GeneratePaperCardInput): Promise<Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'>> {
  const result = await input.dify.sendChatMessage({
    user: 'local-user',
    query: `请为论文《${input.title}》生成论文卡片。只返回 JSON，字段包括 authors, year, oneSentenceSummary, researchProblem, methodSummary, contributions, keywords。`,
    inputs: {
      task: 'paper_card',
      paperId: input.paperId
    }
  })

  const parsed = JSON.parse(result.answer) as Record<string, unknown>
  return {
    paperId: input.paperId,
    authors: String(parsed.authors ?? ''),
    year: String(parsed.year ?? ''),
    oneSentenceSummary: String(parsed.oneSentenceSummary ?? ''),
    researchProblem: String(parsed.researchProblem ?? ''),
    methodSummary: String(parsed.methodSummary ?? ''),
    contributions: parseList(parsed.contributions),
    keywords: parseList(parsed.keywords)
  }
}
```

- [ ] **Step 2: Call card generation after index**

Modify `importAndIndexPaper` so after `setIndexStatus(..., 'indexed', ...)`, it calls `generatePaperCard`, then `repos.paperCards.upsert(card)`.

The workflow should catch JSON parse errors and store a fallback card:

```ts
{
  paperId: paper.id,
  authors: '',
  year: '',
  oneSentenceSummary: '论文已入库，卡片生成失败，可稍后重试。',
  researchProblem: '',
  methodSummary: '',
  contributions: [],
  keywords: []
}
```

- [ ] **Step 3: Verify with mocked Dify**

Run: `pnpm test`

Expected: existing tests pass.

Run manual import with a Dify app prompt configured to return JSON for card generation.

Expected: imported paper displays a generated card in the paper list.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/main/workflows src/main/db/repositories.ts
git commit -m "feat: generate paper cards after import"
```

---

### Task 12: Implement Chat Page Context-Aware Messaging

**Files:**
- Create: `src/renderer/pages/ChatPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/db/repositories.ts`

- [ ] **Step 1: Add conversation repository methods**

Add methods to `src/main/db/repositories.ts`:

- `conversations.list()`
- `conversations.create(input)`
- `messages.create(input)`
- `messages.listByConversation(conversationId)`

Serialize `context` and `citations` as JSON.

- [ ] **Step 2: Add IPC conversation handlers**

Modify `src/main/ipc.ts` to support:

- `conversations:list`
- `conversations:create`
- `conversations:sendMessage`

For `sendMessage`:

1. Load conversation context.
2. Insert user message.
3. Call Dify chat API with `query`, `user`, and context inputs.
4. Insert assistant message with citations.
5. Return assistant message.

- [ ] **Step 3: Add ChatPage UI**

Create `src/renderer/pages/ChatPage.tsx`:

```tsx
import { useState } from 'react'
import { desktopApi } from '../api/desktopApi'
import type { Message } from '../../shared/types'

export function ChatPage(): JSX.Element {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')

  async function send(): Promise<void> {
    if (!draft.trim()) return
    let id = conversationId
    if (!id) {
      const conversation = await desktopApi.conversations.create({
        title: draft.slice(0, 24),
        folderId: null,
        context: { type: 'free' }
      })
      id = conversation.id
      setConversationId(id)
    }
    const assistant = await desktopApi.conversations.sendMessage(id, draft)
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        conversationId: id,
        role: 'user',
        content: draft,
        citations: [],
        createdAt: new Date().toISOString()
      },
      assistant
    ])
    setDraft('')
  }

  return (
    <div className="chat-page">
      <div className="message-list">
        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <p>{message.content}</p>
            {message.citations.length ? (
              <footer>{message.citations.map((citation) => citation.paperTitle).join(' · ')}</footer>
            ) : null}
          </article>
        ))}
      </div>
      <div className="chat-hero compact">
        <div className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="询问论文、比较方法、提取创新点、解释术语..."
          />
          <div className="quick-actions">
            <button onClick={() => void send()}>发送</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Route App chat tab to ChatPage**

Modify `src/renderer/App.tsx` so `activeTab === 'chat'` renders `<ChatPage />`.

- [ ] **Step 5: Run verification**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm lint:types`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main src/renderer
git commit -m "feat: add context aware chat"
```

---

### Task 13: Final MVP Verification and Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/mvp-runbook.md`

- [ ] **Step 1: Add runbook**

Create `docs/mvp-runbook.md`:

```md
# ResearchNotion MVP Runbook

## Prerequisites

- Node.js and pnpm.
- A local Dify instance running.
- A Dify app configured for knowledge-base chat.
- Dify App API Key.
- Dify Knowledge API Key.

## Run

```bash
pnpm install
pnpm dev
```

## Configure

Open Settings and fill:

- Dify service URL.
- Dify App API Key.
- Dify Knowledge API Key.

## Demo Flow

1. Open ResearchNotion.
2. Go to Settings and test connection.
3. Go to Knowledge.
4. Create or select a paper folder.
5. Import a PDF or Markdown paper.
6. Wait for indexing.
7. Confirm the paper card appears.
8. Open the paper in the reader.
9. Press Ctrl+J to open the AI drawer.
10. Ask about the current paper.
11. Go to Chat and ask a folder-scoped question.
```

- [ ] **Step 2: Update README**

Add a "Run locally" section pointing to `docs/mvp-runbook.md`.

- [ ] **Step 3: Run all verification commands**

Run:

```bash
pnpm test
pnpm lint:types
pnpm build
```

Expected:

- `pnpm test`: all tests pass.
- `pnpm lint:types`: exits with code 0.
- `pnpm build`: exits with code 0.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`

Verify:

- App opens to chat page.
- Settings page saves Dify config.
- Knowledge page shows reader-first layout.
- AI drawer opens with `Ctrl+J`.
- Importing PDF/Markdown reaches Dify upload.
- Chat answers show citation titles when Dify returns retriever resources.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md docs/mvp-runbook.md
git commit -m "docs: add mvp runbook"
```

---

## Self-Review Checklist

- Spec coverage: tasks cover app shell, settings, Dify config, local SQLite, folder-to-dataset mapping, PDF/Markdown import, paper card generation, reader-first knowledge page, hidden AI drawer, chat page, and citations.
- Explicitly excluded scope: LaTeX, first-run wizard, cloud users, collaboration, Zotero/BibTeX, global cross-dataset retrieval, and custom RAG backend.
- Type consistency: shared `Folder`, `Paper`, `PaperCard`, `Conversation`, `Message`, and `ChatContext` types are introduced before repository, IPC, and UI tasks use them.
- Verification: each implementation task has test, type-check, build, or manual smoke verification.
