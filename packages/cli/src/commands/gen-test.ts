// bf gen test — generate IR test from existing component source.

import { existsSync, writeFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'
import { generateTestTemplate } from '../lib/test-template'
import { commandsFor, detectPackageManager } from '../lib/pm'

export function run(args: string[], ctx: CliContext): void {
  // Two surfacing modes for the generated IR test:
  //   default       → write `<Component>.test.tsx` (or `index.test.tsx` for
  //                   nested registry layouts) next to the source on disk
  //   --stdout      → print to stdout without touching the filesystem
  //                   (preview, paste into PR, diff against existing test)
  // Refuse to overwrite an existing test unless `--force` is set. This
  // matches `bf gen component`'s collision policy, and lines up with the
  // "Next steps" message that command prints — `bf gen test <name>` is
  // supposed to *give you a file*, not silently print to a terminal the
  // user has long scrolled past.
  const positional = args.filter((a) => !a.startsWith('-'))
  const flagSet = new Set(args.filter((a) => a.startsWith('-')))
  const writeToStdout = flagSet.has('--stdout')
  const force = flagSet.has('--force') || flagSet.has('-f')

  const componentName = positional[0]
  if (!componentName) {
    console.error('Error: Component name required. Usage: bf gen test <component> [--stdout] [--force]')
    process.exit(1)
  }

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }

  const content = generateTestTemplate(resolved.filePath)

  if (writeToStdout) {
    console.log(content)
    return
  }

  // Pick `<basename>.test.tsx` next to the source. For nested layouts
  // (`ui/button/index.tsx`) this becomes `ui/button/index.test.tsx`,
  // matching what `bf gen component` writes.
  const dir = path.dirname(resolved.filePath)
  const base = path.basename(resolved.filePath, path.extname(resolved.filePath))
  const testPath = path.join(dir, `${base}.test.tsx`)

  if (existsSync(testPath) && !force) {
    const rel = path.relative(ctx.projectDir ?? ctx.root, testPath)
    console.error(`Error: ${rel} already exists. Pass --force to overwrite, or --stdout to preview.`)
    process.exit(1)
  }

  writeFileSync(testPath, content)
  const rel = path.relative(ctx.projectDir ?? ctx.root, testPath)
  console.log(`Created: ${rel}`)
  console.log(``)
  // Route the "next step" hint through the detected package manager so
  // the suggestion respects whatever PM the user has actually committed
  // to (lockfile-first, falling back to the PM that spawned this CLI).
  // Hard-coding `bun test` was prescriptive in a project that explicitly
  // supports npm / pnpm / yarn / bun.
  const pm = detectPackageManager(ctx.projectDir ?? ctx.root)
  console.log(`Next: ${commandsFor(pm).test(rel)}`)
}
