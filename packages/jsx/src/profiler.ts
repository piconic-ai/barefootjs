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
  buildEventSummary,
  traceUpdatePath,
  type ComponentGraph,
  type UpdatePathEntry,
} from './debug.ts'
import type { ProfilerEvent } from '@barefootjs/shared'

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

// -- SR4 IR join --------------------------------------------------------------

/** An IR node a compiler-assigned profiler id resolves to. */
export interface ResolvedNode {
  kind: 'signal' | 'memo' | 'effect'
  /** Display name/label of the resolved IR node. */
  name: string
  loc: { file: string; line: number }
}

/** id (`<Component>#<kind>:<rest>`) → resolved IR node. */
export type IdIndex = Map<string, ResolvedNode>

export interface ParsedProfilerId {
  component: string
  kind: string
  /** Everything after `<kind>:` — a name, a line, or `controlled:<setter>`. */
  rest: string
}

/**
 * Parse a compiler-assigned profiler id `<Component>#<kind>:<rest>` (SR1/SR3).
 * Returns `null` for anything that isn't shaped like one, so a stray id in the
 * event stream is surfaced as a coverage gap rather than mis-parsed.
 */
export function parseProfilerId(id: string): ParsedProfilerId | null {
  const hash = id.indexOf('#')
  if (hash < 0) return null
  const colon = id.indexOf(':', hash)
  if (colon < 0) return null
  const component = id.slice(0, hash)
  const kind = id.slice(hash + 1, colon)
  const rest = id.slice(colon + 1)
  if (!component || !kind || !rest) return null
  return { component, kind, rest }
}

/**
 * Build the id→IR-node index that the SR4 join keys on. Every graph node
 * already carries `loc`, so this turns a raw runtime id into a source-mapped
 * node. Effects are registered under both their source line and their label
 * (the two shapes `effects-and-on-mounts.ts` emits), and controlled-signal
 * sync effects under `effect:controlled:<setter>`, mirroring the compiler's
 * id namespace (`build-declaration-emit.ts`).
 */
export function buildIdIndex(graph: ComponentGraph): IdIndex {
  const comp = graph.componentName
  const index: IdIndex = new Map()

  for (const s of graph.signals) {
    index.set(`${comp}#signal:${s.name}`, { kind: 'signal', name: s.name, loc: s.loc })
    if (s.setter) {
      index.set(`${comp}#effect:controlled:${s.setter}`, {
        kind: 'effect',
        name: `controlled:${s.setter}`,
        loc: s.loc,
      })
    }
  }
  for (const m of graph.memos) {
    index.set(`${comp}#memo:${m.name}`, { kind: 'memo', name: m.name, loc: m.loc })
  }
  for (const e of graph.effects) {
    const node: ResolvedNode = { kind: 'effect', name: e.label, loc: e.loc }
    index.set(`${comp}#effect:${e.loc.line}`, node)
    index.set(`${comp}#effect:${e.label}`, node)
  }
  return index
}

/** A profiler id that no IR node could be found for (SR4 coverage gap). */
export interface UnattributedId {
  id: string
  /** Distinct events that referenced this id. */
  count: number
}

export interface JoinedEvent {
  event: ProfilerEvent
  /** Resolved node for `event.subscriber` (effect/memo), if any. */
  subscriber?: ResolvedNode
  /** Resolved node for `event.signal`, if any. */
  signal?: ResolvedNode
}

export interface JoinResult {
  joined: JoinedEvent[]
  /**
   * Ids referenced by the stream that the IR did not resolve — surfaced, never
   * dropped (SR4 invariant). A non-empty list is the honest coverage caveat the
   * analyses print.
   */
  unattributed: UnattributedId[]
}

/**
 * Join a recorded event stream (SR2) to a component's IR (SR4). Each event's
 * `subscriber` / `signal` id is resolved to its source-mapped node; ids with no
 * match are collected as coverage gaps. This is the seam that turns a raw
 * measurement into an explained, fixable finding.
 */
export function joinProfilerEvents(events: readonly ProfilerEvent[], index: IdIndex): JoinResult {
  const joined: JoinedEvent[] = []
  const gaps = new Map<string, number>()

  const resolve = (id: string | undefined): ResolvedNode | undefined => {
    if (id === undefined) return undefined
    const node = index.get(id)
    if (!node) gaps.set(id, (gaps.get(id) ?? 0) + 1)
    return node
  }

  for (const event of events) {
    joined.push({
      event,
      subscriber: resolve(event.subscriber),
      signal: resolve(event.signal),
    })
  }

  const unattributed = [...gaps.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)

  return { joined, unattributed }
}

