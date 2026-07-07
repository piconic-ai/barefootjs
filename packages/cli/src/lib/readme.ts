// Scaffold README.md generator.
//
// Pulled out as a pure `(pkgName, adapter, pm) -> string` helper — rather
// than inlined in `scaffoldApp` (commands/init.ts) — so it's unit-
// testable without running the full `bf init` flow, which needs network
// access (the registry probe / Button fetch) and therefore can't run
// offline in tests. See __tests__/readme.test.ts.

import type { AdapterTemplate } from './templates'
import { commandsFor, type PackageManager } from './pm'

/**
 * Render the scaffold's README.md content for a freshly-generated
 * project. Content is intentionally short: a project title, the
 * copy-paste "get started" sequence (mirroring `printAppNextSteps`'s
 * console output), build/deploy commands when the adapter has a deploy
 * story, a `bf` CLI cheat-sheet, and a note that the compiled output
 * directory is generated and shouldn't be hand-edited.
 */
export function generateReadmeMd(
  pkgName: string,
  adapter: AdapterTemplate,
  pm: PackageManager,
): string {
  const cmd = commandsFor(pm)
  const lines: string[] = []

  lines.push(`# ${pkgName}`, '')
  lines.push(
    `A [BarefootJS](https://barefootjs.dev) app scaffolded with the **${adapter.label}** adapter.`,
    '',
  )

  lines.push('## Getting started', '')
  lines.push('```sh')
  lines.push(cmd.install)
  if (adapter.extraSetupSteps) {
    for (const step of adapter.extraSetupSteps) {
      if (step.label) lines.push(`# ${step.label}`)
      lines.push(step.command)
    }
  }
  lines.push(cmd.run('dev'))
  lines.push('```', '')

  // Every adapter registers a `build` script; `deploy` is optional
  // (only adapters with a one-command deploy story set `adapter.deploy`
  // — see templates.ts). Skip the whole section if neither applies,
  // though in practice `build` always does.
  if (adapter.scripts.build || adapter.deploy) {
    lines.push('## Build & deploy', '')
    lines.push('```sh')
    if (adapter.scripts.build) lines.push(cmd.run('build'))
    if (adapter.deploy) {
      lines.push(`${cmd.run(adapter.deploy.script)}   # deploy to ${adapter.deploy.target}`)
    }
    lines.push('```', '')
  }

  lines.push('## `bf` CLI cheat sheet', '')
  lines.push(
    "The `bf` CLI is the first reference for component APIs and framework docs — run `bf --help` for the full command list.",
    '',
  )
  lines.push('| Command | What it does |')
  lines.push('| --- | --- |')
  lines.push('| `bf search <term>` | Search the component registry |')
  lines.push('| `bf add <component>` | Add a component from the registry |')
  lines.push('| `bf docs <component>` | Show a component\'s API surface |')
  lines.push(
    '| `bf debug graph <component>` | Inspect a `"use client"` component\'s reactive signal graph |',
  )
  lines.push('| `bf guide` | Open the framework guide |')
  lines.push('')

  lines.push('## Generated output', '')
  lines.push(
    "The compiled output directory (produced by `bf build`) is regenerated on every build — don't edit it by hand.",
    '',
  )

  return lines.join('\n')
}
