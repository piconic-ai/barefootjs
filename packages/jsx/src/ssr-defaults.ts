// SSR template-variable defaults extractor.
//
// The Mojo (and other template-stash) adapter renders SSR HTML from a
// generated template file (`<%= $variant %>`, `<%= $count %>`, ...) so
// every variable the template references has to live in the stash at
// render time. Without those values, Perl strict mode aborts the
// request with `Global symbol "$variant" requires explicit package
// name`.
//
// This module statically evaluates each component's prop destructure
// defaults, signal initial values, and memo computations into a
// JSON-encodable seed map. The seed lands in the build manifest so the
// Mojolicious plugin can populate the stash automatically — no
// per-component `signal_init` callback required in the user's
// `app.pl`.
//
// Static evaluator scope (intentionally narrow):
//   - JS literals: number, string, boolean, null, undefined
//   - Plain object / array literals built from literals
//   - Coalescing `??`, `||`, `&&`, and ternary `?:`
//   - Numeric / string `+` `-` `*` `/` `%`
//   - Bare property access (`props.X`) and element access resolve to
//     `undefined`, which `??` / `||` flow through to the literal RHS.
//   - Zero-arg function calls of in-scope identifiers resolve to the
//     binding value — covers `count() * 2` in memo computations where
//     `count` is a previously-evaluated signal getter.
//
// Anything outside the above leaves the entry as `null` (a sentinel
// the Perl side falls through to its own template default — typically
// `undef`, which Mojo renders as empty string).

import ts from 'typescript'
import type { IRMetadata } from './types.ts'

/**
 * A single template-variable default. Keyed in the manifest by the
 * template variable name (`variant`, `count`, ...). The Perl-side
 * `register_components_from_manifest` reads these entries to populate
 * each child template's stash.
 */
export interface SsrDefault {
  /**
   * Static fallback value when neither the caller's props nor the
   * adapter's own derivation supplies one. JSON-encodable: number,
   * string, boolean, null, or a tree of plain objects / arrays. `null`
   * when the source expression isn't statically evaluable.
   */
  value: unknown
  /**
   * When set, the manifest consumer prefers `props[propName]` over
   * `value`. Mirrors destructured-prop defaults
   * (`{ variant = 'default' }`) where the template variable maps 1:1
   * to a caller-supplied prop. Omitted for signal / memo entries that
   * are internal to the component.
   */
  propName?: string
  /**
   * When true, this entry is the rest-props bag (`...props`). The
   * consumer wires it up as an aggregate hash rather than picking a
   * single prop.
   */
  isRestProps?: boolean
}

const UNRESOLVED = Symbol('unresolved')
type EvalResult = unknown | typeof UNRESOLVED

// Sentinel: a statement list ran to its end without hitting a `return`
// (so the enclosing branch falls through to the next statement). Kept
// distinct from `UNRESOLVED` (couldn't evaluate) so a falsy guard
// (`if (!key) return X`) continues evaluation instead of bailing.
const NO_RETURN = Symbol('no-return')

interface EvalContext {
  /** Identifier name → previously-resolved value (signal getters, memos). */
  bindings: Record<string, EvalResult>
  /** Names whose `<name>.X` / `<name>[X]` reads should resolve to `undefined`. */
  propsLike: ReadonlySet<string>
}

/**
 * Extract a JSON-encodable defaults map for the SSR stash.
 *
 * The result keys are the template variables the generated SSR
 * template references — every destructured prop parameter plus every
 * signal getter and memo name. Returns `undefined` when the component
 * exposes no template variables (no props, no signals, no memos).
 */
