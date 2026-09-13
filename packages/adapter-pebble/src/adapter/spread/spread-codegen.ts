/**
 * Object-literal / conditional-spread → Pebble dict lowering for the Pebble
 * template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/spread/spread-codegen.ts`.
 * Free functions taking a `PebbleSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the
 * recursive expression entry plus per-compile bookkeeping — rather than the
 * whole adapter class.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree (#2018) instead of re-parsing the source with
 * `ts.createSourceFile`. The condition and scalar values are threaded
 * straight into `ctx.convertExpressionToPebble` as its `preParsed` argument,
 * so no stringify→re-parse round-trip occurs. The `ts.factory` rebuild in
 * `recordIndexAccessToPebble` only reconstructs the `IDENT[KEY]` node the
 * shared `parseRecordIndexAccess` parser accepts; no source-text re-parse.
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { PebbleSpreadContext } from '../emit-context.ts'
import { escapePebbleSingleQuoted, pebbleHashKey, pebbleIdent } from '../lib/pebble-naming.ts'

/**
 * Lower a conditional inline-object spread
 *   `COND ? { 'aria-describedby': describedBy } : {}`
 * to a Pebble inline ternary of maps
 *   `(bf.truthy(describedBy) ? {'aria-describedby': describedBy} : {})`.
 * Reads the IR-carried structured `ParsedExpr` tree; both branches must be
 * object literals; the condition + values route through
 * `convertExpressionToPebble`. Returns `null` for any other shape so the
 * caller falls back to its normal lowering. Uses Pebble's own symbolic
 * `(test ? a : b)` ternary (confirmed syntax — see `pebble-adapter.ts`'s
 * file header), not Jinja's word-based `(a if test else b)` form.
 */
export function conditionalSpreadToPebble(
  ctx: PebbleSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'conditional') return null
  const whenTrue = expr.consequent
  const whenFalse = expr.alternate
  if (whenTrue.kind !== 'object-literal' || whenFalse.kind !== 'object-literal') {
    return null
  }
  // Thread the condition's carried `ParsedExpr` tree straight through as
  // `preParsed` (#2018) — no stringify→re-parse round-trip.
  const condPebble = ctx.convertConditionToPebble('', expr.test)
  const truePebble = objectLiteralToPebbleDict(ctx, whenTrue)
  const falsePebble = objectLiteralToPebbleDict(ctx, whenFalse)
  if (truePebble === null || falsePebble === null) return null
  return `(${condPebble} ? ${truePebble} : ${falsePebble})`
}

/**
 * (#1971) Lower a bare object-literal expression (`{ align: 'start' }`),
 * carried as the IR's structured `ParsedExpr` tree, to a Pebble dict via
 * `objectLiteralToPebbleDict`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToPebbleDict(
  ctx: PebbleSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToPebbleDict(ctx, expr)
}

/**
 * Convert a static object literal into a Pebble dict string for a
 * conditional spread. Only static string/identifier keys are allowed; values
 * resolve via `convertExpressionToPebble` (or the `Record[propKey]` index
 * lowering). Returns `null` for any computed/spread/dynamic key. Empty
 * object → `{}`.
 */
export function objectLiteralToPebbleDict(
  ctx: PebbleSpreadContext,
  obj: Extract<ParsedExpr, { kind: 'object-literal' }>,
): string | null {
  const entries: string[] = []
  for (const prop of obj.properties) {
    // A spread (`{ ...t }`, #2696 Step 2) isn't a per-key entry this
    // conditional-spread inline lowering can express — bail, same as any
    // other unsupported shape (the caller falls back to the generic path).
    if (prop.kind === 'spread') return null
    // Shorthand `{ a }` was a `ShorthandPropertyAssignment` (not a
    // `PropertyAssignment`), so the former parser rejected it — keep refusing.
    if (prop.shorthand) return null
    // A numeric key (`{ 1: x }`) was rejected by the former parser (only
    // identifier / string-literal names were accepted); `keyKind`
    // distinguishes it from a same-text string `'1'` key.
    if (prop.keyKind === 'numeric') return null
    const key = prop.key
    const val = prop.value
    const indexed = recordIndexAccessToPebble(ctx, val)
    if (
      indexed === null &&
      val.kind === 'index-access' &&
      !isLiteralIndex(val.index)
    ) {
      // Variable-index record access (`sizeMap[size]`) the static-inline
      // path couldn't resolve (non-scalar value / non-const receiver).
      // Record BF101 and bail so the spread surfaces the out-of-shape
      // diagnostic, matching the Kolon port.
      ctx.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Pebble dict.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a \'use client\' component so hydration computes it.',
        },
      })
      return null
    }
    const valPebble =
      indexed !== null
        ? indexed
        // Thread the carried `val` tree straight through as `preParsed`
        // (#2018) — no stringify→re-parse round-trip.
        : ctx.convertExpressionToPebble('', val)
    entries.push(`${pebbleHashKey(key)}: ${valPebble}`)
  }
  return entries.length === 0 ? '{}' : `{${entries.join(', ')}}`
}

/** True when a parsed index is a numeric or string literal (`arr[0]`, `m['k']`). */
function isLiteralIndex(index: ParsedExpr): boolean {
  return (
    index.kind === 'literal' &&
    (index.literalType === 'number' || index.literalType === 'string')
  )
}

/**
 * Lower a spread-object VALUE of the form `IDENT[KEY]` (CheckIcon's
 * `sizeMap[size]`) to an inline indexed Pebble dict
 *   `{'sm': 16, 'md': 20, ...}[size]`.
 * Reuses the shared structural parse (`parseRecordIndexAccess`) — rebuilding
 * the `IDENT[KEY]` node from the carried tree via `ts.factory` rather than
 * re-parsing source text; this wrapper only does the single-quote escaping +
 * bracket-index emit. Assumes Pebble indexes a map LITERAL with the SAME
 * bracket syntax `{…}[key]` a JS object index would use (confirmed for Twig
 * empirically; Pebble's map-literal + subscript combination is a Phase 3/4
 * verification point once the Java runtime exists, tracked alongside this
 * file's other watchpoints).
 */
export function recordIndexAccessToPebble(ctx: PebbleSpreadContext, val: ParsedExpr): string | null {
  // The only shape `parseRecordIndexAccess` accepts is `IDENT[KEY]` with
  // identifier object and index, so rebuild exactly that node from the
  // carried tree via `ts.factory` — no source-text re-parse.
  if (
    val.kind !== 'index-access' ||
    val.object.kind !== 'identifier' ||
    val.index.kind !== 'identifier'
  ) {
    return null
  }
  const tsVal = ts.factory.createElementAccessExpression(
    ts.factory.createIdentifier(val.object.name),
    ts.factory.createIdentifier(val.index.name),
  )
  const parsed = parseRecordIndexAccess(tsVal, ctx.localConstants ?? [], ctx.propsParams)
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal =
      e.value.kind === 'number' ? e.value.text : `'${escapePebbleSingleQuoted(e.value.text)}'`
    return `${pebbleHashKey(e.key)}: ${mapVal}`
  })
  return `{${entries.join(', ')}}[${pebbleIdent(parsed.indexPropName)}]`
}
