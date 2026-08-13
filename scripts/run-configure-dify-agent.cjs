const { spawnSync } = require('node:child_process')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const electronExecutable = require('electron')
const configureScript = path.join(__dirname, 'configure-dify-agent.mjs')

const result = spawnSync(electronExecutable, [configureScript], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  },
  stdio: 'inherit'
})

if (result.error) {
  console.error(`Unable to start the Dify configuration helper: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
