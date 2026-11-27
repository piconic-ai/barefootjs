/**
 * BF101 for a value the server render reads that applies an operator no
 * template lowers (#3981): `typeof x`, `a ** b`, a bitwise or shift
 * operator, `~x`, `k in o`, `o instanceof C` (`unloweredOperator`).
 *
 * Written in markup, such an operator is refused by the emitter that spells
 * it (the support check refuses the same operators). A signal's seed, a
 * memo's body, a const's initializer and a called function's returned
 * expression are computed apart from any emitter: the SSR seed plan
 * classifies them opaque, the static evaluator has no value for the
 * operator, and Go's constructor leaves the value out. The value then
 * renders empty, or `0`, where JS renders the computed one. This is the
 * refusal for those declarations, and for a child prop's value, which Go's
 * constructor drops the same way.
 *
 * Only a declaration the server render reads is refused, however it is
 * reached (`walkServerReads`), and within its expression only what its
 * evaluation runs (`walkEvaluated`): an operator in a callback handed to a
 * call is refused, one in a function stored and never called is not. A
 * `/* @client *\/` read and an event handler read none. A memo whose value
 * has no `parsed` tree is read from its `unparsedValue` (an object-literal
 * body, a single `return`); a const object literal only through the members
 * a template position reads, since a template inlines the member it reads.
 */

import { evaluatedWalkContext, walkEvaluated, type EvaluatedAt, type EvaluatedWalkContext } from '../evaluated-expr-walk.ts'
import { unloweredOperator, type ParsedExpr } from '../expression-parser.ts'
import { isEventHandlerName } from '../event-handler-name.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import { evaluateSeeds, UNRESOLVED } from '../ssr-defaults.ts'
import type { ComponentIR, SourceLocation } from '../types.ts'
import { childPropReads } from './unlowered-array-element.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each declaration the server render reads that applies an operator no template lowers. */
export function refuseUnloweredOperators(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  const readByProp = childPropReads(ir)
  const ctx = evaluatedWalkContext(ir.metadata, { component: BindingScope.EMPTY, module: BindingScope.EMPTY })
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const sources: ReadSource[] = []
  walkTemplatePositions(ir.root, ({ expr, scope, attrName, loc, role }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    const at: EvaluatedAt = { scope: scope ?? component, from: 'component' }
    sources.push({ expr, at, whole: false })
    // A child prop's value is computed apart from any emitter too (Go's
    // constructor drops it); markup positions are refused by their emitters.
    if (role !== 'prop') return
    const node = firstUnloweredOperator(expr, at, ctx)
    if (node !== null) recordChildProp(attrName, operatorText(node), loc, sink)
  }, component)
  const reads: ServerRead[] = []
  walkServerReads(ir, read => reads.push(read))
  const unparsed = unparsedValues(ir)
  const valueOf = (read: ServerRead): ParsedExpr | undefined =>
    read.expr ?? (read.kind === 'signal' || read.kind === 'memo' ? unparsed.get(read.name) : undefined)
  // A signal seed or a memo body is computed apart from any emitter, from
  // the whole of each const it reads: a const it reads counts as read whole.
  for (const read of reads) {
    const value = valueOf(read)
    if (value) sources.push({ expr: value, at: { scope: BindingScope.EMPTY, from: read.scope }, whole: read.kind === 'signal' || read.kind === 'memo' })
  }
  const literalConsts = literalConstNames(reads)
  const constPaths = readPathsByName(sources, literalConsts, ctx)
  for (const name of untreedConstReads(ir, reads, literalConsts, valueOf)) constPaths.set(name, [...(constPaths.get(name) ?? []), []])
  for (const read of reads) {
    // A module-scope declaration is out of scope, as for the array-element refusal.
    if (read.scope === 'module') continue
    const value = valueOf(read)
    if (!value) continue
    const at: EvaluatedAt = { scope: BindingScope.EMPTY, from: read.scope }
    // A const read in a template position is read member by member (`o.n`
    // inlines `o`'s `n`), so only the members those reads reach count. A
    // signal or memo is computed whole, or not at all.
    const reached = read.kind === 'const' && isLiteralContainer(value) ? nodesAtPaths(value, constPaths.get(read.name) ?? []) : [value]
    const node = firstOf(reached, e => firstUnloweredOperator(e, at, ctx))
    if (node !== null) record(read, operatorText(node), !readByProp(read), sink)
  }
}

