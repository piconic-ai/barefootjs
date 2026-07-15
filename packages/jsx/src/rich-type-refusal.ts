/**
 * Rich-type method-call refusal (#2273).
 *
 * A method call on a prop typed as a built-in "host rich type" (`Date`,
 * `Map`, …) has no catalogued lowering — no adapter can emit `.toISOString()`
 * into a template. Left unchecked, such a call transliterates into the
 * target template's own dot-call syntax and dies at request time (a Go
 * template `.CreatedAt.ToISOString` panic, a Jinja `AttributeError`, …),
 * once per adapter, only once someone renders the page. This module makes
 * that gap loud at compile time instead: `checkRichTypeMethodCalls` walks
 * every expression position the compiler already treats as template-lowered
 * and pushes BF021 for any call this build has no evidence a lowering plugin
 * (or `/* @client *\/`) will handle.
 *
 * Deliberately conservative in both directions:
 *   - `resolveReceiverType` (rich-type-evidence.ts) returns `null` — no
 *     opinion — for any receiver shape it can't prove a type for, so an
 *     untyped / generic / call-result receiver is silently allowed through
 *     rather than misdiagnosed.
 *   - A `/* @client *\/` node is skipped entirely (its expression already
 *     opts out of SSR lowering), and a call a registered lowering plugin
 *     claims (`prepareLoweringMatchers`) is exempt — the seam #2274 and
 *     later plugins use to catalogue a rich-type API without touching this
 *     module.
 */

import type {
  IRNode,
  IRMetadata,
  CompilerError,
  SourceLocation,
  TypeInfo,
  AttrValue,
  IRTemplatePart,
} from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { parseExpression } from './expression-parser.ts'
import { prepareLoweringMatchers, type LoweringMatcher } from './lowering-registry.ts'
import { ErrorCodes } from './errors.ts'
import { resolveReceiverType, baseTypeName, HOST_RICH_TYPE_NAMES } from './rich-type-evidence.ts'

type Bindings = ReadonlyMap<string, TypeInfo | null>
const EMPTY_BINDINGS: Bindings = new Map()

/**
 * Walk `root` looking for a method call on a host rich-typed receiver with
 * no catalogued lowering, pushing BF021 into `errors` for each one found.
 * Mirrors `attachParsedExpressions`' tree coverage (jsx-to-ir.ts) so every
 * position that reaches a template gets checked, but reads `.parsed` rather
 * than attaching it, and additionally skips anything under `/* @client *\/`.
 */
export function checkRichTypeMethodCalls(root: IRNode, metadata: IRMetadata, errors: CompilerError[]): void {
  const matchers = prepareLoweringMatchers(metadata)
  const seen = new Set<string>()
  walkNode(root, metadata, EMPTY_BINDINGS, matchers, errors, seen)
}

function isLoweringClaimed(matchers: readonly LoweringMatcher[], callee: ParsedExpr, args: readonly ParsedExpr[]): boolean {
  return matchers.some((m) => m(callee, args) !== null)
}

/** Best-effort dotted-path text for the diagnostic message's `prop '<path>'`. */
function describeReceiverPath(expr: ParsedExpr): string {
  if (expr.kind === 'identifier') return expr.name
  if (expr.kind === 'member' && !expr.computed) return `${describeReceiverPath(expr.object)}.${expr.property}`
  return '<expression>'
}

function pushDiagnostic(
  errors: CompilerError[],
  seen: Set<string>,
  loc: SourceLocation,
  method: string,
  receiverPath: string,
  typeName: string,
): void {
  const key = `${loc.start.line}:${loc.start.column}:${method}`
  if (seen.has(key)) return
  seen.add(key)
  errors.push({
    code: ErrorCodes.UNSUPPORTED_JSX_PATTERN,
    severity: 'error',
    message: `Expression cannot be compiled to marked template: method '.${method}()' on prop '${receiverPath}' of host type '${typeName}' has no catalogued lowering.`,
    loc,
    suggestion: {
      message: 'Add /* @client */ to evaluate this expression on the client only, or pre-compute the value server-side.',
    },
  })
}

/**
 * Recurse a parsed expression tree, checking every `call` node along the way
 * and descending into every sub-expression (so a rich-type call nested
 * inside a larger expression — a template literal interpolation, an object
 * literal value, an arrow body, …) is still found. `bindings` carries local
 * type evidence (loop item / arrow param shadows) down into the recursion.
 */
function checkExpr(
  expr: ParsedExpr,
  loc: SourceLocation,
  meta: IRMetadata,
  bindings: Bindings,
  matchers: readonly LoweringMatcher[],
  errors: CompilerError[],
  seen: Set<string>,
): void {
  const recurse = (e: ParsedExpr, b: Bindings = bindings) => checkExpr(e, loc, meta, b, matchers, errors, seen)

  switch (expr.kind) {
    case 'call': {
      if (expr.callee.kind === 'member') {
        const receiverType = resolveReceiverType(expr.callee.object, meta, bindings)
        if (receiverType && receiverType.kind === 'interface') {
          const typeName = baseTypeName(receiverType.raw)
          const inFileShadow = meta.typeDefinitions.some((d) => d.name === typeName)
          if (HOST_RICH_TYPE_NAMES.has(typeName) && !inFileShadow && !isLoweringClaimed(matchers, expr.callee, expr.args)) {
            pushDiagnostic(errors, seen, loc, expr.callee.property, describeReceiverPath(expr.callee.object), typeName)
          }
        }
      }
      recurse(expr.callee)
      for (const arg of expr.args) recurse(arg)
      break
    }
    case 'member':
      recurse(expr.object)
      break
    case 'index-access':
      recurse(expr.object)
      recurse(expr.index)
      break
    case 'binary':
      recurse(expr.left)
      recurse(expr.right)
      break
    case 'unary':
      recurse(expr.argument)
      break
    case 'conditional':
      recurse(expr.test)
      recurse(expr.consequent)
      recurse(expr.alternate)
      break
    case 'logical':
      recurse(expr.left)
      recurse(expr.right)
      break
    case 'template-literal':
      for (const part of expr.parts) if (part.type === 'expression') recurse(part.expr)
      break
    case 'arrow': {
      const shadowed = new Map(bindings)
      for (const param of expr.params) shadowed.set(param, null)
      recurse(expr.body, shadowed)
      break
    }
    case 'array-literal':
      for (const el of expr.elements) recurse(el)
      break
    case 'object-literal':
      for (const prop of expr.properties) recurse(prop.value)
      break
    case 'array-method':
      recurse(expr.object)
      for (const arg of expr.args) recurse(arg)
      break
    case 'identifier':
    case 'literal':
    case 'regex':
    case 'unsupported':
      break
  }
}

