// bf gen component — generate component skeleton + IR test.

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { scaffold } from '../lib/scaffold'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'
import { commandsFor, detectPackageManager } from '../lib/pm'

export function run(args: string[], ctx: CliContext): void {
  if (args.length < 2) {
    console.error('Usage: bf gen component <component-name> <use-component1> [use-component2] ...')
    console.error('Example: bf gen component settings-form input switch button')
    process.exit(1)
  }

  const [componentName, ...useComponents] = args
  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  const result = scaffold(componentName, useComponents, ctx.metaDir, componentsBasePath)

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
  const pm = detectPackageManager(ctx.projectDir ?? ctx.root)
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
