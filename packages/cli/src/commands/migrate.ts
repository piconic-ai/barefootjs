// `barefoot migrate` — fold a legacy `barefoot.json` into `barefoot.config.ts`.
//
// Background: until issue #1097 the project carried two configs. `paths`
// lived in `barefoot.json` (consumed by registry tooling) and the adapter
// + build options lived in `barefoot.config.ts`. The new layout merges
// `paths` into `barefoot.config.ts` so the project has a single source of
// truth.
//
// This command performs the upgrade:
//
//   1. Read the legacy `barefoot.json` (must exist).
//   2. Read the existing `barefoot.config.ts` (must exist — registry-only
//      projects have no adapter and stay on JSON until that changes).
//   3. Inject a `paths: {...}` block into the `createConfig({...})` call
//      in `barefoot.config.ts`. If a `paths` field already exists, leave
//      the file alone and assume the user already migrated.
//   4. Delete the legacy `barefoot.json`.
//
// We do not try to be clever with AST parsing here. The starter template
// uses a stable shape (`createConfig({ ... })`) and the codemod is forgiving:
// when the file shape is unrecognised we fail loudly rather than silently
// producing bad output.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { findBarefootJson, loadBarefootConfig } from '../context'

export async function run(args: string[], _ctx: CliContext): Promise<void> {
  const dryRun = args.includes('--dry-run')
  const cwd = process.cwd()

  const jsonPath = findBarefootJson(cwd)
  if (!jsonPath) {
    console.error('Error: no barefoot.json found in or above the current directory.')
    console.error('       Nothing to migrate.')
    process.exit(1)
  }

  const projectDir = path.dirname(jsonPath)
  const tsPath = path.join(projectDir, 'barefoot.config.ts')

  if (!existsSync(tsPath)) {
    console.error(`Error: barefoot.config.ts not found at ${tsPath}.`)
    console.error('       This is likely a `barefoot init --registry-only` project, which keeps')
    console.error('       barefoot.json until an adapter is added. To migrate, first add an')
    console.error('       adapter (e.g. write a barefoot.config.ts that imports `createConfig`')
    console.error('       from `@barefootjs/hono/build`) and re-run `barefoot migrate`.')
    process.exit(1)
  }

  const json = loadBarefootConfig(jsonPath)
  const ts = readFileSync(tsPath, 'utf-8')

  if (/(^|\W)paths\s*:/.test(ts)) {
    console.log(`barefoot.config.ts already declares \`paths\` — assuming this project is already migrated.`)
    console.log(`If that is wrong, edit the file by hand and delete barefoot.json.`)
    process.exit(0)
  }

  const patched = injectPathsIntoConfig(ts, json.paths)
  if (patched === null) {
    console.error('Error: could not locate the `createConfig({ ... })` call in barefoot.config.ts.')
    console.error('       The migrate codemod expects the starter template shape:')
    console.error('')
    console.error('         export default createConfig({')
    console.error('           ...')
    console.error('         })')
    console.error('')
    console.error('       Add a `paths: { components, tokens, meta }` field by hand and delete')
    console.error('       barefoot.json.')
    process.exit(1)
  }

  if (dryRun) {
    console.log('--- barefoot.config.ts (after) ---')
    console.log(patched)
    console.log('---')
    console.log(`Would delete: ${path.relative(cwd, jsonPath)}`)
    return
  }

  writeFileSync(tsPath, patched)
  console.log(`  Patched ${path.relative(cwd, tsPath)} — added \`paths\` block`)

  unlinkSync(jsonPath)
  console.log(`  Deleted ${path.relative(cwd, jsonPath)}`)

  console.log('')
  console.log('Migration complete. The project now reads paths from barefoot.config.ts.')
}

/**
 * Insert a `paths: {...}` field at the top of the first `createConfig({...})`
 * (or `defineConfig({...})`) call in the file. Returns null when no such call
 * is found.
 *
 * Indentation is inferred from the line of the call site so the inserted
 * block matches the surrounding code style. The function only edits the
 * first matching call — the starter template never has more than one.
 */
export function injectPathsIntoConfig(source: string, paths: { components: string; tokens: string; meta: string }): string | null {
  const match = /(createConfig|defineConfig)\s*\(\s*\{/.exec(source)
  if (!match) return null

  const callOpenBrace = match.index + match[0].length - 1
  const insertPos = callOpenBrace + 1

  // Infer the indent of the call site from the start of its line.
  const lineStart = source.lastIndexOf('\n', match.index) + 1
  const baseIndent = source.slice(lineStart, match.index).match(/^\s*/)?.[0] ?? ''
  const childIndent = baseIndent + '  '

  const block =
    `\n${childIndent}// Project layout — read by \`barefoot add\`, \`search\`, \`meta:extract\`, etc.` +
    `\n${childIndent}paths: {` +
    `\n${childIndent}  components: ${JSON.stringify(paths.components)},` +
    `\n${childIndent}  tokens: ${JSON.stringify(paths.tokens)},` +
    `\n${childIndent}  meta: ${JSON.stringify(paths.meta)},` +
    `\n${childIndent}},`

  return source.slice(0, insertPos) + block + source.slice(insertPos)
}
