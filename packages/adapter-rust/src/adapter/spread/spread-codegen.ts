/**
 * Object-literal / conditional-spread → Jinja dict lowering for the
 * minijinja template adapter.
 *
 * Near-verbatim port of
 * `packages/adapter-jinja/src/adapter/spread/spread-codegen.ts` (itself
 * ported from `packages/adapter-xslate/src/adapter/spread/spread-codegen.ts`).
 * Free functions taking a `JinjaSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the
 * recursive expression entry plus per-compile bookkeeping — rather than the
 * whole adapter class.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree (#2018) instead of re-parsing the source with
 * `ts.createSourceFile`. The condition and scalar values are threaded
 * straight into `ctx.convertExpressionToJinja` as its `preParsed` argument,
 * so no stringify→re-parse round-trip occurs. The `ts.factory` rebuild in
 * `recordIndexAccessToJinja` only reconstructs the `IDENT[KEY]` node the
 * shared `parseRecordIndexAccess` parser accepts; no source-text re-parse.
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { JinjaSpreadContext } from '../emit-context.ts'
import { escapeMinijinjaSingleQuoted, minijinjaHashKey, minijinjaIdent } from '../lib/minijinja-naming.ts'

/**
 * Lower a conditional inline-object spread
 *   `COND ? { 'aria-describedby': describedBy } : {}`
 * to a Jinja inline ternary of dicts
 *   `({'aria-describedby': describedBy} if bf.truthy(describedBy) else {})`.
 * Reads the IR-carried structured `ParsedExpr` tree; both branches must be
 * object literals; the condition + values route through
 * `convertExpressionToJinja`. Returns `null` for any other shape so the
 * caller falls back to its normal lowering.
 */
export function conditionalSpreadToJinja(
  ctx: JinjaSpreadContext,
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
  const condJinja = ctx.convertConditionToJinja('', expr.test)
  const trueJinja = objectLiteralToJinjaDict(ctx, whenTrue)
  const falseJinja = objectLiteralToJinjaDict(ctx, whenFalse)
  if (trueJinja === null || falseJinja === null) return null
  return `(${trueJinja} if ${condJinja} else ${falseJinja})`
}

/**
 * (#1971) Lower a bare object-literal expression (`{ align: 'start' }`),
 * carried as the IR's structured `ParsedExpr` tree, to a Jinja dict via
 * `objectLiteralToJinjaDict`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToJinjaDict(
  ctx: JinjaSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToJinjaDict(ctx, expr)
}

/**
 * Convert a static object literal into a Jinja dict string for a
 * conditional spread. Only static string/identifier keys are allowed; values
 * resolve via `convertExpressionToJinja` (or the `Record[propKey]` index
 * lowering). Returns `null` for any computed/spread/dynamic key. Empty
 * object → `{}`.
 */
export function objectLiteralToJinjaDict(
  ctx: JinjaSpreadContext,
  obj: Extract<ParsedExpr, { kind: 'object-literal' }>,
): string | null {
  const entries: string[] = []
  for (const prop of obj.properties) {
    // Shorthand `{ a }` was a `ShorthandPropertyAssignment` (not a
    // `PropertyAssignment`), so the former parser rejected it — keep refusing.
    if (prop.shorthand) return null
    // A numeric key (`{ 1: x }`) was rejected by the former parser (only
    // identifier / string-literal names were accepted); `keyKind`
    // distinguishes it from a same-text string `'1'` key.
    if (prop.keyKind === 'numeric') return null
    const key = prop.key
    const val = prop.value
    const indexed = recordIndexAccessToJinja(ctx, val)
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
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Jinja dict.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a \'use client\' component so hydration computes it.',
        },
      })
      return null
    }
    const valJinja =
      indexed !== null
        ? indexed
        // Thread the carried `val` tree straight through as `preParsed`
        // (#2018) — no stringify→re-parse round-trip.
        : ctx.convertExpressionToJinja('', val)
    entries.push(`${minijinjaHashKey(key)}: ${valJinja}`)
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
 * `sizeMap[size]`) to an inline indexed Jinja dict
 *   `{'sm': 16, 'md': 20, ...}[size]`.
 * Reuses the shared structural parse (`parseRecordIndexAccess`) — rebuilding
 * the `IDENT[KEY]` node from the carried tree via `ts.factory` rather than
 * re-parsing source text; this wrapper only does the single-quote escaping +
 * bracket-index emit. Jinja indexes a dict literal with the SAME bracket
 * syntax `{…}[key]` a JS object index would use — no Kolon-style divergence
 * to steer around here.
 */
export function recordIndexAccessToJinja(ctx: JinjaSpreadContext, val: ParsedExpr): string | null {
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
      e.value.kind === 'number' ? e.value.text : `'${escapeMinijinjaSingleQuoted(e.value.text)}'`
    return `${minijinjaHashKey(e.key)}: ${mapVal}`
  })
  return `{${entries.join(', ')}}[${minijinjaIdent(parsed.indexPropName)}]`
}
