/**
 * BF101 for a signal seed or memo body that calls a function a template
 * cannot inline (#3721), when that value reaches a server-rendered position.
 *
 * A template computes a signal's or memo's SSR value from its seed or body
 * (the SSR seed plan, the static SSR defaults, Go's constructor). A
 * zero-argument call of a local function is read there as the expression the
 * function returns (`localCallBodies`); a call of any other local function
 * (`uninlinableLocalCalls`: parameters, a body other than a single
 * `return`) has no value a template can compute, so the value would render
 * as its empty static default where JS renders the call's result. The same
 * call in markup is refused by the shared inlining (`inlineComputedConsts`);
 * this is the refusal for the value positions that inlining never sees.
 *
 * Only a value the server render reads is refused: one read by a template
 * position (`walkTemplatePositions`, which skips `/* @client *\/` reads), or by
 * a signal, memo or const such a position reads. A module-scope
 * `/* @client *\/` signal or memo never renders on the server.
 */

import { freeIdentifiers, mapParsedExpr, type ParsedExpr } from '../expression-parser.ts'
import { uninlinableLocalCalls } from '../local-call-body.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { CompilerError, ComponentIR, SourceLocation } from '../types.ts'

/** Where {@link refuseUninlinableSeedCalls} records its errors. */
export interface UninlinableSeedCallSink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/** A signal, memo or const value: what it reads, and its tree when it has one. */
interface ComponentValue {
  kind: 'signal' | 'memo' | 'const'
  expr: ParsedExpr | undefined
  frees: ReadonlySet<string>
  loc: SourceLocation
}

/** Record BF101 for each server-read signal seed or memo body calling an uninlinable local function. */
export function refuseUninlinableSeedCalls(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  const refused = uninlinableLocalCalls(ir.metadata)
  if (refused.size === 0) return
  const values = componentValues(ir)
  for (const name of serverReadNames(ir, values)) {
    const value = values.get(name)
    if (!value || value.kind === 'const') continue
    for (const fn of calledNames(value, refused)) record(value.kind, name, fn, value.loc, sink)
  }
}

/** The component-scope signals, memos and consts, by name. */
function componentValues(ir: ComponentIR): Map<string, ComponentValue> {
  const { metadata } = ir
  const values = new Map<string, ComponentValue>()
  for (const c of metadata.localConstants ?? []) {
    if (c.isModule || !c.parsed) continue
    values.set(c.name, { kind: 'const', expr: c.parsed, frees: freeIdentifiers(c.parsed) ?? new Set(), loc: c.loc })
  }
  for (const s of metadata.signals) {
    if (s.isModule || s.envReader) continue
    values.set(s.getter, { kind: 'signal', expr: s.parsed, frees: frees(s.parsed, s.initialFreeIdentifiers), loc: s.loc })
  }
  for (const m of metadata.memos) {
    if (m.isModule) continue
    values.set(m.name, { kind: 'memo', expr: m.parsed, frees: frees(m.parsed, m.computationFreeIdentifiers), loc: m.loc })
  }
  return values
}

function frees(expr: ParsedExpr | undefined, fallback: ReadonlySet<string> | undefined): ReadonlySet<string> {
  return (expr && freeIdentifiers(expr)) ?? fallback ?? new Set()
}

/** Every name a server-rendered position reads, directly or through the values it reads. */
function serverReadNames(ir: ComponentIR, values: ReadonlyMap<string, ComponentValue>): Set<string> {
  const read = new Set<string>()
  const pending: string[] = []
  const add = (name: string): void => {
    if (read.has(name)) return
    read.add(name)
    pending.push(name)
  }
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  walkTemplatePositions(ir.root, ({ expr }) => {
    for (const name of freeIdentifiers(expr) ?? []) add(name)
  }, component)
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    for (const free of values.get(name)?.frees ?? []) add(free)
  }
  return read
}

/**
 * The names in `refused` that `value` calls with no arguments. A body the
 * analyzer did not fold into one expression has no tree, and is not refused
 * here: its static default is what a template renders, which can match JS
 * (a guard returning before the call), so it stays a registered limitation.
 */
function calledNames(value: ComponentValue, refused: ReadonlySet<string>): string[] {
  if (!value.expr) return []
  const called = new Set<string>()
  mapParsedExpr(value.expr, (e, enclosing) => {
    if (e.kind === 'call' && e.args.length === 0 && e.callee.kind === 'identifier' && refused.has(e.callee.name) && !enclosing.has(e.callee.name)) {
      called.add(e.callee.name)
    }
    return null
  })
  return [...called]
}

function record(kind: 'signal' | 'memo', name: string, fn: string, loc: SourceLocation, sink: UninlinableSeedCallSink): void {
  const what = kind === 'signal' ? `Signal '${name}' is seeded from` : `Memo '${name}' computes`
  const message =
    `${what} '${fn}()', a call of a function a template cannot compute: only a function that takes no parameters and ` +
    `whose body is a single 'return <expr>' is read on the server, as the expression it returns. The server render ` +
    `would show '${name}' empty where JS shows the call's result.`
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: {
      message: `Make '${fn}' a single 'return <expr>' with no parameters, or defer the reads of '${name}' to the client with /* @client */.`,
      escape: [{ kind: 'rewrite' }, { kind: 'client-directive' }],
    },
  })
}
