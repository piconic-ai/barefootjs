/**
 * Rich-type refusals: two sibling checks over a prop typed as a built-in
 * "host rich type" (`Date`, `Map`, …), for the two distinct ways such a
 * value breaks that have nothing to do with each other structurally.
 *
 * `checkRichTypeMethodCalls` (#2273, BF021): a METHOD CALL on the receiver
 * has no catalogued lowering — no adapter can emit `.toISOString()` into a
 * template. Left unchecked, such a call transliterates into the target
 * template's own dot-call syntax and dies at request time (a Go template
 * `.CreatedAt.ToISOString` panic, a Jinja `AttributeError`, …), once per
 * adapter, only once someone renders the page. This module makes that gap
 * loud at compile time instead: `checkRichTypeMethodCalls` walks every
 * expression position the compiler already treats as template-lowered and
 * pushes BF021 for any call this build has no evidence a lowering plugin
 * (or `/* @client *\/`) will handle.
 *
 * `checkRichTypePropSerialization` (#2643, BF049): a rich-typed prop is used
 * anywhere in this component's own CLIENT code (a handler, an effect) —
 * regardless of whether a method is ever called on it. `checkRichTypeMethodCalls`
 * only walks expression positions reachable through template lowering (JSX
 * text/attribute positions rendered at SSR); a handler or effect body is a
 * different code path it never analyzes, so even a method call there (e.g.
 * `data.get(...)` inside an `onClick`) is just as invisible to it as a bare
 * read. Either way the prop still crosses the `bf-p` hydration boundary as
 * JSON: it arrives de-riched (`Map`/`Set` → `{}`) or fails to serialize
 * (`BigInt` throws at SSR render). See that function's own doc for
 * why this is metadata-driven rather than an IR walk.
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
 *
 * Every receiver this module can prove a type for is rooted at `propsType`
 * (`resolveReceiverType` only resolves a bare prop, a `props.x` chain, or a
 * loop item of a prop array) — so it always crosses the `bf-p` hydration
 * boundary as JSON. That means `/* @client *\/`, the escape this module used
 * to recommend unconditionally, is UNSOUND on its own: the receiver arrives
 * de-riched (a `Date` prop as an ISO string, a `Map`/`Set` as `{}`), so the
 * spliced call throws or silently misbehaves at hydrate (#2636).
 * `buildSuggestion` never offers a bare `/* @client *\/` for this reason —
 * only a pre-compute-server-side escape (sound for every host rich type)
 * and, for `Date`/`URL` only, a `/* @client *\/` block that explicitly
 * revives the receiver first (`new Date(createdAt)...`), since those two
 * types' `toJSON()` output round-trips through their own constructor.
 */

import type {
  IRNode,
  IRMetadata,
  CompilerError,
  SourceLocation,
  TypeInfo,
  AttrValue,
  IRTemplatePart,
  EscapeKind,
} from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { parseExpression } from './expression-parser.ts'
import { prepareLoweringMatchers, type LoweringMatcher } from './lowering-registry.ts'
import { ErrorCodes } from './errors.ts'
import {
  resolveReceiverType,
  baseTypeName,
  HOST_RICH_TYPE_NAMES,
  JSON_REVIVABLE_RICH_TYPE_NAMES,
  resolvePropDeclaredType,
  jsonUnsafeTypeName,
} from './rich-type-evidence.ts'

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
  // Every evidence chain roots at propsType (bare prop, props.x, loop item of
  // a prop array) — with no props type there is nothing to prove, so skip the
  // walk (and the matcher preparation / on-demand template-part parses).
  if (!metadata.propsType) return
  const matchers = prepareLoweringMatchers(metadata)
  const seen = new Set<string>()
  walkNode(root, metadata, EMPTY_BINDINGS, matchers, errors, seen)
}

/**
 * BF049 (#2643): flag a prop typed as a JSON-unsafe host rich type
 * (`Map`, `Set`, `BigInt`, …) that this component's own client code reads —
 * regardless of whether a method is ever called on it, since
 * `checkRichTypeMethodCalls` only walks template-lowered expression
 * positions and never sees a handler/effect body either way. The prop still
 * crosses the `bf-p` hydration boundary as JSON: it arrives de-riched
 * (`Map`/`Set` → `{}`, every entry silently
 * dropped) or fails to serialize at all (`BigInt` throws `TypeError` at SSR
 * render, killing the whole page).
 *
 * Metadata-driven, not an IR walk — the fire condition is "this prop WILL BE
 * SERIALIZED into bf-p", which is exactly what `ir.metadata.clientAnalysis`
 * (`analyzeClientNeeds`) already decided, and what every adapter's own
 * prop-serialization step (e.g. Hono's `propsToSerialize` filter in
 * `hono-adapter.ts`) reads off the SAME metadata. Mirroring that filter here
 * — rather than re-walking JSX attribute positions — means this check fires
 * in lockstep with what actually gets serialized, on every adapter, without
 * duplicating per-adapter serialization logic into the compiler.
 */
