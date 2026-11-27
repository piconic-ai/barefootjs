/**
 * Source spellings a compiler-generated name must avoid (#4021).
 *
 * Phase 2 introduces names of its own into emitted code (a CSR template's
 * per-evaluation const bindings, `__bf_const_B`). A source binding with the
 * same spelling (`[1, 2].map(__bf_const_B => B.k + __bf_const_B)`) would
 * capture a read the compiler substitutes into its scope. Every generated
 * name starts with `__bf_`, so Phase 1 records each identifier of the source
 * file spelled with that prefix (a binding, a reference or a member name
 * alike: an over-approximation), and Phase 2 picks names outside the set.
 */

import ts from 'typescript'

const GENERATED_PREFIX = '__bf_'

/** Every identifier spelling in `sourceFile` that starts with `__bf_`, sorted. */
export function generatedPrefixSpellings(sourceFile: ts.SourceFile): string[] {
  const found = new Set<string>()
  const visit = (node: ts.Node): void => {
    if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && node.text.startsWith(GENERATED_PREFIX)) {
      found.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...found].sort()
}
