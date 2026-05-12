#!/usr/bin/env node
//
// `create-barefootjs` — entrypoint for `npm create barefootjs@latest`.
//
// Thin wrapper around the existing `barefoot init` command:
//   1. Pick the target directory from the first positional arg, or
//      prompt the user for one when omitted (TTY only — falls back to
//      "my-barefoot-app" in CI / piped contexts).
//   2. Refuse to scaffold into a non-empty directory.
//   3. Spawn `node <@barefootjs/cli bin> init` inside the target so
//      init writes its files there, forwarding any --adapter / --css
//      flags. `--yes` short-circuits all prompts by forcing the
//      adapter / css defaults too.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { text } from './text'

const require = createRequire(import.meta.url)

const DEFAULT_PROJECT_NAME = 'my-barefoot-app'
const DEFAULT_ADAPTER = 'hono'
const DEFAULT_CSS = 'unocss'

function usage(): never {
  console.log(`Usage: npm create barefootjs@latest [<project-name>] [-- --adapter <name>]

Scaffolds a runnable BarefootJS app. If <project-name> is omitted you'll
be prompted for one (defaults to "${DEFAULT_PROJECT_NAME}").

Options:
  -y, --yes           Accept all defaults (project name "${DEFAULT_PROJECT_NAME}", adapter hono, css unocss).
                      Skips every prompt — useful for CI and dotfiles.
  -h, --help          Show this message.

Forwarded to \`barefoot init\`:
  --adapter <name>    Adapter to use (default: hono)
  --css <name>        CSS library to use (default: unocss)

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

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) usage()

  const skipPrompts = args.includes('--yes') || args.includes('-y')
  const positional = args.find((a) => !a.startsWith('-'))
  const passthrough = args.filter(
    (a) => a !== positional && a !== '--yes' && a !== '-y',
  )

  // Resolve the project name. Three branches the user can land in:
  //   - explicit positional arg → use it, with a "✔ Using ..." confirmation
  //   - --yes (no positional)  → silently accept the default
  //   - interactive            → prompt for one (TTY-gated; the text()
  //                              helper falls back to the default in
  //                              CI / piped contexts to avoid hangs)
  let projectName: string
  if (positional) {
    projectName = positional
    console.log(`\n✔ Using target directory … ${projectName}`)
  } else if (skipPrompts) {
    projectName = DEFAULT_PROJECT_NAME
    console.log(`\n✔ Using target directory … ${projectName}`)
  } else {
    projectName = await text({
      message: 'Target directory',
      defaultValue: DEFAULT_PROJECT_NAME,
    })
  }

  const targetDir = resolve(process.cwd(), projectName)
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir).filter((e) => !e.startsWith('.'))
    if (entries.length > 0) {
      fail(`target directory "${projectName}" exists and is not empty.`)
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

  const initArgs = ['--name', projectName]
  // `--yes` short-circuits init's adapter / css selectors too by
  // explicitly forwarding the defaults — but only when the caller
  // hasn't already pinned them via passthrough flags.
  if (skipPrompts) {
    if (!passthrough.includes('--adapter')) initArgs.push('--adapter', DEFAULT_ADAPTER)
    if (!passthrough.includes('--css')) initArgs.push('--css', DEFAULT_CSS)
  }
  // Forward only flags that init itself recognizes; let it surface its
  // own errors for anything unknown rather than guessing here.
  for (const arg of passthrough) initArgs.push(arg)

  const result = spawnSync('node', [cliBin, 'init', ...initArgs], {
    cwd: targetDir,
    stdio: 'inherit',
  })

  process.exit(result.status ?? 1)
}

main().catch((err) => {
  // Bubble up unexpected failures (cancelled prompt, IO error, ...)
  // with a non-zero status. Known cancellations surface as a calm
  // single-line message rather than a stack trace.
  if (err && typeof err === 'object' && 'name' in err && err.name === 'TextCancelled') {
    console.error('\nCancelled — nothing scaffolded.')
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})
