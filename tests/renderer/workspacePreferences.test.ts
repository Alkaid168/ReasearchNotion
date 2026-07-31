import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const storageKey = 'research-notion:workspace-preferences'

describe('workspace preferences contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('provides a guarded versioned preferences module', async () => {
    const modulePath = '../../src/renderer/state/workspacePreferences'
    const preferencesModule = await import(modulePath).catch(() => null)

    expect(preferencesModule).not.toBeNull()
    const readWorkspacePreferences = preferencesModule?.readWorkspacePreferences as (() => unknown) | undefined
    expect(readWorkspacePreferences).toBeTypeOf('function')
    window.localStorage.setItem(storageKey, '{broken-json')
    expect(readWorkspacePreferences?.()).toEqual({
      activeTab: 'chat',
      selectedConversationId: null,
      selectedConversationFolderId: null,
      expandedConversationFolderIds: null,
      conversationSidebar: {
        width: 272,
        collapsed: false
      },
      knowledge: {
        activeFolderId: null,
        activePaperId: null,
        expandedFolderIds: [],
        paperViews: {},
        sidebarWidth: 280,
        sidebarCollapsed: false
      }
    })
  })

  it('keeps the sidebar track stable while the main panel shrinks', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/app.css'), 'utf8')

    expect(css).toContain('grid-template-columns: var(--conversation-sidebar-width) 7px minmax(0, 1fr)')
    expect(css).toMatch(/\.sidebar\s*\{[\s\S]*?min-width:\s*0;/)
    expect(css).toMatch(/\.main-panel\s*\{[\s\S]*?min-width:\s*0;/)
  })
})