export function checkRichTypePropSerialization(root: IRNode, metadata: IRMetadata, errors: CompilerError[], declLoc?: SourceLocation): void {
  if (!metadata.propsType || !metadata.clientAnalysis?.needsInit) return
  const usedProps = new Set(metadata.clientAnalysis.usedProps)
  const loc = declLoc ?? root.loc
  for (const param of metadata.propsParams) {
    if (param.isRest || param.name.startsWith('on') || param.name.startsWith('__')) continue
    if (!usedProps.has(param.name)) continue
    const declared = resolvePropDeclaredType(param.sourceName ?? param.name, metadata)
    const typeName = jsonUnsafeTypeName(declared)
    if (!typeName) continue
    // In-file shadow guard, mirroring `checkExpr`'s identical check for the
    // method-call refusal — a local `interface Map { … }` wins.
    if (metadata.typeDefinitions.some((d) => d.name === typeName)) continue
    pushPropSerializationDiagnostic(errors, loc, param.name, typeName, declared!.raw)
  }
}

function pushPropSerializationDiagnostic(
  errors: CompilerError[],
  loc: SourceLocation,
  propName: string,
  typeName: string,
  declaredRaw: string,
): void {
  const consequence =
    typeName === 'bigint' || typeName === 'BigInt'
      ? "JSON.stringify throws at SSR render ('Do not know how to serialize a BigInt'), failing the whole page"
      : typeName === 'symbol' || typeName === 'Symbol' || typeName === 'Function'
        ? 'JSON.stringify drops the value entirely, so the client reads undefined at hydrate'
        : 'it serializes de-riched (e.g. a Map or Set becomes {} with every entry silently dropped), so the client hydrates against corrupt data'
  errors.push({
    code: ErrorCodes.RICH_TYPE_PROP_NOT_HYDRATABLE,
    severity: 'error',
    message: `Prop '${propName}' is typed '${declaredRaw}' and is read by this component's own client code, so it must cross the bf-p hydration boundary as JSON — and ${typeName} cannot: ${consequence}.`,
    loc,
    suggestion: {
      message:
        'Pre-compute a JSON-serializable value server-side — a string, number, boolean, array, or plain object ' +
        '(e.g. pass [...map.entries()] and rebuild the Map client-side where needed) — and pass that as the prop ' +
        'instead. /* @client */ is NOT an escape here: the prop still crosses the bf-p boundary as JSON and arrives ' +
        'de-riched (#2636).',
      escape: [{ kind: 'prop-precompute' }],
    },
  })
}

function isLoweringClaimed(matchers: readonly LoweringMatcher[], callee: ParsedExpr, args: readonly ParsedExpr[]): boolean {
  return matchers.some((m) => m(callee, args) !== null)
}

/** Best-effort dotted-path text for the diagnostic message's receiver description. */
function describeReceiverPath(expr: ParsedExpr): string {
  if (expr.kind === 'identifier') return expr.name
  if (expr.kind === 'member' && !expr.computed) return `${describeReceiverPath(expr.object)}.${expr.property}`
  return '<expression>'
}

/**
 * Whether the receiver path roots at a prop (bare destructured prop or a
 * `props.x` chain) rather than a locally-bound name (loop item, arrow param).
 * Decides whether the diagnostic may call the receiver a "prop" — a loop
 * item's `i.at` is prop-DERIVED but not itself a prop, and naming it one
 * would misdirect the fix toward the props type.
 */
function receiverRootIsProp(expr: ParsedExpr, bindings: Bindings): boolean {
  let root = expr
  while (root.kind === 'member' && !root.computed) root = root.object
  return root.kind === 'identifier' && !bindings.has(root.name)
}

/**
 * Build this refusal's escape suggestion (#2636).
 *
 * Every receiver `checkRichTypeMethodCalls` can flag is prop-rooted (see the
 * module docstring's `resolveReceiverType` note), so it crosses the `bf-p`
 * hydration boundary as JSON with no type-aware revival — a bare
 * `/* @client *\/` recommendation is unsound for ALL of them: the receiver
 * arrives at hydrate de-riched (a `Date` prop as its ISO string, a `Map`/`Set`
 * as `{}`), so the spliced-verbatim call throws or silently misbehaves. This
 * function therefore never recommends a bare `/* @client *\/`. Two real
 * escapes exist instead:
 *   - Pre-compute server-side and pass the result as an already-serializable
 *     prop — sound for every host rich type, always offered first
 *     (`ssrCost: 'none'` before `'client-render'`, per `ErrorSuggestion`).
 *   - For `Date` / `URL` only (`JSON_REVIVABLE_RICH_TYPE_NAMES`), a
 *     `/* @client *\/` block that explicitly REVIVES the receiver —
 *     `new Date(createdAt).getUTCFullYear()` — is genuinely hydrate-safe,
 *     because both types' `toJSON()` output round-trips through their own
 *     one-arg constructor. Every other host rich type has no such escape:
 *     the suggestion says so, rather than staying silent about it.
 */
