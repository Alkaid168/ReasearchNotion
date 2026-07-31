import { z } from 'zod'
import { jsonrepair } from 'jsonrepair'

// Models sometimes return arrays with non-string entries, or a delimited string
// instead of an array. Normalise both to a clean string[] before validation.
const stringArrayField = z.preprocess((val) => {
  if (Array.isArray(val)) {
    return val
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (typeof val === 'string') {
    return val
      .split(/[,，;；、\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}, z.array(z.string()))

// Year is noisy: "published in 2023", 2020, "forthcoming", null, ... Extract the
// first 4-digit year when present, otherwise empty. Keeps the schema strict on
// the final value without bouncing repairable noise back to the model.
const yearField = z.preprocess((val) => {
  if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val))
  if (typeof val === 'string') {
    const match = val.match(/\d{4}/)
    return match ? match[0] : ''
  }
  return ''
}, z.string().regex(/^\d{4}$|^$/, 'year 必须为 4 位年份或空'))

export const PaperCardSchema = z.object({
  authors: z.string().trim().default(''),
  year: yearField.default(''),
  oneSentenceSummary: z.string().trim().default(''),
  researchProblem: z.string().trim().default(''),
  methodSummary: z.string().trim().default(''),
  contributions: stringArrayField,
  keywords: stringArrayField
})

export type PaperCardFields = z.infer<typeof PaperCardSchema>

export type PaperCardParseResult =
  | { ok: true; data: PaperCardFields }
  | { ok: false; errors: string[]; rawForRepair: string }

function preClean(raw: string): string {
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fenced = noThink.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : noThink
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

/**
 * Parse and validate a raw LLM answer into a paper-card shaped object.
 *
 * Pipeline: pre-clean (<think>, code fence, outer braces) → jsonrepair (syntax)
 * → JSON.parse → Zod schema (semantic). Never throws: on any failure returns
 * `{ ok: false, errors, rawForRepair }` so the caller can feed the errors into a
 * single repair prompt.
 */
export function parsePaperCardResponse(rawAnswer: string): PaperCardParseResult {
  const cleaned = extractJsonObject(preClean(rawAnswer))

  let jsonText: string
  try {
    jsonText = jsonrepair(cleaned)
  } catch {
    jsonText = cleaned // jsonrepair could not fix it; let JSON.parse report the original error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    return {
      ok: false,
      errors: [`JSON 解析失败: ${(error as Error).message}`],
      rawForRepair: cleaned
    }
  }

  const result = PaperCardSchema.safeParse(parsed)
  if (result.success) return { ok: true, data: result.data }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    rawForRepair: cleaned
  }
}
