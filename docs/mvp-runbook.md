# ResearchNotion MVP Runbook

## Prerequisites

- Node.js and pnpm.
- A local Dify instance running.
- A Dify app configured for knowledge-base chat.
- A Dify App API Key.
- A Dify Knowledge API Key.

## Run

On Windows, double-click:

```text
start-research-notion.bat
```

The launcher also starts a local DeepSeek bridge on `http://127.0.0.1:17778`. Dify containers call it through `http://host.docker.internal:17778`, and the host forwards the request to DeepSeek. This avoids a Windows Docker network issue where containers can fail TLS handshakes when calling `https://api.deepseek.com` directly.
It also checks `http://localhost:8080` and tries to start local Dify quietly when Dify is not responding. The Dify web page is not opened during normal ResearchNotion startup; use `start-dify.bat` when you want to open Dify itself.

Before a coursework demo, double-click:

```text
prepare-demo.bat
```

It starts local Dify when needed, provisions the Dify Workflow app, briefly starts the desktop tool service to import ResearchNotion Agent tools, provisions the tool Agent Chat app, uploads the demo papers, verifies the MVP demo checklist, and rebuilds native modules for Electron launch.
It also routes Dify DeepSeek calls through the local DeepSeek bridge and clears Dify Redis provider caches so the new endpoint is used immediately.

Or run from a terminal:

```bash
pnpm install
pnpm dev
```

`better-sqlite3` is a native dependency. `pnpm dev` rebuilds it for Electron, while `pnpm test` rebuilds it for Node.js before running Vitest.

## Configure

Open Settings and fill:

- Dify service URL, for example `http://localhost:8080`.
- Dify App API Key.
- Dify Knowledge API Key.

Model provider keys are configured in Dify for the MVP.

For the local coursework demo, you can provision the Dify Workflow app and ResearchNotion settings automatically:

```bash
pnpm demo:prepare
```

Or run each step manually:

```bash
pnpm provision:dify
pnpm use:deepseek-bridge
pnpm import:dify-tools
pnpm provision:dify-agent
pnpm seed:dify
pnpm check:dify
pnpm verify:mvp
pnpm smoke:dify-agent-paper
pnpm benchmark:dify-agent
```

`pnpm import:dify-tools` needs the ResearchNotion desktop tool service at `http://127.0.0.1:17777/openapi.json`; `prepare-demo.bat` starts it automatically. `pnpm provision:dify-agent` creates or updates the `ResearchNotion Tool Agent` Agent Chat app with the imported tools attached. `pnpm seed:dify` downloads and uploads three open-access demo papers: RAG, Transformer, and BERT. `pnpm check:dify` can read the settings written by `pnpm provision:dify`, so you do not need to copy API keys into environment variables for the normal local demo flow.
`pnpm verify:mvp` runs the higher-level demo checklist: Dify app readiness, local library counts, indexed papers, paper cards, and whether the local paper files still exist. It accepts both the stable Workflow app route and the autonomous `agent-chat` Tool Agent route.
`pnpm smoke:dify-agent-paper` starts the local DeepSeek bridge and ResearchNotion tool service when needed, sets the reading state to the seeded `Attention Is All You Need` PDF, calls the autonomous `ResearchNotion Tool Agent`, and verifies that Dify used `get_current_context`, `get_paper_outline`, and `get_current_page_text` without narrating tool calls back to the user.
`pnpm benchmark:dify-agent` runs four real Tool Agent checks against the seeded paper library: chapter structure, full-paper analysis, library inventory, and BERT/Transformer/RAG comparison. It records the tool trace for each question and clears the temporary reading state after completion.

If Dify model calls fail with `SSLEOFError`, `SSL_ERROR_SYSCALL`, or `Server Unavailable Error` while the host machine can access DeepSeek, keep Dify on the local bridge:

```bash
pnpm use:deepseek-bridge
pnpm deepseek:bridge
```

`pnpm use:deepseek-bridge` writes Dify's DeepSeek `endpoint_url` to `http://host.docker.internal:17778` and clears cached provider credentials from Redis. `pnpm deepseek:bridge` starts the host-side OpenAI-compatible forwarder. To restore direct provider access, run:

```bash
pnpm use:deepseek-official
```

