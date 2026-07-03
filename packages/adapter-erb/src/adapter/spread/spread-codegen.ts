/**
 * Object-literal / conditional-spread → Ruby Hash lowering for the ERB
 * template adapter.
 *
 * Ported from the Mojolicious adapter's `spread/spread-codegen.ts` (issue
 * #2018 track D lineage). Free functions taking an `ErbSpreadContext` (built
 * by the adapter's `spreadCtx` getter) so the cluster depends on the narrow
 * seam — the recursive expression entry plus per-compile bookkeeping —
 * rather than the whole adapter class. Mirror of the Go adapter's
 * `spread/spread-codegen.ts`.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree instead of re-parsing the source with
 * `ts.createSourceFile`. The condition and scalar values are threaded
 * straight into `ctx.convertExpressionToRuby` as its `preParsed` argument
 * (cf. go-template's `convertExpressionToGo(jsExpr, out?, preParsed?)`), so
 * no stringify→re-parse round-trip occurs. The `ts.factory` rebuild in
 * `recordIndexAccessToRuby` only reconstructs the `IDENT[KEY]` node the
 * shared `parseRecordIndexAccess` parser accepts; no source-text re-parse.
 * `stringifyParsedExpr` is retained solely for the BF101 diagnostic message
 * (display purposes).
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { ErbSpreadContext } from '../emit-context.ts'
import { rubySymbolKey, escapeRubySingleQuoted } from '../lib/ruby-naming.ts'

/**
 * Lower a `cond ? {…} : {…}` conditional-spread expression — carried as the
 * IR's structured `ParsedExpr` tree — to a Ruby ternary over two Hashes, or
 * null when it isn't that shape. `parseExpression` already strips redundant
 * parentheses, so the conditional / object-literal shapes surface directly.
 */
export function conditionalSpreadToRuby(
  ctx: ErbSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'conditional') return null
  const whenTrue = expr.consequent
  const whenFalse = expr.alternate
  if (whenTrue.kind !== 'object-literal' || whenFalse.kind !== 'object-literal') {
    return null
  }
  // Thread the condition's carried `ParsedExpr` tree straight through as
  // `preParsed` — no stringify→re-parse round-trip; `convertExpressionToRuby`
  // uses the tree directly and derives any diagnostic text from it.
  const condRuby = ctx.convertExpressionToRuby('', expr.test)
  const trueRuby = objectLiteralToRubyHash(ctx, whenTrue)
  const falseRuby = objectLiteralToRubyHash(ctx, whenFalse)
  if (trueRuby === null || falseRuby === null) return null
  // JS ternary tests JS truthiness — wrap, mirroring the top-level emitter's
  // `conditional()`.
  return `(bf.truthy?(${condRuby}) ? ${trueRuby} : ${falseRuby})`
}

/**
 * Lower a bare object-literal expression (`{ align: 'start' }`), carried as
 * the IR's structured `ParsedExpr` tree, to a Ruby Hash via
 * `objectLiteralToRubyHash`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToRubyHash(
  ctx: ErbSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToRubyHash(ctx, expr)
}

/**
 * Convert a static object literal into a Ruby Hash string for a conditional
 * spread. Only static string/identifier keys are allowed; values resolve
 * via `convertExpressionToRuby`. Returns null for any computed/spread/
 * dynamic key. Empty object → `{}`.
 */
export function objectLiteralToRubyHash(
  ctx: ErbSpreadContext,
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
    const indexed = recordIndexAccessToRuby(ctx, val)
    if (
      indexed === null &&
      val.kind === 'index-access' &&
      !isLiteralIndex(val.index)
    ) {
      // Variable-index record access (`sizeMap[size]`) that the
      // static-inline path couldn't resolve — a non-scalar record value,
      // or a non-const receiver. Record BF101 and bail so the whole spread
      // surfaces the out-of-shape diagnostic.
      ctx.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Ruby Hash.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a \'use client\' component so hydration computes it.',
        },
      })
      return null
    }
    const valRuby =
      indexed !== null
        ? indexed
        // Thread the carried `val` tree straight through as `preParsed` —
        // no stringify→re-parse round-trip.
        : ctx.convertExpressionToRuby('', val)
    entries.push(`${rubySymbolKey(key)} ${valRuby}`)
  }
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
}

/** True when a parsed index is a numeric or string literal (`arr[0]`, `m['k']`). */
function isLiteralIndex(index: ParsedExpr): boolean {
  return (
    index.kind === 'literal' &&
    (index.literalType === 'number' || index.literalType === 'string')
  )
}

/**
 * Lower a spread-object VALUE of the form `IDENT[KEY]` where:
 *   - `IDENT` resolves via `localConstants` to a MODULE-scope object
 *     literal whose property values are all scalar (number/string)
 *     literals under static (string-literal or identifier) keys
 *     (a `Record<staticKeys, scalar>` map like `sizeMap`), AND
 *   - `KEY` is a bare identifier that is a prop.
 * Emits an inline indexed Ruby Hash:
 *   `{ sm: 16, md: 20 }[v[:size].to_sym]`
 *
 * Returns the Ruby string when convertible, else `null` so the caller falls
 * back to its normal value lowering (which records BF101 for an unsupported
 * shape). Mirror of the Go adapter's `recordIndexAccessToGoMap`.
 */
export function recordIndexAccessToRuby(ctx: ErbSpreadContext, val: ParsedExpr): string | null {
  // `parseRecordIndexAccess` (the shared single-source-of-truth parser) takes a
  // `ts.Expression`. The only shape it accepts is `IDENT[KEY]` with identifier
  // object and index, so rebuild exactly that node from the carried tree via
  // `ts.factory` — no source-text re-parse needed. Any other shape can't match
  // and short-circuits to `null` here.
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
  // Shared structural parse (single source of truth in `@barefootjs/jsx`);
  // this wrapper only does the Ruby-specific emit (Hash literal + symbol
  // key access) from the structured result.
  const parsed = parseRecordIndexAccess(tsVal, ctx.localConstants, ctx.propsParams)
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal =
      e.value.kind === 'number' ? e.value.text : `'${escapeRubySingleQuoted(e.value.text)}'`
    return `${rubySymbolKey(e.key)} ${mapVal}`
  })
  return `{ ${entries.join(', ')} }[v[:${parsed.indexPropName}].to_sym]`
}
