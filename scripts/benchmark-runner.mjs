#!/usr/bin/env node
/**
 * T6 agent benchmark runner. Runs the tool benchmark and the trust benchmark,
 * then merges their JSON reports into a single agent-eval-full-<ts>.json so the
 * two dimensions (capability + safety) live in one file for regression diffing.
 *
 * Usage:
 *   node scripts/benchmark-runner.mjs                                 # tool k=3, trust k=2
 *   RESEARCH_NOTION_BENCHMARK_K=5 node scripts/benchmark-runner.mjs   # bump tool k
 *
 * Requires the Electron tool service (http://127.0.0.1:17777) and the Dify
 * ResearchNotion Tool Agent to be running. Run via direct node (not pnpm script)
 * to avoid the Windows non-TTY pnpm script quirk; remember to
 * `unset ELECTRON_RUN_AS_NODE` so the Electron tool service stays up.
 */
import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const benchDir = path.resolve(root, 'bench')

function runScript(scriptName, env) {
  console.log(`\n=== ${scriptName} ===`)
  const result = childProcess.spawnSync(process.execPath, [path.resolve(root, 'scripts', scriptName)], {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  // A non-zero exit from a sub-benchmark is propagated (it has already printed
  // its failure detail); we still try to merge whatever reports were written.
  if (result.status !== 0 && result.signal === null) {
    process.exitCode = 1
  }
}

function latestReport(prefix) {
  if (!fs.existsSync(benchDir)) throw new Error(`bench dir missing: ${benchDir}`)
  const files = fs
    .readdirSync(benchDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json') && !name.includes('-full-'))
    .sort()
  if (files.length === 0) throw new Error(`no ${prefix}*.json report (excluding -full-) found in ${benchDir}`)
  return JSON.parse(fs.readFileSync(path.resolve(benchDir, files[files.length - 1]), 'utf8'))
}

function main() {
  const toolK = Number(process.env.RESEARCH_NOTION_BENCHMARK_K ?? 3)
  const trustK = Number(process.env.RESEARCH_NOTION_TRUST_K ?? 2)

  runScript('benchmark-dify-tool-agent.mjs', { RESEARCH_NOTION_BENCHMARK_K: String(toolK) })
  runScript('benchmark-dify-agent-trust.mjs', { RESEARCH_NOTION_TRUST_K: String(trustK) })

  let toolReport
  let trustReport
  try {
    toolReport = latestReport('agent-eval-')
    trustReport = latestReport('trust-eval-')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const merged = {
    meta: {
      timestamp: new Date().toISOString(),
      model: toolReport.meta?.model,
      k: { tool: toolK, trust: trustK }
    },
    toolCases: toolReport.toolCases ?? [],
    trustCases: trustReport.trustCases ?? [],
    aggregates: {
      ...(toolReport.aggregates ?? {}),
      ...(trustReport.aggregates ?? {})
    }
  }

  fs.mkdirSync(benchDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.resolve(benchDir, `agent-eval-full-${stamp}.json`)
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8')

  console.log(`\nmerged report: ${outPath}`)
  console.log('aggregates:')
  console.log(JSON.stringify(merged.aggregates, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