By default, the desktop settings still point to the stable `ResearchNotion Academic QA Agent` Workflow app. To switch the desktop app to the autonomous tool Agent, double-click `use-dify-agent.bat` or run `pnpm use:dify-agent`. To switch back to the stable Workflow app, double-click `use-dify-workflow.bat` or run `pnpm use:dify-workflow`. The desktop Dify client supports both blocking Workflow responses and streaming `agent-chat` responses.

If your ResearchNotion data directory is not under the default Windows app data path, point the scripts at the SQLite file explicitly:

```bash
set RESEARCH_NOTION_DB_PATH=C:\path\to\research-notion.sqlite
pnpm check:dify
```

`pnpm check:dify` can read keys written by `pnpm provision:dify`. If keys were saved manually in the desktop app and Electron encrypted them with `safeStorage`, use `pnpm provision:dify` again or set `DIFY_BASE_URL`, `DIFY_APP_API_KEY`, and `DIFY_KNOWLEDGE_API_KEY` in the shell before running the check script.

## Demo Flow

1. Open ResearchNotion.
2. Go to Settings and fill the Dify fields.
3. Save settings and confirm the local status panel shows the expected Dify, library, paper, indexed paper, and conversation counts.
4. Run the connection check.
   - The check verifies Dify credentials, ResearchNotion input variables, the knowledge API key, and retriever resource output.
5. Go to Knowledge.
6. Create or select a paper folder.
7. Import a PDF or Markdown paper.
8. Wait for Dify indexing.
9. Confirm the paper card appears.
10. Open the paper in the reader.
11. For PDF papers, test page jump, next/previous page, zoom, and fit-width controls.
12. Press `Ctrl+I` in the reader to open or close the AI drawer.
13. Select a passage in the reader and ask a paper question with that selected text as emphasis context.
14. Go to Chat and ask a broader research question.

## Demo Readiness Checklist

Run these checks before calling the project ready for a coursework demo:

- Local Dify is running.
- `pnpm provision:dify` completes successfully.
- `pnpm import:dify-tools` imports 14 ResearchNotion local tools (12 paper tools + search_arxiv + search_semantic_scholar).
- `pnpm provision:dify-agent` creates `ResearchNotion Tool Agent` with 14 function-call tools.
- `pnpm use:deepseek-bridge` is active if Docker containers cannot call DeepSeek directly.
- `pnpm seed:dify` uploads the demo papers.
- `pnpm check:dify` passes.
- `pnpm verify:mvp` passes.
- `pnpm smoke:dify-agent-paper` passes and shows the Tool Agent used the current context, paper outline, and current page tools.
- `pnpm benchmark:dify-agent` passes the chapter, full-paper, library, and comparison question set.
- `node scripts/benchmark-runner.mjs` passes the full T6 benchmark (tool k=3 + trust k=2, merged JSON report).
- Settings shows `可演示`, with Dify configured and nonzero library, paper, PDF, index, and paper-card counts after seeding.
- Settings shows the current Dify App name/mode and the local Agent tool service URL with 14 tools.
- Knowledge opens at least one seeded PDF in the reader, and the PDF toolbar can jump pages and fit width.
- `Ctrl+I` opens and closes the paper AI drawer.
- A question about the opened paper returns an answer with citations.
- Chat history can be opened, renamed, deleted, and moved into or out of folders.

## MVP Scope

- Desktop shell with Notion-like navigation.
- Local SQLite metadata storage.
- Local PDF and Markdown file storage.
- Settings page for Dify URL and keys.
- Folder to Dify dataset mapping.
- Paper import, Dify document upload, and card generation.
- Markdown reader and PDF canvas reader.
- Context-aware chat storage and Dify chat calls.
- Settings page local environment status for demo verification.

LaTeX, cloud users, Zotero import, and fully local RAG are planned extensions rather than MVP features.

> **P2 updates (2026-08-01)**: Online paper search (arXiv + Semantic Scholar), user memory system, vector retrieval (bge-m3 via TEI), desktop DeepSeek key sync, double-column PDF sorting, and Agent benchmark (pass^k + JSON reports) are now implemented. See [technical-guide](research-notion-technical-guide.md) §16.2 for the full roadmap status.