/** `IRTemplatePart.ternary.condition` / `.lookup.key` carry no attached parse (unlike every other position here), so parse on demand. */
function walkTemplateParts(
  parts: readonly IRTemplatePart[],
  loc: SourceLocation,
  meta: IRMetadata,
  bindings: Bindings,
  matchers: readonly LoweringMatcher[],
  errors: CompilerError[],
  seen: Set<string>,
): void {
  for (const part of parts) {
    if (part.type === 'ternary') {
      const trimmed = part.condition.trim()
      if (trimmed) checkExpr(parseExpression(trimmed), loc, meta, bindings, matchers, errors, seen)
    } else if (part.type === 'lookup') {
      const trimmed = part.key.trim()
      if (trimmed) checkExpr(parseExpression(trimmed), loc, meta, bindings, matchers, errors, seen)
    }
  }
}

function walkAttrValue(
  value: AttrValue,
  clientOnly: boolean | undefined,
  loc: SourceLocation,
  meta: IRMetadata,
  bindings: Bindings,
  matchers: readonly LoweringMatcher[],
  errors: CompilerError[],
  seen: Set<string>,
): void {
  if (clientOnly) return
  if (value.kind === 'expression') {
    if (value.parsed) checkExpr(value.parsed, loc, meta, bindings, matchers, errors, seen)
    if (value.parts) walkTemplateParts(value.parts, loc, meta, bindings, matchers, errors, seen)
  } else if (value.kind === 'spread') {
    if (value.parsed) checkExpr(value.parsed, loc, meta, bindings, matchers, errors, seen)
  } else if (value.kind === 'template') {
    walkTemplateParts(value.parts, loc, meta, bindings, matchers, errors, seen)
  }
}

function walkNode(
  node: IRNode,
  meta: IRMetadata,
  bindings: Bindings,
  matchers: readonly LoweringMatcher[],
  errors: CompilerError[],
  seen: Set<string>,
): void {
  if (node.type === 'expression') {
    if (!node.clientOnly && node.parsed) checkExpr(node.parsed, node.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'conditional') {
    if (!node.clientOnly && node.parsedCondition) checkExpr(node.parsedCondition, node.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'if-statement') {
    if (node.parsedCondition) checkExpr(node.parsedCondition, node.loc, meta, bindings, matchers, errors, seen)
  }

  if (node.type === 'element') {
    for (const attr of node.attrs) walkAttrValue(attr.value, attr.clientOnly, node.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'component') {
    for (const prop of node.props) walkAttrValue(prop.value, prop.clientOnly, node.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'provider') {
    walkAttrValue(node.valueProp.value, node.valueProp.clientOnly, node.loc, meta, bindings, matchers, errors, seen)
  }

  switch (node.type) {
    case 'element':
    case 'component':
    case 'fragment':
    case 'provider':
      for (const child of node.children) walkNode(child, meta, bindings, matchers, errors, seen)
      break
    case 'async':
      walkNode(node.fallback, meta, bindings, matchers, errors, seen)
      for (const child of node.children) walkNode(child, meta, bindings, matchers, errors, seen)
      break
    case 'loop': {
      if (node.clientOnly) break
      if (node.arrayParsed) checkExpr(node.arrayParsed, node.loc, meta, bindings, matchers, errors, seen)
      const loopBindings = new Map(bindings)
      const arrayType = node.arrayParsed ? resolveReceiverType(node.arrayParsed, meta, bindings) : null
      loopBindings.set(node.param, arrayType?.kind === 'array' ? arrayType.elementType ?? null : null)
      if (node.index) loopBindings.set(node.index, null)
      for (const child of node.children) walkNode(child, meta, loopBindings, matchers, errors, seen)
      if (node.childComponent) {
        for (const child of node.childComponent.children) walkNode(child, meta, loopBindings, matchers, errors, seen)
      }
      for (const nested of node.nestedComponents ?? []) {
        for (const child of nested.children) walkNode(child, meta, loopBindings, matchers, errors, seen)
      }
      for (const frag of node.flatMapCallback?.fragments ?? []) {
        walkNode(frag.ir, meta, loopBindings, matchers, errors, seen)
      }
      break
    }
    case 'conditional':
      walkNode(node.whenTrue, meta, bindings, matchers, errors, seen)
      walkNode(node.whenFalse, meta, bindings, matchers, errors, seen)
      break
    case 'if-statement':
      walkNode(node.consequent, meta, bindings, matchers, errors, seen)
      if (node.alternate) walkNode(node.alternate, meta, bindings, matchers, errors, seen)
      break
  }
}
