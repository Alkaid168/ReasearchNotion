<!-- 已归档（2026-08-15）：引用"查看原文"问题的调试过程记录，问题已修复。本文仅作历史留档。 -->

# Citation Debug Test Instructions

## Problem
- Citation "查看原文" button jumps to homepage instead of citation page
- Link stability issues (button sometimes appears, sometimes doesn't)

## Debug Logs Added

### 1. App.tsx (onOpenCitation handler)
```typescript
console.log('[CitationDebug] onOpenCitation called:', { citation })
console.log('[CitationDebug] Setting knowledgeRequest:', { paperId, page })
```

### 2. KnowledgePage.tsx (openPaper function)
```typescript
console.log('[CitationDebug] openPaper called:', { paperId, targetPage })
console.log('[CitationDebug] Page calculation:', { targetPage, savedView, pageToOpen })
```

### 3. CitationStatus.tsx (component render)
```typescript
console.log('[CitationDebug] CitationStatus received:', { messageId, citations })
console.log('[CitationDebug] Citation clicked:', { citation })
```

### 4. dify/client.ts (citation extraction)
```typescript
console.log('[CitationDebug] citationsFromToolOutput:', { toolName, paperId, pageNumber })
console.log('[CitationDebug] Final citations returned:', { citations })
```

## Testing Procedure

1. Start the application with debugging enabled:
```bash
env -u ELECTRON_RUN_AS_NODE -u ELECTRON_FORCE_IS_PACKAGED -u VSCODE_RUN_IN_ELECTRON -u ICUBE_IS_ELECTRON -u ICUBE_ELECTRON_PATH node_modules/.bin/electron-vite dev
```

2. Open Electron DevTools (Ctrl+Shift+I) to see console logs

3. Ask a question that will generate citations with page numbers, e.g.:
   - "What are the main methods in the current paper?"
   - "Summarize the approach on page 5"

4. Wait for the AI response with citations

5. Click the "查看原文" button

6. Check the console logs in this order:
   - `[CitationDebug] citationsFromToolOutput` - Check if pageNumber is present here
   - `[CitationDebug] Final citations returned` - Check final citation data
   - `[CitationDebug] CitationStatus received` - Check what component receives
   - `[CitationDebug] Citation clicked` - Check what gets passed to onOpenCitation
   - `[CitationDebug] onOpenCitation called` - Check App.tsx receives
   - `[CitationDebug] Setting knowledgeRequest` - Check page being set
   - `[CitationDebug] openPaper called` - Check KnowledgePage receives
   - `[CitationDebug] Page calculation` - Check final page number

## Expected Results

### If pageNumber is present throughout:
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

### If pageNumber is missing (root cause):
```
[CitationDebug] citationsFromToolOutput: { toolName: 'get_paper_page_text', paperId: 'xxx', pageNumber: undefined }
[CitationDebug] Final citations returned: [{ paperId: 'xxx', pageNumber: null }]
[CitationDebug] CitationStatus received: [{ paperId: 'xxx', pageNumber: null }]
```

## Analysis

### Root Cause Indicators
1. **pageNumber is undefined/null in citationsFromToolOutput** → Tool output doesn't include pageNumber, need to fix extraction logic
2. **pageNumber is present initially but becomes null later** → Data transformation issue in the chain
3. **Button shows "论文原文" instead of "第 X 页"** → CitationStatus correctly detecting missing pageNumber

### Link Stability Indicators
1. **Button sometimes appears, sometimes doesn't** → paperId might be missing in some citations
2. **Inconsistent citation structure** → Tools returning different output formats

## Post-Test Cleanup

After identifying the root cause, remove all debug console.log statements:
- Remove from App.tsx
- Remove from KnowledgePage.tsx
- Remove from CitationStatus.tsx
- Remove from dify/client.ts

## Next Steps Based on Findings

### If pageNumber is missing from tool output:
- Check tool handler implementations (src/main/agentTools/toolHandlers.ts)
- Verify tool output structure includes pageNumber
- Fix extraction logic in citationsFromToolOutput

### If pageNumber is lost during transformation:
- Trace data flow in uniqueCitations
- Check if any filtering drops pageNumber
- Verify mapCitations preserves pageNumber

### If link stability is the issue:
- Check why paperId is sometimes missing
- Verify tool handlers consistently return paperId
- Fix citation creation logic