export function extractSsrDefaults(metadata: IRMetadata): Record<string, SsrDefault> | undefined {
  const out: Record<string, SsrDefault> = {}

  const propsLike = new Set<string>()
  if (metadata.propsObjectName) propsLike.add(metadata.propsObjectName)
  for (const p of metadata.propsParams) propsLike.add(p.name)

  // Prop entries. Both parameter forms need one entry per prop:
  //   - Destructured form (`function Foo({ variant = 'default' })`):
  //     each `propsParam` is a template-stash variable; a literal
  //     destructure default becomes the static fallback value.
  //   - Bare-props form (`function Foo(props: Props)`): template-stash
  //     adapters flatten `props.X` to the same bare scalar (`$X` — see
  //     the Mojo emitter's `member()`), NOT a `$props->{X}` hash read,
  //     so an unseeded prop the caller forgets to pass is a strict-mode
  //     compile error, not a soft `undef` (#2126). Seed every declared
  //     prop with a `null` fallback (→ undef; the template-side `// …`
  //     recompute supplies the real default, and a caller-passed prop
  //     wins via `propName`).
  for (const p of metadata.propsParams) {
    if (p.isRest) continue
    if (metadata.propsObjectName === null && p.defaultValue !== undefined) {
      const value = tryStaticEval(p.defaultValue, { bindings: {}, propsLike })
      out[p.name] = { propName: p.name, value: resultToJsonable(value) }
    } else {
      // No destructure default — the template reads the prop as-is;
      // Perl's `//` operator decides what `undef` becomes. The entry
      // still matters so the template variable exists and consumers
      // can supply the propName even with no static fallback.
      out[p.name] = { propName: p.name, value: null }
    }
  }
  // Rest-props bag (`...props`) — tracked separately from `propsParams`
  // by the analyzer. Default to an empty plain hash so adapters can
  // forward it through `spreadAttrs` without a nullability check.
  if (metadata.restPropsName) {
    out[metadata.restPropsName] = { isRestProps: true, value: {} }
  }

  // Signal initial values, in declaration order. Each evaluated value is
  // fed into the bindings map so subsequent memos can reference earlier
  // signals (Counter's `doubled = createMemo(() => count() * 2)`).
  const bindings: Record<string, EvalResult> = {}

  // (#checkbox) Seed module-scope constants so a memo template-literal that
  // references them resolves to a concrete string. Checkbox's `classes` memo
  // interpolates `baseClasses` / `focusClasses` / `errorClasses` (pure string
  // consts) and `stateClasses` (`[...].join(' ')`). Without these in scope the
  // memo evaluates to `null` and the SSR `class="..."` renders empty, diverging
  // from Hono. Only module-scope consts are seeded (component-scope locals can
  // depend on signals/props and are evaluated lazily elsewhere).
  for (const c of metadata.localConstants ?? []) {
    if (!c.isModule || c.value === undefined) continue
    if (c.name in bindings) continue
    const v = tryStaticEval(c.value, { bindings, propsLike })
    if (v !== UNRESOLVED) bindings[c.name] = v
  }
  for (const sig of metadata.signals) {
    if (!sig.getter || sig.isModule) continue
    // Env signals (#2057) have no static SSR default — their value is the
    // request-scoped reader, seeded by the adapter's env-signal binding, not a
    // baked initial value.
    if (sig.envReader) continue
    const value = tryStaticEval(sig.initialValue, { bindings, propsLike })
    out[sig.getter] = { value: resultToJsonable(value) }
    bindings[sig.getter] = value
  }

  for (const memo of metadata.memos) {
    if (memo.isModule) continue
    const value = tryStaticEval(memo.computation, { bindings, propsLike })
    out[memo.name] = { value: resultToJsonable(value) }
    bindings[memo.name] = value
  }

  // Bare-props-arg safety net: the prop block above covers every prop
  // *declared* on the props type, but `propsParams` can miss props read
  // through an untyped / inline-typed `props` object. A signal / memo
  // initializer's `props.X` read is lowered by template-stash adapters
  // to a *bare scalar* recompute (`my $count = ($initial // 0)`, the
  // #1297 prop-derived seeding), and that bare `$initial` has to exist
  // in the stash or Perl's strict mode aborts the render with `Global
  // symbol "$initial" requires explicit package name` — so also seed
  // every prop a signal / memo initializer references. Value is `null`
  // (→ undef): the recompute's own `?? <literal>` supplies the real
  // fallback, and a caller-passed prop still wins via `propName`.
  if (metadata.propsObjectName !== null) {
    const referenced = new Set<string>()
    for (const sig of metadata.signals) {
      if (!sig.getter || sig.isModule || sig.envReader) continue
      collectPropRefs(sig.initialValue, metadata.propsObjectName, referenced)
    }
    for (const memo of metadata.memos) {
      if (memo.isModule) continue
      collectPropRefs(memo.computation, metadata.propsObjectName, referenced)
    }
    for (const name of referenced) {
      // Don't clobber a signal / memo (or already-seeded prop) of the same
      // name — those carry a resolved value the recompute relies on.
      if (name in out) continue
      out[name] = { propName: name, value: null }
    }
  }

  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * Collect the first-level property name of every `propsObjectName.X` access
 * within `expr` (e.g. `props.initial ?? 0` → `initial`). Used to seed the
 * stash vars a template-stash adapter's bare-scalar signal/memo recompute
 * references. A deeper chain (`props.a.b`) still contributes its *base*
 * prop `a`: adapters lower that to `$a->{b}`, so the bare `$a` needs
 * seeding just the same — the walk stops at the first
 * `propsObjectName.<name>` match and collects `a` (not `b`).
 */
function collectPropRefs(
  expr: string | undefined,
  propsObjectName: string,
  out: Set<string>,
): void {
  if (!expr || !expr.trim()) return
  const node = parseExpression(expr)
  if (!node) return
  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === propsObjectName &&
      ts.isIdentifier(n.name)
    ) {
      // `propsObjectName.<name>` — collect <name> and stop. For a deeper
      // chain (`props.a.b`) this node is the inner `props.a`, so we collect
      // the base prop `a` (which lowers to `$a->{b}`); the outer `.b`
      // access has no further `props.` reference to find.
      out.add(n.name.text)
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
}

function resultToJsonable(v: EvalResult): unknown {
  if (v === UNRESOLVED) return null
  if (v === undefined) return null
  return v
}

function tryStaticEval(expr: string, ctx: EvalContext): EvalResult {
  if (!expr || !expr.trim()) return null
  const node = parseExpression(expr)
  if (!node) return UNRESOLVED
  return evalNode(node, ctx)
}

/**
 * Evaluate a block-body's statements for its returned value. Handles
 * `const` declarations (bound into `ctx.bindings`, which mutate in
 * place so later statements and nested branches see them), `return`
 * statements, and `if (cond) …` guards whose condition is statically
 * resolvable — the early-return-on-default-state shape of
 * an `@client`-annotated memo (`const key = sortKey(); if (!key)
 * return payments; … sort …`). A resolvable-but-falsy guard continues
 * to the next statement (`NO_RETURN` from the skipped branch); an
 * unresolvable condition or any other statement kind bails to
 * `UNRESOLVED`. #1897 (data-table's `sortedData`).
 */
function evalStatementsForReturn(
  statements: readonly ts.Statement[],
  ctx: EvalContext,
): EvalResult | typeof NO_RETURN {
  for (const stmt of statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue
        const v = evalNode(d.initializer, ctx)
        // Leave unresolved locals unbound; only a `return` / guard
        // referencing one would then surface UNRESOLVED.
        if (v !== UNRESOLVED) ctx.bindings[d.name.text] = v
      }
    } else if (ts.isReturnStatement(stmt)) {
      return stmt.expression ? evalNode(stmt.expression, ctx) : UNRESOLVED
    } else if (ts.isIfStatement(stmt)) {
      const cond = evalNode(stmt.expression, ctx)
      if (cond === UNRESOLVED) return UNRESOLVED
      const branch = cond ? stmt.thenStatement : stmt.elseStatement
      if (branch) {
        const taken = evalStatementsForReturn(
          ts.isBlock(branch) ? branch.statements : [branch],
          ctx,
        )
        if (taken !== NO_RETURN) return taken
      }
      // Guard not taken (or its branch fell through) — continue.
    } else {
      // Any other statement (loop, side-effecting call) — bail.
      return UNRESOLVED
    }
  }
  return NO_RETURN
}

