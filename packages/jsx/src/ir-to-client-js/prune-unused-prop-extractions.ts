/**
 * Final-pass removal of prop-extraction consts the emitted init body never
 * reads (`const children = _p.children` and friends).
 *
 * `emitPropsExtraction` mirrors the component's destructuring for every
 * prop the REFERENCE GRAPH marks as used — but the graph also counts
 * template-only references (e.g. `{children}` rendered as SSR-adopted
 * content), which the init body never touches. The stray binding is not
 * just dead weight: props arrive as GETTERS over the parent's reactive
 * state, and a slot-children getter (`get children() { return
 * [createComponent('Checkbox', …)] }`) INSTANTIATES child components when
 * read. An init that eagerly evaluates it creates a second, duplicate
 * child instance next to the `upsertChild` wiring the compiler also
 * emits — double event listeners, toggles that cancel themselves out.
 * The legacy site pipeline masked this by registration order (children
 * modules registered after the parent's init queued, so the queued init
 * ran against an already-hydrated tree); Vite's ESM import order
 * registers children first and made the eager read bite (#2537's
 * migration surfaced it on site/ui's form-builder).
 *
 * Mirrors `resolveFinalImports`'s shape: a TS AST walk over the finished
 * code (never a regex — see CLAUDE.md), span-based splicing, iterated to
 * a fixpoint so an extraction referenced only by another pruned
 * extraction's default expression is removed too.
 */
import ts from 'typescript'
import { collectValueReferencedNames } from '../value-references.ts'
import { PROPS_PARAM } from './utils.ts'

/** Is `stmt` a single-declarator `const X = _p.X…` prop extraction whose
 * initializer is `_p.X` or `_p.X ?? <default>`? Returns the bound name, or
 * null when the statement is anything else. */
function propExtractionName(stmt: ts.Statement): string | null {
  if (!ts.isVariableStatement(stmt)) return null
  const decls = stmt.declarationList.declarations
  if (decls.length !== 1) return null
  const decl = decls[0]!
  if (!ts.isIdentifier(decl.name) || !decl.initializer) return null

  let core: ts.Expression = decl.initializer
  if (
    ts.isBinaryExpression(core) &&
    core.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    core = core.left
  }
  if (!ts.isPropertyAccessExpression(core)) return null
  if (!ts.isIdentifier(core.expression) || core.expression.text !== PROPS_PARAM) return null
  if (core.name.text !== decl.name.text) return null
  return decl.name.text
}

/**
 * Remove prop-extraction consts inside `init*` functions whose bound name
 * is never referenced as a value anywhere else in `code`. Returns the code
 * unchanged when nothing is prunable or the code doesn't parse.
 */
export function pruneUnusedPropExtractions(code: string): string {
  for (let round = 0; round < 10; round++) {
    const referenced = collectValueReferencedNames(code)
    if (referenced === null) return code

    const sourceFile = ts.createSourceFile(
      'generated.js',
      code,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
      ts.ScriptKind.JS,
    )

    // Spans to delete, gathered per round; spliced back-to-front so
    // earlier offsets stay valid.
    const spans: Array<{ start: number; end: number }> = []
    for (const stmt of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(stmt) || !stmt.name?.text.startsWith('init') || !stmt.body) continue
      for (const inner of stmt.body.statements) {
        const name = propExtractionName(inner)
        if (name !== null && !referenced.has(name)) {
          spans.push({ start: inner.getFullStart(), end: inner.getEnd() })
        }
      }
    }

    if (spans.length === 0) return code
    let next = code
    for (const { start, end } of spans.sort((a, b) => b.start - a.start)) {
      next = next.slice(0, start) + next.slice(end)
    }
    code = next
  }
  return code
}
