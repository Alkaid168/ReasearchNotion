import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { readLocalSettings } from './research-notion-local-settings.mjs'

function statusLine(ok, label, detail) {
  return `${ok ? '[OK]' : '[FAIL]'} ${label}${detail ? `: ${detail}` : ''}`
}

function readConfig() {
  const local = readLocalSettings()
  const config = {
    baseUrl: process.env.DIFY_BASE_URL?.trim() || local.settings.baseUrl,
    appApiKey: process.env.DIFY_APP_API_KEY?.trim() || local.settings.appApiKey,
    knowledgeApiKey: process.env.DIFY_KNOWLEDGE_API_KEY?.trim() || local.settings.knowledgeApiKey
  }
  return {
    ...config,
    baseUrl: config.baseUrl?.replace(/\/+$/, '') ?? '',
    source: process.env.DIFY_BASE_URL || process.env.DIFY_APP_API_KEY || process.env.DIFY_KNOWLEDGE_API_KEY ? 'env' : local.dbPath,
    dbPath: local.dbPath,
    attemptedPaths: local.attemptedPaths,
    encryptedKeys: local.encryptedKeys
  }
}

async function readJson(response) {
  if (response.ok) return response.json()
  throw new Error(`HTTP ${response.status}: ${await response.text()}`)
}

async function getJson(url, apiKey) {
  return readJson(
    await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` }
    })
  )
}

export async function checkDifyReadiness(config) {
  const missingConfig = [
    ['DIFY_BASE_URL', config.baseUrl],
    ['DIFY_APP_API_KEY', config.appApiKey]
  ].filter(([, value]) => !value)

  if (missingConfig.length > 0) {
    return {
      ok: false,
      missingConfig: missingConfig.map(([name]) => name),
      appName: '',
      appMode: '',
      missingInputs: [],
      retrieverEnabled: false,
      knowledgeApiOk: false,
      error: '缺少 Dify 配置。'
    }
  }

  try {
    const info = await getJson(`${config.baseUrl}/v1/info`, config.appApiKey)
    const appMode = info.mode ?? 'unknown'

    return {
      ok: appMode === 'agent-chat',
      missingConfig: [],
      appName: info.name ?? '未命名',
      appMode,
      missingInputs: [],
      retrieverEnabled: true,
      knowledgeApiOk: Boolean(config.knowledgeApiKey),
      error: ''
    }
  } catch (error) {
    return {
      ok: false,
      missingConfig: [],
      appName: '',
      appMode: '',
      missingInputs: [],
      retrieverEnabled: false,
      knowledgeApiOk: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function collectLocalLibraryStatus(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return {
      ok: false,
      dbPath,
      folderCount: 0,
      paperCount: 0,
      pdfPaperCount: 0,
      indexedPaperCount: 0,
      cardCount: 0,
      missingFiles: [],
      unindexedPapers: [],
      papersWithoutCards: []
    }
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const count = (sql) => db.prepare(sql).get().count
    const papers = db
      .prepare(
        `SELECT p.id, p.title, p.file_type as fileType, p.file_path as filePath,
                p.index_status as indexStatus, p.dify_document_id as difyDocumentId,
                c.id as cardId
         FROM papers p
         LEFT JOIN paper_cards c ON c.paper_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all()

    const missingFiles = papers
      .filter((paper) => !paper.filePath || !fs.existsSync(paper.filePath))
      .map((paper) => ({ id: paper.id, title: paper.title, filePath: paper.filePath }))
    const unindexedPapers = papers
      .filter((paper) => paper.indexStatus !== 'indexed')
      .map((paper) => ({ id: paper.id, title: paper.title, indexStatus: paper.indexStatus }))
    const papersWithoutCards = papers.filter((paper) => !paper.cardId).map((paper) => ({ id: paper.id, title: paper.title }))

    const result = {
      dbPath,
      folderCount: count(`SELECT COUNT(*) as count FROM folders`),
      paperCount: papers.length,
      pdfPaperCount: count(`SELECT COUNT(*) as count FROM papers WHERE file_type = 'pdf'`),
      indexedPaperCount: count(`SELECT COUNT(*) as count FROM papers WHERE index_status = 'indexed'`),
      cardCount: count(`SELECT COUNT(*) as count FROM paper_cards`),
      missingFiles,
      unindexedPapers,
      papersWithoutCards
    }

    return {
      ...result,
      ok:
        result.folderCount > 0 &&
        result.paperCount > 0 &&
        result.pdfPaperCount > 0 &&
        result.indexedPaperCount > 0 &&
        result.cardCount > 0 &&
        result.missingFiles.length === 0
    }
  } finally {
    db.close()
  }
}

export function buildDemoReadinessReport({ config, dify, local }) {
  const lines = []
  lines.push('# ResearchNotion MVP Demo Verification')
  lines.push('')
  lines.push(statusLine(Boolean(config.source), '配置来源', config.source || '未找到本地设置或环境变量'))
  if (config.encryptedKeys.length > 0) {
    lines.push(statusLine(false, '脚本可读 Key', `${config.encryptedKeys.join('、')} 使用 safeStorage 加密`))
  }
  if (dify.missingConfig.length > 0) {
    lines.push(statusLine(false, 'Dify 配置', `缺少 ${dify.missingConfig.join(', ')}`))
  } else {
    lines.push(statusLine(dify.ok, 'Dify App', dify.appName ? `${dify.appName} (${dify.appMode})` : dify.error))
    lines.push(statusLine(dify.ok, 'Agent 模式', dify.ok ? '已启用' : '当前 App 不是 agent-chat'))
    lines.push(statusLine(true, '知识库归档', dify.knowledgeApiOk ? '保留既有 Dify 知识库配置' : '未配置，Tool Agent 不受影响'))
  }
  lines.push(statusLine(local.folderCount > 0, '论文库数量', String(local.folderCount)))
  lines.push(statusLine(local.paperCount > 0, '论文数量', String(local.paperCount)))
  lines.push(statusLine(local.pdfPaperCount > 0, 'PDF 论文数量', String(local.pdfPaperCount)))
  lines.push(statusLine(local.indexedPaperCount > 0, '已索引论文', String(local.indexedPaperCount)))
  lines.push(statusLine(local.cardCount > 0, '论文卡片', String(local.cardCount)))
  lines.push(statusLine(local.missingFiles.length === 0, '本地论文文件', local.missingFiles.length ? `${local.missingFiles.length} 个缺失` : '完整'))

  if (local.unindexedPapers.length > 0) {
    lines.push('')
    lines.push(`提示：还有 ${local.unindexedPapers.length} 篇论文未完成索引，演示时优先选择已索引论文。`)
  }
  if (local.papersWithoutCards.length > 0) {
    lines.push(`提示：还有 ${local.papersWithoutCards.length} 篇论文缺少论文卡片。`)
  }
  if (local.missingFiles.length > 0) {
    lines.push('')
    lines.push('缺失文件：')
    for (const paper of local.missingFiles.slice(0, 8)) {
      lines.push(`- ${paper.title}: ${paper.filePath}`)
    }
  }

  const ok = dify.ok && local.ok && config.encryptedKeys.length === 0
  lines.push('')
  lines.push(ok ? '结果：MVP 演示环境可用。' : '结果：MVP 演示环境仍有问题，请按 FAIL 项处理。')
  return { ok, text: lines.join('\n') }
}

async function main() {
  const config = readConfig()
  const dify = await checkDifyReadiness(config)
  const local = collectLocalLibraryStatus(config.dbPath)
  const report = buildDemoReadinessReport({ config, dify, local })
  console.log(report.text)
  if (!report.ok) process.exitCode = 1
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
