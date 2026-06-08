/**
 * Static reactive profile analysis for `bf debug profile` (#1690, v1).
 *
 * Implements SR5 (static reactivity budget): per-component profile computed
 * entirely from the IR — signal/memo/binding counts, fan-out, memo chain depth,
 * and batch candidates — without running any code.
 *
 * v1 analyses implemented:
 *  - High fan-out signals (hot-subscriber precursor)
 *  - Deep memo chains
 *  - Batch candidates (event sets ≥2 distinct signals)
 *  - Fallback-heavy components (compiler couldn't prove reactivity)
 *
 * SR6 (compile-diff regression) is also included: `diffProfiles` compares two
 * `ComponentProfileMetrics` instances and surfaces structural regressions.
 *
 * Runtime analyses (hot subscribers, wasted re-runs) require SR1-SR4
 * (instrumentation hooks + compiler-emitted turn markers) and are out of
 * scope for v1.
 */

import type { ComponentGraph, EventSummary } from './debug.ts'
import { buildComponentGraph, buildEventSummary } from './debug.ts'

// =============================================================================
// Types
// =============================================================================

/** Per-component reactive budget metrics derived from the static IR (SR5). */
export interface ComponentProfileMetrics {
  componentName: string
  sourceFile: string
  /** Component uses `"use client"` / has reactive state. */
  hydrated: boolean
  // Raw counts
  signals: number
  memos: number
  effects: number
  loops: number
  eventHandlers: number
  /** Total reactive DOM bindings (reactive + fallback). */
  dynamicBindings: number
  /** Bindings the compiler could not statically prove reactive (fallback-wrapped). */
  fallbacks: number
  conditionals: number
  // Derived budget metrics
  /** Consumers of the most-subscribed signal (fan-out). */
  maxSignalFanOut: number
  /** Name of the signal with maximum fan-out; null when no signals. */
  hotSignal: string | null
  /** Longest memo→memo chain depth (1 = standalone memo, N = N-level chain). */
  maxMemoChainDepth: number
  /** Sum of dependency counts across all memos, effects, and DOM bindings. */
  totalSubscriptions: number
  /** Event handlers that set ≥2 distinct signals — batch() candidates. */
  batchCandidateCount: number
}

/** A single actionable insight produced by static analysis. */
export interface ProfileFinding {
  kind: 'high-fan-out' | 'deep-memo-chain' | 'batch-candidate' | 'fallback-heavy'
  severity: 'info' | 'warning'
  message: string
  suggestion: string
  /** Affected signal name (high-fan-out). */
  signal?: string
  /** Chain depth (deep-memo-chain). */
  depth?: number
  /** Signals involved (batch-candidate). */
  signals?: string[]
  loc?: { file: string; line: number }
}

/** Full profile for one component: metrics + findings. */
export interface ComponentProfile {
  metrics: ComponentProfileMetrics
  findings: ProfileFinding[]
}

// SR6: structural diff between two compile snapshots (no run required).
export interface ProfileDiff {
  componentName: string
  before: ComponentProfileMetrics
  after: ComponentProfileMetrics
  regressions: ProfileDiffEntry[]
  improvements: ProfileDiffEntry[]
  neutral: ProfileDiffEntry[]
}

export interface ProfileDiffEntry {
  metric: string
  before: number | string | null
  after: number | string | null
  delta: number | null
}

// =============================================================================
// Thresholds (tunable, kept conservative for v1)
// =============================================================================

const THRESHOLDS = {
  /** Warn when a signal has more than this many consumers. */
  highFanOut: 3,
  /** Warn when any memo chain is deeper than this. */
  deepMemoChain: 3,
  /** Minimum fallback count before triggering fallback-heavy. */
  fallbackHeavyMin: 3,
  /** Fallback ratio (fallbacks/total bindings) above which to warn. */
  fallbackHeavyRatio: 0.5,
  /** Suggest batch() when a handler sets this many or more distinct signals. */
  batchMinSignals: 2,
} as const

// =============================================================================
// Public API
// =============================================================================

