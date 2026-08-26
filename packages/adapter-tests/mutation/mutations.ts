/**
 * Mutation sweep v1 (#2481 step 2) — structural TSX mutations applied to a
 * fixture's root component source before it is fed back through the same
 * compile/render pipeline `snapshot-generator.ts` uses for the frozen
 * corpus. Each mutation is semantics-preserving BY CONSTRUCTION (an alias
 * hop, a fragment wrapper, a name-then-return split) — a real component
 * should render identically before and after. `scripts/mutation-generate.ts`
 * sweeps every (fixture, mutation) pair and classifies what actually
 * happens; `e2e/mutation.playwright.ts` then runs the same three oracles
 * `oracle.playwright.ts` runs against the frozen corpus, against every
 * mutant that compiled cleanly.
 *
 * Every mutation is a pure TS AST transform (`ts.transform` + a visitor) —
 * never string/regex rewriting, per this repo's compiler convention (see
 * CLAUDE.md's "never parse/rewrite JS/TS with regex" rule, which applies
 * just as much to a tool that MUTATES TSX as to one that parses it).
 */

import ts from 'typescript'

export interface Mutation {
  id: string
  description: string
  /** Returns the mutated source file, or `null` when this fixture has no site the mutation applies to. */
  apply(source: ts.SourceFile): ts.SourceFile | null
}

// =============================================================================
// Shared helpers
// =============================================================================

function startsUppercase(name: string): boolean {
  const c = name.charCodeAt(0)
  return c >= 65 && c <= 90
}

type ComponentFn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

function isFunctionLike(node: ts.Node): node is ComponentFn | ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
}

/**
 * Top-level, PascalCase-named function declarations/expressions — this
 * repo's component naming convention. Bodyless overload signatures (`fn.body`
 * undefined) are skipped; they carry no JSX to mutate.
 */
function topLevelComponents(sf: ts.SourceFile): ComponentFn[] {
  const out: ComponentFn[] = []
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && startsUppercase(stmt.name.text) && stmt.body) {
      out.push(stmt)
      continue
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          startsUppercase(decl.name.text) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          out.push(decl.initializer)
        }
      }
    }
  }
  return out
}

function updateFunctionBody(factory: ts.NodeFactory, fn: ComponentFn, newBody: ts.Block | ts.Expression): ts.Node {
  if (ts.isFunctionDeclaration(fn)) {
    return factory.updateFunctionDeclaration(
      fn,
      fn.modifiers,
      fn.asteriskToken,
      fn.name,
      fn.typeParameters,
      fn.parameters,
      fn.type,
      newBody as ts.Block,
    )
  }
  if (ts.isArrowFunction(fn)) {
    return factory.updateArrowFunction(fn, fn.modifiers, fn.typeParameters, fn.parameters, fn.type, fn.equalsGreaterThanToken, newBody)
  }
  return factory.updateFunctionExpression(
    fn,
    fn.modifiers,
    fn.asteriskToken,
    fn.name,
    fn.typeParameters,
    fn.parameters,
    fn.type,
    newBody as ts.Block,
  )
}

