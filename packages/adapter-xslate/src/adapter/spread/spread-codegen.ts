/**
 * Object-literal / conditional-spread → Kolon hashref lowering for the
 * Text::Xslate template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `XslateSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the recursive
 * expression entry plus per-compile bookkeeping — rather than the whole
 * adapter class. Mirror of the Go / Mojo adapter's `spread/spread-codegen.ts`.
 */

import ts from 'typescript'
import { parseRecordIndexAccess } from '@barefootjs/jsx'

import type { XslateSpreadContext } from '../emit-context.ts'
import { escapeKolonSingleQuoted } from '../lib/kolon-naming.ts'

/**
 * Lower a conditional inline-object spread
 *   `COND ? { 'aria-describedby': describedBy } : {}`
 * to a Kolon inline ternary of hashrefs
 *   `$describedBy ? { 'aria-describedby' => $describedBy } : {}`.
 * Both branches must be object literals; the condition + values route through
 * `convertExpressionToKolon`. Returns `null` for any other shape so the caller
 * falls back to its normal lowering. Mirror of `conditionalSpreadToPerl`.
 */
export function conditionalSpreadToKolon(ctx: XslateSpreadContext, expr: string): string | null {
  const sf = ts.createSourceFile('__spread.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let node: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  if (!ts.isConditionalExpression(node)) return null
  const unwrap = (e: ts.Expression): ts.Expression => {
    let n = e
    while (ts.isParenthesizedExpression(n)) n = n.expression
    return n
  }
  const whenTrue = unwrap(node.whenTrue)
  const whenFalse = unwrap(node.whenFalse)
  if (!ts.isObjectLiteralExpression(whenTrue) || !ts.isObjectLiteralExpression(whenFalse)) {
    return null
  }
  const condKolon = ctx.convertExpressionToKolon(node.condition.getText(sf))
  const trueKolon = objectLiteralToKolonHashref(ctx, whenTrue, sf)
  const falseKolon = objectLiteralToKolonHashref(ctx, whenFalse, sf)
  if (trueKolon === null || falseKolon === null) return null
  return `${condKolon} ? ${trueKolon} : ${falseKolon}`
}

/**
 * (#1971 Perl) Parse a bare object-literal expression string
 * (`{ align: 'start' }`) and lower it to a Kolon hashref via
 * `objectLiteralToKolonHashref`, or null when it isn't a plain object
 * literal. Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToKolonHashref(ctx: XslateSpreadContext, expr: string): string | null {
  const sf = ts.createSourceFile('__obj.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let node: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  if (!ts.isObjectLiteralExpression(node)) return null
  return objectLiteralToKolonHashref(ctx, node, sf)
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
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): string | null {
  const entries: string[] = []
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    let key: string
    if (ts.isIdentifier(prop.name)) {
      key = prop.name.text
    } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
      key = prop.name.text
    } else {
      return null
    }
    const initNode = (() => {
      let n: ts.Expression = prop.initializer
      while (ts.isParenthesizedExpression(n)) n = n.expression
      return n
    })()
    const indexed = recordIndexAccessToKolon(ctx, initNode)
    if (
      indexed === null &&
      ts.isElementAccessExpression(initNode) &&
      initNode.argumentExpression &&
      !ts.isNumericLiteral(initNode.argumentExpression) &&
      !ts.isStringLiteral(initNode.argumentExpression)
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
        message: `Spread object value '${initNode.getText(sf)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Kolon hashref.`,
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
        : ctx.convertExpressionToKolon(prop.initializer.getText(sf))
    entries.push(`'${escapeKolonSingleQuoted(key)}' => ${valKolon}`)
  }
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
}

/**
 * Lower a spread-object VALUE of the form `IDENT[KEY]` (CheckIcon's
 * `sizeMap[size]`) to an inline indexed Kolon hashref
 *   `{ 'sm' => 16, 'md' => 20, ... }[$size]`.
 * Reuses the shared structural parse (`parseRecordIndexAccess`); this wrapper
 * only does the single-quote escaping + Kolon index emit. NB: Kolon indexes a
 * hashref literal with bracket syntax `{…}[$key]`, NOT Perl's arrow-deref
 * `{…}->{$key}` (which Kolon's parser rejects) — this is the one divergence
 * from the Mojo `recordIndexAccessToPerl` emit.
 */
export function recordIndexAccessToKolon(ctx: XslateSpreadContext, val: ts.Expression): string | null {
  const parsed = parseRecordIndexAccess(val, ctx.localConstants ?? [], ctx.propsParams)
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal =
      e.value.kind === 'number' ? e.value.text : `'${escapeKolonSingleQuoted(e.value.text)}'`
    return `'${escapeKolonSingleQuoted(e.key)}' => ${mapVal}`
  })
  return `{ ${entries.join(', ')} }[$${parsed.indexPropName}]`
}
