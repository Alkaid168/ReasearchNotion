import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify demo paper seed script', () => {
  it('uses cached PDFs and retries transient paper downloads', () => {
    const script = readFileSync(resolve('scripts/seed-dify-demo-papers.mjs'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts['seed:dify']).toBe('node scripts/seed-dify-demo-papers.mjs')
    expect(script).toContain('downloadAttemptCount = 4')
    expect(script).toContain('cachedPaperPath')
    expect(script).toContain('folder_demo_researchnotion_trust')
    expect(script).toContain('SYSTEM OVERRIDE')
    expect(script).toContain('复用本地缓存')
    expect(script).toContain('AbortSignal.timeout(60_000)')
    expect(script).toContain('下载失败，准备重试')
  })
})
