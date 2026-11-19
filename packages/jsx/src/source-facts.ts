/**
 * Source facts: what the IR's source text reads, derived once in Phase 1.
 *
 * The client reference graph (`ir-to-client-js/build-references.ts`) decides
 * which declarations `initX` keeps from the names each IR text reads. Phase 2
 * must not re-parse that text, so the analyzer records the facts from the AST
 * node every text is printed from (`AnalyzerContext.getJS`) and the IR carries
 * them in `IRMetadata.sourceFacts`, keyed by the text.
 */

import ts from 'typescript'
import type { SourceFacts } from './types.ts'
import { extractFreeIdentifiersFromNode } from './free-identifiers.ts'

const cache: WeakMap<ts.Node, SourceFacts> = new WeakMap()

/**
 * The facts of `node`: its free identifiers, and every `object.name` member
 * read whose object is an identifier (`props.value`, `p.n`). A member name is
 * no read of a binding, but a read through the props object (or an alias of
 * it) is a use of that prop; the graph decides which objects count.
 */
export function sourceFactsOf(node: ts.Node): SourceFacts {
  const hit = cache.get(node)
  if (hit) return hit
  const members: Array<[string, string]> = []
  const seen = new Set<string>()
  const visit = (n: ts.Node): void => {
    if (ts.isTypeNode(n)) return
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const key = `${n.expression.text}.${n.name.text}`
      if (!seen.has(key)) {
        seen.add(key)
        members.push([n.expression.text, n.name.text])
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  const facts: SourceFacts = { free: [...extractFreeIdentifiersFromNode(node)], members }
  cache.set(node, facts)
  return facts
}
