#!/usr/bin/env node
//
// `create-barefootjs` — entrypoint for `npm create barefootjs@latest`.
//
// Thin wrapper around the existing `barefoot init` command:
//   1. Pick the target directory from the first positional arg (or default
//      to "my-barefoot-app" if omitted).
//   2. Refuse to scaffold into a non-empty directory.
//   3. Spawn `node <@barefootjs/cli bin> init` inside the target so init
//      writes its files there, forwarding any --adapter / --name flags.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function usage(): never {
  console.log(`Usage: npm create barefootjs@latest [<project-name>] [-- --adapter <name>]

Scaffolds a runnable BarefootJS app in <project-name> (or "my-barefoot-app").

Options forwarded to \`barefoot init\`:
  --adapter <name>    Adapter to use (default: hono)

After scaffolding:
  cd <project-name>
  npm install
  npm run dev
`)
  process.exit(0)
}

function fail(msg: string): never {
  console.error(`Error: ${msg}`)
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) usage()

const positional = args.find((a) => !a.startsWith('-')) ?? 'my-barefoot-app'
const passthrough = args.filter((a) => a !== positional)

const targetDir = resolve(process.cwd(), positional)
if (existsSync(targetDir)) {
  const entries = readdirSync(targetDir).filter((e) => !e.startsWith('.'))
  if (entries.length > 0) {
    fail(`target directory "${positional}" exists and is not empty.`)
  }
} else {
  mkdirSync(targetDir, { recursive: true })
}

// `require.resolve` is Node-specific. `create-barefootjs` is invoked
// via `npm create barefootjs@latest` / `npx`, both of which are Node
// processes today; the package is not designed to run on Workers,
// Deno, or Bun-as-edge. Bun's Node-compat layer also supplies
// `createRequire`, so this works there too.
let cliBin: string
try {
  cliBin = require.resolve('@barefootjs/cli/dist/index.js')
} catch {
  fail(
    'unable to resolve @barefootjs/cli. ' +
      'Reinstall create-barefootjs or report this if it persists.',
  )
}

console.log(`\nScaffolding BarefootJS app in ${targetDir}\n`)

const initArgs = ['--name', positional]
// Forward only flags that init itself recognizes; let it surface its own
// errors for anything unknown rather than guessing here.
for (const arg of passthrough) initArgs.push(arg)

const result = spawnSync('node', [cliBin, 'init', ...initArgs], {
  cwd: targetDir,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
