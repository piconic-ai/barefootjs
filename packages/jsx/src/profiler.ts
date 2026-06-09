/**
 * Reactive performance profiler — static half (SR5 / SR6).
 *
 * Background: issue #1690. User-facing docs live in `bf debug profile --help`
 * (the design doc that used to live in `spec/profiler.md` was removed to avoid
 * drift — the CLI help is the single source of truth). This module implements
 * the **run-free** parts of `bf debug profile`: the static reactivity budget
 * (SR5) and the compile-diff regression (SR6). Both are pure functions of
 * the IR — no instrumented run is required — so they reuse the static
 * analysis already shipped in `debug.ts`:
 *
 *   - `buildComponentAnalysis` → `{ graph, ir }`
 *   - `buildComponentSummary`  → node counts
 *   - `traceUpdatePath`        → transitive dependents (fan-out + chain depth)
 *
 * The dynamic half (SR1–SR4: instrumented runtime, turn markers, IR join,
 * Hot-subscribers / Wasted-re-runs / Batch-advisor analyses) is assembled by
 * `buildProfileReport` from a recorded SR2 event stream — see those analyses
 * below.
 */

import ts from 'typescript'
import {
  buildComponentAnalysis,
  buildComponentSummary,
  buildEventSummary,
  traceUpdatePath,
  type ComponentGraph,
  type EventBinding,
  type UpdatePathEntry,
} from './debug.ts'
import { listComponentFunctions, createProgramForFile } from './analyzer.ts'
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
  /**
   * True when the component declares reactive state (signals/memos) but nothing
   * in *this* component subscribes to it — every consumer is in a composed child
   * (a compound component like `Select`/`Combobox`), or the state is only read
   * from event handlers. The single-component static budget can't see across the
   * composition boundary, so its `subscriptions`/fan-out read 0 and would
   * otherwise look misleadingly "free". `--scenario` measures across components.
   */
  crossComponentOnly: boolean
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
  // Build the TS program once and reuse it for both analyses (re-parsing the
  // file twice is the bulk of the cost on a large source).
  const program = createProgramForFile(source, filePath)?.program
  const { graph } = buildComponentAnalysis(source, filePath, componentName, program)
  // `graph` is the authority for reactive-node counts; the summary is consulted
  // only for `loops`, which needs the IR tree walk (`countNodeType`) that the
  // graph doesn't expose.
  const summary = buildComponentSummary(source, filePath, componentName, program)

  const subscriptions = graph.signals.reduce(
    (n, s) => n + s.consumers.filter(c => !isEventHandlerConsumer(c)).length,
    0,
  )

  const fanOut: FanOutEntry[] = graph.signals
    .map(s => {
      const subscribers = transitiveSubscriberCount(graph, s.name)
      return { signal: s.name, subscribers, hot: subscribers >= threshold, loc: s.loc }
    })
    .sort((a, b) => b.subscribers - a.subscribers)

  const { depth, chain } = longestMemoChain(graph)

  // Reactive state exists, yet nothing in *this* component observes it. The
  // check spans signals AND memos: a memo with an in-component consumer (e.g.
  // memo → DOM binding, with the memo reading a prop rather than a signal) is a
  // real subscriber even though `subscriptions`/signal-`fanOut` — both
  // signal-derived — read 0. So a node is "observed in-component" iff it has a
  // non-empty transitive dependent tree; if none of the signals or memos do, the
  // consumers live across a composition boundary (compound component) — flag it
  // so the 0s don't read as "free".
  const hasReactiveState = graph.signals.length > 0 || graph.memos.length > 0
  const observedInComponent =
    graph.signals.some(s => transitiveSubscriberCount(graph, s.name) > 0) ||
    graph.memos.some(m => transitiveSubscriberCount(graph, m.name) > 0)
  const crossComponentOnly = hasReactiveState && !observedInComponent

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
    crossComponentOnly,
  }
}

/**
 * An event handler *reads* a signal (e.g. `setCount(count() + 1)`) but runs
 * outside any reactive scope, so it does not re-run when the signal changes —
 * it is not a reactive subscriber and must be excluded from fan-out /
 * subscription counts (cross-checked against the dynamic run, #1690 §4.2.4).
 */
function isEventHandlerEntry(kind: string, name: string): boolean {
  return kind === 'dom' && /^\w+ handler "/.test(name)
}

/** As above, for the `kind:name` consumer strings on `SignalNode.consumers`. */
function isEventHandlerConsumer(consumer: string): boolean {
  const i = consumer.indexOf(':')
  return i > 0 && isEventHandlerEntry(consumer.slice(0, i), consumer.slice(i + 1))
}

/**
 * Distinct transitive subscribers of a signal/memo. Walks the same tagged
 * `consumers` tree `traceUpdatePath` builds (`debug.ts`), deduplicating across
 * branches so a diamond dependency counts each subscriber once. Event handlers
 * are excluded — they read but don't react.
 */
