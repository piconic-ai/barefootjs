/**
 * Object-literal / conditional-spread → Perl hashref lowering for the
 * Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `MojoSpreadContext` (built by the adapter's
 * `spreadCtx` getter) so the cluster depends on the narrow seam — the recursive
 * expression entry plus per-compile bookkeeping — rather than the whole
 * adapter class. Mirror of the Go adapter's `spread/spread-codegen.ts`.
 */

import ts from 'typescript'
import { parseRecordIndexAccess } from '@barefootjs/jsx'

import type { MojoSpreadContext } from '../emit-context.ts'

/**
 * Parse a `cond ? {…} : {…}` conditional-spread expression and lower it to a
 * Perl ternary over two hashrefs, or null when it isn't that shape.
 */
export function conditionalSpreadToPerl(ctx: MojoSpreadContext, expr: string): string | null {
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
  const condPerl = ctx.convertExpressionToPerl(node.condition.getText(sf))
  const truePerl = objectLiteralToPerlHashref(ctx, whenTrue, sf)
  const falsePerl = objectLiteralToPerlHashref(ctx, whenFalse, sf)
  if (truePerl === null || falsePerl === null) return null
  return `${condPerl} ? ${truePerl} : ${falsePerl}`
}

/**
 * (#1971 Perl) Parse a bare object-literal expression string
 * (`{ align: 'start' }`) and lower it to a Perl hashref via
 * `objectLiteralToPerlHashref`, or null when it isn't a plain object
 * literal. Used for inline object-literal child props (carousel `opts`).
 */
export function objectLiteralExprToPerlHashref(ctx: MojoSpreadContext, expr: string): string | null {
  const sf = ts.createSourceFile('__obj.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let node: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  if (!ts.isObjectLiteralExpression(node)) return null
  return objectLiteralToPerlHashref(ctx, node, sf)
}

/**
 * Convert a static object literal into a Perl hashref string for a
 * conditional spread. Only static string/identifier keys are allowed;
 * values resolve via `convertExpressionToPerl`. Returns null for any
 * computed/spread/dynamic key. Empty object → `{}`.
 */
export function objectLiteralToPerlHashref(
  ctx: MojoSpreadContext,
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
    const indexed = recordIndexAccessToPerl(ctx, initNode)
    if (
      indexed === null &&
      ts.isElementAccessExpression(initNode) &&
      initNode.argumentExpression &&
      !ts.isNumericLiteral(initNode.argumentExpression) &&
      !ts.isStringLiteral(initNode.argumentExpression)
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
        message: `Spread object value '${initNode.getText(sf)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Perl hashref.`,
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
        : ctx.convertExpressionToPerl(prop.initializer.getText(sf))
    entries.push(`'${key.replace(/'/g, "\\'")}' => ${valPerl}`)
  }
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
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
export function recordIndexAccessToPerl(ctx: MojoSpreadContext, val: ts.Expression): string | null {
  // Shared structural parse (single source of truth in `@barefootjs/jsx`);
  // this wrapper only does the Perl-specific emit (single-quote escaping)
  // from the structured result.
  const parsed = parseRecordIndexAccess(val, ctx.localConstants, ctx.propsParams)
  if (!parsed) return null
  const entries = parsed.entries.map(e => {
    const mapVal =
      e.value.kind === 'number' ? e.value.text : `'${e.value.text.replace(/'/g, "\\'")}'`
    return `'${e.key.replace(/'/g, "\\'")}' => ${mapVal}`
  })
  return `{ ${entries.join(', ')} }->{$${parsed.indexPropName}}`
}