function buildSuggestion(
  method: string,
  receiverPath: string,
  receiver: string,
  typeName: string,
): { message: string; escape: ReadonlyArray<{ kind: EscapeKind }> } {
  const revivalExpr =
    receiverPath === '<expression>'
      ? `wrapping the receiver in new ${typeName}(...) before calling .${method}()`
      : `{/* @client */ new ${typeName}(${receiverPath}).${method}(...)}`
  const revivalReason = `a bare /* @client */ crashes at hydrate because ${receiver} crosses the bf-p boundary as JSON and arrives as a plain string, not a ${typeName} instance (#2636)`

  // `toLocaleDateString` has a catalogued explicit-input form (#2324 slice
  // 2) — point the fix at it instead of the generic escape hatches alone.
  // The implicit-environment forms (zero-arg, locale-only, non-literal
  // locale, an unverifiable timeZone literal) stay refused by design;
  // canonical IANA zone literals compile since #2344.
  if (method === 'toLocaleDateString' && typeName === 'Date') {
    return {
      message:
        "Pass a literal locale and an explicit literal timeZone — .toLocaleDateString('ja-JP', { timeZone: 'UTC' }), a fixed '±HH:MM' offset, or a canonical IANA zone ID like 'Asia/Tokyo' (exact case; #2344) — to compile it to the format_date helper; for a runtime locale, resolve the pattern in your i18n layer and use formatDate(date, pattern, tz) from @barefootjs/client. " +
        `Alternatively pre-compute server-side, or evaluate client-only by ${revivalExpr} — ${revivalReason}.`,
      escape: [{ kind: 'rewrite' }, { kind: 'prop-precompute' }, { kind: 'client-directive' }],
    }
  }

  if (JSON_REVIVABLE_RICH_TYPE_NAMES.has(typeName)) {
    return {
      message: `Pre-compute the value server-side and pass it as a prop. Alternatively, evaluate client-only by ${revivalExpr} — ${revivalReason}.`,
      escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
    }
  }

  return {
    message:
      `Pre-compute the value server-side and pass the result — a string, number, array, or plain object — as a prop. ` +
      `/* @client */ is NOT a safe escape here: ${receiver} cannot cross the bf-p hydration boundary as JSON — it arrives de-riched ` +
      `(e.g. a Map or Set serializes to {}), so the call throws or silently returns the wrong result at hydrate (#2636).`,
    escape: [{ kind: 'prop-precompute' }],
  }
}

function pushDiagnostic(
  errors: CompilerError[],
  seen: Set<string>,
  loc: SourceLocation,
  method: string,
  receiverPath: string,
  isProp: boolean,
  typeName: string,
): void {
  const key = `${loc.start.line}:${loc.start.column}:${receiverPath}.${method}`
  if (seen.has(key)) return
  seen.add(key)
  const receiver = isProp ? `prop '${receiverPath}'` : `'${receiverPath}'`
  const suggestion = buildSuggestion(method, receiverPath, receiver, typeName)
  errors.push({
    code: ErrorCodes.UNSUPPORTED_JSX_PATTERN,
    severity: 'error',
    message: `Expression cannot be compiled to marked template: method '.${method}()' on ${receiver} of host type '${typeName}' has no catalogued lowering.`,
    loc,
    suggestion,
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
            pushDiagnostic(
              errors,
              seen,
              loc,
              expr.callee.property,
              describeReceiverPath(expr.callee.object),
              receiverRootIsProp(expr.callee.object, bindings),
              typeName,
            )
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
      for (const prop of expr.properties) recurse(prop.kind === 'spread' ? prop.expr : prop.value)
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
    for (const attr of node.attrs) walkAttrValue(attr.value, attr.clientOnly, attr.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'component') {
    for (const prop of node.props) walkAttrValue(prop.value, prop.clientOnly, prop.loc, meta, bindings, matchers, errors, seen)
  } else if (node.type === 'provider') {
    walkAttrValue(node.valueProp.value, node.valueProp.clientOnly, node.valueProp.loc, meta, bindings, matchers, errors, seen)
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
      for (const seg of node.flatMapCallback?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, meta, loopBindings, matchers, errors, seen)
      }
      // Preamble leaves (array-builder bodies) are nested IR the same way.
      for (const seg of node.preamble?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, meta, loopBindings, matchers, errors, seen)
      }
      break
    }
    case 'conditional':
      // A clientOnly conditional's branches never reach any template (the
      // whole expression defers to hydrate), so walking them would flag calls
      // whose own suggested remediation — /* @client */ — is already applied.
      if (node.clientOnly) break
      walkNode(node.whenTrue, meta, bindings, matchers, errors, seen)
      walkNode(node.whenFalse, meta, bindings, matchers, errors, seen)
      break
    case 'if-statement':
      walkNode(node.consequent, meta, bindings, matchers, errors, seen)
      if (node.alternate) walkNode(node.alternate, meta, bindings, matchers, errors, seen)
      break
  }
}
