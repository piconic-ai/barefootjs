/**
 * Reactive performance profiler — static half (SR5 / SR6).
 *
 * See `spec/profiler.md` and issue #1690. This module implements the
 * **run-free** parts of `bf debug profile`: the static reactivity budget
 * (SR5) and the compile-diff regression (SR6). Both are pure functions of
 * the IR — no instrumented run is required — so they reuse the static
 * analysis already shipped in `debug.ts`:
 *
 *   - `buildComponentAnalysis` → `{ graph, ir }`
 *   - `buildComponentSummary`  → node counts
 *   - `traceUpdatePath`        → transitive dependents (fan-out + chain depth)
 *
 * The dynamic half (SR1–SR4: instrumented runtime, turn markers, IR join,
 * Hot-subscribers / Wasted-re-runs / Batch-advisor analyses) is specified in
 * `spec/profiler.md` and not yet implemented — `buildProfileReport` is the
 * placeholder seam where it will land.
 */

import {
  buildComponentAnalysis,
  buildComponentSummary,
  traceUpdatePath,
  type ComponentGraph,
  type UpdatePathEntry,
} from "./debug.ts"

// -- Static budget (SR5) ------------------------------------------------------

export interface FanOutEntry {
  /** Signal name (the reactive source whose change fans out). */
  signal: string
  /** Distinct transitive subscribers (memos + effects + DOM bindings). */
  subscribers: number
  /** True when `subscribers` exceeds the configured threshold. */
  hot: boolean
  loc: { file: string; line: number }
}

export interface StaticBudget {
  componentName: string
  sourceFile: string
  kind: 'static-budget'
  signals: number
  memos: number
  effects: number
  loops: number
  /** Σ over signals of `consumers.length` — total reactive subscriptions. */
  subscriptions: number
  /** Longest memo→memo dependency path length (0 = no memos). */
  memoChainDepth: number
  /** The memo names forming `memoChainDepth`, head-first. */
  memoChainLongest: string[]
  /** Per-signal fan-out, descending, hottest first. */
  fanOut: FanOutEntry[]
}

export interface StaticBudgetOptions {
  /** Fan-out threshold above which a signal is flagged `hot`. Default 8. */
  fanOutThreshold?: number
}

const DEFAULT_FANOUT_THRESHOLD = 8

/**
 * Build the static reactivity budget for one component (SR5).
 *
 * Predictive only — it names likely hot spots before any run. Pair with
 * `--scenario` (the dynamic half) to confirm actual cost.
 */
export function buildStaticBudget(
  source: string,
  filePath: string,
  componentName?: string,
  options: StaticBudgetOptions = {},
): StaticBudget {
  const threshold = options.fanOutThreshold ?? DEFAULT_FANOUT_THRESHOLD
  const { graph } = buildComponentAnalysis(source, filePath, componentName)
  // `graph` is the authority for reactive-node counts; the summary is consulted
  // only for `loops`, which needs the IR tree walk (`countNodeType`) that the
  // graph doesn't expose.
  const summary = buildComponentSummary(source, filePath, componentName)

  const subscriptions = graph.signals.reduce((n, s) => n + s.consumers.length, 0)

  const fanOut: FanOutEntry[] = graph.signals
    .map(s => {
      const subscribers = transitiveSubscriberCount(graph, s.name)
      return { signal: s.name, subscribers, hot: subscribers >= threshold, loc: s.loc }
    })
    .sort((a, b) => b.subscribers - a.subscribers)

  const { depth, chain } = longestMemoChain(graph)

  return {
    componentName: summary.componentName,
    sourceFile: summary.sourceFile,
    kind: 'static-budget',
    signals: graph.signals.length,
    memos: graph.memos.length,
    effects: graph.effects.length,
    loops: summary.loops,
    subscriptions,
    memoChainDepth: depth,
    memoChainLongest: chain,
    fanOut,
  }
}

/**
 * Distinct transitive subscribers of a signal/memo. Walks the same tagged
 * `consumers` tree `traceUpdatePath` builds (`debug.ts`), deduplicating across
 * branches so a diamond dependency counts each subscriber once.
 */
function transitiveSubscriberCount(graph: ComponentGraph, name: string): number {
  const path = traceUpdatePath(graph, name)
  if (!path) return 0
  const seen = new Set<string>()
  const walk = (entries: UpdatePathEntry[]): void => {
    for (const e of entries) {
      seen.add(`${e.kind}:${e.name}`)
      walk(e.children)
    }
  }
  walk(path.dependents)
  return seen.size
}

/**
 * Longest chain of memo→memo dependencies across the whole component. Starting
 * from every memo (so a head memo whose deps are signals seeds the full chain)
 * and taking the max captures the true longest path.
 */
function longestMemoChain(graph: ComponentGraph): { depth: number; chain: string[] } {
  const memoChainFrom = (entry: UpdatePathEntry): string[] => {
    if (entry.kind !== 'memo') return []
    let best: string[] = []
    for (const child of entry.children) {
      const c = memoChainFrom(child)
      if (c.length > best.length) best = c
    }
    return [entry.name, ...best]
  }

  let best: string[] = []
  for (const memo of graph.memos) {
    const path = traceUpdatePath(graph, memo.name)
    let downstream: string[] = []
    for (const dep of path?.dependents ?? []) {
      const c = memoChainFrom(dep)
      if (c.length > downstream.length) downstream = c
    }
    const chain = [memo.name, ...downstream]
    if (chain.length > best.length) best = chain
  }

  return { depth: best.length, chain: best }
}

