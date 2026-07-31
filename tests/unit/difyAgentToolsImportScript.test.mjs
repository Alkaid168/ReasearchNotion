import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify Agent tools import script', () => {
  it('imports ResearchNotion OpenAPI tools through Dify service APIs', () => {
    const script = readFileSync(resolve('scripts/import-dify-agent-tools.mjs'), 'utf8')
    const authScript = readFileSync(resolve('scripts/tool-service-auth.mjs'), 'utf8')

    expect(script).toContain('ApiToolManageService')
    expect(script).toContain('ResearchNotion_Local_Tools')
    expect(script).toContain('tool_api_providers')
    expect(script).toContain('auth_type')
    expect(script).toContain('api_key_header')
    expect(script).toContain('toolServiceTokenHeader')
    expect(authScript).toContain('X-ResearchNotion-Tool-Token')
    expect(script).toContain('readToolServiceToken')
    expect(script).toContain('get_current_context')
    expect(script).toContain('get_paper_outline')
    expect(script).toContain('get_paper_text_chunk')
    expect(script).toContain('search_library')
    expect(script).toContain('investigate_library')
    expect(script).toContain('create_api_tool_provider')
    expect(script).toContain('update_api_tool_provider')
  })
})
