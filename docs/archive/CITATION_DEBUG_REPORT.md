<!-- 已归档（2026-08-15）：引用"查看原文"问题的调试过程记录，问题已修复。本文仅作历史留档。 -->

# Citation "查看原文" Debugging Report

## Problem Summary
- **Issue**: Citation "查看原文" buttons jump to homepage instead of the specific citation page
- **Link Stability**: Buttons sometimes appear, sometimes don't
- **Previous Fixes**: Jump page mechanism was fixed (PaperReader initialPage effect, requestedPage cleanup) but issue persists

## Root Cause Analysis

### Data Chain Investigation

Based on code analysis, the citation data flows through this chain:

1. **Tool Output** (`src/main/agentTools/toolHandlers.ts`)
   - `getCurrentPageText`: Returns `{ ok: true, paperId, pageNumber, text }`
   - `getPaperPageText`: Returns `{ ok: true, paperId, pageNumber, text }`
   - `investigatePaper`: Returns `{ ok: true, paper, evidence: [{ pageNumber, score, text }] }`
   - ✅ All tool handlers DO return `pageNumber`

2. **Citation Extraction** (`src/main/dify/client.ts`)
   - `citationsFromToolOutput()`: Extracts citations from tool output
   - Three main code paths:
     - Evidence-based: `output.evidence` → `citationsForEvidence()` → extracts `item.pageNumber`
     - Text-based: `output.pageNumber` → direct extraction
     - Array-based: `output.results` → extracts `item.pageNumber`

3. **React Components**
   - `CitationStatus.tsx`: Receives citations, displays button if `paperId` exists
   - `ChatPage.tsx`: Passes `onOpenCitation` handler
   - `App.tsx`: Sets `knowledgeRequest` with `page: citation.pageNumber`
   - `KnowledgePage.tsx`: Calls `openPaper(paperId, requestedPage)`
   - `PaperReader.tsx`: Uses `initialPage` prop

## Debugging Infrastructure Added

### 1. Source Level (`src/main/dify/client.ts`)
```typescript
// In citationsFromToolOutput
console.log('[CitationDebug] citationsFromToolOutput:', { toolName, paperId, pageNumber })

// At the end of readStreamingChatResponse
console.log('[CitationDebug] Final citations returned:', { citations })
```

### 2. Component Level (`src/renderer/components/CitationStatus.tsx`)
```typescript
// In component render
console.log('[CitationDebug] CitationStatus received:', { messageId, citations })

// On button click
console.log('[CitationDebug] Citation clicked:', { citation })
```

### 3. App Level (`src/renderer/App.tsx`)
```typescript
// In onOpenCitation handler
console.log('[CitationDebug] onOpenCitation called:', { citation })
console.log('[CitationDebug] Setting knowledgeRequest:', { paperId, page })
```

### 4. Page Level (`src/renderer/pages/KnowledgePage.tsx`)
```typescript
// In openPaper function
console.log('[CitationDebug] openPaper called:', { paperId, targetPage })
console.log('[CitationDebug] Page calculation:', { targetPage, savedView, pageToOpen })
```

## Testing Procedure

1. **Start Application**
```bash
env -u ELECTRON_RUN_AS_NODE -u ELECTRON_FORCE_IS_PACKAGED -u VSCODE_RUN_IN_ELECTRON -u ICUBE_IS_ELECTRON -u ICUBE_ELECTRON_PATH node_modules/.bin/electron-vite dev
```

2. **Open DevTools**: Press `Ctrl+Shift+I` in Electron window

3. **Generate Citations**: Ask a question that returns citations with page numbers
   - Example: "What are the main methods in this paper?"
   - Example: "Summarize the findings on page 5"

4. **Click Citation**: Click the "查看原文" button

5. **Analyze Logs**: Check console output in sequence

## Expected Results

