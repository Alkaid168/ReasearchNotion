import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify app switch script', () => {
  it('switches local settings between the stable workflow and tool agent apps', () => {
    const script = readFileSync(resolve('scripts/use-dify-app.mjs'), 'utf8')
    const psScript = readFileSync(resolve('scripts/use-dify-app.ps1'), 'utf8')
    const packageJson = readFileSync(resolve('package.json'), 'utf8')

    expect(existsSync(resolve('use-dify-agent.bat'))).toBe(true)
    expect(existsSync(resolve('use-dify-workflow.bat'))).toBe(true)
    expect(script).toContain('ResearchNotion Academic QA Agent')
    expect(script).toContain('ResearchNotion Tool Agent')
    expect(script).toContain('writeLocalSettings')
    expect(script).toContain('api_tokens')
    expect(script).toContain('ResearchNotion Demo Library')
    expect(psScript).toContain("ValidateSet('workflow', 'agent')")
    expect(psScript).toContain('use:dify-agent')
    expect(psScript).toContain('use:dify-workflow')
    expect(packageJson).toContain('use:dify-workflow')
    expect(packageJson).toContain('use:dify-agent')
    expect(packageJson).toContain('node scripts/rebuild-node.cjs && node scripts/use-dify-app.mjs workflow')
    expect(packageJson).toContain('node scripts/rebuild-node.cjs && node scripts/use-dify-app.mjs agent')
  })
})
