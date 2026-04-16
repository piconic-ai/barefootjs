/**
 * Debug analysis utilities for IR-based component inspection.
 *
 * Provides static analysis of signal dependency graphs, update propagation
 * paths, and component reactive structure — all without running any code.
 */

import type {
  ComponentIR,
  IRNode,
  IRExpression,
  IRConditional,
  IRElement,
  IRLoop,
  IRTemplateLiteral,
  SignalInfo,
  MemoInfo,
  EffectInfo,
} from './types'
import { analyzeComponent, listComponentFunctions } from './analyzer'
import { jsxToIR } from './jsx-to-ir'
import { buildMetadata } from './compiler'
import { analyzeClientNeeds } from './ir-to-client-js'

// =============================================================================
// Types
// =============================================================================

export interface SignalNode {
  kind: 'signal'
  name: string
  setter: string | null
  initialValue: string
  consumers: string[] // names of memos/effects/DOM nodes that read this signal
  loc: { file: string; line: number }
}

export interface MemoNode {
  kind: 'memo'
  name: string
  deps: string[] // signal/memo names this memo depends on
  consumers: string[] // names of effects/DOM nodes that read this memo
  computation: string
  loc: { file: string; line: number }
}

export interface EffectNode {
  kind: 'effect'
  label: string
  deps: string[]
  body: string
  loc: { file: string; line: number }
}

export interface DomBinding {
  kind: 'dom'
  label: string // e.g., 'text node "s0"', 'click handler "s1"'
  slotId: string
  deps: string[]
  type: 'text' | 'event' | 'conditional' | 'loop' | 'attribute'
}

export interface ComponentGraph {
  componentName: string
  sourceFile: string
  signals: SignalNode[]
  memos: MemoNode[]
  effects: EffectNode[]
  domBindings: DomBinding[]
}

export interface UpdatePath {
  target: string
  kind: 'signal' | 'memo'
  dependents: UpdatePathEntry[]
}

export interface UpdatePathEntry {
  name: string
  kind: 'memo' | 'effect' | 'dom'
  label: string
  /** Transitive dependents — memos/effects that depend on this entry */
  children: UpdatePathEntry[]
}

// =============================================================================
// Analysis: Build Component Graph
// =============================================================================

/**
 * Analyze a component source and build a full reactive dependency graph.
 * This is the core analysis used by `barefoot inspect` and `barefoot why-update`.
 */
export function buildComponentGraph(source: string, filePath: string, componentName?: string): ComponentGraph {
  const ctx = analyzeComponent(source, filePath, componentName)

  if (!ctx.jsxReturn) {
    return {
      componentName: ctx.componentName || componentName || 'Unknown',
      sourceFile: filePath,
      signals: [],
      memos: [],
      effects: [],
      domBindings: [],
    }
  }

  const ir = jsxToIR(ctx)
  if (!ir) {
    return {
      componentName: ctx.componentName || 'Unknown',
      sourceFile: filePath,
      signals: [],
      memos: [],
      effects: [],
      domBindings: [],
    }
  }

  const metadata = buildMetadata(ctx)
  const componentIR: ComponentIR = {
    version: '0.1',
    metadata,
    root: ir,
    errors: [],
  }

  return buildGraphFromIR(componentIR)
}

/**
 * Build the dependency graph from a pre-compiled ComponentIR.
 */
