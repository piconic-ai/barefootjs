/**
 * Object-literal / conditional-spread → Kolon hashref lowering for the
 * Text::Xslate template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `XslateSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the recursive
 * expression entry plus per-compile bookkeeping — rather than the whole
 * adapter class. Mirror of the Go / Mojo adapter's `spread/spread-codegen.ts`.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree (#2018, mirroring go-template's U5/U6) instead
 * of re-parsing the source with `ts.createSourceFile`. The condition and scalar
 * values are re-stringified with `stringifyParsedExpr` and routed back through
 * `ctx.convertExpressionToKolon`, which re-parses — so the emitted Kolon stays
 * byte-identical to the former AST-text path. The `ts.factory` rebuild in
 * `recordIndexAccessToKolon` only reconstructs the `IDENT[KEY]` node the shared
 * `parseRecordIndexAccess` parser accepts; no source-text re-parse.
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { XslateSpreadContext } from '../emit-context.ts'
import { escapeKolonSingleQuoted } from '../lib/kolon-naming.ts'

/**
 * Lower a conditional inline-object spread
 *   `COND ? { 'aria-describedby': describedBy } : {}`
 * to a Kolon inline ternary of hashrefs
 *   `$describedBy ? { 'aria-describedby' => $describedBy } : {}`.
 * Reads the IR-carried structured `ParsedExpr` tree; both branches must be
 * object literals; the condition + values route through
 * `convertExpressionToKolon`. Returns `null` for any other shape so the caller
 * falls back to its normal lowering. Mirror of `conditionalSpreadToPerl`.
 * `parseExpression` already strips redundant parentheses, so the conditional /
 * object-literal shapes surface directly.
 */
export function conditionalSpreadToKolon(
  ctx: XslateSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'conditional') return null
  const whenTrue = expr.consequent
  const whenFalse = expr.alternate
  if (whenTrue.kind !== 'object-literal' || whenFalse.kind !== 'object-literal') {
    return null
  }
  // TODO(#2018): round-trip — the condition's `ParsedExpr` is re-stringified
  // here and re-parsed inside `convertExpressionToKolon`. Retire once
  // `convertExpressionToKolon` takes a `preParsed?: ParsedExpr` (cf.
  // go-template's `convertExpressionToGo(jsExpr, out?, preParsed?)`), so the
  // carried tree threads straight through instead of stringify→re-parse.
  const condKolon = ctx.convertExpressionToKolon(stringifyParsedExpr(expr.test))
  const trueKolon = objectLiteralToKolonHashref(ctx, whenTrue)
  const falseKolon = objectLiteralToKolonHashref(ctx, whenFalse)
  if (trueKolon === null || falseKolon === null) return null
  return `${condKolon} ? ${trueKolon} : ${falseKolon}`
}

/**
 * (#1971 Perl) Lower a bare object-literal expression (`{ align: 'start' }`),
 * carried as the IR's structured `ParsedExpr` tree, to a Kolon hashref via
 * `objectLiteralToKolonHashref`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToKolonHashref(
  ctx: XslateSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToKolonHashref(ctx, expr)
}

/**
 * Convert a static object literal into a Kolon hashref string for a
 * conditional spread. Only static string/identifier keys are allowed; values
 * resolve via `convertExpressionToKolon` (or the `Record[propKey]` index
 * lowering). Returns `null` for any computed/spread/dynamic key. Empty object
 * → `{}`. Mirror of `objectLiteralToPerlHashref`.
 */
export function objectLiteralToKolonHashref(
  ctx: XslateSpreadContext,
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
    const indexed = recordIndexAccessToKolon(ctx, val)
    if (
      indexed === null &&
      val.kind === 'index-access' &&
      !isLiteralIndex(val.index)
    ) {
      // Variable-index record access (`sizeMap[size]`) the static-inline
      // path couldn't resolve (non-scalar value / non-const receiver).
      // Since #1897 made variable indices parseable (`index-access`),
      // the generic value lowering would emit `$sizeMap[$size]` against
      // an UNBOUND module const instead of refusing — record BF101 and
      // bail so the spread surfaces the out-of-shape diagnostic,
      // matching pre-#1897 behaviour. (Mirrors the Mojo adapter.)
      ctx.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Kolon hashref.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a `\'use client\'` component so hydration computes it.',
        },
      })
      return null
    }
    const valKolon =
      indexed !== null
        ? indexed
        // TODO(#2018): round-trip — re-stringify + re-parse via
        // `convertExpressionToKolon`. Thread the carried `val` tree directly once
        // `convertExpressionToKolon` gains a `preParsed?: ParsedExpr` param.
        : ctx.convertExpressionToKolon(stringifyParsedExpr(val))
    entries.push(`'${escapeKolonSingleQuoted(key)}' => ${valKolon}`)
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
 * Lower a spread-object VALUE of the form `IDENT[KEY]` (CheckIcon's
 * `sizeMap[size]`) to an inline indexed Kolon hashref
 *   `{ 'sm' => 16, 'md' => 20, ... }[$size]`.
 * Reuses the shared structural parse (`parseRecordIndexAccess`) — rebuilding
 * the `IDENT[KEY]` node from the carried tree via `ts.factory` rather than
 * re-parsing source text; this wrapper only does the single-quote escaping +
 * Kolon index emit. NB: Kolon indexes a hashref literal with bracket syntax
 * `{…}[$key]`, NOT Perl's arrow-deref `{…}->{$key}` (which Kolon's parser
 * rejects) — this is the one divergence from the Mojo `recordIndexAccessToPerl`
 * emit.
 */
export function recordIndexAccessToKolon(ctx: XslateSpreadContext, val: ParsedExpr): string | null {
  // The only shape `parseRecordIndexAccess` accepts is `IDENT[KEY]` with
  // identifier object and index, so rebuild exactly that node from the carried
  // tree via `ts.factory` — no source-text re-parse. Any other shape can't
  // match and short-circuits to `null` here.
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
      e.value.kind === 'number' ? e.value.text : `'${escapeKolonSingleQuoted(e.value.text)}'`
    return `'${escapeKolonSingleQuoted(e.key)}' => ${mapVal}`
  })
  return `{ ${entries.join(', ')} }[$${parsed.indexPropName}]`
}