/**
 * The literal consts a signal or memo with no tree to walk (a block-bodied
 * memo with more than one statement) reads whole: the names the analyzer
 * found in it (`ServerRead.untreedNames`), for a declaration whose value
 * the static evaluator cannot compute (`evaluateSeeds`). A value it does
 * compute is the server value whatever the body names, a function it only
 * stores included; one it cannot compute renders empty already, and a const
 * it names is the read the refusal can point at.
 */
function untreedConstReads(
  ir: ComponentIR,
  reads: readonly ServerRead[],
  literalConsts: ReadonlySet<string>,
  valueOf: (read: ServerRead) => ParsedExpr | undefined,
): Set<string> {
  const names = new Set<string>()
  const untreed = reads.filter(r => (r.kind === 'signal' || r.kind === 'memo') && !valueOf(r) && r.untreedNames && [...r.untreedNames].some(n => literalConsts.has(n)))
  if (untreed.length === 0) return names
  const seeds = evaluateSeeds(ir.metadata)
  for (const read of untreed) {
    const seed = (read.kind === 'memo' ? seeds.memos : seeds.signals).get(read.name)
    if (seed !== undefined && seed !== UNRESOLVED) continue
    for (const name of read.untreedNames ?? []) if (literalConsts.has(name)) names.add(name)
  }
  return names
}

/** An expression the server render evaluates, and where. */
interface ReadSource {
  expr: ParsedExpr
  at: EvaluatedAt
  /** Whether every const it reads is read whole, whatever member it names. */
  whole: boolean
}

/**
 * The parse each component signal and memo keeps apart from `parsed`
 * (`unparsedValue`: an object-literal memo body, an operator at the root of
 * a seed or of a memo's expression or single `return`), by the name it is
 * read under.
 */
function unparsedValues(ir: ComponentIR): ReadonlyMap<string, ParsedExpr> {
  const values = new Map<string, ParsedExpr>()
  for (const s of ir.metadata.signals) if (!s.isModule && s.unparsedValue) values.set(s.getter, s.unparsedValue)
  for (const m of ir.metadata.memos) if (!m.isModule && m.unparsedValue) values.set(m.name, m.unparsedValue)
  return values
}

function isLiteralContainer(e: ParsedExpr): boolean {
  return e.kind === 'object-literal' || e.kind === 'array-literal'
}

/** The component consts the server render reads whose initializer is an object or array literal. */
function literalConstNames(reads: readonly ServerRead[]): ReadonlySet<string> {
  return new Set(reads.filter(r => r.kind === 'const' && r.scope === 'component' && r.expr && isLiteralContainer(r.expr)).map(r => r.name))
}

/** A member path a read takes from a value; `null` for a step whose key is not a literal. */
type ReadPath = ReadonlyArray<string | null>

/**
 * The member paths each of `names` is read through in `sources`: `o.a.b` is
 * `['a', 'b']`, `o[i]` is `[null]`, `o` alone (passed on, spread, compared)
 * is `[]`, the whole value. A name a callback or loop row binds is not the
 * const.
 */
function readPathsByName(sources: readonly ReadSource[], names: ReadonlySet<string>, ctx: EvaluatedWalkContext): Map<string, ReadPath[]> {
  const paths = new Map<string, ReadPath[]>()
  if (names.size === 0) return paths
  const add = (name: string, path: ReadPath): void => {
    const list = paths.get(name) ?? []
    list.push(path)
    paths.set(name, list)
  }
  for (const { expr, at, whole } of sources) {
    // A chain is visited outermost first: its inner nodes are its own path, not reads of their own.
    const inChain = new Set<ParsedExpr>()
    walkEvaluated(expr, at, { ...ctx, entered: new Set() }, (e, eAt) => {
      if (inChain.has(e)) return
      const chain = memberChain(e)
      if (!chain || !names.has(chain.name) || eAt.scope.isBound(chain.name)) return
      for (const node of chain.nodes) inChain.add(node)
      add(chain.name, whole ? [] : chain.path)
    })
  }
  return paths
}

/** `e` as a member chain rooted at a bare name (`o`, `o.a`, `o.a[i]`), with the nodes it is made of. */
function memberChain(e: ParsedExpr): { name: string; path: ReadPath; nodes: ParsedExpr[] } | null {
  const steps: Array<string | null> = []
  const nodes: ParsedExpr[] = []
  let node = e
  while (node.kind === 'member' || node.kind === 'index-access') {
    steps.push(node.kind === 'member' ? node.property : null)
    nodes.push(node)
    node = node.object
  }
  if (node.kind !== 'identifier') return null
  nodes.push(node)
  return { name: node.name, path: steps.reverse(), nodes }
}

