import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('native test setup', () => {
  it('checks the installed binding before rebuilding it', () => {
    const source = fs.readFileSync('tests/rebuild-native-global-setup.cjs', 'utf8')

    expect(source).toContain('if (nativeModuleWorks()) return')
    expect(source).toContain("new Database(':memory:')")
  })

  it('checks Electron compatibility before rebuilding for development', () => {
    const source = fs.readFileSync('scripts/ensure-electron-native.cjs', 'utf8')
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

    expect(source).toContain('if (electronNativeModuleWorks().ok)')
    expect(source).toContain("if (probe.result.stderr?.trim())")
    expect(source).toContain("extraModules: ['better-sqlite3']")
    expect(source).toContain("onlyModules: ['better-sqlite3']")
    expect(source).toContain("path.join(projectRoot, '.tmp', 'native-cache')")
    expect(source).toContain('resolveCompatiblePython()')
    expect(source).toContain('process.env.PYTHON = compatiblePython')
    expect(source).toContain('process.env.NODE_GYP_FORCE_PYTHON = compatiblePython')
    expect(source).toContain('process.env.npm_config_python = compatiblePython')
    expect(packageJson.scripts.dev).toBe('electron-vite dev')
    expect(packageJson.scripts['dev:check-native']).toContain('ensure-electron-native.cjs')
  })
})
