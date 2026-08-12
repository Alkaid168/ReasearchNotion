const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const electronExecutable = require('electron')
const probeScript = path.join(__dirname, 'probe-electron-native.cjs')
const readyMarker = path.join(projectRoot, '.tmp', 'electron-native-ready.json')

function nativeSignature() {
  try {
    const electronVersion = require('electron/package.json').version
    const sqliteVersion = require('better-sqlite3/package.json').version
    const sqlitePackageDir = path.dirname(require.resolve('better-sqlite3/package.json'))
    const nativePath = path.join(sqlitePackageDir, 'build', 'Release', 'better_sqlite3.node')
    const nativeStat = fs.statSync(nativePath)
    return {
      electronVersion,
      sqliteVersion,
      nativeSize: nativeStat.size,
      nativeModifiedMs: Math.round(nativeStat.mtimeMs)
    }
  } catch {
    return null
  }
}

function markerMatches(signature) {
  if (!signature) return false
  try {
    const marker = JSON.parse(fs.readFileSync(readyMarker, 'utf8'))
    return Object.entries(signature).every(([key, value]) => marker[key] === value)
  } catch {
    return false
  }
}

function saveReadyMarker(signature) {
  if (!signature) return
  fs.mkdirSync(path.dirname(readyMarker), { recursive: true })
  fs.writeFileSync(readyMarker, `${JSON.stringify(signature)}\n`, 'utf8')
}

function electronNativeModuleWorks() {
  const result = spawnSync(electronExecutable, [probeScript], {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  return { ok: result.status === 0, result }
}

function resolveCompatiblePython() {
  const bundledPython = process.env.USERPROFILE
    ? path.join(
        process.env.USERPROFILE,
        '.cache',
        'codex-runtimes',
        'codex-primary-runtime',
        'dependencies',
        'python',
        'python.exe'
      )
    : null
  const candidates =
    process.platform === 'win32'
      ? [
          ...(bundledPython && fs.existsSync(bundledPython)
            ? [{ command: bundledPython, args: [] }]
            : []),
          { command: 'py', args: ['-3'] },
          { command: 'python', args: [] }
        ]
      : [
          { command: 'python3', args: [] },
          { command: 'python', args: [] }
        ]

  if (process.platform === 'win32') {
    const discovered = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); (Get-Command python -All).Source'
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    )
    if (discovered.status === 0) {
      for (const executable of discovered.stdout.split(/\r?\n/).filter(Boolean)) {
        candidates.push({ command: executable, args: [] })
      }
    }
  }

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.args, '-c', 'import sys; print(sys.executable); raise SystemExit(sys.version_info < (3, 8))'],
      { cwd: projectRoot, encoding: 'utf8' }
    )
    if (result.status === 0) {
      return path.isAbsolute(candidate.command) ? candidate.command : result.stdout.trim()
    }
  }
  return null
}

async function rebuildForElectron() {
  const { rebuild } = await import('@electron/rebuild')
  const electronVersion = require('electron/package.json').version
  process.env.npm_config_cache = path.join(projectRoot, '.tmp', 'native-cache')
  const compatiblePython = resolveCompatiblePython()
  if (compatiblePython) {
    process.env.PYTHON = compatiblePython
    process.env.NODE_GYP_FORCE_PYTHON = compatiblePython
    process.env.npm_config_python = compatiblePython
  }

  await rebuild({
    buildPath: projectRoot,
    electronVersion,
    force: true,
    extraModules: ['better-sqlite3'],
    onlyModules: ['better-sqlite3']
  })
}

async function main() {
  const initialSignature = nativeSignature()
  if (markerMatches(initialSignature)) {
    console.log('better-sqlite3 Electron check is cached; starting immediately.')
    return
  }

  if (electronNativeModuleWorks().ok) {
    saveReadyMarker(initialSignature)
    console.log('better-sqlite3 is ready for Electron; skipping native rebuild.')
    return
  }

  console.log('better-sqlite3 is not compatible with Electron; rebuilding once...')
  try {
    await rebuildForElectron()
  } catch (error) {
    console.error(error)
    console.error(
      'Electron native rebuild failed. On Windows, retry from a short project path if the compiler reports a 260-character path limit.'
    )
    process.exit(1)
  }

  const probe = electronNativeModuleWorks()
  if (!probe.ok) {
    console.error('Electron native rebuild completed, but the compatibility probe still failed.')
    if (probe.result.error) console.error(probe.result.error)
    if (probe.result.stderr?.trim()) console.error(probe.result.stderr.trim())
    process.exit(1)
  }

  saveReadyMarker(nativeSignature())
  console.log('better-sqlite3 rebuild for Electron completed.')
}

void main()
