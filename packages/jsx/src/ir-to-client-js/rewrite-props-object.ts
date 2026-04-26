/**
 * AST-based rename of the source-level props object name (e.g. `props`
 * or a user-supplied destructure name) → the generated parameter name
 * `_p` across the joined init-body string.
 *
 * Replaces the pre-C2 regex hack `\\b<propsObjectName>\\b` which silently
 * matched contexts that should NOT have been rewritten:
 *
 *   1. Object literal keys     `{ props: x }`    → must keep `props`
 *   2. Property access names   `obj.props`       → must keep `props`
 *   3. Shorthand properties    `{ props }`       → must keep `props`
 *   4. String / comment text                     → must keep `props`
 *
 * The regex form happened to work in today's corpus because user code
 * never collided with these forms — fragile. Switching to a TS AST walk
 * makes the rename robust to new emission shapes downstream.
 *
 * Late-stage normalisation only — the rewrite still runs once on the
 * fully-joined init body, after all phases have emitted. A follow-up PR
 * may move it into analyzer-time IR rewriting (mirroring `templateXxx`
 * fields) and introduce a `PropRewritten<T>` brand type so missing the
 * rewrite becomes a compile-time error.
 */

import ts from 'typescript'
import { PROPS_PARAM } from './utils'

/**
 * Rename every value-position reference to `propsObjectName` in `code`
 * to `_p`. No-op when `propsObjectName` is null (destructured-prop mode
 * — the analyzer already pre-rewrites bare prop refs into `templateXxx`
 * fields) or already equals `_p`.
 */
export function rewritePropsObjectRef(code: string, propsObjectName: string | null): string {
  const srcPropsName = propsObjectName ?? 'props'
  if (srcPropsName === PROPS_PARAM) return code

  // Quick exit when the name doesn't appear at all.
  if (!new RegExp(`\\b${srcPropsName}\\b`).test(code)) return code

  const sourceFile = ts.createSourceFile(
    'init-body.ts',
    code,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  )

  // Collect (start, end) spans for every identifier we should rewrite.
  // Spans are sorted by `start` ascending in the order TS visits them
  // (depth-first, source order), so we can apply replacements right-to-
  // left without re-sorting.
  const spans: Array<readonly [number, number]> = []

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === srcPropsName && shouldRewrite(node)) {
      spans.push([node.getStart(sourceFile), node.getEnd()])
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (spans.length === 0) return code

  // Apply right-to-left so earlier offsets stay valid.
  let result = code
  for (let i = spans.length - 1; i >= 0; i--) {
    const [start, end] = spans[i]
    result = result.slice(0, start) + PROPS_PARAM + result.slice(end)
  }
  return result
}

/**
 * Decide whether an `Identifier` whose text matches `propsObjectName`
 * is in a value position that should be rewritten. The exclusions
 * mirror the AST-correct cases handled by `rewriteBarePropRefs` in
 * `prop-rewrite.ts`:
 *
 *   - PropertyAccessExpression's `name` slot:   `obj.props`     SKIP
 *   - PropertyAssignment's `name` slot:         `{ props: x }`  SKIP
 *   - ShorthandPropertyAssignment's `name`:     `{ props }`     SKIP
 *   - PropertySignature / PropertyDeclaration:  type / class    SKIP
 *
 * Strings and comments are not Identifiers so the AST walker never
 * visits them.
 */
function shouldRewrite(node: ts.Identifier): boolean {
  const parent = node.parent
  if (!parent) return true
  // `obj.props` — leave the name slot alone (only the receiver matters).
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  // `{ props: x }` — object literal key.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false
  // `{ props }` — shorthand property.
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) return false
  // `interface Foo { props: ... }` / class field — shouldn't appear in init body
  // but keep the guard for robustness against future expansions of what
  // gets emitted.
  if (ts.isPropertySignature(parent) && parent.name === node) return false
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return false
  // `({ props } = source)` — binding pattern element. Skip the name slot.
  if (ts.isBindingElement(parent) && parent.name === node) return false
  return true
}