function parseExpression(expr: string): ts.Expression | null {
  // Wrap in parens so a leading `{}` parses as an object literal rather
  // than an empty block statement.
  const sf = ts.createSourceFile(
    '__ssr_default__.ts',
    `(${expr})`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return null
  const inner = ts.isParenthesizedExpression(stmt.expression)
    ? stmt.expression.expression
    : stmt.expression
  return inner
}

function evalNode(node: ts.Expression, ctx: EvalContext): EvalResult {
  // Strip parentheses / `as` / `satisfies` — they don't affect the value.
  if (ts.isParenthesizedExpression(node)) return evalNode(node.expression, ctx)
  if (ts.isAsExpression(node)) return evalNode(node.expression, ctx)
  if (ts.isSatisfiesExpression(node)) return evalNode(node.expression, ctx)
  if (ts.isTypeAssertionExpression(node)) return evalNode(node.expression, ctx)
  if (ts.isNonNullExpression(node)) return evalNode(node.expression, ctx)

  // `createMemo(() => count() * 2)` stores the full arrow expression
  // string. For evaluation, we only care about the body. The
  // expression-bodied form (`() => expr`) evaluates its body directly; a
  // block-bodied arrow (`() => { const v = …; return \`…\` }`, the Toggle
  // `classes` memo) evaluates its leading `const` declarations into a local
  // binding scope and then its single `return` expression. We don't attempt
  // branch tracking — any control flow before the `return` leaves it
  // unresolved.
  if (ts.isArrowFunction(node)) {
    if (node.parameters.length !== 0) return UNRESOLVED
    if (!ts.isBlock(node.body)) return evalNode(node.body as ts.Expression, ctx)
    const localBindings: Record<string, EvalResult> = { ...ctx.bindings }
    const localCtx: EvalContext = { ...ctx, bindings: localBindings }
    const result = evalStatementsForReturn(node.body.statements, localCtx)
    return result === NO_RETURN ? UNRESOLVED : result
  }

  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isStringLiteralLike(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null

  if (ts.isIdentifier(node)) {
    if (node.text === 'undefined') return undefined
    if (node.text in ctx.bindings) return ctx.bindings[node.text]
    if (ctx.propsLike.has(node.text)) return undefined
    return UNRESOLVED
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const arg = evalNode(node.operand, ctx)
    if (arg === UNRESOLVED) return UNRESOLVED
    switch (node.operator) {
      case ts.SyntaxKind.MinusToken:
        return typeof arg === 'number' ? -arg : UNRESOLVED
      case ts.SyntaxKind.PlusToken:
        return typeof arg === 'number' ? +arg : UNRESOLVED
      case ts.SyntaxKind.ExclamationToken:
        return !arg
    }
    return UNRESOLVED
  }

  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) return UNRESOLVED
      let key: string
      if (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) {
        key = prop.name.text
      } else if (ts.isNumericLiteral(prop.name)) {
        key = prop.name.text
      } else {
        return UNRESOLVED
      }
      const v = evalNode(prop.initializer, ctx)
      if (v === UNRESOLVED) return UNRESOLVED
      obj[key] = v === undefined ? null : v
    }
    return obj
  }

  if (ts.isArrayLiteralExpression(node)) {
    const arr: unknown[] = []
    for (const elem of node.elements) {
      if (ts.isOmittedExpression(elem)) return UNRESOLVED
      const v = evalNode(elem, ctx)
      if (v === UNRESOLVED) return UNRESOLVED
      arr.push(v === undefined ? null : v)
    }
    return arr
  }

  if (ts.isElementAccessExpression(node)) {
    // Index into a resolved object / array with a resolved scalar key — the
    // Toggle `classes` memo's `variantClasses[variant]` where `variantClasses`
    // is a seeded module-const object and `variant` resolved to `'default'`.
    const base = evalNode(node.expression, ctx)
    if (base === undefined) return undefined // `props['X']` → undefined
    if (base === UNRESOLVED || base === null || typeof base !== 'object') return UNRESOLVED
    if (!node.argumentExpression) return UNRESOLVED
    const key = evalNode(node.argumentExpression, ctx)
    if (key === UNRESOLVED || key === undefined || key === null) return UNRESOLVED
    const k = String(key as string | number)
    // Missing key → JS `undefined` (the `??`/`||` defaulting flows through it).
    return Object.prototype.hasOwnProperty.call(base, k)
      ? (base as Record<string, unknown>)[k]
      : undefined
  }

  if (ts.isPropertyAccessExpression(node)) {
    // `props.X` / `props?.X` — read of a binding we know nothing about, so
    // resolve to `undefined`. Chained access (`a.b.c`) collapses the same way
    // because the base read is already undefined.
    const baseResult = evalNode(node.expression, ctx)
    if (baseResult === undefined) return undefined
    return UNRESOLVED
  }

  if (ts.isCallExpression(node)) {
    // Zero-arg call of a bound identifier — resolves the signal getter
    // pattern (`count() * 2` in a memo).
    if (
      node.arguments.length === 0 &&
      ts.isIdentifier(node.expression) &&
      node.expression.text in ctx.bindings
    ) {
      return ctx.bindings[node.expression.text]
    }
    // `<array>.join(<sep?>)` — evaluate when the receiver resolves to an array
    // and the separator (default `,`) is a string. Covers `stateClasses =
    // [...].join(' ')` (#checkbox). Other array methods stay unresolved.
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'join'
    ) {
      const recv = evalNode(node.expression.expression, ctx)
      if (Array.isArray(recv)) {
        let sep = ','
        if (node.arguments.length >= 1) {
          const sepVal = evalNode(node.arguments[0], ctx)
          if (typeof sepVal !== 'string') return UNRESOLVED
          sep = sepVal
        }
        return recv.map(x => (x === null || x === undefined ? '' : `${x}`)).join(sep)
      }
      return UNRESOLVED
    }
    return UNRESOLVED
  }

  if (ts.isConditionalExpression(node)) {
    const cond = evalNode(node.condition, ctx)
    if (cond === UNRESOLVED) return UNRESOLVED
    return cond ? evalNode(node.whenTrue, ctx) : evalNode(node.whenFalse, ctx)
  }

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind

    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      const l = evalNode(node.left, ctx)
      if (l !== UNRESOLVED && l !== null && l !== undefined) return l
      return evalNode(node.right, ctx)
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      const l = evalNode(node.left, ctx)
      if (l !== UNRESOLVED && l) return l
      return evalNode(node.right, ctx)
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const l = evalNode(node.left, ctx)
      if (l === UNRESOLVED) return UNRESOLVED
      if (!l) return l
      return evalNode(node.right, ctx)
    }

    const l = evalNode(node.left, ctx)
    const r = evalNode(node.right, ctx)
    if (l === UNRESOLVED || r === UNRESOLVED) return UNRESOLVED

    switch (op) {
      case ts.SyntaxKind.PlusToken:
        if (typeof l === 'string' || typeof r === 'string') return `${l}${r}`
        if (typeof l === 'number' && typeof r === 'number') return l + r
        return UNRESOLVED
      case ts.SyntaxKind.MinusToken:
        return typeof l === 'number' && typeof r === 'number' ? l - r : UNRESOLVED
      case ts.SyntaxKind.AsteriskToken:
        return typeof l === 'number' && typeof r === 'number' ? l * r : UNRESOLVED
      case ts.SyntaxKind.SlashToken:
        return typeof l === 'number' && typeof r === 'number' && r !== 0 ? l / r : UNRESOLVED
      case ts.SyntaxKind.PercentToken:
        return typeof l === 'number' && typeof r === 'number' && r !== 0 ? l % r : UNRESOLVED
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
        return l === r
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return l !== r
    }
    return UNRESOLVED
  }

  if (ts.isTemplateExpression(node)) {
    // Template literal with no holes is a plain head literal text.
    if (node.templateSpans.length === 0) return node.head.text
    let acc = node.head.text
    for (const span of node.templateSpans) {
      const v = evalNode(span.expression, ctx)
      if (v === UNRESOLVED) return UNRESOLVED
      acc += `${v ?? ''}${span.literal.text}`
    }
    return acc
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text

  return UNRESOLVED
}
