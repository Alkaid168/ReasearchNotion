const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function candidatePnpmExecutables() {
  const candidates = []
  candidates.push(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'bin', 'pnpm.cmd'))
  candidates.push(process.platform === 'win32' ? 'corepack.cmd' : 'corepack')
  if (process.env.npm_execpath) {
    candidates.push(process.env.npm_execpath)
  }

  candidates.push(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  return candidates
}

function runPnpm(args) {
  for (const candidate of candidatePnpmExecutables()) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue

    const isScript = candidate.endsWith('.js') || candidate.endsWith('.cjs')
    const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate)
    const isCorepack = /(^|[/\\])corepack(\.cmd)?$/i.test(candidate)
    const command = isScript ? process.execPath : candidate
    const commandArgs = isScript ? [candidate, ...args] : isCorepack ? ['pnpm', ...args] : args
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: isCmd })

    if (result.error && result.error.code === 'ENOENT') continue
    return result.status ?? 1
  }

  console.error('pnpm was not found. Please install pnpm or use the bundled Codex runtime.')
  return 1
}

module.exports = { rebuildNative: () => runPnpm(['rebuild', 'better-sqlite3']) }

if (require.main === module) {
  process.exit(runPnpm(['rebuild', 'better-sqlite3']))
}
