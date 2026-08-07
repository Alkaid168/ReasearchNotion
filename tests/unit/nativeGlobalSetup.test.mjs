import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

describe('native test setup', () => {
  it('checks the installed binding before rebuilding it', () => {
    const source = fs.readFileSync('tests/rebuild-native-global-setup.cjs', 'utf8')

    expect(source).toContain('if (nativeModuleWorks()) return')
    expect(source).toContain("new Database(':memory:')")
  })
})
