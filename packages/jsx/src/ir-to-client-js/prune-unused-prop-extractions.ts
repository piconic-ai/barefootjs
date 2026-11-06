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
 *
 * Known limits, both erring toward FALSE-KEEP (an extraction survives and
 * the eager getter read stays), never false-prune:
 * - The reference scan is whole-file and scope-unaware: any other
 *   occurrence of the same identifier text as a value (a module-level
 *   helper's parameter named `children`, a local in an unrelated closure)
 *   keeps the extraction alive.
 * - Splicing removes a statement's full leading trivia, so a comment an
 *   emitter attached directly above a pruned extraction goes with it.
 */
import ts from 'typescript'
import { collectValueReferencedNames } from '../value-references.ts'
import { PROPS_PARAM } from './utils.ts'

/**
 * Does `init` read `<objectName>.<key>`, `<objectName>.<key> ?? <fallback>`,
 * or a defaulted `<objectName>.<key> === undefined ? <default> : <objectName>.<key>`?
 * The one recognizer for "a prop read initializer", shared by
 * `propExtractionName` below (which additionally requires the bound name to
 * equal `key` unless `key` is `children`, and always reads off `_p`), `rewriteBodyAliasReads`
 * (`rewrite-destructured-props.ts`, which does not require the name match —
 * a renamed alias's bound name differs from `key` by definition, but also
 * always reads off `_p`), and `resolveBodyPropAliases` (`props-binding.ts`,
 * which reads off the SOURCE-level props object name, e.g. `props` —
 * `objectName` defaults to `_p` for the first two, post-rename, callers).
 */
export function parsePropReadInitializer(
  init: ts.Expression,
  objectName: string = PROPS_PARAM,
): { key: string; fallback: ts.Expression | null; coalescesNull: boolean } | null {
  const defaulted = parseDefaultedPropRead(init, objectName)
  if (defaulted) return { ...defaulted, coalescesNull: false }
  let core: ts.Expression = init
  let fallback: ts.Expression | null = null
  if (
    ts.isBinaryExpression(core) &&
    core.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    fallback = core.right
    core = core.left
  }
  const key = propReadKey(core, objectName)
  // A `??` fallback (`props.x ?? d`, the author's own) replaces `null` too.
  return key === null ? null : { key, fallback, coalescesNull: fallback !== null }
}

/** `<objectName>.<key>`'s key, or null for any other expression. */
function propReadKey(expr: ts.Expression, objectName: string): string | null {
  if (!ts.isPropertyAccessExpression(expr)) return null
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== objectName) return null
  return expr.name.text
}

/**
 * A destructure default as `composePropRead` spells it:
 * `<objectName>.<key> === undefined ? <default> : <objectName>.<key>`.
 */
function parseDefaultedPropRead(init: ts.Expression, objectName: string): { key: string; fallback: ts.Expression } | null {
  if (!ts.isConditionalExpression(init)) return null
  const test = init.condition
  if (!ts.isBinaryExpression(test) || test.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return null
  if (!ts.isIdentifier(test.right) || test.right.text !== 'undefined') return null
  const key = propReadKey(test.left, objectName)
  if (key === null || propReadKey(init.whenFalse, objectName) !== key) return null
  return { key, fallback: init.whenTrue }
}

/** Is `stmt` a single-declarator `const X = _p.X…` prop extraction whose
 * initializer is `_p.X` or `_p.X ?? <default>`? The children prop's
 * extraction may bind another name (`const kids = _p.children`, a renamed
 * `{ children: kids }`, #3572): its eager read is the hazard this pass
 * removes, so it matches under any name. Returns the bound name, or null
 * when the statement is anything else. */
function propExtractionName(stmt: ts.Statement): string | null {
  if (!ts.isVariableStatement(stmt)) return null
  const decls = stmt.declarationList.declarations
  if (decls.length !== 1) return null
  const decl = decls[0]!
  if (!ts.isIdentifier(decl.name) || !decl.initializer) return null

  const parsed = parsePropReadInitializer(decl.initializer)
  if (parsed === null || (parsed.key !== decl.name.text && parsed.key !== 'children')) return null
  // A default that does something when it runs (`{ a = 1, b = (a = 2) }`)
  // runs whether or not its binding is read, so its declaration stays.
  if (parsed.fallback !== null && mayHaveSideEffect(parsed.fallback)) return null
  return decl.name.text
}

/** `=`, `+=`, `??=` and the other compound assignments. */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

/**
 * Whether evaluating `expr` may do more than produce a value: an
 * assignment, an update, a call, `new`, `delete`, `await` or `yield`. The
 * body of a function `expr` creates is not evaluated, so it does not count.
 */
function mayHaveSideEffect(expr: ts.Node): boolean {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return false
  if (ts.isBinaryExpression(expr) && isAssignmentOperator(expr.operatorToken.kind)) return true
  if (ts.isPrefixUnaryExpression(expr) || ts.isPostfixUnaryExpression(expr)) {
    const op = expr.operator
    if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) return true
  }
  if (
    ts.isCallExpression(expr) || ts.isNewExpression(expr) || ts.isDeleteExpression(expr) ||
    ts.isAwaitExpression(expr) || ts.isYieldExpression(expr) || ts.isTaggedTemplateExpression(expr)
  ) {
    return true
  }
  return ts.forEachChild(expr, child => (mayHaveSideEffect(child) ? true : undefined)) ?? false
}

/**
 * Remove prop-extraction consts inside `init*` functions whose bound name
 * is never referenced as a value anywhere else in `code`. Returns the code
 * unchanged when nothing is prunable or the code doesn't parse.
 */
export function pruneUnusedPropExtractions(code: string): string {
  for (let round = 0; round < 10; round++) {
    const referenced = collectValueReferencedNames(code)
    if (referenced === null) {
      // Unlike resolveFinalImports' identical fallback (where a missed
      // import fails the build loudly), skipping here silently re-opens
      // the eager-getter double-instantiation this pass exists to prevent
      // — so say so.
      console.warn('[barefootjs] pruneUnusedPropExtractions: generated code did not parse; skipping prune')
      return code
    }

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
