// bf debug profile <component> — reactive performance profiler (#1690).
//
// Three modes:
//   bf debug profile <component>                Static reactivity budget (SR5, no run)
//   bf debug profile <component> --diff <ref>   Compile-diff regression (SR6, no run)
//   bf debug profile <component> --scenario auto Dynamic measured run (SR1–SR4): mount
//                                                the instrumented build, fire each handler,
//                                                rank hot subscribers + batch candidates
//
// The static modes are pure functions of the IR (reuse @barefootjs/jsx's
// shipped static analysis). The dynamic mode drives the component in happy-dom
// and joins the recorded event stream to the IR.

import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

interface ProfileFlags {
  scenario?: string
  diff?: string
  fanOutThreshold?: number
  positional: string[]
}

function parseFlags(args: string[]): ProfileFlags {
  const flags: ProfileFlags = { positional: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--scenario') flags.scenario = args[++i]
    else if (a === '--diff') flags.diff = args[++i]
    else if (a === '--fanout') flags.fanOutThreshold = Number(args[++i])
    else flags.positional.push(a)
  }
  return flags
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const flags = parseFlags(args)

  const {
    buildStaticBudget,
    formatStaticBudget,
    diffStaticBudget,
    formatBudgetDiff,
    buildProfileReport,
    formatProfileReport,
  } = await import('@barefootjs/jsx')

  const componentName = flags.positional[0]
  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: bf debug profile <component> [--diff <ref>] [--scenario auto] [--fanout <n>] [--json]')
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

  const source = readFileSync(resolved.filePath, 'utf-8')

  // -- Dynamic mode (SR1–SR4): mount the instrumented build and measure -----
  if (flags.scenario) {
    if (flags.scenario !== 'auto') {
      console.error(`Error: only --scenario auto is supported (got "${flags.scenario}").`)
      console.error('  auto = mount the component and fire each interactive element once.')
      process.exit(1)
    }
    try {
      const { runAutoScenario } = await import('../lib/scenario-driver')
      const { events, fired } = await runAutoScenario(source, resolved.filePath, resolved.componentName)
      const report = buildProfileReport({
        source,
        filePath: resolved.filePath,
        componentName: resolved.componentName,
        scenario: 'auto',
        events,
      })
      if (ctx.jsonFlag) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(formatProfileReport(report))
        if (fired === 0) console.log('  note: no interactive elements were found to fire.')
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  const head = buildStaticBudget(source, resolved.filePath, resolved.componentName, {
    fanOutThreshold: flags.fanOutThreshold,
  })

  // -- Compile-diff regression (SR6) ----------------------------------------
  if (flags.diff) {
    const baseSource = readFileAtRef(resolved.filePath, flags.diff)
    if (baseSource === null) {
      console.error(`Error: Cannot read "${resolved.filePath}" at ref "${flags.diff}".`)
      process.exit(1)
    }
    const base = buildStaticBudget(baseSource, resolved.filePath, resolved.componentName, {
      fanOutThreshold: flags.fanOutThreshold,
    })
    const diff = diffStaticBudget(base, head)

    if (ctx.jsonFlag) {
      console.log(JSON.stringify(diff, null, 2))
    } else {
      console.log(formatBudgetDiff(diff))
    }
    if (diff.regressed) process.exit(1)
    return
  }

  // -- Static budget (SR5) --------------------------------------------------
  if (ctx.jsonFlag) {
    console.log(JSON.stringify(head, null, 2))
    return
  }
  console.log(formatStaticBudget(head))
}

/**
 * Read a file's contents at a git ref via `git show <ref>:<relpath>`. Returns
 * null when the ref or path can't be resolved (e.g. file didn't exist there).
 */
function readFileAtRef(filePath: string, ref: string): string | null {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path.dirname(filePath),
      encoding: 'utf-8',
    }).trim()
    const rel = path.relative(root, path.resolve(filePath))
    return execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd: root,
      encoding: 'utf-8',
    })
  } catch {
    return null
  }
}