/**
 * Build a reactive profile from raw source text.
 * Runs the full analyzer → IR → graph + event pipeline.
 */
export function buildReactiveProfile(
  source: string,
  filePath: string,
  componentName?: string,
): ComponentProfile {
  const graph = buildComponentGraph(source, filePath, componentName)
  const eventSummary = buildEventSummary(source, filePath, componentName)
  const hydrated = graph.signals.length > 0 || graph.memos.length > 0 || graph.effects.length > 0
  return buildProfileFromGraph(graph, eventSummary, hydrated)
}

/**
 * Build a reactive profile from a pre-built graph + event summary.
 * Useful when the caller already has the graph (avoids double analysis).
 */
export function buildProfileFromGraph(
  graph: ComponentGraph,
  eventSummary: EventSummary,
  hydrated: boolean,
): ComponentProfile {
  const metrics = computeMetrics(graph, eventSummary, hydrated)
  const findings = computeFindings(metrics, graph, eventSummary)
  return { metrics, findings }
}

// =============================================================================
// Metrics computation
// =============================================================================

function computeMetrics(
  graph: ComponentGraph,
  eventSummary: EventSummary,
  hydrated: boolean,
): ComponentProfileMetrics {
  // Fan-out: which signal has the most consumers?
  let maxFanOut = 0
  let hotSignal: string | null = null
  for (const signal of graph.signals) {
    if (signal.consumers.length > maxFanOut) {
      maxFanOut = signal.consumers.length
      hotSignal = signal.name
    }
  }

  const maxMemoChainDepth = computeMaxMemoChainDepth(graph)

  const dynamicBindings = graph.domBindings.length
  const fallbacks = graph.domBindings.filter(d => d.classification === 'fallback').length
  const eventHandlers = graph.domBindings.filter(d => d.type === 'event').length
  const conditionals = graph.domBindings.filter(d => d.type === 'conditional').length
  const loops = graph.domBindings.filter(d => d.type === 'loop').length

  // Total subscriptions = sum of all dep-counts across memos, effects, and DOM bindings.
  const totalSubscriptions =
    graph.memos.reduce((s, m) => s + m.deps.length, 0) +
    graph.effects.reduce((s, e) => s + e.deps.length, 0) +
    graph.domBindings.reduce((s, b) => s + b.deps.length, 0)

  // Batch candidates: deduplicate by (eventName, loc, signals) to match the
  // findings list — the same handler wired at N JSX sites (e.g. Calendar's
  // dual-month layout) counts once, not N times. (Bug D)
  const batchDedupeKeys = new Set<string>()
  for (const event of eventSummary.events) {
    const distinct = new Set<string>()
    for (const sc of event.setterCalls) {
      if (sc.signal) distinct.add(sc.signal)
    }
    if (distinct.size >= THRESHOLDS.batchMinSignals) {
      const key = `${event.eventName}|${event.loc.file ?? ''}|${event.loc.start.line}|${[...distinct].sort().join(',')}`
      batchDedupeKeys.add(key)
    }
  }
  const batchCandidateCount = batchDedupeKeys.size

  return {
    componentName: graph.componentName,
    sourceFile: graph.sourceFile,
    hydrated,
    signals: graph.signals.length,
    memos: graph.memos.length,
    effects: graph.effects.length,
    loops,
    eventHandlers,
    dynamicBindings,
    fallbacks,
    conditionals,
    maxSignalFanOut: maxFanOut,
    hotSignal,
    maxMemoChainDepth,
    totalSubscriptions,
    batchCandidateCount,
  }
}

/**
 * Compute the longest memo→memo chain depth in the graph.
 * Depth 1 = a memo with no memo dependants (leaf); depth N = N-level chain.
 * Cycles are guarded via a visited set per traversal.
 */
