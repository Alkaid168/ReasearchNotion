const { rebuildNative } = require('../scripts/rebuild-node.cjs')

function nativeModuleWorks() {
  try {
    const Database = require('better-sqlite3')
    const database = new Database(':memory:')
    database.close()
    return true
  } catch {
    return false
  }
}

// Electron and Node use different native ABIs. Only rebuild when the installed
// better-sqlite3 binary cannot be loaded by the Node process running Vitest.
module.exports = async function rebuildNativeForVitest() {
  if (nativeModuleWorks()) return

  const status = rebuildNative()
  if (status !== 0 || !nativeModuleWorks()) {
    throw new Error(
      `Native rebuild failed (exit ${status}). Run \`pnpm rebuild better-sqlite3\` manually. ` +
        'On Windows, use a short project path if the compiler reports a 260-character path limit.'
    )
  }
}