### Scenario A: pageNumber Present Throughout (Working)
```
[CitationDebug] citationsFromToolOutput: { toolName: 'get_paper_page_text', paperId: 'xxx', pageNumber: 5 }
[CitationDebug] Final citations returned: [{ paperId: 'xxx', pageNumber: 5 }]
[CitationDebug] CitationStatus received: [{ paperId: 'xxx', pageNumber: 5 }]
[CitationDebug] Citation clicked: { paperId: 'xxx', pageNumber: 5 }
[CitationDebug] onOpenCitation called: { citation: { paperId: 'xxx', pageNumber: 5 } }
[CitationDebug] Setting knowledgeRequest: { paperId: 'xxx', page: 5 }
[CitationDebug] openPaper called: { paperId: 'xxx', targetPage: 5 }
[CitationDebug] Page calculation: { targetPage: 5, savedView: 1, pageToOpen: 5 }
```
**Result**: Jumps to correct page

### Scenario B: pageNumber Missing (Root Cause)
```
[CitationDebug] citationsFromToolOutput: { toolName: 'get_paper_page_text', paperId: 'xxx', pageNumber: undefined }
[CitationDebug] Final citations returned: [{ paperId: 'xxx', pageNumber: null }]
[CitationDebug] CitationStatus received: [{ paperId: 'xxx', pageNumber: null }]
```
**Result**: Button shows "论文原文" instead of "第 X 页", jumps to homepage

### Scenario C: pageNumber Lost Mid-Chain
```
[CitationDebug] citationsFromToolOutput: { toolName: 'get_paper_page_text', pageNumber: 5 }
[CitationDebug] Final citations returned: [{ pageNumber: 5 }]
[CitationDebug] CitationStatus received: [{ pageNumber: 5 }]
[CitationDebug] Citation clicked: { pageNumber: 5 }
[CitationDebug] onOpenCitation called: { pageNumber: 5 }
[CitationDebug] Setting knowledgeRequest: { page: 5 }
[CitationDebug] openPaper called: { targetPage: 5 }
[CitationDebug] Page calculation: { pageToOpen: 1 }  ← Should be 5!
```
**Result**: Logic error in page calculation

## Potential Root Causes (Based on Code Analysis)

### 1. Tool Output Format Issue
**Hypothesis**: Some tools don't return `pageNumber` in expected format
- `investigatePaper` evidence items should have `pageNumber`
- Text tools should have `pageNumber` at top level
- **Check**: Log structure of raw tool output

### 2. Extraction Logic Issue
**Hypothesis**: `citationsFromToolOutput` takes wrong code path
- Evidence-based path may not handle all tool outputs correctly
- **Check**: Which conditional branch executes for problematic citations

### 3. Data Type Issue
**Hypothesis**: `pageNumber` gets lost in type coercion
- `output.pageNumber` might be string instead of number
- `toolCitation` expects `typeof pageNumber === 'number'`
- **Check**: Log types of pageNumber values

### 4. Page Calculation Issue
**Hypothesis**: Logic error in `openPaper` page selection
```typescript
const pageToOpen = targetPage && Number.isFinite(targetPage)
  ? Math.max(1, Math.round(targetPage))
  : (savedView?.page ?? 1)
```
- `targetPage` might be `undefined` despite being set
- **Check**: Log `targetPage` vs `pageToOpen`

## Next Steps After Testing

### If pageNumber is missing in tool output:
- Fix tool handler to always return `pageNumber`
- Update tool output schema

### If pageNumber is lost in extraction:
- Fix `citationsFromToolOutput` logic
- Ensure all code paths extract `pageNumber`

### If pageNumber is lost mid-chain:
- Trace React component prop flow
- Fix prop passing or state management

### If link stability is the issue:
- Check why `paperId` is sometimes missing
- Fix citation creation consistency

## Files Modified

1. `src/main/dify/client.ts` - Added debug logs in citation extraction
2. `src/renderer/components/CitationStatus.tsx` - Added debug logs in render and click handler
3. `src/renderer/App.tsx` - Added debug logs in onOpenCitation handler
4. `src/renderer/pages/KnowledgePage.tsx` - Added debug logs in openPaper function

## Cleanup Required

After identifying root cause, remove all debug console.log statements from:
- `src/main/dify/client.ts` (lines 99, ~483)
- `src/renderer/components/CitationStatus.tsx` (lines ~10, ~33)
- `src/renderer/App.tsx` (lines ~241-244)
- `src/renderer/pages/KnowledgePage.tsx` (lines ~289-291)

## TypeScript Status

✅ All changes pass TypeScript compilation with zero errors
