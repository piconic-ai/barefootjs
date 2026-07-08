/**
 * Free-reference resolution for `OriginInfo.freeRefs` (issue #1248 + #1251).
 *
 * Walks an expression AST, collects bare identifier references, and resolves
 * each one to a `BindingKind` using the analyzer's binding environment.
 * Phase 2 (relocate, emit) reads the resulting `FreeReference[]` to decide
 * rewrite shape per identifier without re-walking the AST or running regex.
 *
 * This is the single classification entry point that future passes consume;
 * the legacy `isReactiveExpression` / regex / TypeChecker fan-out collapses
 * onto this once `origin` is populated uniformly.
 */

import ts from 'typescript'
import type {
  BindingKind,
  FreeReference,
  Scope,
  ImportInfo,
  SignalInfo,
  MemoInfo,
  ParamInfo,
  ConstantInfo,
  FunctionInfo,
} from './types.ts'
import { isReactiveType } from './reactivity-checker.ts'
import { incrementCounter } from './instrumentation.ts'

/**
 * Subset of `AnalyzerContext` / `TransformContext` that this resolver reads.
 * Kept as a structural type so the same helper works from either side without
 * dragging in the full context shape (and the circular imports that would bring).
 */
export interface BindingEnvironment {
  signals: readonly SignalInfo[]
  memos: readonly MemoInfo[]
  propsParams: readonly ParamInfo[]
  propsObjectName: string | null
  restPropsName: string | null
  localConstants: readonly ConstantInfo[]
  localFunctions: readonly FunctionInfo[]
  imports: readonly ImportInfo[]
  ambientGlobals: ReadonlySet<string>
  /** Active `.map()` callback parameter names — present inside loop bodies. */
  loopParams?: ReadonlySet<string>
  checker: ts.TypeChecker | null
}

/**
 * Per-environment cache for the binding map. `BindingEnvironment` identity
 * is stable per (analyzer, loopParams snapshot) — `jsx-to-ir.ts` memoizes
 * `makeBindingEnv` so the same object is reused across every
 * `resolveFreeRefs` call within a loop scope. With N expressions per
 * component and M bindings per env, this drops binding-table construction
 * from O(N*M) to O(N + M).
 */
const _bindingMapCache: WeakMap<BindingEnvironment, Map<string, BindingKind>> = new WeakMap()

/**
 * Build a name → BindingKind table from the binding environment.
 *
 * Order of precedence matters: a loop callback parameter shadows an outer
 * `init-local`; an `init-local` shadows a `module-import`. The table is
 * keyed by name only — the resolver does not track lexical scopes per
 * identifier site, which is fine for the analyzer's current usage but
 * misses true shadowing inside nested arrows. That is the next refinement
 * (issue #1251 shadowing tests).
 *
 * Memoized via `_bindingMapCache` so repeated `resolveFreeRefs` calls
 * against the same env reuse one table.
 */
function buildBindingMap(env: BindingEnvironment): Map<string, BindingKind> {
  const cached = _bindingMapCache.get(env)
  if (cached) return cached
  const map = new Map<string, BindingKind>()

  // Lowest precedence first — later writes override.
  for (const imp of env.imports) {
    for (const spec of imp.specifiers) {
      const visibleName = spec.alias ?? spec.name
      map.set(visibleName, 'module-import')
    }
  }
  for (const fn of env.localFunctions) {
    map.set(fn.name, 'init-local')
  }
  for (const c of env.localConstants) {
    map.set(c.name, 'init-local')
  }
  for (const p of env.propsParams) {
    // `children` from destructured props is server-rendered into the
    // outer HTML, not a reactive value — treat it the same as the
    // `props.children` skip below. Matches the legacy
    // `isPropsReference` filter (`.filter(p => p.name !== 'children')`).
    // Without this skip, `<div>{children}</div>` in a destructuring
    // component (e.g. SelectGroup) classifies `children` as `prop` and
    // the OR-combined `reactive` flag promotes it to a text slot,
    // breaking SSR hydration on every UI component that forwards
    // children.
    if (p.name === 'children') continue
    map.set(p.name, 'prop')
  }
  if (env.propsObjectName !== null) {
    map.set(env.propsObjectName, 'prop')
  }
  if (env.restPropsName !== null) {
    map.set(env.restPropsName, 'prop')
  }
  for (const s of env.signals) {
    map.set(s.getter, 'signal-getter')
    if (s.setter !== null) map.set(s.setter, 'signal-setter')
  }
  for (const m of env.memos) {
    map.set(m.name, 'memo-getter')
  }
  // Highest precedence — innermost scope.
  if (env.loopParams) {
    for (const name of env.loopParams) map.set(name, 'render-item')
  }

  _bindingMapCache.set(env, map)
  return map
}