function computeMaxMemoChainDepth(graph: ComponentGraph): number {
  if (graph.memos.length === 0) return 0

  const memoSet = new Set(graph.memos.map(m => m.name))
  // For each memo, which other memos does it depend on?
  const memoDeps = new Map<string, string[]>()
  for (const memo of graph.memos) {
    memoDeps.set(memo.name, memo.deps.filter(d => memoSet.has(d)))
  }

  const cache = new Map<string, number>()

  function depth(name: string, visited: Set<string>): number {
    if (cache.has(name)) return cache.get(name)!
    if (visited.has(name)) return 0 // cycle guard
    const children = memoDeps.get(name) ?? []
    if (children.length === 0) {
      cache.set(name, 1)
      return 1
    }
    visited.add(name)
    const d = 1 + Math.max(...children.map(c => depth(c, new Set(visited))))
    cache.set(name, d)
    return d
  }

  let max = 0
  for (const memo of graph.memos) {
    const d = depth(memo.name, new Set())
    if (d > max) max = d
  }
  return max
}

// =============================================================================
// Findings (static analyses)
// =============================================================================

function computeFindings(
  metrics: ComponentProfileMetrics,
  graph: ComponentGraph,
  eventSummary: EventSummary,
): ProfileFinding[] {
  const findings: ProfileFinding[] = []

  // 1. High fan-out signals
  for (const signal of graph.signals) {
    if (signal.consumers.length > THRESHOLDS.highFanOut) {
      findings.push({
        kind: 'high-fan-out',
        severity: 'warning',
        signal: signal.name,
        message: `${signal.name} has ${signal.consumers.length} consumers (fan-out > ${THRESHOLDS.highFanOut})`,
        suggestion: `Split ${signal.name} into finer-grained signals, or add a createMemo to shield downstream consumers from unrelated updates`,
        loc: { file: signal.loc.file, line: signal.loc.line },
      })
    }
  }

  // 2. Deep memo chains
  if (metrics.maxMemoChainDepth > THRESHOLDS.deepMemoChain) {
    findings.push({
      kind: 'deep-memo-chain',
      severity: 'warning',
      depth: metrics.maxMemoChainDepth,
      message: `Memo chain depth ${metrics.maxMemoChainDepth} (threshold: ${THRESHOLDS.deepMemoChain}) — a single signal update cascades through ${metrics.maxMemoChainDepth} memo levels`,
      suggestion: 'Flatten intermediate memos that do not cache expensive computations; deep chains increase propagation latency',
    })
  }

  // 3. Batch candidates — deduplicate by (eventName, loc, signals) so that
  // the same handler wired to multiple JSX elements (e.g. Calendar dual-month
  // nav buttons) does not produce duplicate findings. (Bug C)
  const batchSeen = new Set<string>()
  for (const event of eventSummary.events) {
    const distinct = new Set<string>()
    const setterNames: string[] = []
    for (const sc of event.setterCalls) {
      if (sc.signal) {
        distinct.add(sc.signal)
        setterNames.push(sc.setter)
      }
    }
    if (distinct.size >= THRESHOLDS.batchMinSignals) {
      const dedupeKey = `${event.eventName}|${event.loc.file ?? ''}|${event.loc.start.line}|${[...distinct].sort().join(',')}`
      if (batchSeen.has(dedupeKey)) continue
      batchSeen.add(dedupeKey)
      findings.push({
        kind: 'batch-candidate',
        severity: 'info',
        signals: [...distinct],
        message: `${event.eventName} on <${event.elementContext}> sets ${distinct.size} signals (${[...distinct].join(', ')}) — triggers ${distinct.size} separate update cycles (static; verify setters are not in separate if/else branches)`,
        suggestion: `If all listed setters fire unconditionally in the same handler path, wrap in batch(() => { ${setterNames.join('; ')}; }) to collapse ${distinct.size} cycles into 1`,
        loc: event.loc.file ? { file: event.loc.file, line: event.loc.start.line } : undefined,
      })
    }
  }

  // 4. Fallback-heavy
  if (
    metrics.dynamicBindings > 0 &&
    metrics.fallbacks >= THRESHOLDS.fallbackHeavyMin &&
    metrics.fallbacks / metrics.dynamicBindings > THRESHOLDS.fallbackHeavyRatio
  ) {
    findings.push({
      kind: 'fallback-heavy',
      severity: 'info',
      message: `${metrics.fallbacks}/${metrics.dynamicBindings} bindings (${Math.round(metrics.fallbacks / metrics.dynamicBindings * 100)}%) are fallback-wrapped — reactivity not statically provable`,
      suggestion: 'Run `bf debug fallbacks` to see each expression and fix them so the compiler can prove reactivity without the fallback wrapper',
    })
  }

  return findings
}