export function buildGraphFromIR(ir: ComponentIR): ComponentGraph {
  const meta = ir.metadata
  const signalGetters = new Set(meta.signals.map(s => s.getter))
  const memoNames = new Set(meta.memos.map(m => m.name))
  const signalSetters = new Map(meta.signals.filter(s => s.setter).map(s => [s.setter!, s.getter]))

  // Collect DOM bindings from IR tree
  const domBindings: DomBinding[] = []
  collectDomBindings(ir.root, domBindings, signalGetters, memoNames)

  // Build consumer lists for signals
  const signalConsumers = new Map<string, string[]>()
  for (const s of meta.signals) signalConsumers.set(s.getter, [])

  // Memos consume signals
  for (const memo of meta.memos) {
    for (const dep of memo.deps) {
      signalConsumers.get(dep)?.push(`memo:${memo.name}`)
    }
  }

  // Effects consume signals
  for (let i = 0; i < meta.effects.length; i++) {
    const effect = meta.effects[i]
    for (const dep of effect.deps) {
      signalConsumers.get(dep)?.push(`effect:e${i}`)
    }
  }

  // DOM bindings consume signals
  for (const dom of domBindings) {
    for (const dep of dom.deps) {
      signalConsumers.get(dep)?.push(`dom:${dom.label}`)
    }
  }

  // Build consumer lists for memos
  const memoConsumers = new Map<string, string[]>()
  for (const m of meta.memos) memoConsumers.set(m.name, [])

  for (let i = 0; i < meta.effects.length; i++) {
    const effect = meta.effects[i]
    for (const dep of effect.deps) {
      memoConsumers.get(dep)?.push(`effect:e${i}`)
    }
  }

  for (const dom of domBindings) {
    for (const dep of dom.deps) {
      memoConsumers.get(dep)?.push(`dom:${dom.label}`)
    }
  }

  // Also track memo→memo dependencies
  for (const memo of meta.memos) {
    for (const dep of memo.deps) {
      memoConsumers.get(dep)?.push(`memo:${memo.name}`)
    }
  }

  const signals: SignalNode[] = meta.signals.map(s => ({
    kind: 'signal',
    name: s.getter,
    setter: s.setter,
    initialValue: s.initialValue,
    consumers: signalConsumers.get(s.getter) ?? [],
    loc: { file: s.loc.file, line: s.loc.start.line },
  }))

  const memos: MemoNode[] = meta.memos.map(m => ({
    kind: 'memo',
    name: m.name,
    deps: m.deps,
    consumers: memoConsumers.get(m.name) ?? [],
    computation: m.computation,
    loc: { file: m.loc.file, line: m.loc.start.line },
  }))

  const effects: EffectNode[] = meta.effects.map((e, i) => ({
    kind: 'effect',
    label: `e${i}`,
    deps: e.deps,
    body: e.body,
    loc: { file: e.loc.file, line: e.loc.start.line },
  }))

  return {
    componentName: meta.componentName,
    sourceFile: findSourceFile(meta) ?? '',
    signals,
    memos,
    effects,
    domBindings,
  }
}

// =============================================================================
// Analysis: Update Propagation Path (why-update)
// =============================================================================

/**
 * Trace the update propagation path from a signal or memo.
 * Shows all downstream effects, memos, and DOM bindings.
 */
export function traceUpdatePath(graph: ComponentGraph, targetName: string): UpdatePath | null {
  // Find the target in signals or memos
  const signal = graph.signals.find(s => s.name === targetName)
  const memo = graph.memos.find(m => m.name === targetName)

  if (!signal && !memo) return null

  const kind = signal ? 'signal' : 'memo'
  const consumers = signal ? signal.consumers : memo!.consumers

  const dependents = consumers.map(consumer => buildUpdateEntry(consumer, graph, new Set()))

  return { target: targetName, kind: kind as 'signal' | 'memo', dependents }
}

function buildUpdateEntry(consumer: string, graph: ComponentGraph, visited: Set<string>): UpdatePathEntry {
  if (visited.has(consumer)) {
    return { name: consumer, kind: 'memo', label: `${consumer} (circular)`, children: [] }
  }
  visited.add(consumer)

  const [type, name] = consumer.split(':')

  if (type === 'memo') {
    const memo = graph.memos.find(m => m.name === name)
    if (memo) {
      const children = memo.consumers
        .map(c => buildUpdateEntry(c, graph, new Set(visited)))
      return { name: memo.name, kind: 'memo', label: `${memo.name} (memo)`, children }
    }
  }

  if (type === 'effect') {
    const effect = graph.effects.find(e => e.label === name)
    return {
      name: name,
      kind: 'effect',
      label: effect ? `effect ${name}` : name,
      children: [],
    }
  }

  if (type === 'dom') {
    return { name: name, kind: 'dom', label: name, children: [] }
  }

  return { name: consumer, kind: 'effect', label: consumer, children: [] }
}

// =============================================================================
// Formatting: Human-readable output
// =============================================================================

/** Format the component graph as a human-readable string for `barefoot inspect`. */
export function formatComponentGraph(graph: ComponentGraph): string {
  const lines: string[] = []

  lines.push(`${graph.componentName} (${graph.sourceFile})`)

  // Signals
  if (graph.signals.length > 0) {
    lines.push(`  signals:`)
    for (const s of graph.signals) {
      lines.push(`    ${s.name} (initial: ${s.initialValue})`)
    }
  }

  // Memos
  if (graph.memos.length > 0) {
    lines.push(`  memos:`)
    for (const m of graph.memos) {
      const depStr = m.deps.length > 0 ? ` <- ${m.deps.join(', ')}` : ''
      lines.push(`    ${m.name}${depStr}`)
    }
  }

  // Effects
  if (graph.effects.length > 0) {
    lines.push(`  effects:`)
    for (const e of graph.effects) {
      const depStr = e.deps.length > 0 ? ` <- ${e.deps.join(', ')}` : ''
      lines.push(`    ${e.label}${depStr}`)
    }
  }

  // DOM bindings
  if (graph.domBindings.length > 0) {
    lines.push(`  dom bindings:`)
    for (const d of graph.domBindings) {
      const arrow = d.type === 'event' ? ' ->' : ' <-'
      const depStr = d.deps.join(', ')
      // For attribute bindings use the attr name; for others use slotId
      const id = d.type === 'attribute' ? `"${d.label}"` : `"${d.slotId}"`
      lines.push(`    ${d.type} ${id}${arrow} ${depStr}`)
    }
  }

  // Dependency graph
  if (graph.signals.length > 0 || graph.memos.length > 0) {
    lines.push(`  dependency graph:`)
    for (const s of graph.signals) {
      for (const consumer of s.consumers) {
        lines.push(`    ${s.name} -> ${consumer}`)
      }
    }
    for (const m of graph.memos) {
      for (const consumer of m.consumers) {
        lines.push(`    ${m.name} -> ${consumer}`)
      }
    }
  }

  return lines.join('\n')
}

