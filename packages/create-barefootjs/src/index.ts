#!/usr/bin/env node
//
// `create-barefootjs` — entrypoint for `npm create barefootjs@latest`.
//
// Thin wrapper around the existing `bf init` command:
//   1. Pick the target directory from the first positional arg, or
//      prompt the user for one when omitted (TTY only — falls back to
//      "my-app" in CI / piped contexts).
//   2. Refuse to scaffold into a non-empty directory.
//   3. Spawn `node <@barefootjs/cli bin> init` inside the target so
//      init writes its files there, forwarding any --adapter / --css
//      flags. `--yes` short-circuits all prompts by forcing the
//      adapter / css defaults too.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { text } from './text'

const require = createRequire(import.meta.url)

const DEFAULT_PROJECT_NAME = 'my-app'
const DEFAULT_ADAPTER = 'hono'
const DEFAULT_CSS = 'unocss'

// Highlight a user-supplied value (project name, picked option label,
// ...) in bold green when stdout is a TTY. In non-TTY contexts (CI,
// piped output) we keep the value plain so log files don't carry ANSI
// noise that's hard to read after the fact.
function highlight(value: string): string {
  return process.stdout.isTTY ? `\x1b[1;32m${value}\x1b[0m` : value
}

// Dim a secondary line (e.g. version banner) so it sits visually
// behind the primary "✔ Target directory" + Next-steps content.
function dim(value: string): string {
  return process.stdout.isTTY ? `\x1b[2m${value}\x1b[0m` : value
}

// `../package.json` is resolved at runtime from the bundled
// `dist/index.js`. `createRequire`'s `require` is opaque to esbuild,
// so the JSON isn't pulled into the bundle — npm publish ships the
// real file alongside `dist/`.
const ownPkg = require('../package.json') as {
  version: string
  dependencies?: Record<string, string>
}
const CREATE_BAREFOOTJS_VERSION = ownPkg.version

// pkg.pr.new install detection. Until the first npm publish lands,
// `npm create barefootjs@latest` 404s on the registry; the only working
// install path is `npm i https://pkg.pr.new/<owner>/<repo>/create-barefootjs@<ref>`,
// which pkg-pr.new rewrites our own `@barefootjs/cli` dep on to point
// at the same SHA. If we detect that pattern we propagate the base URL
// + ref to `bf init` so it can rewrite the generated app's
// `@barefootjs/*: "latest"` entries to the same SHA — otherwise the
// user has to do six manual edits in package.json before `npm install`
// will resolve, which is exactly the friction the docs called out as
// step 3 of the alpha install path.
//
// Matches the URL shape pkg-pr.new emits: `https://pkg.pr.new/<owner>/<repo>/@barefootjs/cli@<ref>`
// where <ref> is either a 40-char commit SHA, a 7-char short SHA, or
// a PR number (digits-only). Exported for unit coverage of the parse;
// runtime invocation is detectPkgPrNewBaseAndRef() below.
export const PKG_PR_NEW_CLI_RE =
  /^https:\/\/pkg\.pr\.new\/([^/\s]+\/[^/\s]+)\/@barefootjs\/cli@([0-9a-f]{6,40}|\d+)$/i
export function parsePkgPrNewCliDep(cliDep: string | undefined): { base: string; ref: string } | null {
  if (!cliDep) return null
  const m = PKG_PR_NEW_CLI_RE.exec(cliDep)
  if (!m) return null
  const [, ownerRepo, ref] = m
  return { base: `https://pkg.pr.new/${ownerRepo}`, ref }
}
function detectPkgPrNewBaseAndRef(): { base: string; ref: string } | null {
  return parsePkgPrNewCliDep(ownPkg.dependencies?.['@barefootjs/cli'])
}

