/**
 * Object-literal / conditional-spread → Blade hash lowering for the Blade
 * template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/spread/spread-codegen.ts`.
 * Free functions taking a `BladeSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the
 * recursive expression entry plus per-compile bookkeeping — rather than the
 * whole adapter class.
 *
 * The conditional-spread / object-literal entries read the IR-carried
 * structured `ParsedExpr` tree (#2018) instead of re-parsing the source with
 * `ts.createSourceFile`. The condition and scalar values are threaded
 * straight into `ctx.convertExpressionToBlade` as its `preParsed` argument,
 * so no stringify→re-parse round-trip occurs. The `ts.factory` rebuild in
 * `recordIndexAccessToBlade` only reconstructs the `IDENT[KEY]` node the
 * shared `parseRecordIndexAccess` parser accepts; no source-text re-parse.
 *
 * Twig→Blade divergence: a Twig hash literal `{'k': v}` becomes a PHP array
 * literal `['k' => v]` (mapping table) — `'key' => value` entries joined by
 * `, `, wrapped in `[...]`, never `{...}`. Empty hash is `[]`, not `{}`.
 */

import ts from 'typescript'
import { parseRecordIndexAccess, stringifyParsedExpr } from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'

import type { BladeSpreadContext } from '../emit-context.ts'
import { escapeBladeSingleQuoted, bladeHashKey, bladeVar } from '../lib/blade-naming.ts'

/**
 * Lower a conditional inline-object spread
 *   `COND ? { 'aria-describedby': describedBy } : {}`
 * to a Blade inline ternary of PHP arrays
 *   `($bf->truthy($describedBy) ? ['aria-describedby' => $describedBy] : [])`.
 * Reads the IR-carried structured `ParsedExpr` tree; both branches must be
 * object literals; the condition + values route through
 * `convertExpressionToBlade`. Returns `null` for any other shape so the
 * caller falls back to its normal lowering.
 */
export function conditionalSpreadToBlade(
  ctx: BladeSpreadContext,
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
  const condBlade = ctx.convertConditionToBlade('', expr.test)
  const trueBlade = objectLiteralToBladeDict(ctx, whenTrue)
  const falseBlade = objectLiteralToBladeDict(ctx, whenFalse)
  if (trueBlade === null || falseBlade === null) return null
  // Blade's symbolic ternary (see `expr/emitters.ts`'s file header,
  // divergence 1) — `(test ? a : b)`, not Jinja's `(a if test else b)`.
  return `(${condBlade} ? ${trueBlade} : ${falseBlade})`
}

/**
 * (#1971) Lower a bare object-literal expression (`{ align: 'start' }`),
 * carried as the IR's structured `ParsedExpr` tree, to a PHP array via
 * `objectLiteralToBladeDict`, or null when it isn't a plain object literal.
 * Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToBladeDict(
  ctx: BladeSpreadContext,
  expr: ParsedExpr | undefined,
): string | null {
  if (!expr || expr.kind !== 'object-literal') return null
  return objectLiteralToBladeDict(ctx, expr)
}

/**
 * Convert a static object literal into a PHP array-literal string for a
 * conditional spread. Only static string/identifier keys are allowed; values
 * resolve via `convertExpressionToBlade` (or the `Record[propKey]` index
 * lowering). Returns `null` for any computed/spread/dynamic key. Empty
 * object → `[]`.
 */
export function objectLiteralToBladeDict(
  ctx: BladeSpreadContext,
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
    const indexed = recordIndexAccessToBlade(ctx, val)
    if (
      indexed === null &&
      val.kind === 'index-access' &&
      !isLiteralIndex(val.index)
    ) {
      // Variable-index record access (`sizeMap[size]`) the static-inline
      // path couldn't resolve (non-scalar value / non-const receiver).
      // Record BF101 and bail so the spread surfaces the out-of-shape
      // diagnostic, matching the Jinja port.
      ctx.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Spread object value '${stringifyParsedExpr(val)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Blade hash.`,
        loc: { file: ctx.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: 'Index a record whose values are number/string literals, or move the spread into a \'use client\' component so hydration computes it.',
        },
      })
      return null
    }
    const valBlade =
      indexed !== null
        ? indexed
        // Thread the carried `val` tree straight through as `preParsed`
        // (#2018) — no stringify→re-parse round-trip.
        : ctx.convertExpressionToBlade('', val)
    entries.push(`${bladeHashKey(key)} => ${valBlade}`)
  }
  return entries.length === 0 ? '[]' : `[${entries.join(', ')}]`
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
 * `sizeMap[size]`) to an inline indexed PHP array
 *   `['sm' => 16, 'md' => 20, ...][$size]`.
 * Reuses the shared structural parse (`parseRecordIndexAccess`) — rebuilding
 * the `IDENT[KEY]` node from the carried tree via `ts.factory` rather than
 * re-parsing source text; this wrapper only does the single-quote escaping +
 * bracket-index emit. PHP indexes an array literal with the SAME bracket
 * syntax `[...][key]` a JS object index would use (verified empirically —
 * `php -r 'var_dump(["a"=>1]["a"]);'` → `1`) — no Kolon-style divergence to
 * steer around here. Unlike Twig's own hash `{…}[key]`, a MISSING key here
 * would normally raise a PHP warning rather than resolve to `null` — this
 * call site's caller (`objectLiteralToBladeDict`'s data-table lookup path,
 * and `blade-adapter.ts`'s `${MAP}[key]` template-literal lowering) always
 * wraps the result in `?? ''`/`?? null`, which silences an undefined-index
 * warning exactly like it silences an undefined-variable one (see
 * `blade-adapter.ts`'s file header, the `??` divergence).
 */
export function recordIndexAccessToBlade(ctx: BladeSpreadContext, val: ParsedExpr): string | null {
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
      e.value.kind === 'number' ? e.value.text : `'${escapeBladeSingleQuoted(e.value.text)}'`
    return `${bladeHashKey(e.key)} => ${mapVal}`
  })
  return `[${entries.join(', ')}][${bladeVar(parsed.indexPropName)}]`
}