// -- Analysis: hot subscribers (v1, §4.2.1) -----------------------------------

export interface HotSubscriber {
  /** The compiler-assigned subscriber id (effect/memo). */
  subscriber: string
  /** Source-mapped node from the SR4 join; absent ⇒ a coverage gap. */
  loc?: { file: string; line: number }
  name?: string
  kind?: 'signal' | 'memo' | 'effect'
  /** Total times this subscriber ran (`effectEnter` count), mount included. */
  runs: number
  /** Runs during initial mount (outside any turn) — the unavoidable baseline. */
  mountRuns: number
  /** Total run time in ms (Σ `effectExit.dur`). */
  totalMs: number
  /** Distinct *interaction* turns it ran in (mount excluded). */
  turns: number
  /**
   * Interaction runs per active turn — `(runs − mountRuns) / turns`, the
   * re-run-pressure signal. Mount is excluded so a click that re-runs an effect
   * 5× reads as `5.0`, not diluted by the one-time mount run.
   */
  runsPerTurn: number
  /** True when `runsPerTurn` meets the configured threshold. */
  hot: boolean
}

export interface HotSubscribersResult {
  kind: 'hot-subscribers'
  /** Ranked by `totalMs` descending, then `runs` descending. */
  subscribers: HotSubscriber[]
  /** SR4 coverage gaps — subscriber ids the IR could not resolve. */
  unattributed: UnattributedId[]
}

export interface HotSubscribersOptions {
  /** `runsPerTurn` at/above which a subscriber is flagged `hot`. Default 2. */
  hotRunsPerTurn?: number
  /** Keep only the top-N by `totalMs` (after ranking). Default: all. */
  topN?: number
}

const DEFAULT_HOT_RUNS_PER_TURN = 2

/**
 * Hot subscribers (§4.2.1): which effects/memos ran most and cost most, joined
 * to IR source loc. Pure over the SR2 stream + SR4 index — same scenario ⇒ same
 * ranking (timings vary, ranks/structure do not).
 *
 * `runsPerTurn` is the re-run-pressure signal: an effect that runs many times
 * within a single turn is a batch / over-subscription candidate (links to the
 * batch advisor and wasted-re-runs analyses).
 */
export function analyzeHotSubscribers(
  events: readonly ProfilerEvent[],
  index: IdIndex,
  options: HotSubscribersOptions = {},
): HotSubscribersResult {
  const threshold = options.hotRunsPerTurn ?? DEFAULT_HOT_RUNS_PER_TURN

  interface Acc {
    runs: number
    mountRuns: number
    totalMs: number
    turns: Set<string>
  }
  const byId = new Map<string, Acc>()
  const acc = (id: string): Acc => {
    let a = byId.get(id)
    if (!a) {
      a = { runs: 0, mountRuns: 0, totalMs: 0, turns: new Set() }
      byId.set(id, a)
    }
    return a
  }

  for (const e of events) {
    if (e.subscriber === undefined) continue
    if (e.type === 'effectEnter') {
      const a = acc(e.subscriber)
      a.runs++
      // Runs outside any turn are the one-time mount/setup baseline — kept
      // separate so they don't dilute the per-interaction `runsPerTurn`.
      if (e.turn === null) a.mountRuns++
      else a.turns.add(e.turn)
    } else if (e.type === 'effectExit' && e.dur !== undefined) {
      acc(e.subscriber).totalMs += e.dur
    }
  }

  const { joined, unattributed } = joinProfilerEvents(events, index)
  const nodeFor = new Map<string, JoinedEvent['subscriber']>()
  for (const j of joined) {
    if (j.event.subscriber !== undefined && j.subscriber) nodeFor.set(j.event.subscriber, j.subscriber)
  }

  let subscribers: HotSubscriber[] = [...byId.entries()].map(([subscriber, a]) => {
    const node = nodeFor.get(subscriber)
    const turns = a.turns.size
    const interactionRuns = a.runs - a.mountRuns
    const runsPerTurn = turns > 0 ? interactionRuns / turns : 0
    return {
      subscriber,
      loc: node?.loc,
      name: node?.name,
      kind: node?.kind,
      runs: a.runs,
      mountRuns: a.mountRuns,
      totalMs: a.totalMs,
      turns,
      runsPerTurn,
      hot: runsPerTurn >= threshold,
    }
  })

  subscribers.sort((x, y) => y.totalMs - x.totalMs || y.runs - x.runs)
  if (options.topN !== undefined) subscribers = subscribers.slice(0, options.topN)

  // Only subscriber ids matter for this analysis — filter the join's gaps to
  // ids that actually appeared as a subscriber.
  const subscriberIds = new Set(byId.keys())
  const gaps = unattributed.filter(u => subscriberIds.has(u.id))

  return { kind: 'hot-subscribers', subscribers, unattributed: gaps }
}

