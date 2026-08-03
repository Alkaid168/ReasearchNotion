import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify Tool Agent configuration scripts', () => {
  it('configures one Tool Agent route and does not ship the old Workflow switch', () => {
    const script = readFileSync(resolve('scripts/configure-dify-agent.mjs'), 'utf8')
    const psScript = readFileSync(resolve('scripts/configure-dify-agent.ps1'), 'utf8')
    const batchScript = readFileSync(resolve('use-dify-agent.bat'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(existsSync(resolve('use-dify-agent.bat'))).toBe(true)
    expect(existsSync(resolve('use-dify-workflow.bat'))).toBe(false)
    expect(existsSync(resolve('scripts/use-dify-app.mjs'))).toBe(false)
    expect(existsSync(resolve('scripts/use-dify-app.ps1'))).toBe(false)
    expect(existsSync(resolve('scripts/provision-dify-research-agent.mjs'))).toBe(false)
    expect(script).toContain('ResearchNotion Tool Agent')
    expect(script).toContain("appMode !== 'agent-chat'")
    expect(script).toContain('writeLocalSettings')
    expect(script).toContain('ResearchNotion Demo Library')
    expect(psScript).toContain('use:dify-agent')
    expect(batchScript).toContain('configure-dify-agent.ps1')
    expect(packageJson.scripts['use:dify-agent']).toBe('node scripts/configure-dify-agent.mjs')
    expect(packageJson.scripts['provision:dify-agent']).toContain('scripts/configure-dify-agent.mjs')
    expect(packageJson.scripts).not.toHaveProperty('use:dify-workflow')
    expect(packageJson.scripts).not.toHaveProperty('provision:dify')
  })
})
