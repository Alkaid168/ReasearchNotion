/**
 * T12a: External paper search tools (arXiv + Semantic Scholar + OpenAlex).
 * No API key required for any of them.
 *
 * - arXiv: public Atom API, effectively unthrottled for reasonable use.
 * - OpenAlex: open scholarly graph, unthrottled in the polite pool (mailto).
 *   Has cited_by_count, authors, abstract, DOI — the most complete dataset,
 *   and the recommended source for citation counts / impact analysis.
 * - Semantic Scholar: shares a tighter public quota that returns HTTP 429
 *   under load, so it retries with exponential backoff honoring Retry-After.
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

const REQUEST_TIMEOUT_MS = 15_000
const S2_MAX_ATTEMPTS = 3
const S2_MAX_BACKOFF_MS = 10_000
const OPENALEX_MAILTO = 'research@researchnotion.local'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, S2_MAX_BACKOFF_MS)
  }
  return Math.min(2 ** attempt * 1000, 5000)
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

/** Search Semantic Scholar via the public Graph API (shared quota; retries on 429). */
export async function searchSemanticScholar(
  query: string,
  maxResults = 5
): Promise<{ ok: true; results: ExternalPaperResult[] } | { ok: false; error: string }> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${maxResults}&fields=title,authors,abstract,year,citationCount,externalIds,url`
  for (let attempt = 0; attempt < S2_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'application/json' }
      })
      if (res.status === 429 && attempt < S2_MAX_ATTEMPTS - 1) {
        await sleep(backoffDelay(attempt, res.headers.get('retry-after')))
        continue
      }
      if (!res.ok) {
        return { ok: false, error: `Semantic Scholar HTTP ${res.status}${res.status === 429 ? ' (rate-limited; retry later)' : ''}` }
      }
      const data = (await res.json()) as { data?: Array<Record<string, unknown>> }
      const results: ExternalPaperResult[] = (data.data ?? []).map(parseScholarPaper)
      return { ok: true, results }
    } catch (error) {
      if (attempt >= S2_MAX_ATTEMPTS - 1) {
        return { ok: false, error: `Semantic Scholar search failed: ${error instanceof Error ? error.message : String(error)}` }
      }
      await sleep(backoffDelay(attempt, null))
    }
  }
  return { ok: false, error: 'Semantic Scholar rate-limited after retries' }
}

function parseScholarPaper(paper: Record<string, unknown>): ExternalPaperResult {
  return {
    title: String(paper.title ?? ''),
    authors: Array.isArray(paper.authors)
      ? paper.authors
          .map((author) => (typeof author === 'object' && author !== null ? String((author as Record<string, unknown>).name ?? '') : String(author)))
          .filter(Boolean)
      : [],
    abstract: String(paper.abstract ?? ''),
    url: String(paper.url ?? ''),
    year: paper.year ? String(paper.year) : undefined,
    citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : undefined,
    doi:
      paper.externalIds && typeof paper.externalIds === 'object' && 'DOI' in paper.externalIds
        ? String((paper.externalIds as Record<string, unknown>).DOI ?? '')
        : undefined
  }
}

/** Detect an arXiv id (YYMM.NNNNN, optionally prefixed/suffixed) so we can do an exact lookup. */
function matchArxivId(query: string): string | null {
  const stripped = query.trim().toLowerCase().replace(/^arxiv\s*[:\s]?\s*/, '')
  const match = stripped.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/)
  return match ? match[1] : null
}

async function fetchOpenalexWork(workUrl: string): Promise<ExternalPaperResult | null> {
  try {
    const res = await fetch(workUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': `ResearchNotion/0.1 (mailto:${OPENALEX_MAILTO})` }
    })
    if (!res.ok) return null
    const work = (await res.json()) as Record<string, unknown>
    return parseOpenalexWork(work)
  } catch {
    return null
  }
}

/** Search OpenAlex (open scholarly graph, no key, polite pool via mailto). Recommended for citation counts.
 *  arXiv ids trigger an exact DOI lookup (10.48550/arxiv.<id>) — keyword search does not reliably match
 *  arXiv ids or generic-title papers, but the DOI lookup is exact and returns cited_by_count. */
export async function searchOpenalex(
  query: string,
  maxResults = 5
): Promise<{ ok: true; results: ExternalPaperResult[] } | { ok: false; error: string }> {
  const arxivId = matchArxivId(query)
  if (arxivId) {
    const exact = await fetchOpenalexWork(
      `https://api.openalex.org/works/doi:${encodeURIComponent(`10.48550/arxiv.${arxivId}`)}?mailto=${encodeURIComponent(OPENALEX_MAILTO)}`
    )
    if (exact) return { ok: true, results: [exact] }
    // exact lookup missed (OpenAlex may not have indexed it yet) → fall through to keyword search
  }
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${maxResults}&mailto=${encodeURIComponent(OPENALEX_MAILTO)}`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': `ResearchNotion/0.1 (mailto:${OPENALEX_MAILTO})` }
    })
    if (!res.ok) return { ok: false, error: `OpenAlex HTTP ${res.status}` }
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
    const results: ExternalPaperResult[] = (data.results ?? []).map(parseOpenalexWork)
    return { ok: true, results }
  } catch (error) {
    return { ok: false, error: `OpenAlex search failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function parseOpenalexWork(work: Record<string, unknown>): ExternalPaperResult {
  const doi = typeof work.doi === 'string' ? work.doi.replace(/^https?:\/\/doi\.org\//i, '') : undefined
  return {
    title: String(work.title ?? ''),
    authors: Array.isArray(work.authorships)
      ? work.authorships
          .map((authorship) => {
            if (typeof authorship !== 'object' || authorship === null) return ''
            const record = authorship as Record<string, unknown>
            const author = record.author
            if (typeof author === 'object' && author !== null) {
              return String((author as Record<string, unknown>).display_name ?? '')
            }
            return String(record.raw_author_name ?? '')
          })
          .filter(Boolean)
      : [],
    abstract: decodeInvertedIndex(work.abstract_inverted_index),
    url: String(work.id ?? work.doi ?? ''),
    year: work.publication_year ? String(work.publication_year) : undefined,
    citationCount: typeof work.cited_by_count === 'number' ? work.cited_by_count : undefined,
    doi
  }
}

/** OpenAlex returns abstracts as an inverted index {word: [positions]}; reconstruct the text. */
function decodeInvertedIndex(inverted: unknown): string {
  if (!inverted || typeof inverted !== 'object') return ''
  const positions: Array<{ word: string; pos: number }> = []
  for (const [word, indices] of Object.entries(inverted as Record<string, unknown>)) {
    if (!Array.isArray(indices)) continue
    for (const pos of indices) {
      if (typeof pos === 'number') positions.push({ word, pos })
    }
  }
  positions.sort((a, b) => a.pos - b.pos)
  return positions.map((entry) => entry.word).join(' ')
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