export function formatHotSubscribers(r: HotSubscribersResult): string {
  const lines: string[] = []
  lines.push('hot subscribers — most run / most time')
  if (r.subscribers.length === 0) {
    lines.push('  (no effect/memo runs recorded)')
  }
  for (const s of r.subscribers) {
    const where = s.loc ? `${s.loc.file}:${s.loc.line}` : '(unresolved)'
    const label = `${s.name ?? s.subscriber}${s.kind ? ` (${s.kind})` : ''}`
    const note = s.hot ? `   ⚠ hot: ${s.runsPerTurn.toFixed(1)} runs/turn` : ''
    lines.push(`  ${label.padEnd(20)} ${s.runs} runs, ${s.totalMs.toFixed(1)}ms  (${where})${note}`)
  }
  if (r.unattributed.length > 0) {
    lines.push(`  ⚠ coverage: ${r.unattributed.length} unresolved subscriber id(s)`)
  }
  return lines.join('\n')
}

// -- Analysis: batch advisor (v1, §4.2.3) -------------------------------------

export type BatchSafety = 'safe' | 'unsafe' | 'unverified'

export interface BatchCandidate {
  /** The turn's handler id (`<Component>#handler:<slot>:<event>`). */
  turn: string
  /** Total effect runs in the turn. */
  totalRuns: number
  /** Distinct effects that ran (the floor a batched turn would collapse to). */
  distinctSubscribers: number
  /** `totalRuns − distinctSubscribers` — runs a `batch()` wrap would remove. */
  savings: number
  /**
   * Whether wrapping the handler in `batch()` is provably behavior-preserving.
   * `'unverified'` until the static post-write-derived-read oracle (SR4) runs —
   * a savings opportunity is surfaced, but never advised as `'safe'` without
   * proof (§4.2.3).
   */
  safety: BatchSafety
}

export interface BatchAdvisorResult {
  kind: 'batch-advisor'
  /** Turns with `savings > 0`, ranked by `savings` descending. */
  candidates: BatchCandidate[]
}

/**
 * Batch advisor (§4.2.3). BarefootJS uses **explicit** `batch()` — `set()`
 * notifies synchronously — so a turn that writes several signals re-runs shared
 * effects once per write. Per turn this measures `totalRuns` (effect runs) vs
 * `distinctSubscribers` (unique effects); `savings = totalRuns −
 * distinctSubscribers` is what a `batch()` wrap would collapse.
 *
 * Measured half only: every candidate is reported `safety: 'unverified'`. The
 * static safety oracle that upgrades a candidate to `'safe'`/`'unsafe'` lands
 * in a follow-up — an advisory that could change behavior must not be labeled
 * safe (§4.2.3).
 */
export function analyzeBatchAdvisor(events: readonly ProfilerEvent[]): BatchAdvisorResult {
  interface TurnAcc {
    totalRuns: number
    subscribers: Set<string>
  }
  const byTurn = new Map<string, TurnAcc>()

  for (const e of events) {
    if (e.type !== 'effectEnter' || e.turn === null) continue
    let acc = byTurn.get(e.turn)
    if (!acc) {
      acc = { totalRuns: 0, subscribers: new Set() }
      byTurn.set(e.turn, acc)
    }
    acc.totalRuns++
    if (e.subscriber !== undefined) acc.subscribers.add(e.subscriber)
  }

  const candidates: BatchCandidate[] = []
  for (const [turn, acc] of byTurn) {
    const distinctSubscribers = acc.subscribers.size
    const savings = acc.totalRuns - distinctSubscribers
    if (savings > 0) {
      candidates.push({
        turn,
        totalRuns: acc.totalRuns,
        distinctSubscribers,
        savings,
        safety: 'unverified',
      })
    }
  }
  candidates.sort((a, b) => b.savings - a.savings || b.totalRuns - a.totalRuns)

  return { kind: 'batch-advisor', candidates }
}