function unwrapParen(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

function isJsxExpr(expr: ts.Expression): boolean {
  const u = unwrapParen(expr)
  return ts.isJsxElement(u) || ts.isJsxSelfClosingElement(u) || ts.isJsxFragment(u)
}

function runTransform(source: ts.SourceFile, transformer: ts.TransformerFactory<ts.SourceFile>): ts.SourceFile {
  const result = ts.transform(source, [transformer])
  const out = result.transformed[0]
  result.dispose()
  return out
}

// =============================================================================
// Mutation 1: alias-props
//
// Inserts `const <name>__alias = <name>` for each of a component's
// destructured props (or, for a plain `props` parameter, the whole object)
// and rewrites every reference inside the function body — including inside
// nested closures (event handlers, `.map()` callbacks) — to the alias.
// Meaning is unchanged; the indirection targets the CSR scope-leak class
// (#2468): a runtime that resolves a prop by name rather than by the value
// actually captured in a closure would read through to the wrong binding
// once the direct name no longer appears in the body.
// =============================================================================

interface AliasBinding {
  original: string
  alias: string
}

function planAliases(fn: ComponentFn): AliasBinding[] {
  if (fn.parameters.length !== 1) return []
  const param = fn.parameters[0]
  if (ts.isIdentifier(param.name)) {
    return [{ original: param.name.text, alias: `${param.name.text}__alias` }]
  }
  if (ts.isObjectBindingPattern(param.name)) {
    const out: AliasBinding[] = []
    for (const el of param.name.elements) {
      if (ts.isIdentifier(el.name)) {
        out.push({ original: el.name.text, alias: `${el.name.text}__alias` })
      }
    }
    return out
  }
  return []
}

function collectBoundNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const el of name.elements) {
    if (ts.isBindingElement(el)) collectBoundNames(el.name, out)
  }
}

function paramNames(params: ts.NodeArray<ts.ParameterDeclaration>): Set<string> {
  const out = new Set<string>()
  for (const p of params) collectBoundNames(p.name, out)
  return out
}

/**
 * Rewrite every reference to an aliased name inside `body`, respecting
 * shadowing introduced by nested function parameters, `let`/`const`
 * declarations, and catch bindings — a local that re-declares an aliased
 * name stops the substitution for its own scope. Structurally aware of
 * name-vs-reference positions that a blind text/regex replace would get
 * wrong: property-access/JSX-attribute/object-literal-key names are never
 * value references and are left untouched; a shorthand property (`{ x }`)
 * whose value IS the aliased binding is promoted to `{ x: x__alias }` so
 * the object's own key is preserved.
 */
function makeAliasReplacer(context: ts.TransformationContext, aliasMap: ReadonlyMap<string, string>): ts.Visitor {
  const { factory } = context
  const shadowStack: Set<string>[] = []
  const isShadowed = (name: string): boolean => shadowStack.some(s => s.has(name))

  const withShadow = <T extends ts.Node>(names: Set<string>, node: T, visitor: (n: ts.Node) => ts.VisitResult<ts.Node>): ts.Node => {
    shadowStack.push(names)
    const result = ts.visitEachChild(node, visitor, context)
    shadowStack.pop()
    return result
  }

  const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
    if (ts.isPropertyAccessExpression(node)) {
      return factory.updatePropertyAccessExpression(node, ts.visitNode(node.expression, visitor) as ts.Expression, node.name)
    }
    if (ts.isJsxAttribute(node)) {
      return factory.updateJsxAttribute(
        node,
        node.name,
        node.initializer ? (ts.visitNode(node.initializer, visitor) as ts.JsxAttributeValue) : node.initializer,
      )
    }
    if (ts.isPropertyAssignment(node)) {
      return factory.updatePropertyAssignment(node, node.name, ts.visitNode(node.initializer, visitor) as ts.Expression)
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      const text = node.name.text
      if (aliasMap.has(text) && !isShadowed(text)) {
        return factory.createPropertyAssignment(node.name, factory.createIdentifier(aliasMap.get(text)!))
      }
      return node
    }
    if (isFunctionLike(node)) {
      return withShadow(paramNames(node.parameters), node, visitor)
    }
    if (ts.isVariableDeclarationList(node)) {
      const names = new Set<string>()
      for (const d of node.declarations) collectBoundNames(d.name, names)
      return withShadow(names, node, visitor)
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      const names = new Set<string>()
      collectBoundNames(node.variableDeclaration.name, names)
      return withShadow(names, node, visitor)
    }
    if (ts.isIdentifier(node)) {
      if (aliasMap.has(node.text) && !isShadowed(node.text)) {
        return factory.createIdentifier(aliasMap.get(node.text)!)
      }
      return node
    }
    return ts.visitEachChild(node, visitor, context)
  }
  return visitor
}

