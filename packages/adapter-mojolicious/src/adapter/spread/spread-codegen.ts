/**
 * Object-literal / conditional-spread → Perl hashref lowering for the
 * Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `MojoSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the recursive
 * expression entry plus per-compile bookkeeping — rather than the whole
 * adapter class. Mirror of the Go adapter's `spread/spread-codegen.ts`.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree (#2018, mirroring go-template's U5/U6) instead
 * of re-parsing the source with `ts.createSourceFile`. The condition and scalar
 * values are threaded straight into `ctx.convertExpressionToPerl` as its
 * `preParsed` argument (cf. go-template's
 * `convertExpressionToGo(jsExpr, out?, preParsed?)`), so no stringify→re-parse
 * round-trip occurs — the emitted Perl is byte-identical to the former path
 * because the carried tree is exactly what re-parsing the stringified text
 * produced. The `ts.factory` rebuild in `recordIndexAccessToPerl` only
 * reconstructs the `IDENT[KEY]` node the shared `parseRecordIndexAccess` parser
 * accepts; no source-text re-parse. `stringifyParsedExpr` is retained solely for
 * the BF101 diagnostic message (display purposes).
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { MojoSpreadContext } from '../emit-context.ts'

/**
 * Lower a `cond ? {…} : {…}` conditional-spread expression — carried as the
 * IR's structured `ParsedExpr` tree — to a Perl ternary over two hashrefs, or
 * null when it isn't that shape. `parseExpression` already strips redundant
 * parentheses, so the conditional / object-literal shapes surface directly.
 */
export function conditionalSpreadToPerl(
  ctx: MojoSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'conditional') return null
  const whenTrue = expr.consequent
  const whenFalse = expr.alternate
  if (whenTrue.kind !== 'object-literal' || whenFalse.kind !== 'object-literal') {
    return null
  }
  // Thread the condition's carried `ParsedExpr` tree straight through as
  // `preParsed` (#2018) — no stringify→re-parse round-trip; `convertExpressionToPerl`
  // uses the tree directly and derives any diagnostic text from it.
  const condPerl = ctx.convertExpressionToPerl('', expr.test)
  const truePerl = objectLiteralToPerlHashref(ctx, whenTrue)
  const falsePerl = objectLiteralToPerlHashref(ctx, whenFalse)
  if (truePerl === null || falsePerl === null) return null
  return `${condPerl} ? ${truePerl} : ${falsePerl}`
}

/**
 * (#1971 Perl) Lower a bare object-literal expression (`{ align: 'start' }`),
 * carried as the IR's structured `ParsedExpr` tree, to a Perl hashref via
 * `objectLiteralToPerlHashref`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToPerlHashref(
  ctx: MojoSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToPerlHashref(ctx, expr)
}

/**
 * Convert a static object literal into a Perl hashref string for a
 * conditional spread. Only static string/identifier keys are allowed;
 * values resolve via `convertExpressionToPerl`. Returns null for any
 * computed/spread/dynamic key. Empty object → `{}`.
 */
export function objectLiteralToPerlHashref(
  ctx: MojoSpreadContext,
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
    const indexed = recordIndexAccessToPerl(ctx, val)
    if (
      indexed === null &&
      val.kind === 'index-access' &&
      !isLiteralIndex(val.index)
    ) {
      // Variable-index record access (`sizeMap[size]`) that the
      // static-inline path couldn't resolve — a non-scalar record
      // value, or a non-const receiver. Since #1897 made variable
      // indices parseable (`index-access`), the generic value lowering
      // would now emit `$sizeMap->{$size}` against an UNBOUND module
      // const instead of refusing. Record BF101 and bail so the whole
      // spread surfaces the out-of-shape diagnostic, matching the
      // pre-#1897 behaviour (the refusal then was a side effect of the
      // value lowering). (A bound receiver — a signal getter like
      // `selected()[index]` — is an attribute value, not a spread
      // member, and never reaches here.)
      ctx.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Perl hashref.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a `\'use client\'` component so hydration computes it.',
        },
      })
      return null
    }
    const valPerl =
      indexed !== null
        ? indexed
        // Thread the carried `val` tree straight through as `preParsed` (#2018)
        // — no stringify→re-parse round-trip.
        : ctx.convertExpressionToPerl('', val)
    entries.push(`'${key.replace(/'/g, "\\'")}' => ${valPerl}`)
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
 * Emits an inline indexed Perl hashref:
 *   `{ 'sm' => 16, 'md' => 20, ... }->{$size}`
 *
 * Returns the Perl string when convertible, else `null` so the caller
 * falls back to its normal value lowering (which records BF101 for an
 * unsupported shape). Mirror of the Go adapter's `recordIndexAccessToGoMap`.
 */
export function recordIndexAccessToPerl(ctx: MojoSpreadContext, val: ParsedExpr): string | null {
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
  // this wrapper only does the Perl-specific emit (single-quote escaping)
  // from the structured result.
  const parsed = parseRecordIndexAccess(tsVal, ctx.localConstants, ctx.propsParams)
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal =
      e.value.kind === 'number' ? e.value.text : `'${e.value.text.replace(/'/g, "\\'")}'`
    return `'${e.key.replace(/'/g, "\\'")}' => ${mapVal}`
  })
  return `{ ${entries.join(', ')} }->{$${parsed.indexPropName}}`
}