/** Format an update path as a human-readable string for `barefoot why-update`. */
export function formatUpdatePath(path: UpdatePath): string {
  const lines: string[] = []

  lines.push(`${path.target} (${path.kind})`)

  for (const entry of path.dependents) {
    formatEntry(entry, lines, '  ')
  }

  return lines.join('\n')
}

function formatEntry(entry: UpdatePathEntry, lines: string[], indent: string): void {
  const arrow = entry.kind === 'dom' ? '->' : '<-'
  lines.push(`${indent}${arrow} ${entry.label}`)
  for (const child of entry.children) {
    formatEntry(child, lines, indent + '  ')
  }
}

/** Format the component graph as JSON for `--json` output. */
export function graphToJSON(graph: ComponentGraph): object {
  return {
    componentName: graph.componentName,
    sourceFile: graph.sourceFile,
    signals: graph.signals.map(s => ({
      name: s.name,
      setter: s.setter,
      initialValue: s.initialValue,
      consumers: s.consumers,
      loc: s.loc,
    })),
    memos: graph.memos.map(m => ({
      name: m.name,
      deps: m.deps,
      consumers: m.consumers,
      computation: m.computation,
      loc: m.loc,
    })),
    effects: graph.effects.map(e => ({
      label: e.label,
      deps: e.deps,
      body: e.body,
      loc: e.loc,
    })),
    domBindings: graph.domBindings.map(d => ({
      label: d.label,
      slotId: d.slotId,
      deps: d.deps,
      type: d.type,
    })),
  }
}

// =============================================================================
// Signal Trace for test --debug
// =============================================================================

export interface SignalTrace {
  type: 'init' | 'render' | 'set' | 'effect'
  signal?: string
  value?: string
  oldValue?: string
  slotId?: string
  detail?: string
}

/**
 * Generate a static signal trace for a component.
 * This shows the initialization sequence without executing any code.
 */
export function generateStaticTrace(graph: ComponentGraph): SignalTrace[] {
  const trace: SignalTrace[] = []

  // [init] signal = initialValue
  for (const signal of graph.signals) {
    trace.push({
      type: 'init',
      signal: signal.name,
      value: signal.initialValue,
    })
  }

  // [init] memo = computation
  for (const memo of graph.memos) {
    trace.push({
      type: 'init',
      signal: memo.name,
      detail: `memo(${memo.computation})`,
    })
  }

  // [render] initial render
  trace.push({ type: 'render', detail: 'initial' })

  // [effect] effect dependencies
  for (const effect of graph.effects) {
    trace.push({
      type: 'effect',
      detail: `${effect.label} depends on: ${effect.deps.join(', ') || 'none'}`,
    })
  }

  // For each DOM binding, trace the initial binding
  for (const dom of graph.domBindings) {
    if (dom.type === 'text') {
      trace.push({
        type: 'effect',
        slotId: dom.slotId,
        detail: `text "${dom.slotId}" bound to: ${dom.deps.join(', ')}`,
      })
    }
  }

  return trace
}

/** Format a signal trace as a human-readable string. */
export function formatSignalTrace(traces: SignalTrace[]): string {
  return traces.map(t => {
    switch (t.type) {
      case 'init':
        return `[init] ${t.signal} = ${t.value ?? t.detail}`
      case 'render':
        return `[render] ${t.detail}`
      case 'set':
        return `[set] ${t.signal}: ${t.oldValue} -> ${t.value}`
      case 'effect':
        return `[effect] ${t.detail}`
      default:
        return `[${t.type}] ${t.detail}`
    }
  }).join('\n')
}

// =============================================================================
// Helpers
// =============================================================================

