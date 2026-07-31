import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DeepSeek endpoint switch script', () => {
  it('can switch Dify DeepSeek endpoint between local bridge and official API', () => {
    const script = readFileSync(resolve('scripts/use-deepseek-endpoint.mjs'), 'utf8')
    const packageJson = readFileSync(resolve('package.json'), 'utf8')

    expect(script).toContain('provider_credentials')
    expect(script).toContain('endpoint_url')
    expect(script).toContain('redis-cli')
    expect(script).toContain('provider_credentials:*')
    expect(script).toContain('__DIFY_TS__')
    expect(script).toContain('http://host.docker.internal:17778')
    expect(script).toContain('https://api.deepseek.com')
    expect(packageJson).toContain('use:deepseek-bridge')
    expect(packageJson).toContain('use:deepseek-official')
  })
})
