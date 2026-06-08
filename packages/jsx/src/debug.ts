/**
 * Debug analysis utilities for IR-based component inspection.
 *
 * Provides static analysis of signal dependency graphs, update propagation
 * paths, and component reactive structure — all without running any code.
 */

import type ts from 'typescript'
import type {
  ComponentIR,
  IRNode,
  IRExpression,
  IRConditional,
  IRElement,
  IRLoop,
  IRComponent,
  IRText,
  IRMetadata,
  AttrValue,
  SignalInfo,
  MemoInfo,
  EffectInfo,
  SourceLocation,
} from './types.ts'
import { analyzeComponent, listComponentFunctions } from './analyzer.ts'
import { jsxToIR } from './jsx-to-ir.ts'
import { buildMetadata } from './compiler.ts'
import { analyzeClientNeeds } from './ir-to-client-js/index.ts'
import type { WrapReason } from './ir-to-client-js/reactivity.ts'
import { decideWrapFromAstFlags } from './ir-to-client-js/reactivity.ts'

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
  /**
   * Classification inherited from the emitter's wrap decision (#944):
   *  - 'reactive': static analysis proved the binding reads a signal, memo,
   *    or reactive prop. `deps` is populated from those proven sources.
   *  - 'fallback': Solid-style wrap-by-default (#937) wrapped it because
   *    the expression contains a call the analyzer can't prove pure.
   *    `deps` may be empty — the effect subscribes to whatever signals it
   *    happens to read at runtime, possibly none.
   *
   * Event handlers are always classified 'reactive' — they are not subject
   * to the wrap-by-default gate (handlers are bound, not re-evaluated).
   */
  classification: 'reactive' | 'fallback'
  /**
   * Source expression text for the binding, when available. Populated for
   * text / attribute / conditional / loop / child-prop bindings so
   * `bf debug fallbacks` can print the expression alongside the slotId —
   * users locate bindings by expression, not by internal slot label.
   *
   * Omitted for event handlers (whose body is already surfaced by
   * `why-update`) and for cases where the IR lacks a flat string form.
   */
  expression?: string
  /**
   * Structural trigger that decided the emitter's wrap-by-default call
   * (#937, DRY-consolidated in PR #991). Mirrors the `WrapReason` enum on
   * `WrapDecision` in `ir-to-client-js/reactivity.ts` so users debugging
   * `why-wrap` see the same vocabulary the compiler uses internally.
   *
   * Populated for text / attribute / conditional / loop / child-prop
   * bindings; omitted for event handlers (not subject to the wrap gate).
   */
  wrapReason?: WrapReason
  loc?: SourceLocation
  jsxPreview?: string
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

// -- Event analysis types -----------------------------------------------------

export interface EventBinding {
  elementTag: string
  elementContext: string
  eventName: string
  handler: string
  setterCalls: SetterRef[]
  loc: SourceLocation
  isComponentProp: boolean
}

export interface SetterRef {
  setter: string
  signal: string | null
  /**
   * Call chain from the handler to the setter, when the setter is reached
   * through one or more local helper functions. For a handler that calls
   * the setter directly this is omitted. For `onClick={handlePointerDown}`
   * where `handlePointerDown` calls `setValue` which calls `setInternalValue`,
   * this is `['handlePointerDown', 'setValue']`.
   */
  via?: string[]
}

export interface EventSummary {
  componentName: string
  sourceFile: string
  events: EventBinding[]
  graph: ComponentGraph
}

// -- Loop analysis types ------------------------------------------------------

export interface LoopInfo {
  array: string
  param: string
  index: string | null
  key: string | null
  method: 'map' | 'flatMap'
  bindings: LoopChildBinding[]
  loc: SourceLocation
}

export interface LoopChildBinding {
  elementContext: string
  kind: 'attribute' | 'text' | 'event'
  name: string
  deps: string[]
  loc?: SourceLocation
}

export interface LoopSummary {
  componentName: string
  sourceFile: string
  loops: LoopInfo[]
}

// -- Why-update analysis types ------------------------------------------------

export interface WhyUpdateResult {
  binding: string
  expression: string | null
  deps: WhyUpdateDep[]
  classification?: 'reactive' | 'fallback'
  wrapReason?: WrapReason
  ambiguous?: Array<{ label: string; slotId: string }>
}

export interface WhyUpdateDep {
  name: string
  kind: 'signal' | 'memo'
  dependsOn: string[]
  changedBy: WhyUpdateSource[]
}

export interface WhyUpdateSource {
  handler: string
  setter: string
  elementContext: string
  via?: string[]
}

// -- Component summary types --------------------------------------------------

export interface ComponentSummary {
  componentName: string
  sourceFile: string
  hydrated: boolean
  clientBundle: string | null
  signals: number
  memos: number
  effects: number
  loops: number
  eventHandlers: number
  dynamicTextBindings: number
  dynamicAttributes: number
  conditionals: number
  fallbacks: number
}

// -- Component analysis (shared IR + graph) -----------------------------------

export interface ComponentAnalysis {
  graph: ComponentGraph
  ir: ComponentIR
}

// =============================================================================
// Analysis: Build Component Graph
// =============================================================================

/**
 * Analyze a component source and build a full reactive dependency graph.
 * This is the core analysis used by `bf debug graph` and `bf debug trace`.
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

  const graph = buildGraphFromIR(componentIR)
  // `findSourceFile` extracts the path from signal/memo/effect metadata; for
  // components with no reactive state it returns '' because there are no
  // located nodes. Fall back to the caller-supplied filePath so callers
  // always get a non-empty sourceFile. (#1690 Bug A)
  return graph.sourceFile ? graph : { ...graph, sourceFile: filePath }
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

/**
 * Build both the ComponentIR and the reactive dependency graph in one pass.
 * Callers that need the raw IR tree (events, loops, why-update) use this
 * instead of `buildComponentGraph` to avoid a redundant analysis round.
 */
