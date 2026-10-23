/**
 * Lexical binding frames for TS-AST walks over emitted or source JS text.
 *
 * Scope model: a name bound INSIDE the walked node — a nested arrow /
 * function parameter, a block-scoped declaration, a `for` head's `let` /
 * `const`, a catch variable — refers to that binding, not to an outer
 * name of the same spelling, for the whole binding's scope. Names bound
 * OUTSIDE the walked text (a loop callback that encloses a template
 * fragment) are the caller's job — that is what `BindingScope`
 * (`./binding-scope.ts`) answers; this module answers the complementary
 * question for binders that live inside the text itself.
 *
 * Shared by the prop-reference rewrites in `prop-rewrite.ts` and the
 * props-object rename in `ir-to-client-js/rewrite-props-object.ts`, so
 * both agree on which identifiers an inner binding shadows.
 */

import ts from 'typescript'

/** Collect every name introduced by a binding name (identifier or pattern). */
function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const el of name.elements) {
    if (ts.isBindingElement(el)) collectBindingNames(el.name, out)
  }
}

/**
 * Names bound by `n` for its subtree, or null when `n` introduces no
 * scope. Function-likes bind their parameters (and a function
 * expression its own name); blocks bind their statement-level
 * variable/function declarations; a `for` head binds its `let` / `const`;
 * catch clauses bind their variable.
 */
function scopeFrameOf(n: ts.Node): Set<string> | null {
  const frame = new Set<string>()
  if (ts.isFunctionLike(n)) collectFunctionBindings(n, frame)
  else if (ts.isBlock(n)) collectBlockBindings(n, frame)
  else if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n)) collectForHeadBindings(n, frame)
  else if (ts.isCatchClause(n) && n.variableDeclaration) collectBindingNames(n.variableDeclaration.name, frame)
  return frame.size > 0 ? frame : null
}

function collectFunctionBindings(n: ts.SignatureDeclaration, frame: Set<string>): void {
  for (const p of n.parameters) collectBindingNames(p.name, frame)
  if ((ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) && n.name) frame.add(n.name.text)
}

function collectBlockBindings(n: ts.Block, frame: Set<string>): void {
  for (const st of n.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) collectBindingNames(d.name, frame)
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      frame.add(st.name.text)
    }
  }
}

/**
 * A `for` head's `let` / `const` binds for the loop (`for (let i = 0; …;
 * i++)`, `for (const x of xs)`): its condition, incrementor and body read
 * the loop variable, not an outer prop of the same name.
 */
function collectForHeadBindings(n: ts.ForStatement | ts.ForOfStatement | ts.ForInStatement, frame: Set<string>): void {
  if (!n.initializer || !ts.isVariableDeclarationList(n.initializer)) return
  for (const d of n.initializer.declarations) collectBindingNames(d.name, frame)
}

/**
 * Depth-first walk that maintains the binding stack described above and
 * reports every identifier along with whether a binding within `root`
 * currently shadows it.
 */
export function walkWithScope(
  root: ts.Node,
  visit: (ident: ts.Identifier, parent: ts.Node | undefined, shadowed: boolean) => void,
): void {
  const scopeStack: Set<string>[] = []
  const isShadowed = (name: string) => scopeStack.some(frame => frame.has(name))
  function rec(n: ts.Node, parent?: ts.Node) {
    const frame = scopeFrameOf(n)
    if (frame) scopeStack.push(frame)
    if (ts.isIdentifier(n)) visit(n, parent, isShadowed(n.text))
    ts.forEachChild(n, child => rec(child, n))
    if (frame) scopeStack.pop()
  }
  rec(root)
}