export function formatStaticBudget(b: StaticBudget): string {
  const lines: string[] = []
  lines.push(`${b.componentName} — static reactivity budget`)
  lines.push(`  signals: ${b.signals}   memos: ${b.memos}   effects: ${b.effects}   loops: ${b.loops}`)
  lines.push(`  subscriptions: ${b.subscriptions}`)
  if (b.memoChainDepth > 0) {
    lines.push(`  memo-chain depth: ${b.memoChainDepth}   (${b.memoChainLongest.join(' → ')})`)
  }
  const shown = b.fanOut.filter(f => f.subscribers > 0).slice(0, 5)
  if (shown.length > 0) {
    lines.push('  fan-out (top):')
    for (const f of shown) {
      lines.push(`    ${f.signal.padEnd(12)} → ${f.subscribers} subscribers${f.hot ? '   ⚠ high' : ''}`)
    }
  }
  lines.push('  note: run with --scenario to measure actual cost; static budget is predictive only.')
  return lines.join('\n')
}

// -- Compile-diff regression (SR6) --------------------------------------------

export interface FanOutChange {
  signal: string
  before: number
  after: number
}

export interface BudgetDiff {
  componentName: string
  signals: number
  memos: number
  effects: number
  loops: number
  subscriptions: number
  memoChainDepth: number
  /** Signals whose fan-out changed (added/removed signals included as 0↔n). */
  fanOut: FanOutChange[]
  /** True when any tracked metric regressed (grew) past zero. */
  regressed: boolean
}

/**
 * Structural reactivity delta between two compiles of the same component (SR6).
 * Each numeric field is `after − before`; positive = grew. CI can fail when
 * `regressed` is true (or gate on a specific metric threshold).
 */
export function diffStaticBudget(base: StaticBudget, head: StaticBudget): BudgetDiff {
  const baseFan = new Map(base.fanOut.map(f => [f.signal, f.subscribers]))
  const headFan = new Map(head.fanOut.map(f => [f.signal, f.subscribers]))
  const signals = new Set([...baseFan.keys(), ...headFan.keys()])

  const fanOut: FanOutChange[] = []
  for (const sig of signals) {
    const before = baseFan.get(sig) ?? 0
    const after = headFan.get(sig) ?? 0
    if (before !== after) fanOut.push({ signal: sig, before, after })
  }
  fanOut.sort((a, b) => (b.after - b.before) - (a.after - a.before))

  const d: Omit<BudgetDiff, 'regressed'> = {
    componentName: head.componentName,
    signals: head.signals - base.signals,
    memos: head.memos - base.memos,
    effects: head.effects - base.effects,
    loops: head.loops - base.loops,
    subscriptions: head.subscriptions - base.subscriptions,
    memoChainDepth: head.memoChainDepth - base.memoChainDepth,
    fanOut,
  }

  const regressed =
    d.signals > 0 || d.memos > 0 || d.effects > 0 || d.subscriptions > 0 ||
    d.memoChainDepth > 0 || fanOut.some(f => f.after > f.before)

  return { ...d, regressed }
}

export function formatBudgetDiff(d: BudgetDiff): string {
  const lines: string[] = []
  lines.push(`${d.componentName} — reactivity diff`)
  const metric = (label: string, v: number) => {
    if (v !== 0) lines.push(`  ${v > 0 ? '+' : ''}${v} ${label}`)
  }
  metric('signals', d.signals)
  metric('memos', d.memos)
  metric('effects', d.effects)
  metric('loops', d.loops)
  metric('subscriptions', d.subscriptions)
  if (d.memoChainDepth !== 0) {
    lines.push(`  memo chain ${d.memoChainDepth > 0 ? 'deepened' : 'shortened'} by ${Math.abs(d.memoChainDepth)}`)
  }
  for (const f of d.fanOut) {
    lines.push(`  signal \`${f.signal}\` fan-out ${f.before}→${f.after}`)
  }
  if (lines.length === 1) lines.push('  no structural reactivity change')
  else lines.push(d.regressed ? '  ⚠ reactivity regressed' : '  ✓ no regression')
  return lines.join('\n')
}

// -- Dynamic report (SR1–SR4) — placeholder seam ------------------------------

export interface ProfileReport {
  kind: 'profile'
  scenario: string
  // subscribers, findings, coverage — see spec/profiler.md §6.3.
}

/**
 * Dynamic, scenario-driven profile (SR1–SR4 + analyses). Not yet implemented —
 * the instrumented runtime, compiler turn markers, and IR join are specified in
 * `spec/profiler.md`. This seam keeps the public surface stable for the CLI
 * while the dynamic half is built.
 */
export function buildProfileReport(_scenario: string): ProfileReport {
  throw new Error(
    'bf debug profile --scenario is not implemented yet. ' +
      'The dynamic measurement substrate (SR1–SR4) is specified in spec/profiler.md. ' +
      'Run `bf debug profile <component>` for the static reactivity budget (SR5).',
  )
}
