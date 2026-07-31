import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/styles/app.css'), 'utf8')
const tokens = readFileSync(path.resolve(process.cwd(), 'src/renderer/styles/tokens.css'), 'utf8')

describe('desktop UX accessibility styles', () => {
  it('keeps keyboard focus visible and respects reduced motion', () => {
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation-duration: 0.01ms')
  })

  it('keeps reader controls and the AI drawer inside narrow desktop windows', () => {
    expect(css).toContain('max-width: calc(100% - 44px)')
    expect(css).toContain('@media (max-width: 900px)')
    expect(css).toContain('.pdf-reader {')
  })

  it('prevents page-level scrolling while preserving internal scroll regions', () => {
    expect(css).toContain('#root {\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  overflow: hidden;')
    expect(css).toContain('.app-frame {\n  position: fixed;\n  inset: 0;\n  overflow: hidden;')
    expect(css).toContain('.app-layout {\n  height: 100%;\n  min-height: 0;\n  overflow: hidden;')
    expect(css).toContain('.message-list {\n  min-height: 0;\n  overflow: auto;')
  })

  it('uses a compact desktop body scale while preserving component-level hierarchy', () => {
    expect(tokens).toContain('font-size: 15px;')
    expect(css).toContain('.topbar-tab {')
    expect(css).toContain('font-size: 13px;')
    expect(css).toContain('.markdown-content h1,')
  })

  it('keeps long selected passages compact inside the paper AI drawer', () => {
    expect(css).toContain('.emphasis-context p {\n  max-height: 84px;\n  overflow: auto;')
    expect(css).toContain('font-size: 12px;\n  line-height: 1.55;')
  })
})
