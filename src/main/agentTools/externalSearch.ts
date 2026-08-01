/**
 * T12a: External paper search tools (arXiv + Semantic Scholar).
 * No API key required for either. Both return JSON-friendly results.
 */

export type ExternalPaperResult = {
  title: string
  authors: string[]
  abstract: string
  url: string
  year?: string
  citationCount?: number
  doi?: string
}

/** Search arXiv via the public Atom API (no key, no rate limit for reasonable use). */
export async function searchArxiv(query: string, maxResults = 5): Promise<{ ok: true; results: ExternalPaperResult[] } | { ok: false; error: string }> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, error: `arXiv HTTP ${res.status}` }
    const xml = await res.text()
    const results = parseArxivAtom(xml)
    return { ok: true, results }
  } catch (error) {
    return { ok: false, error: `arXiv search failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Search Semantic Scholar via the public Graph API (no key, ~100 req/5min). */
export async function searchSemanticScholar(
  query: string,
  maxResults = 5
): Promise<{ ok: true; results: ExternalPaperResult[] } | { ok: false; error: string }> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,authors,abstract,year,citationCount,externalIds,url`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return { ok: false, error: `Semantic Scholar HTTP ${res.status}` }
    const data = (await res.json()) as { data?: Array<Record<string, unknown>> }
    const results: ExternalPaperResult[] = (data.data ?? []).map((paper) => ({
      title: String(paper.title ?? ''),
      authors: Array.isArray(paper.authors)
        ? paper.authors.map((a) => (typeof a === 'object' && a !== null ? String((a as Record<string, unknown>).name ?? '') : String(a))).filter(Boolean)
        : [],
      abstract: String(paper.abstract ?? ''),
      url: String(paper.url ?? ''),
      year: paper.year ? String(paper.year) : undefined,
      citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : undefined,
      doi:
        paper.externalIds && typeof paper.externalIds === 'object' && 'DOI' in paper.externalIds
          ? String((paper.externalIds as Record<string, unknown>).DOI ?? '')
          : undefined
    }))
    return { ok: true, results }
  } catch (error) {
    return { ok: false, error: `Semantic Scholar search failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Minimal arXiv Atom XML parser (extracts entries without a full XML library). */
function parseArxivAtom(xml: string): ExternalPaperResult[] {
  const entries: ExternalPaperResult[] = []
  const entryRegex = /<entry>[\s\S]*?<\/entry>/gi
  const matches = xml.match(entryRegex) ?? []
  for (const entry of matches) {
    const title = extractTag(entry, 'title').replace(/\n/g, ' ').trim()
    const summary = extractTag(entry, 'summary').replace(/\n/g, ' ').trim()
    const idMatch = entry.match(/<id>([^<]+)<\/id>/i)
    const url = idMatch ? idMatch[1].trim() : ''
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i)
    const year = publishedMatch ? publishedMatch[1].slice(0, 4) : undefined
    const authorRegex = /<name>([^<]+)<\/name>/gi
    const authors: string[] = []
    let authorMatch
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1].trim())
    }
    entries.push({ title, authors, abstract: summary, url, year })
  }
  return entries
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? match[1] : ''
}