export function formatBatchAdvisor(r: BatchAdvisorResult): string {
  const lines: string[] = []
  lines.push('batch advisor — unbatched multi-write turns')
  if (r.candidates.length === 0) {
    lines.push('  (no turn would benefit from batching)')
  }
  for (const c of r.candidates) {
    const safe = c.safety === 'safe' ? ', safe' : c.safety === 'unsafe' ? ', UNSAFE' : ', safety unverified'
    lines.push(`  ${c.turn.padEnd(28)} batch candidate ${c.totalRuns}→${c.distinctSubscribers} (saves ${c.savings}${safe})`)
  }
  return lines.join('\n')
}

// -- Dynamic report (SR1–SR4 + analyses, SR7) ---------------------------------

export interface ProfileCoverage {
  /** Distinct handlers exercised (turns observed). */
  handlersFired: number
  /** Handlers the IR knows about (`buildEventSummary`). */
  handlersTotal: number
  /** SR4 ids the IR could not resolve — the honest gap. */
  unattributed: UnattributedId[]
}

export interface ProfileReport {
  kind: 'profile'
  componentName: string
  sourceFile: string
  /** Scenario label (e.g. `'auto'` or a scenario file name). */
  scenario: string
  /** Total recorded events. */
  events: number
  /** Distinct interaction turns. */
  turns: number
  hotSubscribers: HotSubscribersResult
  batchAdvisor: BatchAdvisorResult
  coverage: ProfileCoverage
}

export interface ProfileReportInput {
  source: string
  filePath: string
  componentName?: string
  scenario: string
  /** The recorded event log from driving the instrumented component (SR2). */
  events: readonly ProfilerEvent[]
}

/**
 * Assemble a dynamic profile (SR1–SR4 + analyses, SR7) from a recorded event
 * stream. Pure: the DOM run that *produces* `events` lives in the driver (the
 * CLI's scenario harness); this joins them to the IR and ranks findings.
 * Deterministic — same stream + same source ⇒ same report.
 */
export function buildProfileReport(input: ProfileReportInput): ProfileReport {
  const { source, filePath, componentName, scenario, events } = input
  const { graph } = buildComponentAnalysis(source, filePath, componentName)
  const index = buildIdIndex(graph)

  const hotSubscribers = analyzeHotSubscribers(events, index)
  const batchAdvisor = analyzeBatchAdvisor(events)
  const { unattributed } = joinProfilerEvents(events, index)

  const turnIds = new Set<string>()
  for (const e of events) if (e.turn !== null) turnIds.add(e.turn)

  let handlersTotal = 0
  try {
    handlersTotal = buildEventSummary(source, filePath, componentName).events.length
  } catch {
    handlersTotal = 0
  }

  return {
    kind: 'profile',
    componentName: graph.componentName,
    sourceFile: graph.sourceFile,
    scenario,
    events: events.length,
    turns: turnIds.size,
    hotSubscribers,
    batchAdvisor,
    coverage: {
      handlersFired: turnIds.size,
      handlersTotal,
      unattributed,
    },
  }
}

export function formatProfileReport(r: ProfileReport): string {
  const lines: string[] = []
  lines.push(`${r.componentName} — profile (scenario: ${r.scenario})`)
  lines.push(`  ${r.events} events across ${r.turns} turn(s)`)
  lines.push('')
  lines.push(formatHotSubscribers(r.hotSubscribers))
  lines.push('')
  lines.push(formatBatchAdvisor(r.batchAdvisor))
  lines.push('')
  const c = r.coverage
  lines.push(`coverage: ${c.handlersFired}/${c.handlersTotal} handlers exercised`)
  if (c.unattributed.length > 0) {
    lines.push(`  ⚠ ${c.unattributed.length} unattributed id(s): ${c.unattributed.slice(0, 3).map(u => u.id).join(', ')}`)
  }
  return lines.join('\n')
}
