import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pdfjsPackageJson = require.resolve('pdfjs-dist/package.json')
const sourceDir = join(dirname(pdfjsPackageJson), 'standard_fonts')
const targetDir = fileURLToPath(new URL('../dist/renderer/standard_fonts', import.meta.url))

rmSync(targetDir, { force: true, recursive: true })
mkdirSync(targetDir, { recursive: true })

for (const entry of readdirSync(sourceDir)) {
  const sourcePath = join(sourceDir, entry)
  if (statSync(sourcePath).isFile()) {
    copyFileSync(sourcePath, join(targetDir, entry))
  }
}
