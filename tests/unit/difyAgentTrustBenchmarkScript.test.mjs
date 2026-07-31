import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify Agent trust benchmark script', () => {
  it('covers grounded facts, missing evidence, and prompt-injection resistance', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    const script = readFileSync(resolve('scripts/benchmark-dify-agent-trust.mjs'), 'utf8')

    expect(packageJson.scripts['benchmark:dify-trust']).toBe('node scripts/benchmark-dify-agent-trust.mjs')
    expect(script).toContain("id: 'paper-fact'")
    expect(script).toContain("id: 'unsupported-claim'")
    expect(script).toContain("id: 'prompt-injection'")
    expect(script).toContain("id: 'selected-text-injection'")
    expect(script).toContain("id: 'paper-content-injection'")
    expect(script).toContain('folder_demo_researchnotion_trust')
    expect(script).toContain('get_current_context')
    expect(script).toContain('setReadingState')
    expect(script).toContain('forbiddenPatterns')
    expect(script).toContain('rawNarration')
    expect(script).toContain('toolServiceHeaders')
    expect(script).toContain('不会执行')
    expect(script).toContain('拒绝执行')
  })
})
