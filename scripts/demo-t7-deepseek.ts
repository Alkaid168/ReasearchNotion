/* eslint-disable no-console */
/**
 * T7 live demo (no Dify needed). Drives the real DeepSeek API through
 * `parsePaperCardResponse` + the repair path.
 *
 * Three rounds:
 *   1. deepseek-chat  × 3 real papers   — happy path
 *   2. deepseek-reasoner × 1            — exercises <think> stripping
 *   3. adversarial system prompt × 1    — induces malformed JSON, exercises repair
 *
 * Auth: read DEEPSEEK_API_KEY from env. Skips cleanly when unset.
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node_modules/.bin/vite-node scripts/demo-t7-deepseek.ts
 */
import { parsePaperCardResponse } from '../src/main/workflows/paperCardSchema'
import { buildPaperCardRepairQuery } from '../src/main/dify/researchAgent'

const apiKey = (process.env.DEEPSEEK_API_KEY ?? '').trim()
if (!apiKey) {
  console.error(
    '跳过 live demo：未设置 DEEPSEEK_API_KEY。\n' +
      '用法：DEEPSEEK_API_KEY=sk-... vite-node scripts/demo-t7-deepseek.ts'
  )
  process.exit(0)
}

const ENDPOINT = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '') + '/v1/chat/completions'

const SYSTEM_CLEAN = `你是科研论文阅读助手。根据用户提供的论文标题与摘要生成论文卡片。
只返回一个 JSON 对象，字段：
- authors: string（英文人名可保留英文）
- year: string（4 位年份）
- oneSentenceSummary: string（中文）
- researchProblem: string（中文）
- methodSummary: string（中文）
- contributions: string[]（中文数组）
- keywords: string[]（中文数组）
证据不足的字段用空字符串或空数组，不要编造。不要输出 <think>、Markdown 代码块或解释文字。`

// Adversarial: deliberately ask for everything T7's schema layer must defend against
// (markdown fence, Chinese curly quotes, prose preamble, string instead of array).
// Built via .join('\n') because the prose intentionally contains ``` which would
// terminate a template literal.
const SYSTEM_ADVERSARIAL = [
  '你是论文助手。回答时请遵守以下格式：',
  '1. 先写一句中文“好的，我来为你生成论文卡片：”作为开头。',
  '2. 然后用 ```json 代码块包裹 JSON，代码块内外都可以有解释。',
  '3. JSON 字段名和字符串值都用中文全角引号“”包裹。',
  '4. contributions 和 keywords 写成用中文分号；分隔的单个字符串，不要用数组。',
  '字段：authors, year, oneSentenceSummary, researchProblem, methodSummary, contributions, keywords。'
].join('\n')

const papers = [
  {
    id: 'rag-2020',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    abstract:
      'We introduce RAG models that combine parametric memory with non-parametric memory: a pre-trained retriever (DPR) retrieves passages, and a pre-trained seq2seq model (BART) conditions generation on them.'
  },
  {
    id: 'transformer-2017',
    title: 'Attention Is All You Need',
    abstract:
      'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.'
  },
  {
    id: 'bert-2018',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    abstract:
      'We introduce BERT, Bidirectional Encoder Representations from Transformers. BERT pre-trains deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context.'
  }
]

async function ask(model: string, system: string, userPrompt: string): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1500,
      stream: false
    })
  })
  if (!res.ok) throw new Error(`DeepSeek ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content
}

function preview(s: string, n = 200): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > n ? oneLine.slice(0, n) + ` …(+${oneLine.length - n} chars)` : oneLine
}

type Round = { label: string; model: string; system: string; paper: (typeof papers)[number] }

const rounds: Round[] = [
  { label: 'chat / RAG', model: 'deepseek-chat', system: SYSTEM_CLEAN, paper: papers[0] },
  { label: 'chat / Transformer', model: 'deepseek-chat', system: SYSTEM_CLEAN, paper: papers[1] },
  { label: 'chat / BERT', model: 'deepseek-chat', system: SYSTEM_CLEAN, paper: papers[2] },
  { label: 'reasoner / RAG (expect <think>)', model: 'deepseek-reasoner', system: SYSTEM_CLEAN, paper: papers[0] },
  { label: 'adversarial / Transformer (expect malformed)', model: 'deepseek-chat', system: SYSTEM_ADVERSARIAL, paper: papers[1] }
]

const stats = { firstPass: 0, repaired: 0, failed: 0 }

for (const round of rounds) {
  console.log('\n' + '='.repeat(72))
  console.log(`[${round.label}]`)
  console.log('='.repeat(72))

  const userPrompt = `论文标题：${round.paper.title}\n摘要：${round.paper.abstract}\n\n请生成论文卡片。`
  const firstRaw = await ask(round.model, round.system, userPrompt)
  console.log('\n[1] 原始输出（预览）: ' + preview(firstRaw))

  const first = parsePaperCardResponse(firstRaw)
  if (first.ok) {
    stats.firstPass++
    console.log('✅ 一次通过 schema。contributions=' + JSON.stringify(first.data.contributions.slice(0, 2)))
    continue
  }

  console.log('⚠️  第一次失败: ' + first.errors.join('; '))
  const secondRaw = await ask(
    round.model,
    SYSTEM_CLEAN,
    buildPaperCardRepairQuery({
      paperId: round.paper.id,
      title: round.paper.title,
      errors: first.errors,
      previousOutput: first.rawForRepair
    })
  )
  console.log('\n[2] repair 输出（预览）: ' + preview(secondRaw))
  const second = parsePaperCardResponse(secondRaw)
  if (second.ok) {
    stats.repaired++
    console.log('✅ repair 后通过。contributions=' + JSON.stringify(second.data.contributions.slice(0, 2)))
  } else {
    stats.failed++
    console.log('❌ repair 仍失败: ' + second.errors.join('; '))
  }
}

console.log('\n' + '='.repeat(72))
console.log(
  `汇总: ${rounds.length} 轮 | 一次通过 ${stats.firstPass} | repair 后通过 ${stats.repaired} | 失败 ${stats.failed}`
)
console.log('='.repeat(72))