/** Collect DOM bindings (text updates, event handlers, etc.) from the IR tree. */
function collectDomBindings(
  node: IRNode,
  bindings: DomBinding[],
  signalGetters: Set<string>,
  memoNames: Set<string>,
): void {
  switch (node.type) {
    case 'element': {
      // Dynamic attribute bindings (style, class, aria-*, data-*, etc.)
      for (const attr of node.attrs) {
        if (!attr.dynamic) continue
        const expr = attrValueToString(attr.value)
        if (!expr) continue
        const deps = extractReactiveDeps(expr, signalGetters, memoNames)
        if (deps.length > 0) {
          bindings.push({
            kind: 'dom',
            label: attr.name,
            slotId: node.slotId ?? '?',
            deps,
            type: 'attribute',
          })
        }
      }
      // Event handlers
      for (const event of node.events) {
        const deps = extractReactiveDeps(event.handler, signalGetters, memoNames)
        if (deps.length > 0 || true) {
          bindings.push({
            kind: 'dom',
            label: `${event.name} handler "${node.slotId ?? '?'}"`,
            slotId: node.slotId ?? '?',
            deps: extractSetterRefs(event.handler, signalGetters),
            type: 'event',
          })
        }
      }
      // Recurse
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames)
      }
      break
    }
    case 'expression': {
      if (node.reactive && node.slotId) {
        const deps = extractReactiveDeps(node.expr, signalGetters, memoNames)
        bindings.push({
          kind: 'dom',
          label: `text "${node.slotId}"`,
          slotId: node.slotId,
          deps,
          type: 'text',
        })
      }
      break
    }
    case 'conditional': {
      if (node.reactive && node.slotId) {
        const deps = extractReactiveDeps(node.condition, signalGetters, memoNames)
        bindings.push({
          kind: 'dom',
          label: `conditional "${node.slotId}"`,
          slotId: node.slotId,
          deps,
          type: 'conditional',
        })
      }
      collectDomBindings(node.whenTrue, bindings, signalGetters, memoNames)
      collectDomBindings(node.whenFalse, bindings, signalGetters, memoNames)
      break
    }
    case 'loop': {
      if (node.slotId) {
        const deps = extractReactiveDeps(node.array, signalGetters, memoNames)
        if (deps.length > 0) {
          bindings.push({
            kind: 'dom',
            label: `loop "${node.slotId}"`,
            slotId: node.slotId,
            deps,
            type: 'loop',
          })
        }
      }
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames)
      }
      break
    }
    case 'fragment':
    case 'provider': {
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames)
      }
      break
    }
    case 'if-statement': {
      collectDomBindings(node.consequent, bindings, signalGetters, memoNames)
      if (node.alternate) {
        collectDomBindings(node.alternate, bindings, signalGetters, memoNames)
      }
      break
    }
  }
}

/** Convert an IRAttribute value to a flat string for reactive dep extraction. */
function attrValueToString(value: string | IRTemplateLiteral | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  // IRTemplateLiteral: join all ternary expressions
  return value.parts
    .map(p => p.type === 'ternary' ? `${p.condition} ${p.whenTrue} ${p.whenFalse}` : '')
    .join(' ')
}

/** Extract reactive getter names (signal/memo calls) from an expression. */
function extractReactiveDeps(expr: string, signalGetters: Set<string>, memoNames: Set<string>): string[] {
  const deps: string[] = []
  for (const getter of signalGetters) {
    if (new RegExp(`\\b${getter}\\s*\\(`).test(expr)) {
      deps.push(getter)
    }
  }
  for (const memo of memoNames) {
    if (new RegExp(`\\b${memo}\\s*\\(`).test(expr)) {
      deps.push(memo)
    }
  }
  return deps
}

/** Extract setter references from an event handler expression. */
function extractSetterRefs(expr: string, signalGetters: Set<string>): string[] {
  const refs: string[] = []
  // Look for setter calls: setXxx(...)
  const matches = expr.matchAll(/\b(set[A-Z]\w*)\s*\(/g)
  for (const match of matches) {
    refs.push(match[1])
  }
  // Also detect signal getter reads in handler
  for (const getter of signalGetters) {
    if (new RegExp(`\\b${getter}\\s*\\(`).test(expr)) {
      refs.push(getter)
    }
  }
  return refs
}

function findSourceFile(meta: ComponentIR['metadata']): string | null {
  for (const s of meta.signals) {
    if (s.loc?.file) return s.loc.file
  }
  for (const m of meta.memos) {
    if (m.loc?.file) return m.loc.file
  }
  for (const e of meta.effects) {
    if (e.loc?.file) return e.loc.file
  }
  return null
}

// Re-export for CLI convenience
export { listComponentFunctions }
