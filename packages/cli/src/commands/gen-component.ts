// bf gen component — generate component skeleton + IR test.

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { scaffold } from '../lib/scaffold'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'
import { commandsFor, detectPackageManager, testRunnerFor } from '../lib/pm'

const USAGE = 'Usage: bf gen component <component-name> [use-component1] [use-component2] ...'
const EXAMPLE = 'Example: bf gen component settings-form input switch button'

// Component names become `<name>/index.tsx` paths and PascalCase
// identifiers, so only lowercase kebab-case is accepted. Anything else
// (a stray flag, `My Widget`, `--`) would otherwise reach the name
// conversion in `scaffold` and crash or emit an invalid identifier.
const KEBAB_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function run(args: string[], ctx: CliContext): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    console.log(EXAMPLE)
    return
  }

  if (args.length < 1) {
    console.error(USAGE)
    console.error(EXAMPLE)
    process.exit(1)
  }

  const unknownFlag = args.find(a => a.startsWith('-'))
  if (unknownFlag) {
    console.error(`Error: Unknown option '${unknownFlag}'.`)
    console.error(USAGE)
    process.exit(1)
  }

  const invalidName = args.find(a => !KEBAB_NAME.test(a))
  if (invalidName !== undefined) {
    console.error(`Error: Invalid component name '${invalidName}'. Use lowercase kebab-case (e.g. settings-form).`)
    console.error(USAGE)
    process.exit(1)
  }

  const [componentName, ...useComponents] = args
  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  // PM detection drives both the emitted test file's import source
  // (`bun:test` vs. `vitest`) and the "Next steps" hint below, so the
  // generated test matches the runner the project's `test` script is
  // wired up to. See `testRunnerFor` in `../lib/pm.ts`.
  const pm = detectPackageManager(ctx.projectDir ?? ctx.root)
  const runner = testRunnerFor(pm)
  const result = scaffold(componentName, useComponents, ctx.metaDir, componentsBasePath, {
    testImportSource: runner.importSource,
  })

  // Write component file
  const componentAbsPath = path.join(writeRoot, result.componentPath)
  if (existsSync(componentAbsPath)) {
    console.error(`Error: ${result.componentPath} already exists. Delete it first or choose a different name.`)
    process.exit(1)
  }

  // Write test file
  const testAbsPath = path.join(writeRoot, result.testPath)
  const testDir = path.dirname(testAbsPath)
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }

  writeFileSync(componentAbsPath, result.componentCode)
  writeFileSync(testAbsPath, result.testCode)

  // Detected PM controls the test-run hint so the suggestion lines up
  // with whatever the user has committed to (lockfile-first), instead of
  // prescribing `bun test` regardless.
  const testCmd = commandsFor(pm).test(result.testPath)

  console.log(`Created:`)
  console.log(`  ${result.componentPath}`)
  console.log(`  ${result.testPath}`)
  console.log(``)
  console.log(`Next steps:`)
  console.log(`  1. Implement the component in ${result.componentPath}`)
  console.log(`  2. ${testCmd}`)
  console.log(`  3. bf gen test ${componentName}  (regenerate richer test)`)
}
