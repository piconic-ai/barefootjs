/**
 * Backend-neutral boolean-result classification shared by the adapters whose
 * host language has no boolean type (Mojolicious, Xslate: Perl renders a
 * comparison as `''` / `1` and the literal `false` as `0`). Both adapters
 * route a boolean-shaped attribute value through their `bool_str` runtime
 * helper; this module decides which `ParsedExpr` shapes are boolean-shaped
 * and rewrites a ternary that only PARTLY is (#3349).
 *
 * Detected boolean-result shapes:
 *   - `binary` with a comparison operator (`<`, `>`, `<=`, `>=`, `==`,
 *     `===`, `!=`, `!==`)
 *   - `unary` with logical `!`
 *   - `literal` with `literalType: 'boolean'`
 *   - `logical` (`&&` / `||` / `??`) when both sides are boolean-result
 *   - `conditional` (`?:`) when both branches are boolean-result
 */

import type { ParsedExpr } from '../expression-parser.ts'

const COMPARISON_OPS = new Set([
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '===',
  '!=',
  '!==',
])

/** Whether `node` structurally evaluates to a JS boolean. */
export function isBooleanResultParsed(node: ParsedExpr): boolean {
  switch (node.kind) {
    case 'literal':
      return node.literalType === 'boolean'
    case 'binary':
      return COMPARISON_OPS.has(node.op)
    case 'unary':
      return node.op === '!'
    case 'logical':
      // `x > 0 && y < 10` is boolean; `x() || 'fallback'` is not.
      // Only both-sides-boolean qualifies.
      return (
        isBooleanResultParsed(node.left) && isBooleanResultParsed(node.right)
      )
    case 'conditional':
      // `cond ? bool : bool` is boolean; `cond ? 'a' : 'b'` is not.
      return (
        isBooleanResultParsed(node.consequent) &&
        isBooleanResultParsed(node.alternate)
      )
    default:
      return false
  }
}

/**
 * Rewrites the boolean-result branches of a ternary whose OTHER branch is
 * not boolean (`yes() ? false : s()`), so a taken boolean branch carries
 * JS `String(boolean)` instead of Perl's `0` / `''` / `1` (#3349). The whole
 * value isn't boolean-shaped, so `bool_str` can't wrap it; instead a literal
 * `true` / `false` branch becomes the string literal `'true'` / `'false'`,
 * and any other boolean-result branch `b` becomes `b ? 'true' : 'false'`.
 * The existing ternary lowering then renders the rewritten tree unchanged.
 * Nested ternary branches are rewritten recursively; anything that is not
 * a mixed ternary is returned as is.
 */
export function stringifyBooleanTernaryBranches(node: ParsedExpr): ParsedExpr {
  if (node.kind !== 'conditional' || isBooleanResultParsed(node)) return node
  return {
    ...node,
    consequent: stringifyBooleanBranch(node.consequent),
    alternate: stringifyBooleanBranch(node.alternate),
  }
}

function stringifyBooleanBranch(branch: ParsedExpr): ParsedExpr {
  if (!isBooleanResultParsed(branch)) return stringifyBooleanTernaryBranches(branch)
  if (branch.kind === 'literal') {
    return { kind: 'literal', value: String(branch.value), literalType: 'string' }
  }
  return {
    kind: 'conditional',
    test: branch,
    consequent: { kind: 'literal', value: 'true', literalType: 'string' },
    alternate: { kind: 'literal', value: 'false', literalType: 'string' },
  }
}

