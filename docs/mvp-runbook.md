# ResearchNotion MVP Runbook

## Prerequisites

- Node.js and pnpm.
- A local Dify instance running.
- A Dify app configured for knowledge-base chat.
- A Dify App API Key.
- A Dify Knowledge API Key.

## Run

```bash
pnpm install
pnpm dev
```

## Configure

Open Settings and fill:

- Dify service URL, for example `http://localhost:8080`.
- Dify App API Key.
- Dify Knowledge API Key.

Model provider keys are configured in Dify for the MVP.

## Demo Flow

1. Open ResearchNotion.
2. Go to Settings and fill the Dify fields.
3. Save settings and run the connection check.
4. Go to Knowledge.
5. Create or select a paper folder.
6. Import a PDF or Markdown paper.
7. Wait for Dify indexing.
8. Confirm the paper card appears.
9. Open the paper in the reader.
10. Press `Ctrl+J` or click the AI button to open the reader drawer.
11. Ask a paper question.
12. Go to Chat and ask a broader research question.

## MVP Scope

- Desktop shell with Notion-like navigation.
- Local SQLite metadata storage.
- Local PDF and Markdown file storage.
- Settings page for Dify URL and keys.
- Folder to Dify dataset mapping.
- Paper import, Dify document upload, and card generation.
- Markdown reader and PDF placeholder.
- Context-aware chat storage and Dify chat calls.

LaTeX, cloud users, online paper search, Zotero import, and fully local RAG are planned extensions rather than MVP features.