function transitiveSubscriberCount(graph: ComponentGraph, name: string): number {
  const path = traceUpdatePath(graph, name)
  if (!path) return 0
  const seen = new Set<string>()
  const walk = (entries: UpdatePathEntry[]): void => {
    for (const e of entries) {
      if (!isEventHandlerEntry(e.kind, e.name)) seen.add(`${e.kind}:${e.name}`)
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
  if (b.crossComponentOnly) {
    lines.push(
      `  ⓘ compound: ${b.signals} signal(s) / ${b.memos} memo(s) but 0 in-component subscriptions —`,
    )
    lines.push('    consumers are likely in composed child components (or it is read only from handlers);')
    lines.push('    run with --scenario to measure across the composition boundary.')
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
  /**
   * Discriminator so a JSON consumer can tell the three `bf debug profile`
   * modes apart (`static-budget` / `profile` / `diff`). Without it an all-zero
   * diff (no structural change) was indistinguishable from a pure-static
   * component with no reactive state (#1849 B2).
   */
  kind: 'diff'
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
    kind: 'diff',
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
  kind: 'signal' | 'memo' | 'effect' | 'handler'
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
  // DOM-binding effects (#1690, SR3/SR4): text/attribute/conditional/loop
  // updates emit `createEffect(…, "<Component>#binding:<slotId>")`. Resolve
  // each from its `domBinding` (slotId + loc). Event bindings are handlers, not
  // re-running effects — skip them.
  for (const b of graph.domBindings) {
    if (!b.loc) continue
    const loc = { file: b.loc.file, line: b.loc.start.line }
    if (b.type === 'event') {
      // Handler turn ids (`<Component>#handler:<slotId>:<eventName>`, SR3). The
      // event name is embedded in the label (`click handler "s1"`).
      const eventName = b.label.match(/^(\w+)\s+handler/)?.[1]
      if (eventName) {
        index.set(`${comp}#handler:${b.slotId}:${eventName}`, {
          kind: 'handler',
          name: `${eventName}@${b.slotId}`,
          loc,
        })
      }
      continue
    }
    index.set(`${comp}#binding:${b.slotId}`, { kind: 'effect', name: `${b.slotId} (${b.type})`, loc })
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
   * Actionable coverage gaps: ids shaped like a compiler profiler id
   * (`<Component>#<kind>:<rest>`) that the IR did not resolve — surfaced, never
   * dropped (SR4 invariant). A non-empty list is the honest coverage caveat the
   * analyses print: something the IR *should* have explained but didn't.
   */
  unattributed: UnattributedId[]
  /**
   * Non-actionable runtime bookkeeping ids (`s9`, `e3`, `m7`, `r10`) — anonymous
   * reactive nodes the compiler never named (see `isRuntimeBookkeepingId`).
   * Kept separate from `unattributed` so the coverage report focuses on real,
   * fixable gaps instead of internal slot/ref noise, but still surfaced (never
   * dropped) so the SR4 "account for every id" invariant holds.
   */
  diagnostics: UnattributedId[]
}

/**
 * True for the reactive runtime's *fallback* ids — the synthetic `s<n>`
 * (signal), `e<n>` (effect), `m<n>` (memo), and `r<n>` (root) sequences
 * `reactive.ts` assigns when a node carries no compiler `__bfId`. These name
 * anonymous internal machinery, never a source location, so they can never be
 * attributed to an IR node. Treating them as coverage gaps makes a healthy
 * report look broken (#1840); they belong in the non-actionable diagnostics
 * bucket instead. Compiler ids always carry a `#`, so they never match.
 */
function isRuntimeBookkeepingId(id: string): boolean {
  return /^[serm]\d+$/.test(id)
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

  const unattributed: UnattributedId[] = []
  const diagnostics: UnattributedId[] = []
  for (const [id, count] of gaps.entries()) {
    ;(isRuntimeBookkeepingId(id) ? diagnostics : unattributed).push({ id, count })
  }
  const byCount = (a: UnattributedId, b: UnattributedId): number => b.count - a.count
  unattributed.sort(byCount)
  diagnostics.sort(byCount)

  return { joined, unattributed, diagnostics }
}

// -- Analysis: hot subscribers (v1, §4.2.1) -----------------------------------

/** A likely source `createEffect(...)` call site for an uninstrumented id. */
export interface EffectCandidate {
  file: string
  line: number
}

/**
 * Static scan for `createEffect(...)` call sites in `source` whose line is NOT
 * in `instrumentedLines` — i.e. effects the compiler did not assign a `__bfId`
 * (a `createEffect` nested in a ref callback / helper rather than at the
 * component's top-level reactive init). These are the likely sources behind an
 * anonymous runtime `e<n>` id the IR join can't resolve (#1849 B6). A specific
 * `e<n>` can't be mapped to a specific call site, so these are surfaced as
 * *candidates* ("possible sources"), not definitive attribution.
 */
export function findUninstrumentedEffects(
  source: string,
  filePath: string,
  instrumentedLines: ReadonlySet<number>,
): EffectCandidate[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: EffectCandidate[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createEffect') {
      const line = sf.getLineAndCharacterOfPosition(node.expression.getStart(sf)).line + 1
      if (!instrumentedLines.has(line)) out.push({ file: filePath, line })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  out.sort((a, b) => a.line - b.line)
  return out
}

export interface HotSubscriber {
  /** The compiler-assigned subscriber id (effect/memo). */
  subscriber: string
  /** Source-mapped node from the SR4 join; absent ⇒ a coverage gap. */
  loc?: { file: string; line: number }
  name?: string
  kind?: ResolvedNode['kind']
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
  /**
   * Why an `e<n>`-style runtime id has no `loc`: the compiler never assigned it
   * a `__bfId` (a `createEffect` outside the top-level reactive init — e.g.
   * inside a ref callback). Set only for those ids so the reader understands the
   * missing location is expected, not a broken profiler (#1849 B6). The cost is
   * still surfaced — the row is kept, not hidden.
   */
  resolution?: 'uninstrumented'
  /** Human note paired with `resolution`. */
  resolutionNote?: string
  /**
   * Likely source `createEffect` call sites for an `uninstrumented` id, from a
   * static scan — possible sources, not a definitive attribution.
   */
  candidates?: EffectCandidate[]
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
  /**
   * Drop subscribers whose `totalMs` is below this threshold (after ranking,
   * before `topN`). Noise filter for `--hot-ms`: a component with a long tail of
   * sub-millisecond effects (e.g. a calendar grid) collapses to the few that
   * actually cost. Default: keep all.
   */
  minMs?: number
  /**
   * Candidate `createEffect` call sites for uninstrumented `e<n>` ids (#1849 B6).
   * Attached to each such subscriber so the reader can jump to the likely source
   * without opening the file. Computed by the caller (it needs the component
   * source); the analysis is otherwise source-free.
   */
  uninstrumentedCandidates?: readonly EffectCandidate[]
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
    /** Distinct turn *invocations* (by `turnSeq`, falling back to id) it ran in. */
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
      else a.turns.add(String(e.turnSeq ?? e.turn))
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
    // An anonymous runtime `e<n>` id with no resolved node is a `createEffect`
    // the compiler never assigned a `__bfId` (one nested in a ref callback /
    // helper). Keep it in the table — its cost is real — but label *why* it has
    // no location and surface candidate source lines so the reader needn't hunt
    // for it (#1849 B6). Other bookkeeping ids (`s*`/`m*`/`r*`) stay plain.
    const uninstrumented = !node && /^e\d+$/.test(subscriber)
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
      ...(uninstrumented
        ? {
            resolution: 'uninstrumented' as const,
            resolutionNote: 'createEffect in non-JSX function scope (not attributed by compiler)',
            candidates: [...(options.uninstrumentedCandidates ?? [])],
          }
        : {}),
    }
  })

  // Rank by cost — `totalMs` is what the user fixes ("where's the time?"). To
  // stay reproducible (SR7) despite wall-clock noise, compare at the displayed
  // 0.1ms precision so same-cost subscribers form a stable cohort, then break
  // ties by `runs` (the structural leading indicator) and finally the id.
  const roundMs = (m: number): number => Math.round(m * 10) / 10
  subscribers.sort(
    (x, y) =>
      roundMs(y.totalMs) - roundMs(x.totalMs) ||
      y.runs - x.runs ||
      (x.subscriber < y.subscriber ? -1 : x.subscriber > y.subscriber ? 1 : 0),
  )
  // `minMs` is a noise floor applied at the displayed 0.1ms precision so a
  // subscriber on the line is filtered consistently with how it would render.
  if (options.minMs !== undefined) subscribers = subscribers.filter(s => roundMs(s.totalMs) >= options.minMs!)
  if (options.topN !== undefined) subscribers = subscribers.slice(0, options.topN)

  // Only subscriber ids matter for this analysis — filter the join's gaps to
  // ids that actually appeared as a subscriber.
  const subscriberIds = new Set(byId.keys())
  const gaps = unattributed.filter(u => subscriberIds.has(u.id))

  return { kind: 'hot-subscribers', subscribers, unattributed: gaps }
}

const BAR_EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** Pad or ellipsize `s` to exactly `width` cells so columns stay aligned. */
function fitLabel(s: string, width: number): string {
  return s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width)
}

/**
 * A proportional horizontal bar for `value/max`, in eighth-block precision
 * (mitata-style), left-padded to `width` cells. Empty when value/max ≤ 0.
 */
function bar(value: number, max: number, width: number): string {
  if (max <= 0 || value <= 0) return ''.padEnd(width)
  const units = Math.min(value / max, 1) * width
  let full = Math.floor(units)
  let rem = Math.round((units - full) * 8)
  if (rem === 8) {
    full++ // a fractional part that rounds to 8/8 is a whole extra cell
    rem = 0
  }
  return ('█'.repeat(full) + (rem > 0 ? BAR_EIGHTHS[rem] : '')).padEnd(width)
}

/**
 * Render candidate `createEffect` sites grouped per file, e.g.
 * `collapsible/index.tsx:82, :126, :184` (multiple files joined by `; `).
 */
function formatEffectCandidates(candidates: readonly EffectCandidate[]): string {
  const byFile = new Map<string, number[]>()
  for (const c of candidates) {
    const arr = byFile.get(c.file) ?? []
    arr.push(c.line)
    byFile.set(c.file, arr)
  }
  const groups: string[] = []
  for (const [file, ls] of byFile) {
    const sorted = [...new Set(ls)].sort((a, b) => a - b)
    groups.push(`${file}:${sorted[0]}${sorted.slice(1).map(l => `, :${l}`).join('')}`)
  }
  return groups.join('; ')
}

export function formatHotSubscribers(r: HotSubscribersResult, limit = 12): string {
  const lines: string[] = []
  lines.push('hot subscribers — most run / most time')
  if (r.subscribers.length === 0) {
    lines.push('  (no effect/memo runs recorded)')
  }
  // Resolved subscribers carry a source line and are the actionable ones; show
  // them first, then a capped tail of unresolved noise (loop/binding effects
  // the analyzer can't yet place), so a big list (e.g. a calendar grid) stays
  // readable instead of dumping a thousand rows.
  const shown = r.subscribers.slice(0, limit)
  // Bars are proportional to `totalMs` — the cost, i.e. where to spend a fix.
  // `runs` (the leading indicator of that cost) rides alongside as a number.
  const maxMs = shown.reduce((m, s) => Math.max(m, s.totalMs), 0)
  for (const s of shown) {
    // An uninstrumented `e<n>` id has no loc by design (the compiler never named
    // it); say so explicitly instead of the bare `(unresolved)` that reads like
    // a broken profiler (#1849 B6).
    const where = s.loc
      ? `${s.loc.file}:${s.loc.line}`
      : s.resolution === 'uninstrumented'
        ? '(uninstrumented — createEffect in non-JSX scope)'
        : '(unresolved)'
    const base = s.name ?? s.subscriber
    // Binding names already carry their type (`s1 (attribute)`); don't double up.
    const label = s.kind && !base.endsWith(')') ? `${base} (${s.kind})` : base
    const note = s.hot ? `  ⚠ ${s.runsPerTurn.toFixed(1)}/turn` : ''
    lines.push(
      `  ${fitLabel(label, 24)} ${bar(s.totalMs, maxMs, 14)} ${s.totalMs.toFixed(1)}ms  ${String(s.runs).padStart(3)}×  (${where})${note}`,
    )
    // Candidate source lines for an uninstrumented id — the reader jumps there
    // without opening the file. Possible sources, not a definitive mapping.
    if (s.candidates && s.candidates.length > 0) {
      lines.push(`${' '.repeat(26)}candidates: ${formatEffectCandidates(s.candidates)}`)
    }
  }
  if (r.subscribers.length > shown.length) {
    lines.push(`  … and ${r.subscribers.length - shown.length} more`)
  }
  if (r.unattributed.length > 0) {
    lines.push(`  ⚠ coverage: ${r.unattributed.length} unresolved subscriber id(s)`)
  }
  return lines.join('\n')
}

// -- Analysis: wasted re-runs (v1, §4.2.2) ------------------------------------

export interface WastedSubscriber {
  /** The compiler-assigned subscriber id (effect/memo/binding). */
  subscriber: string
  /** Source-mapped node from the SR4 join; absent ⇒ a coverage gap. */
  loc?: { file: string; line: number }
  name?: string
  kind?: ResolvedNode['kind']
  /** Runs that emitted an output fingerprint (`effectOutput` count). */
  totalRuns: number
  /** Fingerprinted runs whose output was identical to the previous run. */
  wastedRuns: number
  /** `wastedRuns / totalRuns` — the share of recompute that produced no change. */
  wastedRatio: number
  /** True when `wastedRatio` meets the configured threshold. */
  wasted: boolean
}

export interface WastedReRunsResult {
  kind: 'wasted-re-runs'
  /** Subscribers with ≥1 wasted run, ranked by `wastedRuns` then `wastedRatio`. */
  subscribers: WastedSubscriber[]
  /** SR4 coverage gaps — fingerprinted subscriber ids the IR could not resolve. */
  unattributed: UnattributedId[]
}

export interface WastedReRunsOptions {
  /**
   * `wastedRatio` at/above which a subscriber is flagged `wasted`. A fraction in
   * `[0,1]` (e.g. `0.5` = half its runs produced identical output). Default 0.5.
   */
  wastedRatio?: number
  /** Keep only the top-N by `wastedRuns` (after ranking). Default: all. */
  topN?: number
}

const DEFAULT_WASTED_RATIO = 0.5

/**
 * Wasted re-runs (§4.2.2): effects/memos that re-ran but produced output
 * identical to their previous run — the computation happened, the DOM/value did
 * not change, so the re-run was removable. The complement to hot subscribers:
 * hot says *where the cost is*, wasted says *how much of it is removable*.
 *
 * Pure over the SR2 stream's `effectOutput` fingerprints (memo-value `Object.is`
 * + instrumented DOM writes) joined to IR source loc — same scenario ⇒ same
 * ranking. A high ratio means the subscriber reads at a coarser grain than its
 * output needs; the fix is a finer signal/memo split.
 */
export function analyzeWastedReReruns(
  events: readonly ProfilerEvent[],
  index: IdIndex,
  options: WastedReRunsOptions = {},
): WastedReRunsResult {
  const threshold = options.wastedRatio ?? DEFAULT_WASTED_RATIO

  interface Acc {
    total: number
    wasted: number
  }
  const byId = new Map<string, Acc>()

  for (const e of events) {
    if (e.type !== 'effectOutput' || e.subscriber === undefined || e.changed === undefined) continue
    let a = byId.get(e.subscriber)
    if (!a) {
      a = { total: 0, wasted: 0 }
      byId.set(e.subscriber, a)
    }
    a.total++
    if (!e.changed) a.wasted++
  }

  const { unattributed } = joinProfilerEvents(events, index)
  const nodeFor = new Map<string, ResolvedNode>()
  for (const [id] of byId) {
    const node = index.get(id)
    if (node) nodeFor.set(id, node)
  }

  let subscribers: WastedSubscriber[] = [...byId.entries()]
    .map(([subscriber, a]) => {
      const node = nodeFor.get(subscriber)
      const wastedRatio = a.total > 0 ? a.wasted / a.total : 0
      return {
        subscriber,
        loc: node?.loc,
        name: node?.name,
        kind: node?.kind,
        totalRuns: a.total,
        wastedRuns: a.wasted,
        wastedRatio,
        wasted: wastedRatio >= threshold,
      }
    })
    // Only subscribers that actually wasted work are findings.
    .filter(s => s.wastedRuns > 0)

  // Rank by *removable* cost first — absolute wasted runs is what a finer split
  // would eliminate; ratio (the severity) and id break ties, keeping the order
  // deterministic across runs (SR7).
  subscribers.sort(
    (x, y) =>
      y.wastedRuns - x.wastedRuns ||
      y.wastedRatio - x.wastedRatio ||
      (x.subscriber < y.subscriber ? -1 : x.subscriber > y.subscriber ? 1 : 0),
  )
  if (options.topN !== undefined) subscribers = subscribers.slice(0, options.topN)

  // Only fingerprinted subscriber ids matter — filter the join's gaps to ids
  // that actually appeared as a fingerprinted subscriber.
  const subscriberIds = new Set(byId.keys())
  const gaps = unattributed.filter(u => subscriberIds.has(u.id))

  return { kind: 'wasted-re-runs', subscribers, unattributed: gaps }
}

/** The noun for a subscriber's identical output, keyed by kind (memo vs DOM). */
function wastedOutputNoun(kind?: ResolvedNode['kind']): string {
  return kind === 'memo' ? 'identical value' : 'identical DOM'
}

export function formatWastedReReruns(r: WastedReRunsResult, limit = 12): string {
  const lines: string[] = []
  lines.push('wasted re-runs — re-ran but produced identical output')
  if (r.subscribers.length === 0) {
    lines.push('  (no wasted re-runs recorded)')
  }
  const shown = r.subscribers.slice(0, limit)
  const maxWasted = shown.reduce((m, s) => Math.max(m, s.wastedRuns), 0)
  for (const s of shown) {
    const where = s.loc ? `${s.loc.file}:${s.loc.line}` : '(unresolved)'
    const base = s.name ?? s.subscriber
    const label = s.kind && !base.endsWith(')') ? `${base} (${s.kind})` : base
    const pct = Math.round(s.wastedRatio * 100)
    const note = s.wasted ? '  ⚠ split so it doesn’t re-run on unrelated changes' : ''
    lines.push(
      `  ${fitLabel(label, 24)} ${bar(s.wastedRuns, maxWasted, 14)} wasted: ${s.wastedRuns}/${s.totalRuns} produced ${wastedOutputNoun(s.kind)} (${pct}%)  (${where})${note}`,
    )
  }
  if (r.subscribers.length > shown.length) {
    lines.push(`  … and ${r.subscribers.length - shown.length} more`)
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
  /** Handler source location, when the id index resolves it. */
  loc?: { file: string; line: number }
  /** Friendly handler name (`click@s1`), when resolved. */
  handler?: string
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
export function analyzeBatchAdvisor(
  events: readonly ProfilerEvent[],
  index?: IdIndex,
): BatchAdvisorResult {
  // Group by turn *invocation* (`turnSeq`), so several clicks of the same
  // handler are evaluated separately rather than summed into one inflated turn.
  interface TurnAcc {
    handlerId: string
    totalRuns: number
    subscribers: Set<string>
  }
  const byInvocation = new Map<string, TurnAcc>()

  for (const e of events) {
    if (e.type !== 'effectEnter' || e.turn === null) continue
    const key = String(e.turnSeq ?? e.turn)
    let acc = byInvocation.get(key)
    if (!acc) {
      acc = { handlerId: e.turn, totalRuns: 0, subscribers: new Set() }
      byInvocation.set(key, acc)
    }
    acc.totalRuns++
    if (e.subscriber !== undefined) acc.subscribers.add(e.subscriber)
  }

  // Collapse invocations to one candidate per handler — the worst (max-savings)
  // invocation represents the handler's batch opportunity.
  const byHandler = new Map<string, BatchCandidate>()
  for (const acc of byInvocation.values()) {
    const distinctSubscribers = acc.subscribers.size
    const savings = acc.totalRuns - distinctSubscribers
    if (savings <= 0) continue
    const prev = byHandler.get(acc.handlerId)
    if (prev && prev.savings >= savings) continue
    const node = index?.get(acc.handlerId)
    byHandler.set(acc.handlerId, {
      turn: acc.handlerId,
      loc: node?.loc,
      handler: node?.name,
      totalRuns: acc.totalRuns,
      distinctSubscribers,
      savings,
      safety: 'unverified',
    })
  }

  const candidates = [...byHandler.values()]
  candidates.sort((a, b) => b.savings - a.savings || b.totalRuns - a.totalRuns)

  return { kind: 'batch-advisor', candidates }
}

export function formatBatchAdvisor(r: BatchAdvisorResult): string {
  const lines: string[] = []
  lines.push('batch advisor — unbatched multi-write turns')
  if (r.candidates.length === 0) {
    lines.push('  (no turn would benefit from batching)')
  }
  const maxSavings = r.candidates.reduce((m, c) => Math.max(m, c.savings), 0)
  for (const c of r.candidates) {
    const safe = c.safety === 'safe' ? ', safe' : c.safety === 'unsafe' ? ', UNSAFE' : ', safety unverified'
    const where = c.loc ? `  (${c.loc.file}:${c.loc.line})` : ''
    const label = fitLabel(c.handler ?? c.turn, 24)
    // Bar proportional to savings (deterministic) — the bigger the bar, the more
    // effect re-runs a `batch()` would collapse.
    lines.push(
      `  ${label} ${bar(c.savings, maxSavings, 14)} batch candidate ${c.totalRuns}→${c.distinctSubscribers} (saves ${c.savings}${safe})${where}`,
    )
  }
  return lines.join('\n')
}

// -- Batch safety oracle (§4.2.3 / SR4) ---------------------------------------

/** Memos transitively dependent on any of `written` (so stale under batch). */
function downstreamMemos(graph: ComponentGraph, written: Set<string>): Set<string> {
  const byName = new Map(graph.memos.map(m => [m.name, m]))
  const result = new Set<string>()
  const dependsOnWritten = (memoName: string, seen: Set<string>): boolean => {
    if (seen.has(memoName)) return false
    seen.add(memoName)
    const m = byName.get(memoName)
    if (!m) return false
    for (const dep of m.deps) {
      if (written.has(dep)) return true
      if (byName.has(dep) && dependsOnWritten(dep, seen)) return true
    }
    return false
  }
  for (const m of graph.memos) if (dependsOnWritten(m.name, new Set())) result.add(m.name)
  return result
}

/**
 * The **post-write-derived-read** oracle (§4.2.3). Wrapping a handler in
 * `batch()` defers effect flush; since a memo is a push-effect that writes a
 * private signal (`reactive.ts`), a memo read *after* a write to one of its
 * dependencies returns a **stale** value under batch. So a wrap is safe iff no
 * such read happens.
 *
 * Conservative by construction — only `'safe'` when provably so:
 * - indirect setters (`via` a helper) ⇒ `'unverified'` (helper body unseen);
 * - a downstream-memo getter called after the first write ⇒ `'unsafe'`;
 * - a bare unknown-function call after a write ⇒ `'unverified'` (it could read a
 *   memo we can't see). Signal reads are fine — `set()` updates the value
 *   synchronously; only memo recomputation is deferred.
 *
 * Known gap: a memo read reached through an object-method call's closure is not
 * traced (only lexically-visible `memo()` getters and bare helper calls are).
 */
export function assessBatchSafety(args: {
  handler: string
  setterNames: readonly string[]
  hasIndirectSetters: boolean
  writtenSignals: readonly string[]
  graph: ComponentGraph
}): BatchSafety {
  if (args.hasIndirectSetters || args.setterNames.length === 0) return 'unverified'

  const D = downstreamMemos(args.graph, new Set(args.writtenSignals))
  const setters = new Set(args.setterNames)
  const memoNames = new Set(args.graph.memos.map(m => m.name))
  const signalGetters = new Set(args.graph.signals.map(s => s.name))

  let sf: ts.SourceFile
  try {
    sf = ts.createSourceFile('__h.ts', `const __h = ${args.handler}`, ts.ScriptTarget.Latest, true)
  } catch {
    return 'unverified'
  }

  type Call = { pos: number; kind: 'write' | 'memoRead' | 'risky' }
  const calls: Call[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      if (setters.has(name)) calls.push({ pos: node.getStart(sf), kind: 'write' })
      else if (D.has(name) && node.arguments.length === 0) calls.push({ pos: node.getStart(sf), kind: 'memoRead' })
      else if (!signalGetters.has(name) && !memoNames.has(name)) calls.push({ pos: node.getStart(sf), kind: 'risky' })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  calls.sort((a, b) => a.pos - b.pos)

  let seenWrite = false
  let risky = false
  for (const c of calls) {
    if (c.kind === 'write') seenWrite = true
    else if (seenWrite && c.kind === 'memoRead') return 'unsafe'
    else if (seenWrite && c.kind === 'risky') risky = true
  }
  if (!seenWrite) return 'unverified'
  return risky ? 'unverified' : 'safe'
}

/**
 * Pair each turn handler id (`<Component>#handler:<slotId>:<event>`) with its
 * `EventBinding`, matching the event `domBinding`'s slotId to the binding by
 * source line (the binding itself has no slotId). Used to feed the safety
 * oracle a candidate's handler body + setter calls.
 */
function turnToEventBinding(graph: ComponentGraph, events: EventBinding[]): Map<string, EventBinding> {
  const byLine = new Map<number, EventBinding>()
  for (const e of events) if (e.loc) byLine.set(e.loc.start.line, e)
  const out = new Map<string, EventBinding>()
  for (const b of graph.domBindings) {
    if (b.type !== 'event' || !b.loc) continue
    const eventName = b.label.match(/^(\w+)\s+handler/)?.[1]
    const binding = byLine.get(b.loc.start.line)
    if (eventName && binding) out.set(`${graph.componentName}#handler:${b.slotId}:${eventName}`, binding)
  }
  return out
}

// -- Dynamic report (SR1–SR4 + analyses, SR7) ---------------------------------

/**
 * Compact rollup of the non-actionable runtime bookkeeping ids — a count plus a
 * small sample. The full per-id list could run to hundreds of entries for a
 * loop-heavy component (a calendar's 6-week grid emits ~90 binding ids × mount
 * + interaction ≈ 180), drowning a JSON consumer in noise it can't act on
 * (#1849 B7). The text report only ever printed the count, so the array carried
 * no information the summary doesn't.
 */
export interface DiagnosticsSummary {
  /** Total distinct anonymous runtime bookkeeping ids encountered. */
  count: number
  /** A few example ids (hottest first) for a sanity check — not exhaustive. */
  sample: string[]
}

export interface ProfileCoverage {
  /** Distinct handlers exercised (turns observed). */
  handlersFired: number
  /** Handlers the IR knows about (`buildEventSummary`). */
  handlersTotal: number
  /** SR4 ids the IR could not resolve — the honest, actionable gap. */
  unattributed: UnattributedId[]
  /**
   * Anonymous runtime bookkeeping ids (`s*`/`e*`/`m*`/`r*`) that have no source
   * node — non-actionable noise, kept out of `unattributed` so the gap list
   * stays meaningful, but summarized here so nothing is silently dropped.
   */
  diagnostics: DiagnosticsSummary
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
  wastedReReruns: WastedReRunsResult
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
  /**
   * Other sources compiled for the same run — the composed sub-components of a
   * scenario-file story. Their graphs are merged into the id index so events
   * from those components resolve too.
   */
  extraSources?: readonly { source: string; filePath: string }[]
  /** Keep only the top-N hot subscribers by `totalMs` (`--top`). Default: all. */
  topN?: number
  /** Drop hot subscribers below this `totalMs` floor (`--hot-ms`). Default: all. */
  minMs?: number
  /**
   * `wastedRatio` threshold (`--wasted-pct`) for the wasted-re-runs analysis, a
   * fraction in `[0,1]`. Default 0.5.
   */
  wastedRatio?: number
}

/**
 * Assemble a dynamic profile (SR1–SR4 + analyses, SR7) from a recorded event
 * stream. Pure: the DOM run that *produces* `events` lives in the driver (the
 * CLI's scenario harness); this joins them to the IR and ranks findings.
 * Deterministic — same stream + same source ⇒ same report.
 */
export function buildProfileReport(input: ProfileReportInput): ProfileReport {
  const { source, filePath, componentName, scenario, events } = input

  const primary = buildComponentAnalysis(source, filePath, componentName).graph
  // All sources contributing to the merged index (primary first).
  const allSources = [{ source, filePath }, ...(input.extraSources ?? [])]

  const index: IdIndex = new Map()
  // turn id → the handler binding + the component graph that owns it (so the
  // safety oracle reasons over the right component's memos).
  const turnBindings = new Map<string, { binding: EventBinding; graph: ComponentGraph }>()
  let handlersTotal = 0
  // Per-file lines of the `createEffect` calls the compiler instrumented (top
  // level, carry a `__bfId`). Subtracted from a source scan to find the
  // uninstrumented ones behind anonymous `e<n>` ids (#1849 B6).
  const instrumentedEffectLines = new Map<string, Set<number>>()

  for (const s of allSources) {
    // A source file may declare several components (e.g. a headless set:
    // Collapsible + CollapsibleTrigger + CollapsibleContent). Build the TS
    // program once and reuse it for every component — re-parsing per component
    // is the dominant cost (a 25-component file like `chart` is ~30s otherwise).
    const program = createProgramForFile(s.source, s.filePath)?.program
    let componentNames: string[]
    try {
      componentNames = listComponentFunctions(s.source, s.filePath)
    } catch {
      componentNames = []
    }
    if (componentNames.length === 0) componentNames = [undefined as unknown as string]
    for (const name of componentNames) {
      let graph: ComponentGraph
      try {
        graph = buildComponentAnalysis(s.source, s.filePath, name, program).graph
      } catch {
        continue
      }
      for (const [k, v] of buildIdIndex(graph)) index.set(k, v)
      for (const e of graph.effects) {
        const set = instrumentedEffectLines.get(e.loc.file) ?? new Set<number>()
        set.add(e.loc.line)
        instrumentedEffectLines.set(e.loc.file, set)
      }
      try {
        const summary = buildEventSummary(s.source, s.filePath, name, program)
        handlersTotal += summary.events.length
        for (const [turn, binding] of turnToEventBinding(graph, summary.events)) {
          turnBindings.set(turn, { binding, graph })
        }
      } catch {
        /* a component the analyzer can't summarize contributes no handlers */
      }
    }
  }

  // Candidate sites for uninstrumented `createEffect` ids, across every source
  // in the run (a compound scenario spans several files), so an `e<n>` row can
  // cite where to look (#1849 B6).
  const uninstrumentedCandidates: EffectCandidate[] = []
  for (const s of allSources) {
    uninstrumentedCandidates.push(
      ...findUninstrumentedEffects(s.source, s.filePath, instrumentedEffectLines.get(s.filePath) ?? new Set()),
    )
  }

  const hotSubscribers = analyzeHotSubscribers(events, index, {
    topN: input.topN,
    minMs: input.minMs,
    uninstrumentedCandidates,
  })
  const wastedReReruns = analyzeWastedReReruns(events, index, { wastedRatio: input.wastedRatio })
  const batchAdvisor = analyzeBatchAdvisor(events, index)
  const { unattributed, diagnostics } = joinProfilerEvents(events, index)

  // Safety oracle (§4.2.3): upgrade each candidate from 'unverified'.
  for (const c of batchAdvisor.candidates) {
    const hit = turnBindings.get(c.turn)
    if (!hit) continue
    c.safety = assessBatchSafety({
      handler: hit.binding.handler,
      setterNames: hit.binding.setterCalls.map(s => s.setter),
      hasIndirectSetters: hit.binding.setterCalls.some(s => s.via && s.via.length > 0),
      writtenSignals: hit.binding.setterCalls.map(s => s.signal).filter((s): s is string => s !== null),
      graph: hit.graph,
    })
  }

  // Count distinct turn *invocations* (turnSeq), not handler ids — N clicks of
  // one handler are N turns. Handlers exercised (coverage) counts distinct ids.
  const turnSeqs = new Set<string>()
  const handlerIds = new Set<string>()
  for (const e of events) {
    if (e.turn !== null) {
      turnSeqs.add(String(e.turnSeq ?? e.turn))
      handlerIds.add(e.turn)
    }
  }

  return {
    kind: 'profile',
    componentName: primary.componentName,
    sourceFile: primary.sourceFile,
    scenario,
    events: events.length,
    turns: turnSeqs.size,
    hotSubscribers,
    wastedReReruns,
    batchAdvisor,
    coverage: {
      handlersFired: handlerIds.size,
      handlersTotal,
      unattributed,
      // Roll the (potentially hundreds of) bookkeeping ids up to a count + a
      // small sample so JSON consumers aren't flooded (#1849 B7). `diagnostics`
      // is already sorted hottest-first by `joinProfilerEvents`.
      diagnostics: { count: diagnostics.length, sample: diagnostics.slice(0, 3).map(d => d.id) },
    },
  }
}

export function formatProfileReport(r: ProfileReport): string {
  const lines: string[] = []
  lines.push(`${r.componentName} — profile (scenario: ${r.scenario})`)
  lines.push(`  ${r.events} events across ${r.turns} turn(s)`)
  // No interactions measured: either the component has no handlers (use the
  // static budget) or its handlers live in composed children the auto scenario
  // couldn't reach (use a --scenario file). Say so plainly rather than leaving
  // the user with mount-only, mostly-unresolved noise.
  if (r.turns === 0) {
    lines.push(
      r.coverage.handlersTotal === 0
        ? '  note: no event handlers — run `bf debug profile <component>` for the static budget.'
        : '  note: no interactions measured (handlers are likely in composed children) — try `--scenario <story.tsx>`.',
    )
  }
  lines.push('')
  lines.push(formatHotSubscribers(r.hotSubscribers))
  lines.push('')
  lines.push(formatWastedReReruns(r.wastedReReruns))
  lines.push('')
  lines.push(formatBatchAdvisor(r.batchAdvisor))
  lines.push('')
  const c = r.coverage
  lines.push(`coverage: ${c.handlersFired}/${c.handlersTotal} handlers exercised`)
  if (c.unattributed.length > 0) {
    lines.push(`  ⚠ ${c.unattributed.length} unattributed id(s): ${c.unattributed.slice(0, 3).map(u => u.id).join(', ')}`)
  }
  // Anonymous runtime bookkeeping ids (s*/e*/m*/r*) are noted but flagged
  // non-actionable, so the report is honest about coverage without crying wolf.
  if (c.diagnostics.count > 0) {
    lines.push(`  · ${c.diagnostics.count} anonymous runtime id(s) (non-actionable bookkeeping)`)
  }
  return lines.join('\n')
}
