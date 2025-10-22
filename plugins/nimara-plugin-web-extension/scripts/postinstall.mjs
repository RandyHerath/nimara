import process from 'node:process'

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let presetAvailable = true
try {
  require.resolve('@proj-airi/unocss-preset-chromatic')
}
catch {
  presetAvailable = false
  console.warn('[nimara-plugin-web-extension] Skipping wxt prepare: chromatic preset is not built yet.')
}

if (!presetAvailable || process.env.SKIP_WXT_PREPARE === 'true') {
  process.exit(0)
}

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpmCmd, ['wxt', 'prepare'], { stdio: 'inherit' })

if (result.error) {
  console.warn('[nimara-plugin-web-extension] wxt prepare failed to start:', result.error)
  process.exit(0)
}

if (result.status !== 0) {
  console.warn(`[nimara-plugin-web-extension] \`wxt prepare\` exited with code ${result.status}. Continuing install.`)
  process.exit(0)
}