export function buildComponentAnalysis(source: string, filePath: string, componentName?: string, program?: ts.Program): ComponentAnalysis {
  const ctx = analyzeComponent(source, filePath, componentName, program)
  const emptyIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root: { type: 'fragment', children: [], loc: { file: filePath, start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
    errors: [],
  }

  if (!ctx.jsxReturn) {
    return { graph: buildGraphFromIR(emptyIR), ir: emptyIR }
  }

  const root = jsxToIR(ctx)
  if (!root) {
    return { graph: buildGraphFromIR(emptyIR), ir: emptyIR }
  }

  const ir: ComponentIR = { version: '0.1', metadata: buildMetadata(ctx), root, errors: [] }
  return { graph: buildGraphFromIR(ir), ir }
}

// =============================================================================
// Analysis: Event Bindings
// =============================================================================

/**
 * Build a complete event summary for a component, including setter resolution
 * and downstream update paths.
 */
export function buildEventSummary(source: string, filePath: string, componentName?: string, program?: ts.Program): EventSummary {
  const { graph, ir } = buildComponentAnalysis(source, filePath, componentName, program)
  const setterToSignal = new Map<string, string>()
  for (const s of ir.metadata.signals) {
    if (s.setter) setterToSignal.set(s.setter, s.getter)
  }

  const fnSetters = buildLocalFunctionSetterMap(ir.metadata, setterToSignal)
  const events = collectEventBindings(ir.root, setterToSignal, fnSetters)

  return {
    componentName: graph.componentName,
    sourceFile: graph.sourceFile,
    events,
    graph,
  }
}

export function escapeForIdBoundary(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function makeIdCallRegex(name: string): RegExp {
  return new RegExp(`(?:^|[^\\w$])${escapeForIdBoundary(name)}\\s*\\(`)
}

function makeIdRefRegex(name: string): RegExp {
  return new RegExp(`(?:^|[^\\w$])${escapeForIdBoundary(name)}(?:[^\\w$]|$)`)
}

/**
 * A setter reachable from a local function, with the chain of intermediate
 * function names between that function and the setter (excluding the function
 * itself). For a direct call the chain is empty.
 */
export interface FnSetterResolution {
  setter: string
  chain: string[]
}

export function buildLocalFunctionSetterMap(
  meta: IRMetadata,
  setterToSignal: Map<string, string>,
): Map<string, FnSetterResolution[]> {
  const setterPatterns = [...setterToSignal.keys()].map(s => ({ name: s, re: makeIdCallRegex(s) }))

  // Collect every local function-like binding: `function foo() {}` declarations
  // plus arrow/function-expression consts (`const foo = () => {}`), which land
  // in localConstants rather than localFunctions.
  const bodies = new Map<string, string>()
  for (const fn of meta.localFunctions) bodies.set(fn.name, fn.body)
  for (const c of meta.localConstants) {
    if (c.containsArrow && c.value) bodies.set(c.name, c.value)
  }

  // Direct setters and direct local-function calls per binding.
  const fnNamePatterns = [...bodies.keys()].map(n => ({ name: n, re: makeIdCallRegex(n) }))
  const directSetters = new Map<string, string[]>()
  const directCalls = new Map<string, string[]>()
  for (const [name, body] of bodies) {
    const setters: string[] = []
    for (const { name: setter, re } of setterPatterns) {
      if (re.test(body)) setters.push(setter)
    }
    directSetters.set(name, setters)
    const calls: string[] = []
    for (const { name: callee, re } of fnNamePatterns) {
      if (callee !== name && re.test(body)) calls.push(callee)
    }
    directCalls.set(name, calls)
  }

  // Resolve transitively: a handler may reach a setter through a chain of
  // helper functions (handler -> setValue -> setInternalValue). `stack`
  // guards against cycles (mutual recursion between helpers). Component
  // helper graphs are tiny, so a plain DFS per binding is fine.
  const resolve = (name: string, stack: Set<string>): FnSetterResolution[] => {
    const out: FnSetterResolution[] = []
    const seen = new Set<string>()
    for (const setter of directSetters.get(name) ?? []) {
      if (!seen.has(setter)) {
        out.push({ setter, chain: [] })
        seen.add(setter)
      }
    }
    for (const callee of directCalls.get(name) ?? []) {
      if (stack.has(callee)) continue
      const sub = resolve(callee, new Set([...stack, callee]))
      for (const r of sub) {
        if (!seen.has(r.setter)) {
          out.push({ setter: r.setter, chain: [callee, ...r.chain] })
          seen.add(r.setter)
        }
      }
    }
    return out
  }

  const result = new Map<string, FnSetterResolution[]>()
  for (const name of bodies.keys()) {
    const resolved = resolve(name, new Set([name]))
    if (resolved.length > 0) result.set(name, resolved)
  }

  return result
}

function collectEventBindings(
  node: IRNode,
  setterToSignal: Map<string, string>,
  fnSetters: Map<string, FnSetterResolution[]>,
): EventBinding[] {
  const events: EventBinding[] = []
  walkForEvents(node, events, setterToSignal, fnSetters)
  return events
}

function walkForEvents(
  node: IRNode,
  events: EventBinding[],
  setterToSignal: Map<string, string>,
  fnSetters: Map<string, FnSetterResolution[]>,
): void {
  switch (node.type) {
    case 'element': {
      for (const event of node.events) {
        events.push({
          elementTag: node.tag,
          elementContext: describeElement(node),
          eventName: event.originalAttr ?? `on${event.name[0].toUpperCase()}${event.name.slice(1)}`,
          handler: event.handler,
          setterCalls: resolveSetters(event.handler, setterToSignal, fnSetters),
          loc: event.loc,
          isComponentProp: false,
        })
      }
      for (const child of node.children) {
        walkForEvents(child, events, setterToSignal, fnSetters)
      }
      break
    }
    case 'component': {
      for (const prop of node.props) {
        if (!/^on[A-Z]/.test(prop.name)) continue
        const handler = prop.value.kind === 'expression' ? prop.value.expr : null
        if (!handler) continue
        events.push({
          elementTag: node.name,
          elementContext: describeComponent(node),
          eventName: prop.name,
          handler,
          setterCalls: resolveSetters(handler, setterToSignal, fnSetters),
          loc: prop.loc,
          isComponentProp: true,
        })
      }
      for (const child of node.children) {
        walkForEvents(child, events, setterToSignal, fnSetters)
      }
      break
    }
    case 'fragment':
    case 'provider': {
      for (const child of node.children) {
        walkForEvents(child, events, setterToSignal, fnSetters)
      }
      break
    }
    case 'conditional': {
      walkForEvents(node.whenTrue, events, setterToSignal, fnSetters)
      walkForEvents(node.whenFalse, events, setterToSignal, fnSetters)
      break
    }
    case 'loop': {
      for (const child of node.children) {
        walkForEvents(child, events, setterToSignal, fnSetters)
      }
      break
    }
    case 'if-statement': {
      walkForEvents(node.consequent, events, setterToSignal, fnSetters)
      if (node.alternate) walkForEvents(node.alternate, events, setterToSignal, fnSetters)
      break
    }
    case 'async': {
      walkForEvents(node.fallback, events, setterToSignal, fnSetters)
      for (const child of node.children) {
        walkForEvents(child, events, setterToSignal, fnSetters)
      }
      break
    }
  }
}

export function resolveSetters(
  handler: string,
  setterToSignal: Map<string, string>,
  fnSetters: Map<string, FnSetterResolution[]>,
): SetterRef[] {
  const refs: SetterRef[] = []
  const seen = new Set<string>()
  const trimmed = handler.trim()

  for (const [setter, signal] of setterToSignal) {
    if (trimmed === setter || makeIdCallRegex(setter).test(handler)) {
      if (!seen.has(setter)) {
        refs.push({ setter, signal })
        seen.add(setter)
      }
    }
  }

  for (const [fnName, resolutions] of fnSetters) {
    if (trimmed === fnName || makeIdCallRegex(fnName).test(handler)) {
      for (const r of resolutions) {
        if (!seen.has(r.setter)) {
          refs.push({
            setter: r.setter,
            signal: setterToSignal.get(r.setter) ?? null,
            via: [fnName, ...r.chain],
          })
          seen.add(r.setter)
        }
      }
    }
  }

  return refs
}

function describeElement(node: IRElement): string {
  for (const attr of node.attrs) {
    if (['type', 'name', 'placeholder', 'id'].includes(attr.name) && attr.value.kind === 'literal') {
      return `${node.tag} ${attr.value.value}`
    }
  }
  const textChild = node.children.find((c): c is IRText => c.type === 'text')
  if (textChild && textChild.value.trim()) {
    return `${textChild.value.trim()} ${node.tag}`
  }
  return node.tag
}

function describeComponent(node: IRComponent): string {
  const textChild = node.children.find((c): c is IRText => c.type === 'text')
  if (textChild && textChild.value.trim()) {
    return `${textChild.value.trim()} ${node.name}`
  }
  return node.name
}

/**
 * Format an event summary as a human-readable string for `bf debug events`.
 * Uses the graph to trace downstream updates for each setter.
 */
export function formatEventSummary(summary: EventSummary, graph: ComponentGraph): string {
  const lines: string[] = []
  lines.push(`${summary.componentName} — ${summary.events.length} event handler(s)`)

  if (summary.events.length === 0) return lines.join('\n')

  for (const event of summary.events) {
    lines.push('')
    lines.push(`  ${event.elementContext}`)

    const setterParts = event.setterCalls.map(s => {
      const chain = s.via && s.via.length > 0 ? `${s.via.join(' -> ')} -> ${s.setter}` : s.setter
      return chain
    })

    const setterStr = setterParts.length > 0 ? setterParts.join(', ') : event.handler
    lines.push(`    ${event.eventName} -> ${setterStr}`)

    const updatedSignals = new Set<string>()
    for (const sc of event.setterCalls) {
      if (sc.signal) updatedSignals.add(sc.signal)
    }

    if (updatedSignals.size > 0) {
      const targets: string[] = []
      for (const sig of updatedSignals) {
        const path = traceUpdatePath(graph, sig)
        if (path && path.dependents.length > 0) {
          const downstream = flattenUpdateTargets(path.dependents)
          targets.push(`${sig} -> ${downstream.join(', ')}`)
        }
      }
      if (targets.length > 0) {
        lines.push(`    updates: ${targets.join('; ')}`)
      }
    }

    const loc = event.loc
    if (loc.file) {
      const locFile = loc.file.split('/').pop() ?? loc.file
      lines.push(`    at ${locFile}:${loc.start.line}`)
    }
  }

  return lines.join('\n')
}

function flattenUpdateTargets(entries: UpdatePathEntry[]): string[] {
  const targets: string[] = []
  for (const entry of entries) {
    if (entry.kind === 'dom') {
      targets.push(entry.label)
    } else if (entry.kind === 'memo') {
      targets.push(entry.name)
      if (entry.children.length > 0) {
        targets.push(...flattenUpdateTargets(entry.children))
      }
    } else if (entry.kind === 'effect') {
      targets.push(`effect ${entry.name}`)
    }
  }
  return targets
}

// =============================================================================
// Analysis: Loop Bindings
// =============================================================================

interface PrecompiledLoopPatterns {
  signalCallPatterns: Array<{ name: string; re: RegExp }>
  memoCallPatterns: Array<{ name: string; re: RegExp }>
  paramRefPatterns: Array<{ name: string; re: RegExp }>
}

export function buildLoopSummary(source: string, filePath: string, componentName?: string): LoopSummary {
  const { graph, ir } = buildComponentAnalysis(source, filePath, componentName)
  const signalGetters = new Set(ir.metadata.signals.map(s => s.getter))
  const memoNames = new Set(ir.metadata.memos.map(m => m.name))
  const loops: LoopInfo[] = []
  collectLoops(ir.root, loops, signalGetters, memoNames)
  return { componentName: graph.componentName, sourceFile: graph.sourceFile, loops }
}

function collectLoops(
  node: IRNode,
  loops: LoopInfo[],
  signalGetters: Set<string>,
  memoNames: Set<string>,
): void {
  switch (node.type) {
    case 'loop': {
      const bindings: LoopChildBinding[] = []
      const paramNames = extractLoopParamNames(node.param, node)
      if (node.index) paramNames.push(node.index)
      const patterns: PrecompiledLoopPatterns = {
        signalCallPatterns: [...signalGetters].map(g => ({ name: g, re: makeIdCallRegex(g) })),
        memoCallPatterns: [...memoNames].map(m => ({ name: m, re: makeIdCallRegex(m) })),
        paramRefPatterns: paramNames.map(n => ({ name: n, re: makeIdRefRegex(n) })),
      }
      collectLoopChildBindings(node.children, bindings, patterns)
      loops.push({
        array: node.array,
        param: node.param,
        index: node.index ?? null,
        key: node.key ?? null,
        method: node.method === 'flatMap' ? 'flatMap' : 'map',
        bindings,
        loc: node.loc,
      })
      for (const child of node.children) collectLoops(child, loops, signalGetters, memoNames)
      break
    }
    case 'element': {
      for (const child of node.children) collectLoops(child, loops, signalGetters, memoNames)
      break
    }
    case 'component': {
      for (const child of node.children) collectLoops(child, loops, signalGetters, memoNames)
      break
    }
    case 'fragment':
    case 'provider': {
      for (const child of node.children) collectLoops(child, loops, signalGetters, memoNames)
      break
    }
    case 'conditional': {
      collectLoops(node.whenTrue, loops, signalGetters, memoNames)
      collectLoops(node.whenFalse, loops, signalGetters, memoNames)
      break
    }
    case 'if-statement': {
      collectLoops(node.consequent, loops, signalGetters, memoNames)
      if (node.alternate) collectLoops(node.alternate, loops, signalGetters, memoNames)
      break
    }
    case 'async': {
      collectLoops(node.fallback, loops, signalGetters, memoNames)
      for (const child of node.children) collectLoops(child, loops, signalGetters, memoNames)
      break
    }
  }
}

function collectLoopChildBindings(
  children: IRNode[],
  bindings: LoopChildBinding[],
  patterns: PrecompiledLoopPatterns,
  parentTag?: string,
): void {
  for (const child of children) {
    switch (child.type) {
      case 'element': {
        const ctx = child.tag
        for (const attr of child.attrs) {
          if (attr.name === 'key' || attr.name === '...' || attr.name.startsWith('...')) continue
          if (attr.value.kind !== 'expression' && attr.value.kind !== 'template' && attr.value.kind !== 'spread') continue
          const expr = attrValueToString(attr.value)
          if (!expr) continue
          const deps = collectLoopDepsPrecompiled(expr, patterns)
          if (deps.length > 0) {
            bindings.push({ elementContext: ctx, kind: 'attribute', name: attr.name, deps, loc: attr.loc })
          }
        }
        for (const event of child.events) {
          const deps = collectLoopDepsPrecompiled(event.handler, patterns)
          bindings.push({
            elementContext: ctx,
            kind: 'event',
            name: event.originalAttr ?? `on${event.name[0].toUpperCase()}${event.name.slice(1)}`,
            deps,
            loc: event.loc,
          })
        }
        collectLoopChildBindings(child.children, bindings, patterns, ctx)
        break
      }
      case 'expression': {
        if (child.slotId) {
          const deps = collectLoopDepsPrecompiled(child.expr, patterns)
          if (deps.length > 0) {
            bindings.push({ elementContext: parentTag ?? 'text', kind: 'text', name: child.expr, deps, loc: child.loc })
          }
        }
        break
      }
      case 'component': {
        const ctx = child.name
        for (const prop of child.props) {
          if (prop.name === '...' || prop.name.startsWith('...')) continue
          if (prop.value.kind !== 'expression' && prop.value.kind !== 'template' && prop.value.kind !== 'spread') continue
          const propValue = attrValueToString(prop.value) ?? ''
          if (!propValue) continue
          const deps = collectLoopDepsPrecompiled(propValue, patterns)
          if (deps.length > 0) {
            const isEvent = /^on[A-Z]/.test(prop.name)
            bindings.push({ elementContext: ctx, kind: isEvent ? 'event' : 'attribute', name: prop.name, deps, loc: prop.loc })
          }
        }
        for (const c of child.children) {
          collectLoopChildBindings([c], bindings, patterns, parentTag)
        }
        break
      }
      case 'conditional': {
        collectLoopChildBindings([child.whenTrue], bindings, patterns, parentTag)
        collectLoopChildBindings([child.whenFalse], bindings, patterns, parentTag)
        break
      }
      case 'fragment':
      case 'provider': {
        collectLoopChildBindings(child.children, bindings, patterns, parentTag)
        break
      }
      case 'loop': {
        break
      }
      case 'if-statement': {
        collectLoopChildBindings([child.consequent], bindings, patterns, parentTag)
        if (child.alternate) collectLoopChildBindings([child.alternate], bindings, patterns, parentTag)
        break
      }
      case 'async': {
        collectLoopChildBindings([child.fallback], bindings, patterns, parentTag)
        collectLoopChildBindings(child.children, bindings, patterns, parentTag)
        break
      }
    }
  }
}

function extractLoopParamNames(loopParam: string, node: IRLoop): string[] {
  if (node.paramBindings && node.paramBindings.length > 0) {
    return node.paramBindings.map(b => b.name)
  }
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(loopParam)) {
    return [loopParam]
  }
  return []
}

function collectLoopDepsPrecompiled(
  expr: string,
  patterns: PrecompiledLoopPatterns,
): string[] {
  const deps: string[] = []
  for (const { name, re } of patterns.signalCallPatterns) {
    if (re.test(expr)) deps.push(name)
  }
  for (const { name, re } of patterns.memoCallPatterns) {
    if (re.test(expr)) deps.push(name)
  }
  for (const { name, re } of patterns.paramRefPatterns) {
    if (re.test(expr)) deps.push(name)
  }
  return deps
}

export function formatLoopSummary(summary: LoopSummary): string {
  const lines: string[] = []
  lines.push(`${summary.componentName} — ${summary.loops.length} loop(s)`)

  for (const loop of summary.loops) {
    lines.push('')
    const params = loop.index ? `${loop.param}, ${loop.index}` : loop.param
    lines.push(`  ${loop.array}.${loop.method}(${params})`)
    if (loop.key) lines.push(`    key: ${loop.key}`)

    for (const b of loop.bindings) {
      const depStr = b.deps.length > 0 ? b.deps.join(', ') : '(no deps)'
      if (b.kind === 'event') {
        lines.push(`    ${b.elementContext} ${b.name} -> ${depStr}`)
      } else if (b.kind === 'attribute') {
        lines.push(`    ${b.elementContext} ${b.name} <- ${depStr}`)
      } else {
        lines.push(`    ${b.elementContext} <- ${depStr}`)
      }
    }

    const locFile = loop.loc.file.split('/').pop() ?? loop.loc.file
    lines.push(`    at ${locFile}:${loop.loc.start.line}`)
  }

  return lines.join('\n')
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
// Analysis: Why-Update (binding → reason)
// =============================================================================

export function buildWhyUpdate(
  source: string,
  filePath: string,
  bindingLabel: string,
  componentName?: string,
): WhyUpdateResult | null {
  const { graph, ir } = buildComponentAnalysis(source, filePath, componentName)

  const matches = graph.domBindings.filter(d =>
    d.label === bindingLabel ||
    d.slotId === bindingLabel,
  )
  if (matches.length === 0) return null
  if (matches.length > 1) {
    return {
      binding: bindingLabel,
      expression: null,
      deps: [],
      ambiguous: matches.map(d => ({ label: d.label, slotId: d.slotId })),
    }
  }
  const binding = matches[0]

  const setterToSignal = new Map<string, string>()
  for (const s of ir.metadata.signals) {
    if (s.setter) setterToSignal.set(s.setter, s.getter)
  }
  const fnSetters = buildLocalFunctionSetterMap(ir.metadata, setterToSignal)
  const events = collectEventBindings(ir.root, setterToSignal, fnSetters)

  const deps: WhyUpdateDep[] = []
  const visited = new Set<string>()

  function traceDep(name: string): void {
    if (visited.has(name)) return
    visited.add(name)

    const signal = graph.signals.find(s => s.name === name)
    if (signal) {
      const changedBy: WhyUpdateSource[] = []
      for (const ev of events) {
        for (const sc of ev.setterCalls) {
          if (sc.signal === name) {
            changedBy.push({
              handler: ev.eventName,
              setter: sc.setter,
              elementContext: ev.elementContext,
              via: sc.via,
            })
          }
        }
      }
      deps.push({ name, kind: 'signal', dependsOn: [], changedBy })
      return
    }

    const memo = graph.memos.find(m => m.name === name)
    if (memo) {
      deps.push({ name, kind: 'memo', dependsOn: memo.deps, changedBy: [] })
      for (const dep of memo.deps) traceDep(dep)
    }
  }

  for (const dep of binding.deps) traceDep(dep)

  const stableId = binding.type === 'attribute' ? binding.label : binding.slotId
  return {
    binding: stableId,
    expression: binding.expression ?? null,
    deps,
    ...(binding.classification === 'fallback' && { classification: binding.classification as 'fallback' }),
    ...(binding.wrapReason && { wrapReason: binding.wrapReason }),
  }
}

export function formatWhyUpdate(result: WhyUpdateResult): string {
  const lines: string[] = []

  lines.push(`${result.binding} updates because:`)
  if (result.expression) {
    lines.push(`  ${result.expression}`)
  }

  if (result.classification === 'fallback') {
    lines.push('')
    lines.push(`note: this is a fallback-wrapped binding (${result.wrapReason ?? 'unknown'})`)
    lines.push('  the compiler could not statically prove reactivity — deps are determined at runtime')
  }

  for (const dep of result.deps) {
    lines.push('')
    if (dep.kind === 'memo') {
      lines.push(`${dep.name} depends on:`)
      for (const d of dep.dependsOn) lines.push(`  ${d}`)
    } else {
      lines.push(`${dep.name} changes from:`)
      if (dep.changedBy.length === 0) {
        lines.push('  (no event handlers found)')
      }
      for (const src of dep.changedBy) {
        const chain = src.via && src.via.length > 0
          ? `${src.elementContext} ${src.handler} -> ${src.via.join(' -> ')} -> ${src.setter}`
          : `${src.elementContext} ${src.handler} -> ${src.setter}`
        lines.push(`  ${chain}`)
      }
    }
  }

  return lines.join('\n')
}

// =============================================================================
// Formatting: Human-readable output
// =============================================================================

/** Format the component graph as a human-readable string for `bf debug graph`. */
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

  // DOM bindings. Fallback-wrapped expressions (#937 Solid-style
  // wrap-by-default) are marked with a leading `~` so users can spot
  // expressions whose reactivity couldn't be statically proven — these
  // are the candidates `bf debug fallbacks` surfaces for optimisation.
  if (graph.domBindings.length > 0) {
    lines.push(`  dom bindings:`)
    for (const d of graph.domBindings) {
      // For attribute bindings use the attr name; for others use slotId
      const id = d.type === 'attribute' ? `"${d.label}"` : `"${d.slotId}"`
      const marker = d.classification === 'fallback' ? '~ ' : '  '
      const locSuffix = formatBindingLoc(d)
      // No tracked deps ⇒ drop the arrow entirely instead of emitting
      // a dangling `<- ` (trailing space). Fallback-wrapped attribute
      // handlers like `<Button onClick={() => setCount(0)}>` legitimately
      // read no signal, so an empty deps list is the common case; mark
      // it explicitly so the reader doesn't wonder if the analyzer
      // dropped data.
      if (d.deps.length === 0) {
        if (d.jsxPreview) {
          lines.push(`    ${marker}${d.jsxPreview} (no tracked deps)${locSuffix}`)
        } else {
          lines.push(`    ${marker}${d.type} ${id} (no tracked deps)${locSuffix}`)
        }
        continue
      }
      const depStr = d.deps.join(', ')
      if (d.jsxPreview) {
        if (d.type === 'event') {
          lines.push(`    ${marker}${d.jsxPreview} -> ${depStr}${locSuffix}`)
        } else {
          lines.push(`    ${marker}${depStr} -> ${d.jsxPreview}${locSuffix}`)
        }
      } else {
        const arrow = d.type === 'event' ? ' ->' : ' <-'
        lines.push(`    ${marker}${d.type} ${id}${arrow} ${depStr}${locSuffix}`)
      }
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

/** Format an update path as a human-readable string for `bf debug trace`. */
export function formatUpdatePath(path: UpdatePath): string {
  const lines: string[] = []

  lines.push(`${path.target} (${path.kind})`)

  for (const entry of path.dependents) {
    formatEntry(entry, lines, '  ')
  }

  return lines.join('\n')
}

function formatBindingLoc(d: DomBinding): string {
  if (!d.loc) return ''
  const file = d.loc.file.split('/').pop() ?? d.loc.file
  return ` at ${file}:${d.loc.start.line}`
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
      classification: d.classification,
      ...(d.expression !== undefined && { expression: d.expression }),
      ...(d.loc && { loc: { file: d.loc.file, line: d.loc.start.line } }),
      ...(d.jsxPreview && { jsxPreview: d.jsxPreview }),
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
// Fallback explanation
// =============================================================================

export interface FallbackExplanation {
  label: string
  expression: string
  reason: string
  runtimeDeps: string
  suggestion: string
  loc?: { file: string; line: number }
  isEventHandler: boolean
}

export function describeFallback(binding: DomBinding): FallbackExplanation {
  const isEventHandler = binding.type === 'event' ||
    (binding.type === 'attribute' && /^on[A-Z]/.test(binding.label.split('.').pop() ?? ''))

  const reason = describeFallbackReason(binding.wrapReason, binding.type, isEventHandler)
  const runtimeDeps = binding.deps.length > 0
    ? binding.deps.join(', ')
    : isEventHandler
      ? 'likely none (event handler captures values, does not track reactively)'
      : 'unknown — subscribes to whatever signals it reads at runtime'

  const suggestion = isEventHandler
    ? 'event handlers intentionally capture scope values; this fallback is typically safe to ignore'
    : binding.wrapReason === 'fallback-function-calls'
      ? 'inline the reactive source or wrap the result in createMemo so the compiler can prove the dependency'
      : binding.wrapReason === 'fallback-getter-calls'
        ? 'the call looks like a signal getter but is not a known signal; verify the function is pure or extract as createMemo'
        : 'rewrite to use a known signal/memo reference so the compiler can statically prove reactivity'

  return {
    label: binding.label,
    expression: binding.expression ?? '(expression not captured)',
    reason,
    runtimeDeps,
    suggestion,
    loc: binding.loc ? { file: binding.loc.file, line: binding.loc.start.line } : undefined,
    isEventHandler,
  }
}

function describeFallbackReason(
  wrapReason: WrapReason | undefined,
  bindingType: string,
  isEventHandler: boolean,
): string {
  const context = bindingType === 'attribute'
    ? 'an attribute expression'
    : bindingType === 'text'
      ? 'a text interpolation'
      : bindingType === 'conditional'
        ? 'a conditional expression'
        : bindingType === 'loop'
          ? 'a loop array expression'
          : 'an expression'

  switch (wrapReason) {
    case 'fallback-function-calls':
      return isEventHandler
        ? `function call in ${context} (event handler prop)`
        : `opaque function call in ${context} — the compiler cannot prove it is reactive or pure`
    case 'fallback-getter-calls':
      return `call pattern resembles a signal getter in ${context}, but is not a recognized signal`
    case 'string-reactive':
      return `string-level match found a signal/memo name in ${context}`
    case 'props-access':
      return `props.xxx reference in ${context} — reactive via prop forwarding`
    case 'proven-reactive':
      return `statically proven reactive in ${context}`
    default:
      return `unknown fallback trigger in ${context}`
  }
}

export function formatFallbackExplanations(
  componentName: string,
  fallbacks: DomBinding[],
): string {
  const lines: string[] = []

  if (fallbacks.length === 0) {
    lines.push(`${componentName} — no fallback-wrapped expressions.`)
    return lines.join('\n')
  }

  lines.push(`${componentName} — ${fallbacks.length} fallback-wrapped expression(s)`)

  for (const f of fallbacks) {
    const ex = describeFallback(f)
    lines.push('')
    if (ex.loc) {
      const locFile = ex.loc.file.split('/').pop() ?? ex.loc.file
      lines.push(`  ${locFile}:${ex.loc.line}`)
    }
    lines.push(`  ${ex.label} fallback:`)
    lines.push(`    expression: ${ex.expression}`)
    lines.push(`    reason: ${ex.reason}`)
    lines.push(`    runtime deps: ${ex.runtimeDeps}`)
    lines.push(`    suggestion: ${ex.suggestion}`)
  }

  return lines.join('\n')
}

// =============================================================================
// Component Summary (hydration/size overview)
// =============================================================================

export function buildComponentSummary(source: string, filePath: string, componentName?: string, program?: ts.Program): ComponentSummary {
  const { graph, ir } = buildComponentAnalysis(source, filePath, componentName, program)
  const meta = ir.metadata
  const clientNeeds = analyzeClientNeeds(ir)
  const hasReactiveState = meta.signals.length > 0 || meta.memos.length > 0 || meta.effects.length > 0
  const needsClient = clientNeeds.needsInit && hasReactiveState

  let loopCount = 0
  countNodeType(ir.root, 'loop', () => { loopCount++ })

  let conditionalCount = 0
  countNodeType(ir.root, 'conditional', () => { conditionalCount++ })

  const eventHandlers = graph.domBindings.filter(d => d.type === 'event').length
  const textBindings = graph.domBindings.filter(d => d.type === 'text').length
  const attrBindings = graph.domBindings.filter(d => d.type === 'attribute').length
  const fallbacks = graph.domBindings.filter(d => d.classification === 'fallback').length

  let clientBundle: string | null = null
  if (needsClient) {
    const base = filePath.replace(/\.[^.]+$/, '').split('/').pop() ?? meta.componentName
    clientBundle = `${base}.client.js`
  }

  return {
    componentName: graph.componentName,
    sourceFile: graph.sourceFile,
    hydrated: needsClient,
    clientBundle,
    signals: graph.signals.length,
    memos: graph.memos.length,
    effects: graph.effects.length,
    loops: loopCount,
    eventHandlers,
    dynamicTextBindings: textBindings,
    dynamicAttributes: attrBindings,
    conditionals: conditionalCount,
    fallbacks,
  }
}

function countNodeType(node: IRNode, targetType: string, cb: () => void): void {
  if (node.type === targetType) cb()
  switch (node.type) {
    case 'element':
    case 'fragment':
    case 'provider':
      for (const child of node.children) countNodeType(child, targetType, cb)
      break
    case 'component':
      for (const child of node.children) countNodeType(child, targetType, cb)
      break
    case 'conditional':
      countNodeType(node.whenTrue, targetType, cb)
      countNodeType(node.whenFalse, targetType, cb)
      break
    case 'loop':
      for (const child of node.children) countNodeType(child, targetType, cb)
      break
    case 'if-statement':
      countNodeType(node.consequent, targetType, cb)
      if (node.alternate) countNodeType(node.alternate, targetType, cb)
      break
    case 'async':
      countNodeType(node.fallback, targetType, cb)
      for (const child of node.children) countNodeType(child, targetType, cb)
      break
  }
}

export function formatComponentSummary(summary: ComponentSummary): string {
  const lines: string[] = []
  lines.push(summary.componentName)
  lines.push(`  hydrated: ${summary.hydrated ? 'yes' : 'no'}`)
  if (summary.clientBundle) {
    lines.push(`  client bundle: ${summary.clientBundle}`)
  }
  lines.push(`  signals: ${summary.signals}`)
  lines.push(`  memos: ${summary.memos}`)
  if (summary.effects > 0) lines.push(`  effects: ${summary.effects}`)
  lines.push(`  loops: ${summary.loops}`)
  lines.push(`  event handlers: ${summary.eventHandlers}`)
  lines.push(`  dynamic text bindings: ${summary.dynamicTextBindings}`)
  lines.push(`  dynamic attributes: ${summary.dynamicAttributes}`)
  if (summary.conditionals > 0) lines.push(`  conditionals: ${summary.conditionals}`)
  if (summary.fallbacks > 0) lines.push(`  fallbacks: ${summary.fallbacks}`)
  return lines.join('\n')
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive a `WrapReason` for bindings that mix string-level evidence (known
 * signal/memo/prop names in the expression → `deps.length > 0`, or a
 * `props.xxx` reference) with the AST flags the analyzer attaches to each
 * attribute/prop/loop. Mirrors `decideWrapForAttr` / `decideWrapForChildProp`
 * in `ir-to-client-js/reactivity.ts` but uses `deps` as the stand-in for the
 * string-level `needsEffectWrapper` check (debug.ts has no `ClientJsContext`).
 */
function inferWrapReasonForAttrLike(
  hasStringReactive: boolean,
  hasPropsRef: boolean,
  flags: { callsReactiveGetters?: boolean; hasFunctionCalls?: boolean },
): WrapReason | undefined {
  if (hasPropsRef) return 'props-access'
  if (hasStringReactive) return 'string-reactive'
  const decision = decideWrapFromAstFlags(flags)
  return decision.wrap ? decision.reason : undefined
}

/**
 * Collect DOM bindings (text updates, event handlers, etc.) from the IR tree.
 *
 * Emits one `DomBinding` per expression the emitter wraps in `createEffect` at
 * client JS generation time. The gate matches `ir-to-client-js/collect-elements.ts`
 * so `bf debug graph` / `bf debug trace` / `bf debug fallbacks` see the
 * same reactive footprint the runtime sees.
 *
 * Each binding carries a `classification`:
 *  - `'reactive'`: static analysis proved the expression reads a signal/memo/prop.
 *  - `'fallback'`: Solid-style wrap-by-default (#937) wrapped it because the
 *    expression contains a call the analyzer can't prove pure.
 */
function collectDomBindings(
  node: IRNode,
  bindings: DomBinding[],
  signalGetters: Set<string>,
  memoNames: Set<string>,
  parentTag?: string,
  // Loop-param names in scope (#1690, #1795 Phase 2). Inside a `map(it => …)`
  // body the emitter rewrites every `it.x` read into a reactive accessor and
  // wraps the binding in `createEffect`, yet `it` is neither a signal nor a
  // memo — so without this context loop-child text / attribute bindings are
  // invisible to the graph. When a binding expression references one of these
  // names it is treated as reactive (matching the emitter's gate), giving the
  // profiler a `domBinding` (slotId + loc) to resolve `<Comp>#binding:<slotId>`.
  loopParams: Set<string> = new Set(),
): void {
  // Does a loop-child binding read a loop param (or index)? Use the analyzer's
  // lexer-resolved metadata, NOT a raw-string regex — so a param name that only
  // appears inside a string literal (index `i` vs `'i'`) is not mistaken for a
  // reactive read. Text expressions carry `origin.freeRefs` (a `render-item`
  // kind == map-callback param); attributes carry `freeIdentifiers` (bare
  // identifier set). This matches the emitter's actual loop-param gate.
  const exprReadsLoopParam = (n: IRExpression): boolean =>
    loopParams.size > 0 && (n.origin?.freeRefs?.some(r => loopParams.has(r.name)) ?? false)
  const attrReadsLoopParam = (free: ReadonlySet<string> | undefined): boolean =>
    loopParams.size > 0 && free !== undefined && [...loopParams].some(p => free.has(p))
  switch (node.type) {
    case 'element': {
      // Dynamic attribute bindings (style, class, aria-*, data-*, etc.)
      // Widened to match the emitter's gate in collect-elements.ts:
      // `needsEffectWrapper(...) || attr.callsReactiveGetters || attr.hasFunctionCalls`.
      // `deps.length > 0` is the debug-side proxy for `needsEffectWrapper` —
      // both recognise known signal / memo / prop names, so a non-empty
      // deps list is the statically-proven-reactive case.
      for (const attr of node.attrs) {
        if (attr.value.kind !== 'expression' && attr.value.kind !== 'template' && attr.value.kind !== 'spread') continue
        // `key` is consumed by the loop's keyFn, never emitted as an attribute
        // effect — skip it inside loops so a `key={it.id}` read isn't mistaken
        // for a reactive binding (matches `collectLoopChildBindings`).
        if (attr.name === 'key' && loopParams.size > 0) continue
        const expr = attrValueToString(attr.value)
        if (!expr) continue
        const deps = extractReactiveDeps(expr, signalGetters, memoNames)
        const isReactive = deps.length > 0 || attrReadsLoopParam(attr.freeIdentifiers)
        const wrapReason = inferWrapReasonForAttrLike(isReactive, false, attr)
        if (wrapReason) {
          bindings.push({
            kind: 'dom',
            label: attr.name,
            slotId: node.slotId ?? '?',
            deps,
            type: 'attribute',
            classification: isReactive ? 'reactive' : 'fallback',
            expression: expr,
            wrapReason,
            loc: attr.loc,
            jsxPreview: attr.value.kind === 'spread'
              ? `<${node.tag} {...${truncateExpr(expr)}}>`
              : `<${node.tag} ${attr.name}={${truncateExpr(expr)}}>`,
          })
        }
      }
      // Event handlers — always tracked, always 'reactive' (handlers are
      // bound, not re-evaluated; no wrap-by-default gate applies).
      for (const event of node.events) {
        bindings.push({
          kind: 'dom',
          label: `${event.name} handler "${node.slotId ?? '?'}"`,
          slotId: node.slotId ?? '?',
          deps: extractSetterRefs(event.handler, signalGetters),
          type: 'event',
          classification: 'reactive',
          loc: event.loc,
          jsxPreview: `<${node.tag} ${event.originalAttr ?? `on${event.name[0].toUpperCase()}${event.name.slice(1)}`}={...}>`,
        })
      }
      // Recurse — pass element tag as parent context for text bindings
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames, node.tag, loopParams)
      }
      break
    }
    case 'expression': {
      // Widened to match emitter gate in collect-elements.ts:
      // `node.reactive || node.callsReactiveGetters || node.hasFunctionCalls`.
      const decision = decideWrapFromAstFlags(node)
      const loopReactive = exprReadsLoopParam(node)
      if ((decision.wrap || loopReactive) && node.slotId) {
        const deps = extractReactiveDeps(node.expr, signalGetters, memoNames)
        const preview = parentTag
          ? `<${parentTag}>{${truncateExpr(node.expr)}}</${parentTag}>`
          : `{${truncateExpr(node.expr)}}`
        bindings.push({
          kind: 'dom',
          label: `text "${node.slotId}"`,
          slotId: node.slotId,
          deps,
          type: 'text',
          classification:
            (decision.wrap && decision.reason === 'proven-reactive') || loopReactive
              ? 'reactive'
              : 'fallback',
          expression: node.expr,
          wrapReason: decision.wrap ? decision.reason : 'string-reactive',
          loc: node.loc,
          jsxPreview: preview,
        })
      }
      break
    }
    case 'conditional': {
      const decision = decideWrapFromAstFlags(node)
      if (decision.wrap && node.slotId) {
        const deps = extractReactiveDeps(node.condition, signalGetters, memoNames)
        bindings.push({
          kind: 'dom',
          label: `conditional "${node.slotId}"`,
          slotId: node.slotId,
          deps,
          type: 'conditional',
          classification: decision.reason === 'proven-reactive' ? 'reactive' : 'fallback',
          expression: node.condition,
          wrapReason: decision.reason,
          loc: node.loc,
          jsxPreview: `{${truncateExpr(node.condition)} ? ... : ...}`,
        })
      }
      collectDomBindings(node.whenTrue, bindings, signalGetters, memoNames, parentTag, loopParams)
      collectDomBindings(node.whenFalse, bindings, signalGetters, memoNames, parentTag, loopParams)
      break
    }
    case 'loop': {
      // IRLoop compresses reactive/fallback behind `!isStaticArray`. We
      // distinguish here via the dedicated flags added in #944:
      // `callsReactiveGetters` catches `items()` where `items` is a signal;
      // `hasFunctionCalls` without reactive-getter hit is the fallback case
      // (e.g. `getItems().map(...)` with an opaque helper).
      if (node.slotId) {
        const deps = extractReactiveDeps(node.array, signalGetters, memoNames)
        const isReactive = deps.length > 0 || node.callsReactiveGetters === true
        const isFallback = !isReactive && node.hasFunctionCalls === true
        if (isReactive || isFallback) {
          // IRLoop has no `.reactive` flag (unlike IRExpression/IRConditional),
          // so we derive the WrapReason inline rather than via
          // `inferWrapReasonForAttrLike`: a loop whose array calls a signal
          // getter (`items()` where `items` is a signal) is proven-reactive,
          // not fallback — flip the string evidence before handing the AST
          // flags to the helper.
          const wrapReason: WrapReason = deps.length > 0
            ? 'string-reactive'
            : node.callsReactiveGetters
              ? 'proven-reactive'
              : 'fallback-function-calls'
          bindings.push({
            kind: 'dom',
            label: `loop "${node.slotId}"`,
            slotId: node.slotId,
            deps,
            type: 'loop',
            classification: isReactive ? 'reactive' : 'fallback',
            expression: node.array,
            wrapReason,
            loc: node.loc,
            jsxPreview: `{${truncateExpr(node.array)}.${node.method === 'flatMap' ? 'flatMap' : 'map'}(${node.param} => ...)}`,
          })
        }
      }
      // Loop-param names enter scope for the children (#1690, #1795 Phase 2).
      const childLoopParams = new Set(loopParams)
      for (const p of extractLoopParamNames(node.param, node)) childLoopParams.add(p)
      if (node.index) childLoopParams.add(node.index)
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames, parentTag, childLoopParams)
      }
      break
    }
    case 'component': {
      // Child-component prop bindings (#942 DRY-consolidated in #952).
      for (const prop of node.props) {
        if (prop.name === '...' || prop.name.startsWith('...')) continue
        if (prop.value.kind !== 'expression' && prop.value.kind !== 'template' && prop.value.kind !== 'spread') continue
        const propValue = attrValueToString(prop.value) ?? ''
        if (!propValue) continue
        const deps = extractReactiveDeps(propValue, signalGetters, memoNames)
        const hasPropsRef = propValue.includes('props.')
        const isReactive = deps.length > 0 || hasPropsRef
        const wrapReason = inferWrapReasonForAttrLike(deps.length > 0, hasPropsRef, prop)
        if (wrapReason) {
          bindings.push({
            kind: 'dom',
            label: `${node.name}.${prop.name}`,
            slotId: node.slotId ?? '?',
            deps,
            type: 'attribute',
            classification: isReactive ? 'reactive' : 'fallback',
            expression: propValue,
            wrapReason,
            loc: prop.loc,
            jsxPreview: prop.value.kind === 'spread'
              ? `<${node.name} {...${truncateExpr(propValue)}}>`
              : `<${node.name} ${prop.name}={${truncateExpr(propValue)}}>`,
          })
        }
      }
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames, parentTag, loopParams)
      }
      break
    }
    case 'fragment':
    case 'provider': {
      for (const child of node.children) {
        collectDomBindings(child, bindings, signalGetters, memoNames, parentTag, loopParams)
      }
      break
    }
    case 'if-statement': {
      collectDomBindings(node.consequent, bindings, signalGetters, memoNames, parentTag, loopParams)
      if (node.alternate) {
        collectDomBindings(node.alternate, bindings, signalGetters, memoNames, parentTag, loopParams)
      }
      break
    }
  }
}

function truncateExpr(expr: string, max: number = 40): string {
  const s = expr.replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Convert an `AttrValue` to a flat string for reactive dep extraction. */
function attrValueToString(value: AttrValue): string | null {
  switch (value.kind) {
    case 'literal':
      return value.value
    case 'expression':
      return value.expr
    case 'spread':
      return value.expr
    case 'template':
      return value.parts
        .map(p => {
          if (p.type === 'ternary') return `${p.condition} ${p.whenTrue} ${p.whenFalse}`
          if (p.type === 'lookup') return p.key
          return ''
        })
        .join(' ')
    case 'boolean-attr':
    case 'boolean-shorthand':
    case 'jsx-children':
      return null
  }
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
