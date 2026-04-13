/**
 * AST-based prop reference rewriting for client JS templates.
 *
 * Walks the TypeScript AST to identify destructured prop names used as
 * value references (not as object keys, property access targets, or
 * shorthand properties), then applies targeted regex replacement.
 */

import ts from 'typescript'
import { PROPS_PARAM } from './ir-to-client-js/utils'

/**
 * Rewrite bare destructured prop references in expression text.
 * Returns undefined if no rewriting was needed.
 *
 * @param text - The type-stripped expression text
 * @param node - The AST node for structural analysis
 * @param propNames - Set of destructured prop names to rewrite
 */
export function rewriteBarePropRefs(
  text: string,
  node: ts.Node,
  propNames: Set<string>,
): string | undefined {
  // Walk AST to find which prop names are actually used as value references
  const foundPropRefs = new Set<string>()
  function visit(n: ts.Node, parent?: ts.Node) {
    if (ts.isIdentifier(n) && propNames.has(n.text)) {
      // Skip: object literal key  { org: ... }
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return
      // Skip: shorthand property  { org }
      if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n) return
      // Skip: property access name  foo.org
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
      foundPropRefs.add(n.text)
    }
    ts.forEachChild(n, child => visit(child, n))
  }
  visit(node)
  if (foundPropRefs.size === 0) return undefined

  // Apply targeted regex replacement only for AST-identified prop ref names
  let result = text
  for (const propName of foundPropRefs) {
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
  return result
}
