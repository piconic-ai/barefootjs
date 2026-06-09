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

// Full, self-contained guide (shown by `bf debug profile --help`). This is the
// single source of truth for the profiler's UX — there is no separate spec doc
// to drift from. Keep it practical: what each mode measures, how to read the
// output, and what to do about a finding.
const HELP = `bf debug profile — reactive performance profiler

Find and fix wasted reactive work: re-runs that produce nothing, fan-out that
fires too widely, multi-write turns that could batch. Every finding is mapped
back to a source line so you (or an agent) can act on it.

USAGE
  ${USAGE.replace('Usage: ', '')}

THREE MODES
  bf debug profile <component>
      Static reactivity budget — no run required. Pure function of the IR, so
      it works the moment a component compiles. Predicts hot spots before you
      measure: signal/memo/effect/loop counts, total subscriptions, the longest
      memo→memo chain, and per-signal fan-out (flagged ⚠ high past --fanout).

  bf debug profile <component> --diff <ref>
      Compile-diff regression — compiles the component at <ref> (any git ref)
      and at the working tree, then prints the structural delta (+effects,
      fan-out 3→9, memo chain deepened, …). Exits non-zero when a metric grew,
      so it is CI-able. No run required.

  bf debug profile <component> --scenario auto
  bf debug profile <component> --scenario <story.tsx>
      Dynamic measured run. Mounts the instrumented build in a headless DOM,
      fires interactions, and records the reactive event stream, then joins it
      back to the IR. 'auto' fires every handler the IR knows about once (zero
      config). A story file is a .tsx that composes the component the way it is
      really used — needed for compound/headless components whose handlers live
      in user-composed children.

READING A DYNAMIC RUN
  hot subscribers   Effects/memos ranked by total time (the bar) with run count.
                    'N/turn' flags re-run pressure within one interaction — a
                    split / batch candidate. The fix: stop the effect re-running
                    on signals it doesn't actually depend on.
  wasted re-runs    Effects/memos that re-ran but produced identical output —
                    pure waste. The fix: a finer signal/memo split, or memoize
                    the sub-expression.
  batch advisor     Turns that re-ran shared effects once per write. 'safe' means
                    a batch() wrap is statically proven behavior-preserving;
                    'safety unverified' means a wrap would help but couldn't be
                    proven safe. The fix: wrap the handler body in batch().
  coverage          Handlers exercised vs the IR total, plus any ids that
                    couldn't be mapped to source — the honest scope caveat.

FLAGS
  --diff <ref>        Compile-diff against a git ref (mode selector).
  --scenario <s>      'auto' or a path to a story .tsx (mode selector).
  --fanout <n>        Static fan-out threshold for the ⚠ high flag (int ≥ 1, default 8).
  --top <n>           Keep only the N hottest subscribers in the dynamic table
                      (int ≥ 1; --json is never truncated).
  --hot-ms <n>        Drop subscribers below this total-ms floor — a noise filter
                      for grid components with a long cheap tail (number ≥ 0).
  --wasted-pct <n>    Flag a subscriber whose runs are ≥ n% identical output
                      (0–100, default 50).
  --json              Machine-readable output (every mode). Stable schema with
                      deterministic tie-breaking; structural findings reproduce
                      run-to-run (wall-clock-timed ranks can shift near rounding
                      boundaries).

EXAMPLES
  bf debug profile calendar                       # static budget, no run
  bf debug profile calendar --scenario auto       # measure every handler once
  bf debug profile calendar --scenario auto --top 5 --hot-ms 1
  bf debug profile checkout --scenario ./stories/checkout.tsx --json
  bf debug profile checkout --diff origin/main    # regression gate (CI)

NOTES
  • Instrumentation is dev-only and is stripped from production builds.
  • The dynamic modes need the client runtime built (e.g. \`bun run build\`); the
    static budget and --diff need no build.
  • Composes with \`bf debug graph/trace/why-update\`: those say *where to look*,
    profile says *what it cost and what to change*, citing the same source lines.`

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
    opts: { integer?: boolean; min?: number; max?: number },
  ): number => {
    const raw = value(args, i, name)
    const n = Number(raw)
    if (Number.isNaN(n)) fail(`${name} requires a number (got "${raw}").`)
    if (opts.integer && !Number.isInteger(n)) fail(`${name} must be a whole number (got "${raw}").`)
    if (opts.min !== undefined && n < opts.min) fail(`${name} must be ≥ ${opts.min} (got "${raw}").`)
    if (opts.max !== undefined && n > opts.max) fail(`${name} must be ≤ ${opts.max} (got "${raw}").`)
    return n
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--scenario') flags.scenario = value(args, ++i, '--scenario')
    else if (a === '--diff') flags.diff = value(args, ++i, '--diff')
    else if (a === '--fanout') flags.fanOutThreshold = num(args, ++i, '--fanout', { integer: true, min: 1 })
    else if (a === '--top') flags.topN = num(args, ++i, '--top', { integer: true, min: 1 })
    else if (a === '--hot-ms') flags.minMs = num(args, ++i, '--hot-ms', { min: 0 })
    else if (a === '--wasted-pct') flags.wastedPct = num(args, ++i, '--wasted-pct', { min: 0, max: 100 })
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
  // `--help`/`-h` prints the full guide and exits 0 — handled before parseFlags
  // so it isn't rejected as an unknown flag.
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }

  const flags = parseFlags(args)

  // `--scenario` (measure a run) and `--diff` (compare two compiles) are
  // mutually exclusive modes. The dynamic block returns before the diff check,
  // so combining them silently ran the scenario and dropped `--diff` (#1849 B4).
  // Reject it instead of returning the wrong output without warning.
  if (flags.scenario && flags.diff) {
    fail('--scenario and --diff cannot be combined: --scenario measures a run, --diff compares two compiles. Pick one.')
  }

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
        // `--top` is a *display* cap on the dynamic table, not a data filter.
        // In JSON mode the help promises the full list ("--json is never
        // truncated"), so skip the slice — applying it here would truncate the
        // serialized `hotSubscribers.subscribers` too (#1849 B1). Text mode
        // still passes it so the rendered table honors `--top`.
        topN: ctx.jsonFlag ? undefined : flags.topN,
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
