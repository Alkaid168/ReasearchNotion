import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

describe('demo preparation scripts', () => {
  it('provides a Windows entrypoint and a dry-run checklist', () => {
    const batchPath = path.join(repoRoot, 'prepare-demo.bat')
    const bridgeBatchPath = path.join(repoRoot, 'start-deepseek-bridge.bat')
    const scriptPath = path.join(repoRoot, 'scripts', 'prepare-demo.ps1')
    const launcherPath = path.join(repoRoot, 'scripts', 'start-research-notion.ps1')
    const readmePath = path.join(repoRoot, 'README.md')
    const runbookPath = path.join(repoRoot, 'docs', 'mvp-runbook.md')

    expect(existsSync(batchPath)).toBe(true)
    expect(existsSync(bridgeBatchPath)).toBe(true)
    expect(existsSync(scriptPath)).toBe(true)
    expect(existsSync(launcherPath)).toBe(true)

    const output = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-DryRun'],
      { cwd: repoRoot, encoding: 'utf8' }
    )

    expect(output).toContain('ResearchNotion demo preparation')
    expect(output).toContain('pnpm provision:dify')
    expect(output).toContain('scripts\\start-dify.ps1 -NoOpen')
    expect(output).toContain('pnpm use:deepseek-bridge')
    expect(output).toContain('pnpm import:dify-tools')
    expect(output).toContain('pnpm provision:dify-agent')
    expect(output).toContain('pnpm seed:dify')
    expect(output).toContain('pnpm verify:mvp')
    expect(output).toContain('pnpm rebuild:native')

    const launcher = readFileSync(launcherPath, 'utf8')
    const prepareScript = readFileSync(scriptPath, 'utf8')
    expect(launcher).toContain('deepseek:bridge')
    expect(launcher).toContain('http://127.0.0.1:17778/health')
    expect(launcher).toContain('Test-Dify')
    expect(launcher).toContain('scripts\\start-dify.ps1')
    expect(launcher).toContain('-NoOpen')
    expect(prepareScript).toContain("'start-dify.ps1'), '-NoOpen'")

    const readme = readFileSync(readmePath, 'utf8')
    const runbook = readFileSync(runbookPath, 'utf8')
    expect(readme).toContain('DeepSeek')
    expect(readme).toContain('14')
    expect(runbook).toContain('DeepSeek bridge')
    expect(runbook).toContain('http://host.docker.internal:17778')
    expect(runbook).toContain('prepare-demo.bat` starts it automatically')
  })

  it('lets the Dify launcher start quietly for desktop startup', () => {
    const difyScriptPath = path.join(repoRoot, 'scripts', 'start-dify.ps1')
    const script = readFileSync(difyScriptPath, 'utf8')

    expect(script).toContain('param(')
    expect(script).toContain('[switch]$NoOpen')
    expect(script).toContain('if (-not $NoOpen)')
    expect(script).toContain('Start-Process $DifyUrl')
  })

  it('lets Node rebuild scripts fall back to Corepack when pnpm is not on PATH', () => {
    const rebuildScriptPath = path.join(repoRoot, 'scripts', 'rebuild-node.cjs')
    const script = readFileSync(rebuildScriptPath, 'utf8')

    expect(script).toContain('corepack.cmd')
    expect(script).toContain("['pnpm', ...args]")
  })
})