function usage(): never {
  console.log(`Usage: npm create barefootjs@latest [<project-name>] [-- --adapter <name>]

Scaffolds a runnable BarefootJS app. If <project-name> is omitted you'll
be prompted for one (defaults to "${DEFAULT_PROJECT_NAME}").

Options:
  -y, --yes           Accept all defaults (project name "${DEFAULT_PROJECT_NAME}", adapter hono, css unocss).
                      Skips every prompt — useful for CI and dotfiles.
  -h, --help          Show this message.

Forwarded to \`bf init\`:
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

  // Banner + a blank padding line. The padding stays in place across
  // the prompt → confirmation transition: the interactive prompt fills
  // the row beneath the empty line, then `text()` wipes it on submit
  // and the caller's confirmation is written into the same row. With
  // no padding the prompt and the confirmation would land on
  // different rows relative to the banner.
  console.log(dim(`create-barefootjs version ${CREATE_BAREFOOTJS_VERSION}`))
  console.log()

  const skipPrompts = args.includes('--yes') || args.includes('-y')
  const positional = args.find((a) => !a.startsWith('-'))
  const passthrough = args.filter(
    (a) => a !== positional && a !== '--yes' && a !== '-y',
  )

  // Resolve the project name. Three branches the user can land in:
  //   - explicit positional arg → use it
  //   - --yes (no positional)  → silently accept the default
  //   - interactive            → prompt (TTY-gated; falls back to the
  //                              default in CI / piped contexts)
  // All three produce the same "✔ Target directory <name>" line, so
  // the transcript reads consistently regardless of how the value was
  // supplied.
  let projectName: string
  if (positional) {
    projectName = positional
  } else if (skipPrompts) {
    projectName = DEFAULT_PROJECT_NAME
  } else {
    projectName = await text({
      message: 'Target directory',
      defaultValue: DEFAULT_PROJECT_NAME,
    })
  }
  // No leading \n here: the banner already emitted a padding line, and
  // for the prompt branch `text()` has just wiped its row — we write
  // the confirmation directly into that same row.
  console.log(`✔ Target directory ${highlight(projectName)}`)

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

  // `--name` gets the last path segment, sanitized later by init —
  // multi-segment inputs like "foo/bar/bazz" would otherwise leak
  // slashes into package.json / wrangler.jsonc names where they're
  // invalid. The user-typed path stays available to init via
  // BAREFOOT_INIT_PROJECT_PATH so the "cd ..." line in the Next steps
  // guide still echoes what the user typed.
  const initArgs = ['--name', basename(projectName)]
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

  const pkgPrNew = detectPkgPrNewBaseAndRef()

  const result = spawnSync('node', [cliBin, 'init', ...initArgs], {
    cwd: targetDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Init reads this when rendering the "cd <path>" Next-steps
      // line so a "foo/bar/bazz" positional shows as `cd foo/bar/bazz`
      // instead of just `cd bazz`.
      BAREFOOT_INIT_PROJECT_PATH: projectName,
      // Sentinel — the only way `bf init` runs. Direct invocations
      // (without this var) are bounced with a redirect to
      // `npm create barefootjs@latest`. See packages/cli/src/commands/init.ts.
      BAREFOOT_INIT_VIA_CREATE: '1',
      // Alpha install path: when create-barefootjs was itself installed
      // from pkg.pr.new, forward the base URL + ref so init rewrites
      // the generated `package.json`'s `@barefootjs/*: "latest"` entries
      // to URLs pinned at the same SHA. Unset under a normal npm install
      // — in which case init leaves "latest" alone.
      ...(pkgPrNew
        ? {
            BAREFOOT_PKG_PR_NEW_BASE: pkgPrNew.base,
            BAREFOOT_PKG_PR_NEW_REF: pkgPrNew.ref,
          }
        : {}),
    },
  })

  process.exit(result.status ?? 1)
}

// Only auto-run when invoked as a binary (via the shebang) — not when
// `src/index.ts` is imported from a unit test to exercise the exported
// pure helpers (`parsePkgPrNewCliDep`, ...). The bundled `dist/index.js`
// is always run as the entry; the import-time branch only matters for
// tests that point bun at the TS source.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false
  try {
    const entryUrl = new URL(`file://${process.argv[1]}`).href
    return entryUrl === import.meta.url
  } catch {
    return false
  }
})()

if (invokedAsScript) {
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
}
