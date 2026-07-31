import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Dify provisioning workflow prompt', () => {
  it('keeps the generated QA node aligned with the desktop prompt contract', () => {
    const script = readFileSync(resolve('scripts/provision-dify-research-agent.mjs'), 'utf8')

    expect(script).toContain('不要自我介绍')
    expect(script).toContain('不要复述用户任务')
    expect(script).toContain('当前上下文类型为 folder 时，只在当前论文库范围内回答')
    expect(script).toContain('当前上下文类型为 paper 时，只围绕当前论文回答')
    expect(script).toContain('不要把其他论文的结论当作当前论文内容')
    expect(script).not.toContain('绉戠爺')
    expect(script).not.toContain('鈥')
  })

  it('prints the local OpenAPI tool import URL for the Dify Agent setup', () => {
    const script = readFileSync(resolve('scripts/provision-dify-research-agent.mjs'), 'utf8')

    expect(script).toContain('host.docker.internal:17777')
    expect(script).toContain('openapi.json?server=')
    expect(script).toContain('RESEARCH_NOTION_TOOL_BASE_URL')
    expect(script).toContain('get_current_context')
    expect(script).toContain('get_current_page_text')
    expect(script).toContain('get_paper_metadata')
    expect(script).toContain('get_paper_page_text')
    expect(script).toContain('get_paper_section')
    expect(script).toContain('list_library_papers')
    expect(script).toContain('search_current_paper')
    expect(script).toContain('search_library')
    expect(script).toContain('English query')
    expect(script).toContain('不要只依赖一次知识库召回')
  })

  it('disables DeepSeek v4 thinking in Dify-visible model nodes', () => {
    const script = readFileSync(resolve('scripts/provision-dify-research-agent.mjs'), 'utf8')

    expect(script).toContain('thinking: false')
  })
})