/**
 * Default `bindingScope` assignment for a given `BindingKind`. Mirrors the
 * authoring scope in the canonical SCOPE_FORBIDDEN table — `prop`-kind refs
 * are introduced in `init` scope (component body), `render-item` in
 * `render-item` scope, and so on.
 */
function defaultBindingScope(kind: BindingKind): Scope {
  switch (kind) {
    case 'render-item':
      return 'render-item'
    case 'sub-init-local':
      return 'sub-init'
    case 'module-import':
    case 'module-local':
    case 'global':
      return 'module'
    // signal/memo/prop/init-local are all introduced in the component body
    case 'prop':
    case 'signal-getter':
    case 'signal-setter':
    case 'memo-getter':
    case 'reactive-brand':
    case 'init-local':
    default:
      return 'init'
  }
}

/**
 * Collect every bare identifier reference inside `node`. Skips positions
 * that are not references (property names, key names, JSX tag names).
 *
 * This is intentionally an over-collection — we keep duplicate names so
 * the resolver can dedupe after kind resolution (a name resolved to two
 * different kinds in different positions is rare but possible with future
 * shadowing support, and dedup-by-name+kind handles that).
 */
function collectIdentifiers(node: ts.Node): ts.Identifier[] {
  const out: ts.Identifier[] = []
  const visit = (n: ts.Node, parent?: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      // foo.X — X is a property name
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
      // { X: ... } — X is a key
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return
      // { X } — shorthand key (the value side IS a ref, but in TS AST the
      // single identifier node serves both roles; treat it as a ref)
      // JSX <Tag .../> — Tag identifier. Intrinsic tags (lowercase) are
      // never free refs; component refs are, but the IR builder collects
      // them separately so we skip to avoid double counting. All three
      // JSX element kinds expose a `tagName` field with the same shape.
      if (
        parent &&
        (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
        parent.tagName === n
      ) {
        return
      }
      // JSX attribute name — not a free ref
      if (parent && ts.isJsxAttribute(parent) && parent.name === n) return
      out.push(n)
      return
    }
    ts.forEachChild(n, child => visit(child, n))
  }
  visit(node)
  return out
}

/**
 * Walk the AST and collect every PropertyAccessExpression whose static
 * type carries the Reactive<T> brand. Library getters such as
 * `form.isSubmitting` and `username.error` enter the IR through this path
 * — the leaf identifier (`isSubmitting`) is a property name and so is
 * skipped by `collectIdentifiers`; the reactivity lives on the access
 * expression as a whole.
 *
 * Each match contributes one FreeReference whose `name` is the full
 * access text (e.g. `props.form.isSubmitting`) so it remains uniquely
 * identifiable in downstream emit. The root identifier of the access
 * (e.g. `props`) is reported separately by the identifier walk under its
 * own kind.
 */
