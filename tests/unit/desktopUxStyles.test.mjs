import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const normalizeLineEndings = (text) => text.replace(/\r\n/g, '\n')
const css = normalizeLineEndings(readFileSync(path.resolve(process.cwd(), 'src/renderer/styles/app.css'), 'utf8'))
const tokens = normalizeLineEndings(readFileSync(path.resolve(process.cwd(), 'src/renderer/styles/tokens.css'), 'utf8'))

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

  it('provides GPT refinement tokens for motion, float shadows, radius and z-order', () => {
    expect(tokens).toContain('--rn-ease-out: cubic-bezier(0.16, 1, 0.3, 1);')
    expect(tokens).toContain('--rn-duration-normal: 200ms;')
    expect(tokens).toContain('--rn-shadow-dropdown: 0 8px 28px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);')
    expect(tokens).toContain('--rn-shadow-float: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);')
    expect(tokens).toContain('--rn-radius-md: 12px;')
    expect(tokens).toContain('--rn-z-toast: 40;')
  })

  it('differentiates the active model option weight from inactive options', () => {
    expect(css).toContain('.model-selector-option strong {\n  font-weight: 500;')
    expect(css).toContain('.model-selector-option.active strong {\n  font-weight: 700;')
  })
})