function aliasDeclarations(factory: ts.NodeFactory, bindings: readonly AliasBinding[]): ts.Statement[] {
  return bindings.map(b =>
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [factory.createVariableDeclaration(factory.createIdentifier(b.alias), undefined, undefined, factory.createIdentifier(b.original))],
        ts.NodeFlags.Const,
      ),
    ),
  )
}

export const aliasProps: Mutation = {
  id: 'alias-props',
  description:
    'Insert an indirect `const x__alias = x` hop for each destructured prop (or the whole props object) and rewrite every in-body reference to the alias. Meaning-preserving; targets #2468-class CSR scope leaks.',
  apply(source) {
    const components = topLevelComponents(source)
    const plans = new Map<ComponentFn, AliasBinding[]>()
    for (const fn of components) {
      const bindings = planAliases(fn)
      if (bindings.length > 0) plans.set(fn, bindings)
    }
    if (plans.size === 0) return null

    const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
      const { factory } = context
      const rewrite = (node: ts.Node): ts.VisitResult<ts.Node> => {
        const bindings = plans.get(node as ComponentFn)
        if (bindings) {
          const fn = node as ComponentFn
          const aliasMap = new Map(bindings.map(b => [b.original, b.alias]))
          const replace = makeAliasReplacer(context, aliasMap)
          if (fn.body && !ts.isBlock(fn.body)) {
            const newExpr = ts.visitNode(fn.body, replace) as ts.Expression
            const block = factory.createBlock([...aliasDeclarations(factory, bindings), factory.createReturnStatement(newExpr)], true)
            return updateFunctionBody(factory, fn, block)
          }
          const body = fn.body as ts.Block
          const newStatements = body.statements.map(s => ts.visitNode(s, replace) as ts.Statement)
          const newBody = factory.updateBlock(body, [...aliasDeclarations(factory, bindings), ...newStatements])
          return updateFunctionBody(factory, fn, newBody)
        }
        return ts.visitEachChild(node, rewrite, context)
      }
      return root => ts.visitNode(root, rewrite) as ts.SourceFile
    }
    return runTransform(source, transformer)
  },
}

// =============================================================================
// Mutations 2 & 3 share one traversal: every `return <jsx>` (or, for a
// concise arrow body, the implicit return) belonging DIRECTLY to a
// top-level component — not to a nested closure/loop-row callback defined
// inside it, whose return is a per-row template, not the component root.
// =============================================================================

function transformRootReturns(
  context: ts.TransformationContext,
  fn: ComponentFn,
  transformExpr: (expr: ts.Expression) => ts.Expression,
): ComponentFn {
  const { factory } = context
  if (fn.body && !ts.isBlock(fn.body) && isJsxExpr(fn.body as ts.Expression)) {
    return updateFunctionBody(factory, fn, transformExpr(fn.body as ts.Expression)) as ComponentFn
  }
  if (!fn.body || !ts.isBlock(fn.body)) return fn

  const recur = (node: ts.Node): ts.Node => {
    if (node !== fn.body && isFunctionLike(node)) return node // don't descend into nested closures/row callbacks
    if (ts.isReturnStatement(node) && node.expression && isJsxExpr(node.expression)) {
      return factory.updateReturnStatement(node, transformExpr(node.expression))
    }
    return ts.visitEachChild(node, recur, context)
  }
  const newBody = recur(fn.body) as ts.Block
  return updateFunctionBody(factory, fn, newBody) as ComponentFn
}

function hasRootJsxReturn(fn: ComponentFn): boolean {
  if (fn.body && !ts.isBlock(fn.body)) return isJsxExpr(fn.body as ts.Expression)
  if (!fn.body || !ts.isBlock(fn.body)) return false
  let found = false
  const walk = (node: ts.Node): void => {
    if (found) return
    if (node !== fn.body && isFunctionLike(node)) return
    if (ts.isReturnStatement(node) && node.expression && isJsxExpr(node.expression)) {
      found = true
      return
    }
    ts.forEachChild(node, walk)
  }
  walk(fn.body)
  return found
}