function collectReactiveBrandRefs(
  node: ts.Node,
  checker: ts.TypeChecker
): FreeReference[] {
  const out: FreeReference[] = []
  const seen = new Set<string>()
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n)) {
      try {
        const type = checker.getTypeAtLocation(n)
        if (isReactiveType(type)) {
          const accessText = n.getText()
          if (!seen.has(accessText)) {
            seen.add(accessText)
            out.push({
              name: accessText,
              bindingScope: 'init',
              kind: 'reactive-brand',
            })
          }
        }
      } catch {
        // Type resolution can fail when the AST node was parsed in a
        // synthetic SourceFile (transitive-taint recursion path) but the
        // checker is rooted in a different Program. Surface the count via
        // instrumentation so the bench harness can flag the divergence
        // instead of letting it accumulate as silent misclassification.
        incrementCounter('freeRefsTypeLookupFailures')
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

/**
 * Re-parse a constant's initializer text (stored as a string in
 * `ConstantInfo.value`) and resolve its own freeRefs. Used by transitive
 * taint propagation: `const x = doubled` should surface `doubled`'s
 * `memo-getter` kind when something reads `x` later.
 *
 * Returns an empty array on parse failure or when the constant has no
 * recorded `value`.
 */
function resolveConstantInitializerRefs(
  c: import('./types.ts').ConstantInfo,
  env: BindingEnvironment,
  visited: Set<string>
): FreeReference[] {
  if (c.value === undefined) return []
  // Skip locals whose initializer is an arrow / function expression. The
  // references inside the function body do not run at the consuming
  // expression's read site — they run when (and if) the function is
  // invoked, and the invocation gets its own reactivity classification
  // from the consumer's expression. Recursing into the body here
  // over-classifies (e.g. `const numMonths = () => props.numberOfMonths
  // ?? 1` would taint any `numMonths()` call site with a `prop` ref even
  // though the props read is gated by the call). Matches the legacy
  // `isReactiveExpression` semantics, which never walked into function
  // bodies during constant taint analysis.
  if (c.containsArrow) return []
  // Wrap in parens so any expression form parses as a single expression.
  const sf = ts.createSourceFile(
    '__const_init.ts',
    `const __probe = (${c.value});`,
    ts.ScriptTarget.Latest,
    true
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return []
  const decl = stmt.declarationList.declarations[0]
  if (!decl || !decl.initializer) return []
  const expr = ts.isParenthesizedExpression(decl.initializer)
    ? decl.initializer.expression
    : decl.initializer
  return resolveFreeRefsInternal(expr, env, visited)
}

/**
 * Inner resolver shared between the top-level `resolveFreeRefs` call and
 * the transitive-taint expansion path. `visited` tracks identifier names
 * already expanded to break cycles like `const a = b; const b = a`.
 */
function resolveFreeRefsInternal(
  node: ts.Node,
  env: BindingEnvironment,
  visited: Set<string>
): FreeReference[] {
  const bindingMap = buildBindingMap(env)
  const idents = collectIdentifiers(node)

  const seen = new Set<string>()
  const out: FreeReference[] = []

  for (const ident of idents) {
    const name = ident.text

    // `props.children` is rendered into the server-side HTML (it is the
    // child slot, not a reactive value). Treat the `props` identifier as
    // a non-reactive reference *only* in this position so consumers don't
    // wrap the surrounding expression in createEffect just because it
    // touches `props`. Matches the legacy `isPropsReference` semantics.
    if (env.propsObjectName === name) {
      const parent = ident.parent
      if (
        parent &&
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === ident &&
        parent.name.text === 'children'
      ) {
        continue
      }
    }

    let kind: BindingKind | undefined = bindingMap.get(name)

    // Reactive<T> brand check on the bare identifier (memo as value).
    if (env.checker) {
      try {
        const type = env.checker.getTypeAtLocation(ident)
        if (isReactiveType(type)) {
          if (
            kind === undefined ||
            kind === 'module-import' ||
            kind === 'module-local' ||
            kind === 'global'
          ) {
            kind = 'reactive-brand'
          }
        }
      } catch {
        // See the equivalent catch in `collectReactiveBrandRefs`: ignored
        // here so the resolver still produces a useful (if conservative)
        // result, surfaced via instrumentation for the bench harness.
        incrementCounter('freeRefsTypeLookupFailures')
      }
    }

    if (kind === undefined) {
      if (env.ambientGlobals.has(name)) continue
      kind = 'global'
    }

    const dedupKey = `${name}::${kind}`
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey)
      out.push({
        name,
        bindingScope: defaultBindingScope(kind),
        kind,
      })
    }

    // Transitive taint: when a referenced identifier is a local constant,
    // recurse into its initializer so the consumer sees the *kinds* the
    // constant captures. `const x = doubled` → reading `x` surfaces a
    // `memo-getter` for `doubled` here, which is what makes `<div>{x()}</div>`
    // wrap correctly without the regex Phase-2 rescan.
    if (kind === 'init-local' && !visited.has(name)) {
      visited.add(name)
      const constInfo = env.localConstants.find(c => c.name === name)
      if (constInfo !== undefined) {
        for (const transitive of resolveConstantInitializerRefs(constInfo, env, visited)) {
          const tk = `${transitive.name}::${transitive.kind}`
          if (seen.has(tk)) continue
          seen.add(tk)
          out.push(transitive)
        }
      }
    }
  }

  // Property-access brand walk — catches `form.isSubmitting` etc.
  if (env.checker) {
    for (const brandRef of collectReactiveBrandRefs(node, env.checker)) {
      const dedupKey = `${brandRef.name}::${brandRef.kind}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)
      out.push(brandRef)
    }
  }

  return out
}

/**
 * Resolve `node`'s free-identifier references against `env` and return one
 * `FreeReference` per (name, kind) pair encountered. References that flow
 * through a local constant are recursively expanded so the consumer sees
 * the constant's *kind composition*, not just the local name.
 */
/**
 * Whether `name` is bound by anything in the environment — an import, a
 * local const/function, a prop param, a signal/memo, or an active loop
 * param. Used by Phase 1's render-nothing-literal fold to distinguish
 * the global `undefined` (renders nothing per JSX semantics) from a
 * shadowed local binding named `undefined` (legal, if inadvisable — the
 * shadowed VALUE must render). Cheap: the binding map is memoized per
 * environment.
 */
export function isNameBound(name: string, env: BindingEnvironment): boolean {
  return buildBindingMap(env).has(name)
}

export function resolveFreeRefs(
  node: ts.Node,
  env: BindingEnvironment
): FreeReference[] {
  return resolveFreeRefsInternal(node, env, new Set<string>())
}
