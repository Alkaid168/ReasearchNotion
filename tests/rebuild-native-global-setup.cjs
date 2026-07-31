const { rebuildNative } = require('../scripts/rebuild-node.cjs')

// Ensures better-sqlite3 is rebuilt for the Node.js ABI before vitest runs.
// Implemented as a vitest globalSetup so `pnpm test` stays a single command,
// avoiding pnpm's Windows script-shell mis-parsing of `node <path> && ...`.
module.exports = async function rebuildNativeForVitest() {
  const status = rebuildNative()
  if (status !== 0) {
    throw new Error(
      `Native rebuild failed (exit ${status}). Run \`pnpm rebuild better-sqlite3\` manually.`
    )
  }
}
