/**
 * Value names a type declaration depends on.
 *
 * A type is normally self-contained, but `typeof X` (a TS *type query*) makes
 * it reference a VALUE binding — so re-emitting that type into a generated
 * module is only sound if `X` is in scope there too. Compiled templates
 * localise a source module's constants into each component body, which puts
 * them OUT of scope for a module-level type alias; without this, an emitted
 * `type IconName = keyof typeof strokePaths | …` fails TS2304 and TS silently
 * widens `keyof typeof` to `string | number | symbol`.
 *
 * Parsed through the TS AST rather than matched textually: `typeof` is also
 * an *expression* operator, and the token appears inside string literals and
 * comments, so a textual scan both over- and under-matches.
 */

import ts from 'typescript'

/**
 * The value names referenced by `typeof` inside the given type-declaration
 * sources. For a qualified query (`typeof ns.member`) the ROOT binding is
 * what has to be in scope, so `ns` is returned.
 *
 * Each definition is parsed standalone; a fragment that doesn't parse
 * contributes nothing rather than throwing (the caller is emitting
 * best-effort source text, not validating it).
 */
export function collectTypeQueryValueNames(definitions: readonly string[]): Set<string> {
  const names = new Set<string>()
  for (const definition of definitions) {
    const sourceFile = ts.createSourceFile(
      '__bf_typedef.ts',
      definition,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      ts.ScriptKind.TS,
    )
    const visit = (node: ts.Node): void => {
      if (ts.isTypeQueryNode(node)) {
        let entity: ts.EntityName = node.exprName
        while (ts.isQualifiedName(entity)) entity = entity.left
        names.add(entity.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return names
}
