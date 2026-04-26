/**
 * AST-based prop-access detector.
 *
 * Replaces the regex pair (`\\b<name>\\.[a-zA-Z_]` / `\\b<name>\\s*\\[`)
 * that `computePropUsage` used pre-C1. The regex form silently missed
 * optional-chaining property access (`<name>?.foo`) because the `?` between
 * the identifier and the `.` broke the dot match.
 *
 * The detector parses each source via the TypeScript compiler, walks
 * `PropertyAccessExpression` (covers both `.foo` and `?.foo` — the AST
 * distinguishes them only via `questionDotToken`, which we ignore) and
 * `ElementAccessExpression` (`[expr]`) nodes, and records the access
 * kind for any prop name that is the immediate `expression` of the
 * access node.
 *
 * Template-style sources (HTML strings with `${...}` interpolations) are
 * normalised by extracting each interpolation expression and parsing
 * those — the surrounding HTML is irrelevant for prop access.
 */

import ts from 'typescript'
import type { PropAccessKind } from '../types'
import { extractTemplateExpressions } from './identifiers'

/** Map from prop name → set of access kinds observed across all sources. */
export type PropAccessKindMap = Map<string, Set<PropAccessKind>>

/**
 * Walk every property / element access in `source` and record any whose
 * receiver is one of `propNames`. Mutates `out` in place so the caller
 * can fold results from many sources into a single map.
 *
 * Sources may be either pure expressions (`condition`, `dynamicElements
 * .expression`, `constant.value`) or template-style strings carrying
 * `${...}` interpolations (HTML branches, loop templates). Both are
 * normalised here.
 */
export function collectPropAccesses(
  source: string,
  propNames: ReadonlySet<string>,
  out: PropAccessKindMap,
): void {
  if (propNames.size === 0) return

  // Quick exit: if the source mentions none of the candidate names by
  // substring, no AST walk is needed. Saves a TS parse per source for
  // the common case where most strings touch only a handful of props.
  let anyMentioned = false
  for (const name of propNames) {
    if (source.includes(name)) { anyMentioned = true; break }
  }
  if (!anyMentioned) return

  for (const expr of normaliseExpressionParts(source)) {
    const sourceFile = ts.createSourceFile(
      'p.ts',
      expr,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
      ts.ScriptKind.TS,
    )
    visit(sourceFile, propNames, out)
  }
}

/**
 * Yield each parseable JS expression embedded in `source`. Pure
 * expressions yield the whole string; template-style strings yield only
 * the `${...}` substitution bodies via the shared
 * `extractTemplateExpressions` helper.
 */
function normaliseExpressionParts(source: string): string[] {
  if (!source.includes('${')) return [source]
  return extractTemplateExpressions(source)
}

function visit(
  node: ts.Node,
  propNames: ReadonlySet<string>,
  out: PropAccessKindMap,
): void {
  // Both `obj.foo` and `obj?.foo` are PropertyAccessExpression — the
  // optional-chain bit lives on `questionDotToken`, which we deliberately
  // ignore: from a "does this prop need a `{}` default" perspective both
  // forms perform a property read against `obj`.
  if (ts.isPropertyAccessExpression(node)) {
    recordIfPropAccess(node.expression, 'property', propNames, out)
  } else if (ts.isElementAccessExpression(node)) {
    recordIfPropAccess(node.expression, 'index', propNames, out)
  }
  ts.forEachChild(node, child => visit(child, propNames, out))
}

function recordIfPropAccess(
  receiver: ts.Expression,
  kind: PropAccessKind,
  propNames: ReadonlySet<string>,
  out: PropAccessKindMap,
): void {
  if (!ts.isIdentifier(receiver)) return
  const name = receiver.text
  if (!propNames.has(name)) return
  let kinds = out.get(name)
  if (!kinds) {
    kinds = new Set<PropAccessKind>()
    out.set(name, kinds)
  }
  kinds.add(kind)
}