// =============================================================================
// Mutation 2: fragment-wrap — wrap the root JSX element in `<>...</>`.
// =============================================================================

export const fragmentWrap: Mutation = {
  id: 'fragment-wrap',
  description: 'Wrap each component-root returned JSX element in a `<>...</>` fragment. Meaning-preserving.',
  apply(source) {
    const components = topLevelComponents(source)
    if (!components.some(hasRootJsxReturn)) return null

    const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
      const { factory } = context
      const wrap = (expr: ts.Expression): ts.Expression =>
        factory.createJsxFragment(
          factory.createJsxOpeningFragment(),
          [factory.createJsxExpression(undefined, unwrapParen(expr))],
          factory.createJsxJsxClosingFragment(),
        )
      const visitor = (node: ts.Node): ts.Node => {
        if (components.includes(node as ComponentFn)) {
          return transformRootReturns(context, node as ComponentFn, wrap)
        }
        return ts.visitEachChild(node, visitor, context)
      }
      return root => ts.visitNode(root, visitor) as ts.SourceFile
    }
    return runTransform(source, transformer)
  },
}

// =============================================================================
// Mutation 3: block-body — `return (<jsx>)` becomes a block that names the
// value before returning it: `{ const __root = (<jsx>); return __root }`.
//
// A NESTED block (rather than splicing two statements into the enclosing
// block) is deliberate: it is valid at every syntactic position a
// `ReturnStatement` can occupy — a bare `Block.statements` slot, an
// unbraced `if`/`for` body, a `case` clause — without needing to detect
// which shape applies, and it is semantically inert (an extra block scope
// around a `const` nothing else references does not change behavior). An
// arrow function's implicit return converts the same way, but into ITS OWN
// body block rather than a nested one — that IS the function's body.
// =============================================================================

export const blockBody: Mutation = {
  id: 'block-body',
  description: '`return (<jsx>)` becomes `{ const __root = (<jsx>); return __root }`. Meaning-preserving.',
  apply(source) {
    const components = topLevelComponents(source)
    if (!components.some(hasRootJsxReturn)) return null

    const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
      const { factory } = context
      const nameAndReturn = (expr: ts.Expression): ts.Statement[] => [
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(factory.createIdentifier('__root'), undefined, undefined, unwrapParen(expr))],
            ts.NodeFlags.Const,
          ),
        ),
        factory.createReturnStatement(factory.createIdentifier('__root')),
      ]
      const visitor = (node: ts.Node): ts.Node => {
        if (components.includes(node as ComponentFn)) {
          const fn = node as ComponentFn
          if (fn.body && !ts.isBlock(fn.body) && isJsxExpr(fn.body as ts.Expression)) {
            const block = factory.createBlock(nameAndReturn(fn.body as ts.Expression), true)
            return updateFunctionBody(factory, fn, block)
          }
          return replaceReturnsWithNamedBlocks(context, fn)
        }
        return ts.visitEachChild(node, visitor, context)
      }
      return root => ts.visitNode(root, visitor) as ts.SourceFile

      function replaceReturnsWithNamedBlocks(ctx: ts.TransformationContext, fn: ComponentFn): ComponentFn {
        if (!fn.body || !ts.isBlock(fn.body)) return fn
        const recur = (node: ts.Node): ts.Node => {
          if (node !== fn.body && isFunctionLike(node)) return node
          if (ts.isReturnStatement(node) && node.expression && isJsxExpr(node.expression)) {
            return factory.createBlock(nameAndReturn(node.expression), true)
          }
          return ts.visitEachChild(node, recur, ctx)
        }
        const newBody = recur(fn.body) as ts.Block
        return updateFunctionBody(factory, fn, newBody) as ComponentFn
      }
    }
    return runTransform(source, transformer)
  },
}

export const MUTATIONS_V1: readonly Mutation[] = [aliasProps, fragmentWrap, blockBody]