// =============================================================================
// SR6: Compile-diff regression detection
// =============================================================================

/**
 * Compare two profile metric snapshots.
 * Returns regressions (metrics that got worse), improvements, and neutral changes.
 *
 * "Worse" metrics when they increase: fallbacks, maxSignalFanOut,
 * maxMemoChainDepth, totalSubscriptions, batchCandidateCount.
 * All other metric changes (signal/memo/binding counts) are neutral (structural).
 */
export function diffProfiles(
  before: ComponentProfileMetrics,
  after: ComponentProfileMetrics,
): ProfileDiff {
  const worseWhenHigher = new Set<keyof ComponentProfileMetrics>([
    'fallbacks',
    'maxSignalFanOut',
    'maxMemoChainDepth',
    'totalSubscriptions',
    'batchCandidateCount',
  ])

  const numericKeys: Array<keyof ComponentProfileMetrics> = [
    'signals', 'memos', 'effects', 'loops', 'eventHandlers',
    'dynamicBindings', 'fallbacks', 'conditionals',
    'maxSignalFanOut', 'maxMemoChainDepth', 'totalSubscriptions', 'batchCandidateCount',
  ]

  const regressions: ProfileDiffEntry[] = []
  const improvements: ProfileDiffEntry[] = []
  const neutral: ProfileDiffEntry[] = []

  for (const key of numericKeys) {
    const b = before[key] as number
    const a = after[key] as number
    if (a === b) continue
    const entry: ProfileDiffEntry = { metric: key, before: b, after: a, delta: a - b }
    if (worseWhenHigher.has(key)) {
      if (a > b) regressions.push(entry)
      else improvements.push(entry)
    } else {
      neutral.push(entry)
    }
  }

  return { componentName: after.componentName, before, after, regressions, improvements, neutral }
}

// =============================================================================
// Formatting: human-readable output
// =============================================================================

/** Format a single component profile for `bf debug profile <component>`. */
export function formatSingleProfile(profile: ComponentProfile): string {
  const m = profile.metrics
  const lines: string[] = []

  lines.push(`${m.componentName} — reactive profile (static)`)
  if (m.sourceFile) lines.push(`  source: ${m.sourceFile}`)
  lines.push(`  hydrated: ${m.hydrated ? 'yes' : 'no'}`)

  lines.push('')
  lines.push('  Counts:')
  lines.push(`    signals:          ${m.signals}`)
  lines.push(`    memos:            ${m.memos}`)
  if (m.effects > 0) lines.push(`    effects:          ${m.effects}`)
  lines.push(`    dynamic bindings: ${m.dynamicBindings}`)
  if (m.fallbacks > 0) lines.push(`    fallbacks:        ${m.fallbacks}`)
  if (m.loops > 0) lines.push(`    loops:            ${m.loops}`)
  if (m.conditionals > 0) lines.push(`    conditionals:     ${m.conditionals}`)
  if (m.eventHandlers > 0) lines.push(`    event handlers:   ${m.eventHandlers}`)

  lines.push('')
  lines.push('  Reactive budget (SR5):')
  const fanOutSuffix = m.hotSignal ? ` (${m.hotSignal})` : ''
  lines.push(`    max signal fan-out:   ${m.maxSignalFanOut}${fanOutSuffix}`)
  lines.push(`    max memo chain depth: ${m.maxMemoChainDepth}`)
  lines.push(`    total subscriptions:  ${m.totalSubscriptions}`)
  if (m.batchCandidateCount > 0) {
    lines.push(`    batch candidates:     ${m.batchCandidateCount} handler(s) set ≥2 signals`)
  }

  if (profile.findings.length > 0) {
    lines.push('')
    lines.push('  Findings:')
    for (const f of profile.findings) {
      const icon = f.severity === 'warning' ? '⚠' : '→'
      lines.push(`    ${icon} [${f.kind}] ${f.message}`)
      lines.push(`      fix: ${f.suggestion}`)
      if (f.loc) {
        const file = f.loc.file.split('/').pop() ?? f.loc.file
        lines.push(`      at ${file}:${f.loc.line}`)
      }
    }
  } else {
    lines.push('')
    lines.push('  No findings — component is within all thresholds.')
  }

  return lines.join('\n')
}

