import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify check script', () => {
  it('checks the Tool Agent and its local tool provider', () => {
    const script = readFileSync(resolve('scripts/check-dify-research-agent.mjs'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts['check:dify']).toBe('node scripts/check-dify-research-agent.mjs')
    expect(script).toContain('ResearchNotion Tool Agent')
    expect(script).toContain('ResearchNotion_Local_Tools')
    expect(script).toContain('tool_api_providers')
    expect(script).toContain('agent-chat')
    expect(script).toContain("info.mode === 'agent-chat'")
    expect(script).toContain('function_call')
    expect(script).toContain('Dify Tool Agent')
    expect(script).toContain('expectedToolCount = 16')
    expect(script).toContain('readToolAgentToken')
    expect(script).toContain("from api_tokens")
    expect(script).toContain('provider_credentials')
    expect(script).toContain('endpoint_url')
    expect(script).toContain('DeepSeek endpoint')
    expect(script).not.toContain('ResearchNotion Academic QA Agent')
  })
})