/**
 * The subtrees of the literal `value` that `paths` read: a step into an
 * object literal reaches the last property of that key and every spread
 * after it (all spreads when no property has the key; into a spread object
 * literal, only its own member of that key), a literal index into
 * an array literal with no spread before it reaches that element. Any other
 * step reads the node it stands on whole.
 */
function nodesAtPaths(value: ParsedExpr, paths: readonly ReadPath[]): ParsedExpr[] {
  const reached: ParsedExpr[] = []
  for (const path of paths) {
    let current: ParsedExpr[] = [value]
    for (const step of path) {
      const next: ParsedExpr[] = []
      for (const node of current) {
        const members = step === null ? null : literalMembers(node, step)
        if (members === null) reached.push(node)
        else next.push(...members)
      }
      current = next
    }
    reached.push(...current)
  }
  return reached
}

/** What reading `key` of the literal `node` reaches, or `null` when `node` is not a literal container `key` can be followed into. */
function literalMembers(node: ParsedExpr, key: string): ParsedExpr[] | null {
  if (node.kind === 'object-literal') {
    let last = -1
    node.properties.forEach((p, i) => {
      if (p.kind === 'prop' && p.key === key) last = i
    })
    const members: ParsedExpr[] = []
    node.properties.forEach((p, i) => {
      if (i === last && p.kind === 'prop') members.push(p.value)
      // A spread of a literal reaches only its own member of that key.
      else if (i > last && p.kind === 'spread') members.push(...(literalMembers(p.expr, key) ?? [p.expr]))
    })
    return members
  }
  if (node.kind === 'array-literal') {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || String(index) !== key) return null
    if (node.elements.slice(0, index + 1).some(el => el.kind === 'unsupported')) return null
    return node.elements[index] ? [node.elements[index]] : []
  }
  return null
}

function firstOf(nodes: readonly ParsedExpr[], find: (e: ParsedExpr) => ParsedExpr | null): ParsedExpr | null {
  for (const node of nodes) {
    const found = find(node)
    if (found !== null) return found
  }
  return null
}

/** The first node evaluating `expr` runs that applies an operator no template lowers, or `null`. */
function firstUnloweredOperator(expr: ParsedExpr, at: EvaluatedAt, ctx: EvaluatedWalkContext): ParsedExpr | null {
  let found: ParsedExpr | null = null
  walkEvaluated(expr, at, { ...ctx, entered: new Set() }, (e) => {
    if (found === null && unloweredOperator(e) !== null) found = e
  })
  return found
}

const SUBJECT: Record<ServerRead['kind'], (name: string) => string> = {
  signal: name => `Signal '${name}' is seeded from`,
  memo: name => `Memo '${name}' computes`,
  const: name => `'${name}' is initialized from`,
  function: name => `Function '${name}' returns`,
}

/** How the message names the operator of `node`: an `'unknown'` one parsed without its token. */
function operatorText(node: ParsedExpr): string {
  const operator = unloweredOperator(node)
  if (operator !== 'unknown') return `\`${operator}\``
  return node.kind === 'binary'
    ? 'a binary operator other than comparison and arithmetic (`**`, a bitwise or shift operator, `in`, `instanceof`)'
    : 'a prefix `++` / `--`'
}

const FIX = 'Pre-compute the value in the backend and pass it as a prop'

function record(read: ServerRead, operator: string, deferrable: boolean, sink: UninlinableSeedCallSink): void {
  const { name } = read
  const message =
    `${SUBJECT[read.kind](name)} an expression applying ${operator}, which no template lowers. ` +
    `The server render would show '${name}' empty where JS shows the computed value.`
  push(message, read.loc, deferrable ? name : null, sink)
}

function recordChildProp(prop: string | undefined, operator: string, loc: SourceLocation, sink: UninlinableSeedCallSink): void {
  const message =
    `Child prop${prop === undefined ? '' : ` '${prop}'`} is passed an expression applying ${operator}, which no template lowers. ` +
    'The child would render it empty where JS renders the computed value.'
  push(message, loc, null, sink)
}

/** Record one BF101; `deferred` names the declaration whose reads `/* @client *\/` defers, `null` where it defers nothing. */
function push(message: string, loc: SourceLocation, deferred: string | null, sink: UninlinableSeedCallSink): void {
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message && e.loc.start.line === loc.start.line && e.loc.start.column === loc.start.column)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: deferred
      ? { message: `${FIX}, or defer the reads of '${deferred}' to the client with /* @client */.`, escape: [{ kind: 'client-directive' }] }
      : { message: `${FIX}.` },
  })
}