/**
 * Format a multi-component profile table for `--scenario auto`.
 * Sorted by totalSubscriptions descending (highest reactive cost first).
 */
export function formatProfileTable(profiles: ComponentProfile[]): string {
  if (profiles.length === 0) return 'No components found.'

  const sorted = [...profiles].sort(
    (a, b) => b.metrics.totalSubscriptions - a.metrics.totalSubscriptions,
  )

  const lines: string[] = []
  lines.push('Component               sig  memo  bind  fall  fanOut  chain  subs  batch  findings')
  lines.push('─'.repeat(90))

  for (const p of sorted) {
    const m = p.metrics
    const name = m.componentName.padEnd(23).slice(0, 23)
    const findingStr = p.findings.length > 0
      ? p.findings.map(f => f.kind.replace(/-/g, '_')).join(',')
      : '—'
    const row = [
      name,
      String(m.signals).padStart(3),
      String(m.memos).padStart(5),
      String(m.dynamicBindings).padStart(5),
      String(m.fallbacks).padStart(5),
      String(m.maxSignalFanOut).padStart(7),
      String(m.maxMemoChainDepth).padStart(6),
      String(m.totalSubscriptions).padStart(5),
      String(m.batchCandidateCount).padStart(6),
      `  ${findingStr}`,
    ].join('  ')
    lines.push(row)
  }

  // Findings detail section
  const allFindings = sorted.flatMap(p =>
    p.findings.map(f => ({ component: p.metrics.componentName, finding: f })),
  )

  if (allFindings.length > 0) {
    lines.push('')
    lines.push('Findings:')
    for (const { component, finding } of allFindings) {
      const icon = finding.severity === 'warning' ? '⚠' : '→'
      lines.push(`  ${icon} ${component}: ${finding.message}`)
      lines.push(`    fix: ${finding.suggestion}`)
      if (finding.loc) {
        const file = finding.loc.file.split('/').pop() ?? finding.loc.file
        lines.push(`    at ${file}:${finding.loc.line}`)
      }
    }
  } else {
    lines.push('')
    lines.push('No findings across all components.')
  }

  return lines.join('\n')
}

/** Format a profile diff for `--diff`. */
export function formatProfileDiff(diff: ProfileDiff): string {
  const lines: string[] = []
  lines.push(`${diff.componentName} — reactive profile diff (before → after)`)
  lines.push('')

  if (diff.regressions.length === 0 && diff.improvements.length === 0 && diff.neutral.length === 0) {
    lines.push('  No changes in reactive metrics.')
    return lines.join('\n')
  }

  if (diff.regressions.length > 0) {
    lines.push('  Regressions (reactive cost increased):')
    for (const e of diff.regressions) {
      lines.push(`    ${e.metric}: ${e.before} → ${e.after}  (+${e.delta})`)
    }
  }

  if (diff.improvements.length > 0) {
    lines.push('  Improvements (reactive cost decreased):')
    for (const e of diff.improvements) {
      lines.push(`    ${e.metric}: ${e.before} → ${e.after}  (${e.delta})`)
    }
  }

  if (diff.neutral.length > 0) {
    lines.push('  Structural changes (count changes, no clear direction):')
    for (const e of diff.neutral) {
      const sign = (e.delta ?? 0) > 0 ? '+' : ''
      lines.push(`    ${e.metric}: ${e.before} → ${e.after}  (${sign}${e.delta})`)
    }
  }

  return lines.join('\n')
}

/** Serialize a single profile to a JSON-safe object. */
export function profileToJSON(profile: ComponentProfile): object {
  return {
    metrics: profile.metrics,
    findings: profile.findings,
  }
}
