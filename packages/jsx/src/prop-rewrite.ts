/**
 * AST-based prop reference rewriting for client JS templates.
 *
 * Walks the TypeScript AST to identify destructured prop names used as
 * value references (not as object keys, property access targets, or
 * shorthand properties), then applies targeted regex replacement.
 */

import ts from 'typescript'
import { PROPS_PARAM } from './ir-to-client-js/utils.ts'
import { createTemplateAwareStringProtector } from './ir-to-client-js/html-template.ts'

/**
 * Walk an AST node for destructured-prop value references and add
 * each found name to `out`. Same skip rules as the rewrite path —
 * object-literal keys, shorthand properties, and property-access
 * names are excluded so only true value references get picked up.
 * Exported for callers that need the raw discovery set (e.g. the
 * branch-local prop-dep cache from #1425).
 */
export function collectAstPropRefs(
  node: ts.Node,
  propNames: Set<string>,
  out: Set<string>,
): void {
  function visit(n: ts.Node, parent?: ts.Node) {
    if (ts.isIdentifier(n) && propNames.has(n.text)) {
      // Skip: object literal key  { org: ... }
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return
      // Skip: shorthand property  { org }
      if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n) return
      // Skip: property access name  foo.org
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
      out.add(n.text)
    }
    ts.forEachChild(n, child => visit(child, n))
  }
  visit(node)
}

/**
 * Apply the targeted regex rewrite for one or more prop names on a
 * type-stripped expression text. Idempotent under `_p.X` (negative
 * lookbehind on `_p\\.`) and skips object-literal keys via the
 * post-match `{,` + `:` shape check.
 */
export function applyRegexPropRefRewrite(
  text: string,
  propRefs: Iterable<string>,
): string {
  const { protect, restore } = createTemplateAwareStringProtector()
  let result = protect(text)

  for (const propName of propRefs) {
    const pattern = new RegExp(`(?<!${PROPS_PARAM}\\.)(?<!['"\\w.-])\\b${propName}\\b(?![a-zA-Z0-9_$])`, 'g')
    result = result.replace(pattern, (match, offset, str) => {
      // Skip object literal keys: preceded by { or , and followed by :
      const after = str.slice(offset + match.length)
      if (/^\s*:(?!:)/.test(after)) {
        const before = str.slice(0, offset)
        if (/[{,]\s*$/.test(before)) return match
      }
      return `${PROPS_PARAM}.${propName}`
    })
  }

  return restore(result)
}

/**
 * Rewrite bare destructured prop references in expression text.
 * Returns undefined if no rewriting was needed.
 *
 * @param text - The type-stripped expression text
 * @param node - The AST node for structural analysis
 * @param propNames - Set of destructured prop names to rewrite
 * @param extraPropRefs - Optional prop names known to appear in
 *   `text` via substitution sources the AST walk can't see (e.g.
 *   `text` was produced by inlining a branch-local whose initializer
 *   references the prop). The post-match `_p\\.` lookbehind keeps
 *   the regex idempotent, so passing an over-broad set is safe.
 */
export function rewriteBarePropRefs(
  text: string,
  node: ts.Node,
  propNames: Set<string>,
  extraPropRefs?: ReadonlySet<string>,
): string | undefined {
  // Walk AST to find which prop names are actually used as value references
  const foundPropRefs = new Set<string>()
  collectAstPropRefs(node, propNames, foundPropRefs)
  if (extraPropRefs) {
    for (const ref of extraPropRefs) {
      if (propNames.has(ref)) foundPropRefs.add(ref)
    }
  }
  if (foundPropRefs.size === 0) return undefined
  return applyRegexPropRefRewrite(text, foundPropRefs)
}
