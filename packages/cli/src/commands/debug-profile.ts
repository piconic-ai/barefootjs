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

const USAGE =
  'Usage: bf debug profile <component> [--diff <ref>] [--scenario auto|<file>] [--fanout <n>] [--top <n>] [--hot-ms <n>] [--wasted-pct <n>] [--json]'

interface ProfileFlags {
  scenario?: string
  diff?: string
  fanOutThreshold?: number
  /** `--top <n>`: keep only the N hottest subscribers (dynamic mode). */
  topN?: number
  /** `--hot-ms <n>`: drop subscribers below this totalMs floor (dynamic mode). */
  minMs?: number
  /** `--wasted-pct <n>`: flag a subscriber whose runs are ≥ n% identical output. */
  wastedPct?: number
  positional: string[]
}

/**
 * Parse `debug profile` flags. Unknown `--flags` are rejected (rather than
 * silently swallowed into `positional`, where they would be mistaken for the
 * component name — e.g. `bf debug profile --hot-ms 10 foo` reading the flag as
 * the component). Every value-taking flag validates its argument so an agent
 * gets an actionable message instead of silent surprising behavior:
 *
 * - a missing value, or a value that is itself a flag, is rejected — so
 *   `--scenario --fanout 8` can't make `scenario='--fanout'` and silently drop
 *   `--fanout`;
 * - numeric flags enforce sensible ranges — `--top`/`--fanout` are positive
 *   integers (a negative `--top` would slice from the end, a negative
 *   `--fanout` would mark everything hot), `--hot-ms` is a non-negative number.
 */
function parseFlags(args: string[]): ProfileFlags {
  const flags: ProfileFlags = { positional: [] }
  // Consume the next token as a flag value, rejecting a missing value or one
  // that is itself a flag (a common typo that would otherwise be swallowed).
  const value = (args: string[], i: number, name: string): string => {
    const raw = args[i]
    if (raw === undefined || raw.startsWith('-')) {
      fail(`${name} requires a value${raw === undefined ? '' : ` (got the flag "${raw}")`}.`)
    }
    return raw
  }
  const num = (
    args: string[],
    i: number,
    name: string,
    opts: { integer?: boolean; min?: number },
  ): number => {
    const raw = value(args, i, name)
    const n = Number(raw)
    if (Number.isNaN(n)) fail(`${name} requires a number (got "${raw}").`)
    if (opts.integer && !Number.isInteger(n)) fail(`${name} must be a whole number (got "${raw}").`)
    if (opts.min !== undefined && n < opts.min) fail(`${name} must be ≥ ${opts.min} (got "${raw}").`)
    return n
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--scenario') flags.scenario = value(args, ++i, '--scenario')
    else if (a === '--diff') flags.diff = value(args, ++i, '--diff')
    else if (a === '--fanout') flags.fanOutThreshold = num(args, ++i, '--fanout', { integer: true, min: 1 })
    else if (a === '--top') flags.topN = num(args, ++i, '--top', { integer: true, min: 1 })
    else if (a === '--hot-ms') flags.minMs = num(args, ++i, '--hot-ms', { min: 0 })
    else if (a === '--wasted-pct') flags.wastedPct = num(args, ++i, '--wasted-pct', { min: 0 })
    else if (a.startsWith('-')) fail(`Unknown flag "${a}".`)
    else flags.positional.push(a)
  }
  return flags
}

function fail(message: string): never {
  console.error(`Error: ${message}`)
  console.error(USAGE)
  process.exit(1)
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
    console.error(USAGE)
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
    try {
      const { runAutoScenario, runFileScenario } = await import('../lib/scenario-driver')
      const isAuto = flags.scenario === 'auto'
      const { events, fired, sources } = isAuto
        ? await runAutoScenario(source, resolved.filePath, resolved.componentName)
        : await runFileScenario(flags.scenario)
      // Both modes load the entry/story last (its local imports are loaded
      // first), so the entry drives componentName/sourceFile and its imported
      // children merge into the id index. Auto mode must pass those imports too
      // (#1840): a compound component like DatePicker imports Calendar, whose
      // `Calendar#binding:*` subscribers otherwise resolve to `((unresolved))`.
      const primary = isAuto ? { source, filePath: resolved.filePath } : sources[sources.length - 1]
      const extraSources = sources.slice(0, -1)
      const report = buildProfileReport({
        source: primary.source,
        filePath: primary.filePath,
        componentName: isAuto ? resolved.componentName : undefined,
        scenario: isAuto ? 'auto' : flags.scenario,
        events,
        extraSources,
        topN: flags.topN,
        minMs: flags.minMs,
        // `--wasted-pct` is a percentage on the CLI; the analysis takes a [0,1] fraction.
        wastedRatio: flags.wastedPct !== undefined ? flags.wastedPct / 100 : undefined,
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
