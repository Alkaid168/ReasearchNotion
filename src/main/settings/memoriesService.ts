import type Database from 'better-sqlite3'
import type { UserMemory, UserMemoryInput } from '../../shared/types'

type MemoryRow = {
  id: string
  type: string
  name: string
  description: string
  body: string
  created_at: string
  updated_at: string
}

function rowToMemory(row: MemoryRow): UserMemory {
  return {
    id: row.id,
    type: row.type as UserMemory['type'],
    name: row.name,
    description: row.description,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * T12b: User memory service (Claude Code-style single-fact store).
 * Stores research field, language preference, writing style, feedback corrections,
 * active projects, and external references. Injected into the agent prompt at runtime.
 *
 * Design informed by Letta's filesystem benchmark (74% LoCoMo with simple storage)
 * and Claude Code's per-file memory pattern — SQLite rows are the equivalent of files.
 */
export function createMemoriesService(db: Database.Database) {
  function list(): UserMemory[] {
    const rows = db
      .prepare(`SELECT * FROM user_memories ORDER BY type, updated_at DESC`)
      .all() as MemoryRow[]
    return rows.map(rowToMemory)
  }

  function save(input: UserMemoryInput): UserMemory {
    const id = input.id ?? `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO user_memories (id, type, name, description, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         name = excluded.name,
         description = excluded.description,
         body = excluded.body,
         updated_at = excluded.updated_at`
    ).run(id, input.type, input.name, input.description, input.body, now, now)
    const row = db.prepare(`SELECT * FROM user_memories WHERE id = ?`).get(id) as MemoryRow
    return rowToMemory(row)
  }

  function remove(id: string): void {
    db.prepare(`DELETE FROM user_memories WHERE id = ?`).run(id)
  }

  /**
   * Build the memories prefix string for agent prompt injection.
   * Strategy:
   *   - user + preference: all (core identity + style, usually few)
   *   - feedback: latest 3 (recent corrections matter most)
   *   - project + reference: all (usually few, high signal)
   *   - Truncate total to maxChars to respect context budget.
   */
  function buildInjectionPrefix(maxChars = 1500): string {
    const memories = list()
    if (memories.length === 0) return ''

    const userPrefs = memories.filter((m) => m.type === 'user' || m.type === 'preference')
    const feedback = memories.filter((m) => m.type === 'feedback').slice(0, 3)
    const projectRef = memories.filter((m) => m.type === 'project' || m.type === 'reference')
    const selected = [...userPrefs, ...feedback, ...projectRef]

    const lines: string[] = ['User memories (research context + preferences):']
    let totalLen = lines[0].length

    for (const mem of selected) {
      const line = `- [${mem.type}] ${mem.name}: ${mem.body}`
      if (totalLen + line.length > maxChars) break
      lines.push(line)
      totalLen += line.length
    }

    return lines.length > 1 ? lines.join('\n') : ''
  }

  return { list, save, delete: remove, buildInjectionPrefix }
}
