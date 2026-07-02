/**
 * Expression Parser for BarefootJS
 *
 * Parses JavaScript expressions into a structured AST-like representation
 * using TypeScript Compiler API. This enables proper support detection
 * and conversion to backend template syntax.
 */

import ts from 'typescript'

// =============================================================================
// Parsed Expression Types
// =============================================================================

export type ParsedExpr =
  | { kind: 'identifier'; name: string }
  // `raw` is the numeric literal's `ts.NumericLiteral.text` — the token TS
  // itself normalises (separators stripped, radix / exponent folded to
  // decimal: `1_000`/`0x10`/`1e3` → `1000`/`16`/`1000`). It is NOT the
  // verbatim source spelling. Its value is that it equals the exact string an
  // adapter's literal lowering already emits, so a structured lowering matches
  // byte-for-byte — which the lossy `parseFloat` `value` can't guarantee (e.g.
  // `parseFloat('1_000')` is 1, and large integers lose precision). Only
  // populated for numeric literals; string / boolean / null carry their
  // canonical form in `value`.
  | { kind: 'literal'; value: string | number | boolean | null; literalType: 'string' | 'number' | 'boolean' | 'null'; raw?: string }
  | { kind: 'call'; callee: ParsedExpr; args: ParsedExpr[] }
  | { kind: 'member'; object: ParsedExpr; property: string; computed: boolean }
  // Element access with a NON-literal index (`selected()[index]`,
  // `rows[i + 1]`). A literal-index access (`arr[0]`, `obj['key']`)
  // stays a `member` (computed) since the key is statically known and
  // folds into the same property path. The variable case can't, so the
  // index travels as its own `ParsedExpr` for the adapter to lower
  // (array `->[$i]` vs hash `->{$k}` in Perl, `[index]` in JS). #1897
  // (data-table's per-row `selected()[index]`).
  | { kind: 'index-access'; object: ParsedExpr; index: ParsedExpr }
  | { kind: 'binary'; op: string; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'unary'; op: string; argument: ParsedExpr }
  | { kind: 'conditional'; test: ParsedExpr; consequent: ParsedExpr; alternate: ParsedExpr }
  | { kind: 'logical'; op: '&&' | '||' | '??'; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'template-literal'; parts: TemplatePart[] }
  // Expression-bodied arrow (`(a, b) => …`), multi-parameter. A
  // single-`return` block body is normalised to its returned expression;
  // a single object-binding-pattern param (`({done}) => done`) is rewritten
  // to a synthetic identifier param with dotted-access body. Higher-order
  // callbacks (`.filter`/`.sort`/`.reduce`/`.flatMap`) arrive as a generic
  // `call` whose argument is this kind; the adapter serializes `body` to the
  // runtime evaluator (#2018). Block bodies with locals / multiple statements,
  // and array-binding-pattern params, stay `unsupported`.
  | { kind: 'arrow'; params: string[]; body: ParsedExpr }
  // A regex literal carried as its exact source text (`/\/+$/`), so the Go
  // ctor lowering matches the one trailing-slash-strip pattern it recognises
  // (`String.replace`). Outside that narrow surface a regex resolves to
  // `unsupported`.
  | { kind: 'regex'; raw: string }
  | { kind: 'array-literal'; elements: ParsedExpr[] }
  // Object literal `{ a: 1, b: x }` / shorthand `{ a }`. Carried so an
  // adapter that lowers an object *value* (Go `map[string]interface{}`,
  // Perl hashref) can emit from structure instead of re-parsing the
  // source with `ts.createSourceFile`. Only produced for plain literals:
  // every property is a non-computed `key: value` or shorthand `{ key }`.
  // Spreads, computed keys, methods, and getters/setters fall through to
  // `unsupported` (unchanged). `raw` is the original expression string —
  // the same value the old `unsupported` fallback carried — so an adapter
  // that does not yet consume `properties` stays byte-identical by
  // emitting it exactly as it emits `unsupported`. Extending the type
  // adds a TS compile error in every exhaustive `ParsedExpr` switch, the
  // same drift defence used for `array-literal` / `array-method`.
  | { kind: 'object-literal'; properties: ObjectLiteralProperty[]; raw: string }
  // Non-higher-order array methods. Discriminated by `method` so each
  // adapter handles the full set via one exhaustive switch instead of
  // sprinkling per-method branches across the call / member emitters.
  // The set is intentionally narrow; extending it adds a TS compile
  // error in every adapter that hasn't been updated (the same drift
  // defence used for `ParsedExpr.kind`).
  | {
      kind: 'array-method'
      method:
        | 'join'
        | 'includes'
        | 'indexOf'
        | 'lastIndexOf'
        | 'at'
        | 'concat'
        | 'slice'
        | 'reverse'
        | 'toReversed'
        | 'toLowerCase'
        | 'toUpperCase'
        | 'trim'
        | 'toFixed'
        | 'split'
        | 'startsWith'
        | 'endsWith'
        | 'replace'
        | 'repeat'
        | 'padStart'
        | 'padEnd'
      object: ParsedExpr
      args: ParsedExpr[]
    }
  // `.flat(depth?)` (#1448 Tier C). The flatten depth is validated and
  // normalised into a structured `FlatDepth` at parse time — the literal
  // never reaches `args`, so adapters fold via a runtime helper instead of
  // re-inspecting the depth argument. A non-literal depth refuses with
  // BF101 (the depth must be known at template time). See the `.flat` arm
  // in `convertNode`.
  | {
      kind: 'array-method'
      method: 'flat'
      object: ParsedExpr
      args: []
      flatDepth: FlatDepth
    }
  | { kind: 'unsupported'; raw: string; reason: string }

/**
 * One property of an `object-literal` `ParsedExpr`. The key is the
 * resolved (non-computed) property name — for `{ a: 1 }` and shorthand
 * `{ a }` it is `a`; for `{ 'a-b': 1 }` it is `a-b`. Computed keys
 * (`{ [k]: 1 }`) are not represented; such literals fall through to
 * `unsupported` at parse time.
 */
export type ObjectLiteralProperty = {
  key: string
  // The syntactic kind of the key, since `key` normalises all three to a
  // string and so loses the distinction. A consumer that must treat a numeric
  // key (`{ 1: 'a' }`) differently from a same-text string key (`{ '1': 'a' }`)
  // reads this; most consumers ignore it. `identifier` for shorthand.
  keyKind?: 'identifier' | 'string' | 'numeric'
  // Shorthand `{ a }` (the value is the identifier `a`) vs explicit
  // `{ a: <value> }`. The `value` already carries the resolved tree
  // either way; this flag is kept for re-stringification fidelity.
  shorthand: boolean
  value: ParsedExpr
}

/**
 * One comparison key inside a sort comparator. A simple
 * `(a, b) => a.f - b.f` produces a single key; a multi-key
 * `||`-chained comparator (`a.x - b.x || a.y - b.y`) produces one key
 * per `||` operand, applied in priority order as tie-breakers.
 */
export type SortKey = {
  // What value to compare on each item:
  //   { kind: 'self' }         → primitive array, compare items directly
  //   { kind: 'field', field } → struct-field accessor
  key: { kind: 'self' } | { kind: 'field'; field: string }
  // How to compare:
  //   'numeric' → `a - b` subtraction semantics
  //   'string'  → `localeCompare` semantics
  //   'auto'    → relational (`>`/`<`) ternary: compare numerically
  //               when both keys parse as numbers, else lexically.
  //               Both template runtimes apply the same rule so their
  //               output stays byte-equal; this diverges from JS
  //               `<`/`>` only for numeric *strings* (rare in SSR
  //               data — JS would compare those lexically).
  type: 'numeric' | 'string' | 'auto'
  direction: 'asc' | 'desc'
}

/**
 * Structured form of a JS `(a, b) => …` sort comparator. Recovered from
 * the generic `arrow` callback body by {@link sortComparatorFromArrow} as
 * the LEGACY fallback for a comparator the runtime evaluator can't model
 * (`localeCompare` string sorts — `serializeParsedExpr` refuses them).
 * Consumed by the adapters' `bf_sort` / `bf->sort` emit. The shape is
 * intentionally finite — see {@link sortComparatorFromArrow} for the
 * accepted catalogue.
 */
export type SortComparator = {
  // Comparison keys in priority order. A simple comparator has one
  // key; a `||`-chained multi-key comparator has one per operand.
  // Always length >= 1.
  keys: SortKey[]
}

/**
 * Flatten depth for `.flat(depth?)` (#1448 Tier C). A finite non-negative
 * integer flattens that many levels (`.flat()` defaults to `1`; a `0` or
 * negative JS depth means "no flatten" → a shallow copy, normalised to
 * `0` here); `'infinity'` is the `.flat(Infinity)` full-depth form. The
 * depth must be a literal — a non-literal argument can't be resolved at
 * template time and refuses with BF101.
 */
export type FlatDepth = number | 'infinity'

export type TemplatePart =
  | { type: 'string'; value: string }
  | { type: 'expression'; expr: ParsedExpr }

// =============================================================================
// Parsed Statement Types (for block body arrow functions)
// =============================================================================

export type ParsedStatement =
  | { kind: 'var-decl'; name: string; init: ParsedExpr }
  | { kind: 'return'; value: ParsedExpr }
  | {
      kind: 'if';
      condition: ParsedExpr;
      consequent: ParsedStatement[];
      alternate?: ParsedStatement[];  // else / else if chain
    }

// =============================================================================
// Support Level Classification
// =============================================================================

export type SupportLevel =
  | 'L1' // Simple identifiers and signals: count(), name
  | 'L2' // Member access and .length: user.name, items().length
  | 'L3' // Comparison operators: count() > 0, filter() === 'all'
  | 'L4' // Logical operators: a && b, !isLoading()
  | 'L5' // Higher-order functions with simple predicates: items().filter(x => !x.done).length
  | 'L5_UNSUPPORTED' // Higher-order functions with complex predicates

export interface SupportResult {
  supported: boolean
  level?: SupportLevel
  reason?: string
  /**
   * The `reason` already spells out the fix (the pre-compute / `@client`
   * hint, or a tailored message like the `forEach` diagnostic), so adapters
   * surface it as-is instead of appending their own remediation block.
   * Low-level reasons (operators, comparators, predicates) leave this unset.
   */
  selfContained?: boolean
}

// JS Array / String prototype methods that the template-language
// adapters (Mojo, Go) don't yet lower. The parser routes any
// `<recv>.<method>(...)` call against one of these names to the
// `call` arm of `isSupported`, which records BF101 — surfacing a
// loud refusal at compile time instead of silently emitting a
// `${obj}->{method}(...)` hash lookup that breaks at render time.
//
// A method gets removed from this set when its lowering lands —
// the same flow the higher-order family used in #1443 (parser
// intercepts the call shape before it falls through to this gate,
// see the `higher-order` and `array-method` carve-outs in
// `convertNode`'s call branch).
//
// The Hono / CSR adapters never consult `isSupported` (they
// evaluate JS at runtime via hono/jsx) so this set only constrains
// the template-language adapters.
const UNSUPPORTED_METHODS = new Set([
  // Higher-order array methods. Seven of these (`filter`, `every`,
  // `some`, `find`, `findIndex`, `findLast`, `findLastIndex`) are
  // intercepted as `higher-order` IR before reaching this gate.
  // `map` is intercepted as an IRLoop when its callback returns JSX,
  // and as a `CALLBACK_METHODS` evaluator lowering (`map_eval`, #2073)
  // when it returns a value — it stays listed here so the fall-throughs
  // (a bare `arr.map` reference, a function-reference callback) still
  // refuse loudly. `reduce` / `reduceRight` stay
  // listed here so the shapes the Tier C catalogue can't lower still
  // refuse loudly: the `convertNode` call branch intercepts a matching
  // `.reduce(fn, init)` / `.reduceRight(fn, init)` into the structured
  // `array-method` + `ReduceOp` form *before* this gate (returning
  // early), so only the unlowerable fall-throughs (a `.reduce(fn)` with
  // no initial value, or a bare method reference) reach the gate and
  // refuse. A 2-arg call whose reducer/init shape is off-catalogue
  // returns an explicit `unsupported` from the call branch with a richer
  // message. The rest stay refused — see #1448 Tier C for the design
  // questions. `forEach` carries a tailored reason (see
  // `UNSUPPORTED_METHOD_REASONS`).
  // `flat` is no longer here — `.flat(depth?)` lowers via the
  // `array-method` IR (structured `FlatDepth`) + `bf_flat` (Go) /
  // `bf->flat` (Mojo). `flatMap` stays listed as a fallback: the
  // field-projection form (`i => i` / `i => i.field`) lowers via a
  // structured `FlatMapOp`. The convertNode arm intercepts EVERY
  // `.flatMap(...)` call before this gate — matching shapes lower, and the
  // off-catalogue / wrong-arity forms get a tailored `unsupported` reason
  // there — so only a bare method *reference* (`arr.flatMap` uncalled)
  // falls through to this gate. The JSX-returning `.flatMap` lowers as an
  // `IRLoop` upstream. See #1448.
  'filter', 'map', 'reduce', 'reduceRight', 'every', 'some',
  'forEach', 'flatMap',
  // #1448 Tier A — Array methods. Each method PR adds the lowering
  // (typically a new `array-method` variant or runtime helper) and
  // removes its row here. See packages/adapter-tests/fixtures/methods/.
  // `includes` is no longer here — both the array-receiver and
  // string-receiver shapes lower via the `array-method` IR + a
  // receiver-type-dispatching runtime helper (`bf_includes` on Go,
  // `$bf->includes(...)` on Mojo).
  // `indexOf` / `lastIndexOf` likewise lower via the `array-method`
  // IR + `bf_index_of` / `bf_last_index_of` (Go) and
  // `bf->index_of` / `bf->last_index_of` (Mojo).
  // `at` lowers via the `array-method` IR + the pre-existing
  // `bf_at` (Go) and a new `bf->at` (Mojo); both support negative
  // indices (`.at(-1)` returns the last element).
  // `concat` lowers via the `array-method` IR + `bf_concat` (Go) /
  // `bf->concat` (Mojo).
  // `slice` lowers via the `array-method` IR + `bf_slice` (Go) /
  // `bf->slice` (Mojo); accepts 1- or 2-arg form (`start` only or
  // `start + end`).
  // `reverse` / `toReversed` lower via the `array-method` IR +
  // `bf_reverse` (Go) / `bf->reverse` (Mojo). The Mojo helper is
  // shared by both shapes; in SSR template context the receiver is
  // never observed so JS's mutation-vs-new-array distinction has
  // no template-level meaning. Both lowerings always return a new
  // array — safest interpretation.
  // #1448 Tier A — String methods.
  // `toLowerCase` / `toUpperCase` lower via the `array-method` IR +
  // `bf_lower` / `bf_upper` (Go) and Perl's native `lc` / `uc` (Mojo).
  // `trim` lowers via the `array-method` IR + `bf_trim` (Go) and a
  // Perl regex strip (Mojo).
  //
  // #1448 follow-up — String methods that have NO lowering yet. These
  // were previously absent from this gate, so `isSupported` reported
  // them "supported" and the adapters emitted a raw method call
  // (`{{.Name.StartsWith "a"}}` on Go, `$name->{startsWith}('a')` on
  // Mojo) with no build diagnostic — a silent footgun that only
  // surfaced as a crash at template-render time. Listing them here
  // makes the build fail loudly with BF101 (the same treatment the
  // unsupported array methods above get), pointing users at the
  // `/* @client */` escape hatch. Each name drops off as its lowering
  // lands. See #1448 "Unsupported string methods" Tier B / Tier C.
  // `split` is no longer here — `String.prototype.split(sep)` lowers
  // via the `array-method` IR + `bf_split` (Go) / `bf->split` (Mojo),
  // returning an array that composes with `.join()` / `.map()` / etc.
  // See #1448 Tier B.
  // `startsWith` / `endsWith` are no longer here — both lower via the
  // `array-method` IR + `bf_starts_with` / `bf_ends_with` (Go) and
  // `bf->starts_with` / `bf->ends_with` (Mojo). See #1448 Tier B.
  // `replace` is no longer here — the string-pattern form lowers via
  // the `array-method` IR + `bf_replace` (Go) / `bf->replace` (Mojo);
  // the regex-pattern form is refused at the parse arm below (it would
  // need the per-adapter regex-flavour decision). `replaceAll` stays
  // refused. See #1448 Tier B.
  // `repeat` is no longer here — `String.prototype.repeat(n)` lowers via
  // the `array-method` IR + `bf_repeat` (Go) / `bf->repeat` (Mojo).
  // See #1448 Tier B.
  // `padStart` / `padEnd` are no longer here — both lower via the
  // `array-method` IR + `bf_pad_start` / `bf_pad_end` (Go) and
  // `bf->pad_start` / `bf->pad_end` (Mojo). See #1448 Tier B.
  'replaceAll',
  'charAt', 'charCodeAt', 'codePointAt', 'normalize',
  'substring', 'substr', 'match', 'matchAll', 'search',
])

// Per-method override reasons for the BF101 refusal. A method here is still
// refused via `UNSUPPORTED_METHODS` above; this only swaps the generic hint
// for a tailored one. Add a row here rather than a branch in the support gate
// when a method needs special wording.
const UNSUPPORTED_METHOD_REASONS: Record<string, string> = {
  // `forEach` returns `undefined`, so the generic pre-compute / @client hint
  // is misleading (renders nothing either way) — steer to `.map(...)` /
  // `createEffect`. Rationale pinned in foreach-client-only.test.ts.
  forEach:
    `'.forEach()' returns undefined and has no template-position meaning. ` +
    `Use it for side effects inside an event handler or createEffect callback ` +
    `(client JS), or use '.map(...)' if you meant to render each item.`,
}

// Methods that lower at their single-argument form but whose EXTRA
// argument is meaningful and NOT yet lowered: the `fromIndex` of
// `.includes` / `.indexOf` / `.lastIndexOf` (the 2-arg form) and the
// additional arrays of a variadic `.concat(a, b, …)`. The relaxed
// per-method arms in `convertNode` accept every method's zero-arg
// defaults (`.join()` / `.slice()` / `.concat()` / `.at()`) and
// JS-ignored trailing arguments; this guard catches only the remaining
// meaningful-extra forms, refusing them with BF101 because silently
// dropping the argument would make the SSR output differ from the
// client. See #1448.
const LOWERED_ARRAY_METHODS = new Set([
  'includes',
  'indexOf',
  'lastIndexOf',
  'concat',
])

// =============================================================================
// Expression Parser
// =============================================================================

/**
 * Extract the single-expression body of an arrow-function source
 * (`() => EXPR` → `EXPR`), using the TypeScript parser rather than a regex so
 * any parameter shape (destructure / defaults / parens) or nested arrow is
 * handled robustly.
 *
 * Returns `null` for a block-bodied arrow (`() => { … }`) or a source that
 * isn't a bare arrow function — callers (e.g. the SSR memo-seeding path) treat
 * those as "not a single lowerable expression". This is the AST-backed
 * replacement for ad-hoc `^\(...\)\s*=>` stripping.
 */
export function extractArrowBodyExpression(source: string): string | null {
  const sf = ts.createSourceFile(
    '__arrow__.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt) || sf.statements.length !== 1) return null
  let expr: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression
  if (!ts.isArrowFunction(expr)) return null
  if (ts.isBlock(expr.body)) return null
  return expr.body.getText(sf).trim()
}

/**
 * One member of a context-provider object-literal value
 * (`<Ctx.Provider value={{ open: () => …, onOpenChange: … }}>`), classified
 * for SSR lowering:
 *
 * - `getter` — a ZERO-parameter arrow with an expression body. At SSR time
 *   the provider value is fixed for the render, so the getter is equivalent
 *   to its body's value snapshot (`open: () => props.open ?? false` reads as
 *   `props.open ?? false`). Arrows with parameters are NOT getters — their
 *   body references the parameter, which has no SSR value.
 * - `function` — any other function shape (parameterised / block-bodied
 *   arrow, function expression, or a `??` / `||` chain with a function
 *   operand). These are behavior, not data: SSR never invokes them, so
 *   adapters lower them to their nil value (`undef` / `nil`).
 * - `expression` — everything else; lowers through the adapter's normal
 *   expression pipeline (so signal getters, props, memo calls keep their
 *   existing SSR seeding semantics).
 */
export type ProviderObjectMember =
  | { name: string; kind: 'getter'; body: string }
  | { name: string; kind: 'function' }
  | { name: string; kind: 'expression'; expr: string }

/**
 * Structurally parse a `<Ctx.Provider value={{ … }}>` object literal into
 * per-member SSR lowering classifications (see `ProviderObjectMember`).
 *
 * Returns `null` when the source is not a plain object literal, or when it
 * contains a shape with no per-member story (spread entry, computed key,
 * get/set accessor) — callers fall back to their existing whole-expression
 * path (typically a BF101 refusal). Shorthand members (`{ search }`) yield
 * an `expression` member with the identifier as the expression; method
 * members (`{ open() {…} }`) classify as `function` like block-bodied
 * arrows.
 */
export function parseProviderObjectLiteral(source: string): ProviderObjectMember[] | null {
  const sf = ts.createSourceFile(
    '__provider__.ts',
    `const __x = (${source});`,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  let init = stmt.declarationList.declarations[0]?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init || !ts.isObjectLiteralExpression(init)) return null

  const isFunctionShaped = (e: ts.Expression): boolean => {
    let v: ts.Expression = e
    while (ts.isParenthesizedExpression(v)) v = v.expression
    if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) return true
    // `props.onX ?? (() => {})` — a fallback chain with a function operand
    // is function-typed regardless of which side wins at runtime.
    if (
      ts.isBinaryExpression(v) &&
      (v.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        v.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return isFunctionShaped(v.left) || isFunctionShaped(v.right)
    }
    return false
  }

  const members: ProviderObjectMember[] = []
  for (const prop of init.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) {
      members.push({ name: prop.name.text, kind: 'expression', expr: prop.name.text })
      continue
    }
    if (ts.isMethodDeclaration(prop)) {
      // `{ open() {…} }` — function-shaped behavior, same as a
      // block-bodied arrow member.
      const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null
      if (name === null) return null // computed key
      members.push({ name, kind: 'function' })
      continue
    }
    if (!ts.isPropertyAssignment(prop)) return null // spread / accessor
    const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
      ? prop.name.text
      : null
    if (name === null) return null // computed key
    let v: ts.Expression = prop.initializer
    while (ts.isParenthesizedExpression(v)) v = v.expression
    if (ts.isArrowFunction(v) && v.parameters.length === 0 && !ts.isBlock(v.body)) {
      members.push({ name, kind: 'getter', body: v.body.getText(sf).trim() })
      continue
    }
    if (isFunctionShaped(v)) {
      members.push({ name, kind: 'function' })
      continue
    }
    members.push({ name, kind: 'expression', expr: v.getText(sf).trim() })
  }
  return members
}

/**
 * A single entry of a JSX `style={{ … }}` object, lowered for SSR. The key is
 * already CSS-cased (`backgroundColor` → `background-color`); the value is
 * either a static string literal or a raw JS expression for the adapter to
 * lower (`color` → its template interpolation).
 */
export type StyleObjectEntry =
  | { cssKey: string; kind: 'literal'; value: string }
  | { cssKey: string; kind: 'expr'; expr: string }

/** camelCase → kebab-case for CSS property names (`backgroundColor` →
 *  `background-color`, `WebkitTransform` → `-webkit-transform`). The `ms`
 *  vendor prefix is lowercase in React style keys (`msTransform`) yet the CSS
 *  property carries a leading dash (`-ms-transform`), so special-case it the
 *  same way React's `hyphenateStyleName` does. */
export function cssKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).replace(/^ms-/, '-ms-')
}

/**
 * Parse a JSX `style={{ … }}` object-literal source into CSS entries, or
 * `null` when the shape isn't a plain object of static-keyed properties
 * (spread, computed key, shorthand, method, getter) — the adapter then keeps
 * refusing it. A bare `{…}` parses as a block statement, so the source is
 * wrapped in parens to force expression context. Used by the template adapters
 * to lower `style={{ backgroundColor: color, padding: '8px' }}` to a CSS
 * string instead of emitting BF101.
 */
export function parseStyleObjectEntries(source: string): StyleObjectEntry[] | null {
  const sf = ts.createSourceFile('__style__.ts', `(${source})`, ts.ScriptTarget.Latest, true)
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt) || sf.statements.length !== 1) return null
  let expr: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression
  if (!ts.isObjectLiteralExpression(expr)) return null
  const entries: StyleObjectEntry[] = []
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) return null // shorthand/spread/method/getter
    let key: string
    if (ts.isIdentifier(prop.name)) key = prop.name.text
    else if (ts.isStringLiteral(prop.name)) key = prop.name.text
    else return null // computed / numeric key
    const cssKey = cssKebabCase(key)
    const init = prop.initializer
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      entries.push({ cssKey, kind: 'literal', value: init.text })
    } else {
      entries.push({ cssKey, kind: 'expr', expr: init.getText(sf).trim() })
    }
  }
  return entries.length > 0 ? entries : null
}

/**
 * Parse a JavaScript expression string into a ParsedExpr tree.
 */
export function parseExpression(expr: string): ParsedExpr {
  const trimmed = expr.trim()
  if (!trimmed) {
    return { kind: 'unsupported', raw: expr, reason: 'Empty expression' }
  }

  // Create a minimal source file containing just the expression
  const sourceFile = ts.createSourceFile(
    'expression.ts',
    trimmed,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  // Get the first statement which should be an expression statement
  if (sourceFile.statements.length === 0) {
    return { kind: 'unsupported', raw: expr, reason: 'No statements found' }
  }

  const firstStmt = sourceFile.statements[0]
  if (!ts.isExpressionStatement(firstStmt)) {
    return { kind: 'unsupported', raw: expr, reason: 'Not an expression statement' }
  }

  return convertNode(firstStmt.expression, expr)
}

/**
 * Convert an already-parsed TypeScript node directly into a {@link ParsedExpr},
 * for a consumer that already holds a `ts.Node` (e.g. a `.sort()` callback at
 * the loop-hoist site) and wants the structured conversion without re-parsing
 * source via `ts.createSourceFile`. An `unsupported` result still carries the
 * node's text in `raw` for debugging (a synthetic node with no source file
 * falls back to '').
 */
export function tsNodeToParsedExpr(node: ts.Node): ParsedExpr {
  let raw = ''
  try {
    raw = node.getText()
  } catch {
    /* synthetic node without a source file */
  }
  return convertNode(node, raw)
}

/**
 * Higher-order array methods whose callback body the runtime evaluator drives
 * (#2018). Recognised generically as a `call` whose callee is `<recv>.<method>`
 * and whose first argument is an `arrow`; the adapter serializes the arrow body
 * to the evaluator. A JSX-returning `.map` / `.flatMap` is an IRLoop upstream
 * and never reaches this recognition; the value-returning `.map(cb)` form
 * (e.g. `tags.map(t => \`#${t}\`).join(' ')`) lowers via `map_eval` (#2073).
 */
export const CALLBACK_METHODS: ReadonlySet<string> = new Set([
  'filter', 'map', 'every', 'some', 'find', 'findIndex', 'findLast', 'findLastIndex',
  'sort', 'toSorted', 'reduce', 'reduceRight', 'flatMap',
])

/**
 * A recognised higher-order callback method call: `<object>.<method>(<arrow>,
 * …rest)` where `method ∈` {@link CALLBACK_METHODS} and the first argument is a
 * generic `arrow`. Returns the receiver, the callback arrow, and any trailing
 * args (e.g. the `.reduce` init), or `null` if the shape doesn't match. The
 * single recognition point shared by the support gate and the adapter dispatch.
 */
export function asCallbackMethodCall(expr: ParsedExpr): {
  method: string
  object: ParsedExpr
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>
  args: ParsedExpr[]
} | null {
  if (expr.kind !== 'call') return null
  if (expr.callee.kind !== 'member' || expr.callee.computed) return null
  if (!CALLBACK_METHODS.has(expr.callee.property)) return null
  const arrow = expr.args[0]
  if (!arrow || arrow.kind !== 'arrow') return null
  return { method: expr.callee.property, object: expr.callee.object, arrow, args: expr.args.slice(1) }
}

/**
 * Resolve a non-computed object-literal property key to its string name.
 * Identifier / string / numeric names resolve to their text; a computed
 * (`[expr]`) or otherwise non-plain key returns null so the caller treats
 * the whole literal as `unsupported`.
 */
function objectLiteralKeyName(
  name: ts.PropertyName,
): { key: string; keyKind: 'identifier' | 'string' | 'numeric' } | null {
  if (ts.isIdentifier(name)) return { key: name.text, keyKind: 'identifier' }
  if (ts.isStringLiteral(name)) return { key: name.text, keyKind: 'string' }
  if (ts.isNumericLiteral(name)) return { key: name.text, keyKind: 'numeric' }
  return null
}

/**
 * Convert a TypeScript AST node to ParsedExpr.
 */
function convertNode(node: ts.Node, raw: string): ParsedExpr {
  // Identifier: count, name, items
  if (ts.isIdentifier(node)) {
    return { kind: 'identifier', name: node.text }
  }

  // String literal: 'all', "completed"
  if (ts.isStringLiteral(node)) {
    return { kind: 'literal', value: node.text, literalType: 'string' }
  }

  // Numeric literal: 0, 5, 3.14. Keep `ts.NumericLiteral.text` in `raw` (TS's
  // normalised token — `1_000`/`0x10`/`1e3` → `1000`/`16`/`1000`) so an adapter
  // emits the exact string its own literal lowering already produces; `value`
  // is the parsed number for structural reasoning.
  if (ts.isNumericLiteral(node)) {
    const value = parseFloat(node.text)
    return { kind: 'literal', value, literalType: 'number', raw: node.text }
  }

  // Boolean literals and null
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: 'literal', value: true, literalType: 'boolean' }
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: 'literal', value: false, literalType: 'boolean' }
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: 'literal', value: null, literalType: 'null' }
  }

  // Call expression: count(), items(), filter()
  if (ts.isCallExpression(node)) {
    const callee = convertNode(node.expression, raw)
    const args = node.arguments.map(arg => convertNode(arg, raw))

    // Higher-order callback methods (`.filter`/`.find`/`.every`/`.some`/
    // `.sort`/`.reduce`/`.flatMap`/…) are NOT folded here (#2018 P5): they
    // flow through as a generic `call` whose argument is a generic `arrow`,
    // and the adapter recognises the callback shape at dispatch and serializes
    // the arrow body to the runtime evaluator. The one exception is the
    // non-arrow `.filter(Boolean)` callable: synthesise the equivalent
    // identity arrow `_ => _` so it flows through the same callback lowering
    // (the adapter keeps a dedicated truthiness fallback for the identity body).
    if (
      callee.kind === 'member' &&
      !callee.computed &&
      callee.property === 'filter' &&
      args.length === 1 &&
      args[0].kind === 'identifier' &&
      args[0].name === 'Boolean'
    ) {
      return {
        kind: 'call',
        callee,
        args: [{ kind: 'arrow', params: ['_'], body: { kind: 'identifier', name: '_' } }],
      }
    }

    // Non-higher-order array methods (#1443). Lifting these into an
    // `array-method` IR node — instead of detecting at each adapter's
    // `call()` emitter — keeps the abstraction at the IR layer where
    // it belongs: an array supports `.join`, and the per-target
    // lowering is the adapter's choice. Adding `.concat` / `.slice` /
    // etc. later means widening the IR discriminator, not adding more
    // branches to every adapter's call dispatch.
    if (callee.kind === 'member' && !callee.computed) {
      // `.join()` / `.join(sep)` — JS defaults the separator to `,` when
      // omitted and ignores any extra arguments. Accept every arity; the
      // adapters supply the default separator and read only `args[0]`.
      if (callee.property === 'join') {
        return { kind: 'array-method', method: 'join', object: callee.object, args }
      }
      // `.includes(x)` — shared between `Array.prototype.includes` and
      // `String.prototype.includes`. The parser can't tell the receiver
      // type without TS inference, so both shapes lower through the
      // same IR node and each adapter dispatches at the runtime level
      // (`bf_includes` on Go uses `reflect.Kind()`; `$bf->includes`
      // on Mojo uses `ref()`). See #1448 Tier A.
      if (callee.property === 'includes' && args.length === 1) {
        return { kind: 'array-method', method: 'includes', object: callee.object, args }
      }
      // `.indexOf(x)` / `.lastIndexOf(x)` — value-equality search,
      // both adapters dispatch through a runtime helper that walks
      // the slice (forward / backward) and compares with `DeepEqual`
      // (Go) / `eq` (Perl). The existing `bf_find_index` (Go)
      // operates on struct-field equality and stays — see the
      // higher-order `.find` lowering. See #1448 Tier A.
      if ((callee.property === 'indexOf' || callee.property === 'lastIndexOf') && args.length === 1) {
        return { kind: 'array-method', method: callee.property, object: callee.object, args }
      }
      // `.at(i)` — negative-index support (`.at(-1)` is the last
      // element). Go has `bf_at` registered already (see runtime
      // FuncMap); Mojo's `bf->at` wraps the same arithmetic.
      // See #1448 Tier A.
      // `.at(i)` — JS ignores any argument past the first, and `.at()`
      // with no argument is `.at(0)` (the first element). Accept every
      // arity; the adapters read `args[0]` (defaulting the index to 0).
      if (callee.property === 'at') {
        return { kind: 'array-method', method: 'at', object: callee.object, args }
      }
      // `.concat()` / `.concat(other)` — `.concat()` returns a shallow
      // copy (indistinguishable from the receiver in an SSR snapshot),
      // and `.concat(other)` merges the two arrays. Go uses `bf_concat`
      // (reflect-based append into `[]any`); Mojo uses `bf->concat`
      // (Perl list builder). The VARIADIC form (`.concat(a, b, …)`) is
      // not lowered yet — it's refused by the guard below rather than
      // silently dropping the extra arrays.
      if (callee.property === 'concat' && args.length <= 1) {
        return { kind: 'array-method', method: 'concat', object: callee.object, args }
      }
      // `.slice()` / `.slice(start)` / `.slice(start, end)` — route
      // through `bf_slice` (Go) / `bf->slice` (Mojo). A missing `start`
      // defaults to 0 (full copy), a missing / undef `end` means "to
      // length", and JS ignores any third+ argument. Accept every arity;
      // the adapters read only `args[0]` / `args[1]`.
      if (callee.property === 'slice') {
        return { kind: 'array-method', method: 'slice', object: callee.object, args }
      }
      // `.reverse()` and `.toReversed()` — both zero-arg shapes
      // share the runtime lowering. SSR templates render a snapshot
      // of state, so JS's mutate-and-return-receiver (`reverse`)
      // vs return-new-array (`toReversed`) distinction has no
      // template-level meaning; both produce a new reversed array.
      // JS takes no argument and ignores any that are passed.
      if (callee.property === 'reverse' || callee.property === 'toReversed') {
        return { kind: 'array-method', method: callee.property, object: callee.object, args }
      }
      // `.flat(depth?)` — flatten nested arrays `depth` levels deep
      // (default 1). The depth is validated to a literal and normalised
      // into a structured `FlatDepth` here: `Infinity` becomes the
      // full-depth form, a 0 / negative JS depth normalises to 0 ("no
      // flatten" → shallow copy), and a fractional literal truncates
      // toward zero (JS ToIntegerOrInfinity). A NON-literal depth can't be
      // resolved at template time, so it refuses with BF101 rather than
      // emitting a broken helper call. Go uses `bf_flat`; Mojo uses
      // `bf->flat`. See #1448 Tier C.
      if (callee.property === 'flat') {
        const depthNode = node.arguments[0]
        let flatDepth: FlatDepth
        if (depthNode === undefined) {
          flatDepth = 1
        } else if (ts.isIdentifier(depthNode) && depthNode.text === 'Infinity') {
          flatDepth = 'infinity'
        } else {
          let n: number | undefined
          if (ts.isNumericLiteral(depthNode)) {
            n = Number(depthNode.text)
          } else if (
            ts.isPrefixUnaryExpression(depthNode) &&
            depthNode.operator === ts.SyntaxKind.MinusToken &&
            ts.isNumericLiteral(depthNode.operand)
          ) {
            n = -Number(depthNode.operand.text)
          }
          if (n === undefined || Number.isNaN(n)) {
            return {
              kind: 'unsupported',
              raw,
              reason: `\`.flat(depth)\` needs a literal integer or \`Infinity\` depth — a computed depth can't be resolved at template time. Use a literal depth, or pre-compute the value before the template.`,
            }
          }
          const truncated = Math.trunc(n)
          flatDepth = truncated < 0 ? 0 : truncated
        }
        return { kind: 'array-method', method: 'flat', object: callee.object, args: [], flatDepth }
      }
      // `.toLowerCase()` — string-only (the IR carries a value-builtin
      // tag, not a receiver-type discriminator, so the `array-method`
      // label is a misnomer for string methods but the mechanical
      // pipeline matches). Go uses the existing `bf_lower` helper;
      // Mojo uses Perl's native `lc`. See #1448 Tier A.
      if (callee.property === 'toLowerCase') {
        return { kind: 'array-method', method: 'toLowerCase', object: callee.object, args }
      }
      // `.toUpperCase()` — Go uses the existing `bf_upper` helper;
      // Mojo uses Perl's native `uc`.
      if (callee.property === 'toUpperCase') {
        return { kind: 'array-method', method: 'toUpperCase', object: callee.object, args }
      }
      // `.trim()` — Go uses the existing `bf_trim` helper; Mojo uses
      // a new `bf->trim` method that mirrors JS's "strip leading +
      // trailing whitespace" semantic via a Perl regex.
      if (callee.property === 'trim') {
        return { kind: 'array-method', method: 'trim', object: callee.object, args }
      }
      // `.toFixed(digits?)` — Number → fixed-decimal string. The digit
      // count (default 0) travels as the single arg; all adapters route
      // through a `to_fixed` runtime helper (Perl) / `fmt.Sprintf` (Go)
      // so JS's rounding + zero-padding semantics match. #1897
      // (data-table's `payment.amount.toFixed(2)`).
      if (callee.property === 'toFixed') {
        return { kind: 'array-method', method: 'toFixed', object: callee.object, args }
      }
      // `.split()` / `.split(sep)` / `.split(sep, limit)` — string →
      // array, full JS arity. `.split()` (no separator) returns the
      // whole string as a single element; `.split(sep)` splits on the
      // (literal) separator; the optional `limit` caps the number of
      // pieces. JS ignores a third+ argument. Go uses `bf_split`
      // (`strings.Split`, optional limit, normalised to `[]any`) and
      // `bf_arr` for the no-separator whole-string case; Mojo uses
      // `bf->split`. The regex-separator form stays refused (the parser
      // never reaches here for it — a regex literal arg is `unsupported`
      // and propagates). See #1448 Tier B.
      if (callee.property === 'split') {
        return { kind: 'array-method', method: 'split', object: callee.object, args }
      }
      // Arity guard for the forms whose EXTRA argument changes the
      // result and is not yet lowered: the `fromIndex` of `.includes` /
      // `.indexOf` / `.lastIndexOf` (the 2-arg form), and the additional
      // arrays of a variadic `.concat(a, b, …)`. Silently dropping those
      // would make the SSR output *differ* from the client (worse than a
      // build error), so they refuse with BF101 until lowered. (The
      // single-argument forms, zero-arg defaults, and JS-ignored
      // trailing arguments of every method are accepted by the relaxed
      // arms above.) See #1448.
      if (LOWERED_ARRAY_METHODS.has(callee.property)) {
        const argName = callee.property === 'concat' ? 'other' : 'x'
        const detail =
          callee.property === 'concat'
            ? 'the variadic `.concat(a, b, …)` form'
            : `\`.${callee.property}(…)\` with ${args.length} argument(s)`
        return {
          kind: 'unsupported',
          raw,
          reason: `${detail} is not yet lowered to the Go/Mojo template adapters. Use the single-argument \`.${callee.property}(${argName})\` form, or pre-compute the value before the template.`,
        }
      }
      // `.startsWith(search, position?)` / `.endsWith(search, endPosition?)`
      // — string → boolean, full JS arity. Go uses `bf_starts_with` /
      // `bf_ends_with` (wrapping `strings.HasPrefix` / `strings.HasSuffix`,
      // with an optional position that re-anchors the comparison); Mojo
      // uses `bf->starts_with` / `bf->ends_with` (substr comparison). JS
      // ignores a third+ argument. The zero-arg form (`.startsWith()`) is
      // refused: JS coerces the missing search to the literal string
      // "undefined", a degenerate result not worth lowering (mirrors the
      // `.includes()` zero-arg refusal). See #1448 Tier B.
      if (callee.property === 'startsWith' || callee.property === 'endsWith') {
        if (args.length === 0) {
          return {
            kind: 'unsupported',
            raw,
            reason: `\`.${callee.property}()\` with no search string is not lowered — JS coerces the missing argument to the string "undefined", a degenerate result. Pass an explicit search string, or pre-compute the value before the template.`,
          }
        }
        return { kind: 'array-method', method: callee.property, object: callee.object, args }
      }
      // `.replace(pattern, replacement)` — string-pattern form,
      // replacing the FIRST occurrence (JS semantics for a string
      // pattern). Go uses `bf_replace` (`strings.Replace` with n=1);
      // Mojo uses `bf->replace` (index/substr splice, no regex). A
      // regex-literal pattern is the deferred form — its `regex` first
      // arg is carried STRUCTURALLY (not collapsed to `unsupported`) so
      // the Go ctor lowering can recover the one trailing-slash pattern
      // it supports without re-parsing (#2039). Template use stays
      // refused: `isSupported` maps a regex-pattern `.replace` to the
      // deferred-form BF101 reason — the Perl `s///` vs Go
      // `regexp.ReplaceAllString` flavour gap is the open design
      // question in #1448. `replaceAll` stays refused entirely.
      //
      // Full JS arity: a third+ argument is ignored (the adapter reads
      // only the pattern + replacement). The one- and zero-argument
      // forms are refused: JS coerces the missing replacement (and
      // pattern) to the literal string "undefined", a degenerate result
      // (mirrors the `.includes()` / `.startsWith()` zero-arg refusal).
      if (callee.property === 'replace') {
        if (args.length < 2) {
          return {
            kind: 'unsupported',
            raw,
            reason: `\`.replace(${args.length === 0 ? '' : 'pattern'})\` needs both a pattern and a replacement — JS coerces the missing argument to the string "undefined", a degenerate result. Pass both arguments, or pre-compute the value before the template.`,
          }
        }
        // A regex-literal pattern is the deferred form (the Perl `s///`
        // vs Go `regexp.ReplaceAllString` flavour gap, #1448). Its shape
        // is carried structurally — `args[0]` is a `regex` node (convertNode
        // line ~1127) — so a consumer that recognises one fixed pattern (the
        // Go ctor's `/\/+$/` trailing-slash strip → `strings.TrimRight`) reads
        // it from the tree instead of re-parsing the raw (#2039). Returned
        // before the object-literal `badArg` check below so the regex form
        // keeps its dedicated diagnostic precedence; `isSupported` then refuses
        // any template use with the deferred-form reason.
        const patternNode = node.arguments[0]
        if (patternNode && ts.isRegularExpressionLiteral(patternNode)) {
          return { kind: 'array-method', method: 'replace', object: callee.object, args }
        }
        // Treat an object-literal argument like `unsupported` — a `.replace`
        // with an object pattern/replacement isn't lowerable, same as before
        // the `object-literal` kind existed (byte-identical; Roadmap A-1).
        const badArg =
          args[0].kind === 'unsupported' || args[0].kind === 'object-literal'
            ? args[0]
            : args[1].kind === 'unsupported' || args[1].kind === 'object-literal'
              ? args[1]
              : undefined
        if (badArg) {
          const reason = badArg.kind === 'unsupported' ? badArg.reason : 'Unsupported syntax: ObjectLiteralExpression'
          return { kind: 'unsupported', raw, reason }
        }
        return { kind: 'array-method', method: 'replace', object: callee.object, args }
      }
      // `.repeat(n)` — string → string (the receiver concatenated `n`
      // times). Go uses `bf_repeat` (`strings.Repeat`, clamping a
      // negative count to "" instead of panicking); Mojo uses
      // `bf->repeat` (Perl's `x` operator). JS throws RangeError for a
      // negative count, but SSR templates degrade to the empty string
      // rather than crashing the render. See #1448 Tier B.
      // Full JS arity: `.repeat()` (no count) is `repeat(0)` → "" (JS
      // coerces the missing count to 0, not a RangeError), and a
      // second+ argument is ignored. The adapter supplies the `0` for
      // the no-argument form. See #1448 Tier B.
      if (callee.property === 'repeat') {
        return { kind: 'array-method', method: 'repeat', object: callee.object, args }
      }
      // `.padStart(target, pad?)` / `.padEnd(target, pad?)` — string →
      // string, padded to `target` length with `pad` (default a single
      // space) repeated + truncated to fill. Go uses `bf_pad_start` /
      // `bf_pad_end`; Mojo uses `bf->pad_start` / `bf->pad_end`. Both
      // count length in code points (Go runes / Perl chars) so they
      // stay byte-equal — this differs from JS's UTF-16-unit length
      // only for astral-plane receivers, which are vanishingly rare in
      // numeric / space padding. See #1448 Tier B.
      // Full JS arity: `.padStart()` (no target) is `padStart(0)` → the
      // receiver unchanged (JS coerces the missing target to 0), and a
      // third+ argument is ignored. The adapter supplies the `0` for the
      // no-argument form and reads only target + padString.
      if (callee.property === 'padStart' || callee.property === 'padEnd') {
        return { kind: 'array-method', method: callee.property, object: callee.object, args }
      }
      // `.sort` / `.toSorted` / `.reduce` / `.reduceRight` / `.flatMap`
      // (callback methods) are NOT folded here (#2018 P5): they fall through
      // to the generic `call` construction below (callee = member, arg =
      // generic `arrow`), and the adapter serializes the arrow body to the
      // runtime evaluator. The localeCompare-sort fallback recovers a
      // structured comparator from the generic arrow via
      // `sortComparatorFromArrow`.
    }

    return { kind: 'call', callee, args }
  }

  // Array literal: [a, b, c]
  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map(el => convertNode(el, raw))
    return { kind: 'array-literal', elements }
  }

  // Object literal: { a: 1, b: x, shorthand }. Only plain literals are
  // structured — every property must be a non-computed `key: value` or a
  // shorthand `{ key }`. Anything else (spread, computed key, method,
  // getter/setter) falls through to the generic `unsupported` fallback
  // below, exactly as before this kind existed.
  if (ts.isObjectLiteralExpression(node)) {
    const properties: ObjectLiteralProperty[] = []
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const k = objectLiteralKeyName(prop.name)
        if (k === null) return { kind: 'unsupported', raw, reason: `Unsupported syntax: ${ts.SyntaxKind[node.kind]}` }
        properties.push({ key: k.key, keyKind: k.keyKind, shorthand: false, value: convertNode(prop.initializer, raw) })
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const key = prop.name.text
        properties.push({ key, keyKind: 'identifier', shorthand: true, value: { kind: 'identifier', name: key } })
      } else {
        // Spread assignment, method, getter/setter — not a plain map.
        return { kind: 'unsupported', raw, reason: `Unsupported syntax: ${ts.SyntaxKind[node.kind]}` }
      }
    }
    return { kind: 'object-literal', properties, raw }
  }

  // Property access: user.name, items().length
  if (ts.isPropertyAccessExpression(node)) {
    const object = convertNode(node.expression, raw)
    const property = node.name.text

    // Return as normal member - filter.length is handled in adapter
    return { kind: 'member', object, property, computed: false }
  }

  // Element access: items[0], obj['key']
  if (ts.isElementAccessExpression(node)) {
    const object = convertNode(node.expression, raw)
    const argNode = node.argumentExpression
    // `argumentExpression` is non-optional in the TS types but CAN be
    // undefined on an AST recovered from incomplete source (`arr[`). Guard
    // so a half-typed expression surfaces a recoverable BF101 instead of
    // throwing inside `ts.isNumericLiteral(undefined)`.
    if (!argNode) {
      return { kind: 'unsupported', raw, reason: 'Element access with no index expression' }
    }
    // For simple number/string access, store as property
    if (ts.isNumericLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    if (ts.isStringLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    // Variable / expression index (`selected()[index]`, `rows[i + 1]`):
    // carry the index as its own ParsedExpr so the adapter can lower it
    // (the literal forms above fold into a static property path; this
    // one can't). #1897 (data-table).
    const index = convertNode(argNode, raw)
    // An object-literal index (`arr[{…}]`) isn't lowerable — surface it
    // as the whole expression, exactly as an `unsupported` index did
    // before the kind existed (byte-identical; Roadmap A-1).
    if (index.kind === 'unsupported' || index.kind === 'object-literal') return index
    return { kind: 'index-access', object, index }
  }

  // Binary expression: a === b, count > 0, a + b
  if (ts.isBinaryExpression(node)) {
    const left = convertNode(node.left, raw)
    const right = convertNode(node.right, raw)
    const opToken = node.operatorToken

    // Logical operators
    if (opToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return { kind: 'logical', op: '&&', left, right }
    }
    if (opToken.kind === ts.SyntaxKind.BarBarToken) {
      return { kind: 'logical', op: '||', left, right }
    }
    if (opToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      return { kind: 'logical', op: '??', left, right }
    }

    // Convert operator token to string
    const op = getOperatorString(opToken.kind)
    return { kind: 'binary', op, left, right }
  }

  // Prefix unary expression: !value, -count
  if (ts.isPrefixUnaryExpression(node)) {
    const argument = convertNode(node.operand, raw)
    const op = getUnaryOperatorString(node.operator)
    return { kind: 'unary', op, argument }
  }

  // Conditional expression: cond ? a : b
  if (ts.isConditionalExpression(node)) {
    const test = convertNode(node.condition, raw)
    const consequent = convertNode(node.whenTrue, raw)
    const alternate = convertNode(node.whenFalse, raw)
    return { kind: 'conditional', test, consequent, alternate }
  }

  // Parenthesized expression: (a + b)
  if (ts.isParenthesizedExpression(node)) {
    return convertNode(node.expression, raw)
  }

  // Template literal: `Hello ${name}`
  if (ts.isTemplateExpression(node)) {
    const parts: TemplatePart[] = []
    // Head part
    if (node.head.text) {
      parts.push({ type: 'string', value: node.head.text })
    }
    // Spans (expression + literal pairs)
    for (const span of node.templateSpans) {
      parts.push({ type: 'expression', expr: convertNode(span.expression, raw) })
      if (span.literal.text) {
        parts.push({ type: 'string', value: span.literal.text })
      }
    }
    return { kind: 'template-literal', parts }
  }

  // No-substitution template literal: `hello`
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'literal', value: node.text, literalType: 'string' }
  }

  // Regex literal: `/\/+$/`. Carried as exact source text for the Go ctor
  // trailing-slash-strip lowering (`String.replace`).
  if (ts.isRegularExpressionLiteral(node)) {
    return { kind: 'regex', raw: node.getText() }
  }

  // Arrow function / function expression: `x => expr`, `(a, b) => expr`,
  // `({field}) => field`, `function (x) { return … }`. Produces a generic
  // multi-parameter `arrow` (#2018 P5). A single-`return` block body
  // normalises to its returned expression; a single object-binding-pattern
  // param is rewritten to a synthetic identifier param with dotted-access
  // body (destructure support). Higher-order callbacks reach the adapter as
  // a generic `call` whose argument is this kind; the adapter serializes
  // `body` to the runtime evaluator.
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    // Resolve the body expression: an expression-bodied arrow carries it
    // directly; a block body (arrow `=> { … }` or a function expression)
    // must reduce to exactly one `return <expr>;`. Multi-statement /
    // local-var bodies stay refused.
    let body: ParsedExpr
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      body = convertNode(node.body, raw)
    } else {
      const block = node.body as ts.Block
      const stmts = block.statements
      // Fast path: a single `return <expr>` keeps the pre-#2040 conversion
      // (convertNode on the returned node), byte-identical for the existing
      // corpus.
      if (stmts.length === 1 && ts.isReturnStatement(stmts[0]) && stmts[0].expression) {
        body = convertNode(stmts[0].expression, raw)
      } else {
        // General value-producing block: normalize `let`-inline + value `if` /
        // early `return` into a single expression (#2040). Imperative shapes
        // (raw `for` / `while`, `break`, mutation, side effects) don't parse
        // into ParsedStatement, or fall through without a value — either way we
        // refuse with an actionable reason and adapters surface BF101.
        let sf: ts.SourceFile | undefined
        try {
          sf = block.getSourceFile()
        } catch {
          sf = undefined
        }
        const parsed = sf
          ? parseBlockBody(block, sf, n => n.getText(sf))
          : null
        if (!parsed) {
          return { kind: 'unsupported', raw, reason: IMPERATIVE_BLOCK_REASON }
        }
        const folded = foldBlockToExpr(parsed)
        if (!folded.ok) {
          return { kind: 'unsupported', raw, reason: folded.reason }
        }
        body = folded.expr
      }
    }

    // Single object-binding-pattern param: `({done}) => done` (#1443),
    // `({user: {name}}) => name` (#1530), `({done = false}) => done`
    // (#1531), `({done, ...rest}) => rest.priority` (#1532). We
    // synthesise the equivalent dotted-access form so adapters can
    // reuse their existing higher-order paths instead of needing a
    // residual-object-accessor pipeline (#1384 territory). Nested
    // destructure recurses into the inner pattern and threads a
    // dotted path; leaf defaults fold into the rewrite as
    // `(_t.field ?? <default>)`. Top-level rest is rewritten when
    // every reference is `restName.X` member access; value-use
    // shapes refuse with BF021 (#1532). Array binding patterns,
    // nested rest, and defaults at non-leaf (nested-pattern) slots
    // stay unsupported.
    if (node.parameters.length === 1 && ts.isObjectBindingPattern(node.parameters[0].name)) {
      const bindingPattern = node.parameters[0].name
      const fieldMap = new Map<string, DestructureBinding>()
      // `excludedTopKeys` mirrors the JS rest-binding exclusion set:
      // the source-object keys explicitly consumed at the top level
      // (#1532 review). Used by `validateRestUsage` for the
      // `rest.X is always undefined` collision check — `fieldMap`
      // keys on local rename / leaf names and would miss
      // `({done: d, ...rest}) => rest.done` or `({user: {name}, ...rest}) => rest.user`.
      const excludedTopKeys = new Set<string>()
      const collect = collectDestructureBindings(bindingPattern, [], fieldMap, raw, excludedTopKeys)
      if (!collect.ok) {
        return { kind: 'unsupported', raw, reason: collect.reason }
      }
      const restName = collect.restName
      // Post-validate defaults (#1536 review). The rewrite inlines the
      // default at every reference site (`x` → `_t.x ?? <default>`), so
      // two shapes that JS would handle differently both produce
      // surprises here:
      //   1. Cross-binding refs (`({ a, b = a }) => b`): JS resolves
      //      `a` to the destructured field; our rewrite would resolve
      //      it to the outer scope (no per-default substitution against
      //      `fieldMap`). Refuse so the mismatch can't sneak in.
      //   2. Side-effecting defaults (`({ x = getX() }) => x + x`): JS
      //      evaluates the default at most once per call; our rewrite
      //      duplicates the default at every reference site, so a
      //      function-call-like subnode would fire N times. Restrict
      //      defaults to shapes with no function-call-like subnodes
      //      (`call` / `array-method` / `higher-order` / `arrow-fn`).
      //      `member` access stays allowed even though getters/Proxies
      //      can technically side-effect — see the docstring on
      //      `findImpureDefaultNode` for the rationale.
      // Both refusals route back through the standard `unsupported`
      // path so adapters surface BF101; the workaround is to fold the
      // default inline at the binding site.
      for (const [name, entry] of fieldMap) {
        if (!entry.defaultExpr) continue
        const refs = new Set<string>()
        collectIdentifiers(entry.defaultExpr, refs)
        for (const ref of refs) {
          if (fieldMap.has(ref)) {
            return {
              kind: 'unsupported',
              raw,
              reason: `Default value for '${name}' references destructured binding '${ref}'; cross-binding default references are not supported. Workaround: inline the default at the use site.`,
            }
          }
        }
        const impure = findImpureDefaultNode(entry.defaultExpr)
        if (impure) {
          return {
            kind: 'unsupported',
            raw,
            reason: `Default value for '${name}' contains a '${impure}' expression; defaults must have no function-call-like subnodes because the rewrite inlines the default at every reference site. Workaround: bind the result to a closure variable and reference that, or fold the default inline at the use site.`,
          }
        }
      }
      // Post-validate rest usage (#1532). Mode A — `restName.X` member
      // access — rewrites to `_t.X` because the residual object only
      // omits the explicitly-bound keys, and `_t.X` for any `X` not in
      // `fieldMap` returns the same value as `restName.X` would. Any
      // other use of `restName` (call arg, return value, comparison
      // operand, computed key) can't be lowered to template syntax —
      // refuse with BF021 so the user can fall back to `/* @client */`.
      // Also catches `restName.X` where `X` is a declared field — that
      // shape is always `undefined` per JS spec and is a user bug.
      if (restName !== undefined) {
        const check = validateRestUsage(body, restName, excludedTopKeys)
        if (!check.ok) {
          return { kind: 'unsupported', raw, reason: check.reason }
        }
      }
      const syntheticParam = pickSyntheticParam(fieldMap, body)
      const rewritten = substituteDestructuredFields(body, fieldMap, syntheticParam, restName)
      return { kind: 'arrow', params: [syntheticParam], body: rewritten }
    }

    // Every (remaining) parameter must be a plain identifier. Multi-param
    // arrows (sort comparators `(a, b) => …`) and single-param identifier
    // arrows (`x => …`) both land here.
    const params: string[] = []
    for (const p of node.parameters) {
      if (!ts.isIdentifier(p.name)) {
        return { kind: 'unsupported', raw, reason: 'Only identifier (or a single object-destructure) function parameters are supported' }
      }
      params.push(p.name.text)
    }
    return { kind: 'arrow', params, body }
  }

  // Default: unsupported
  return { kind: 'unsupported', raw, reason: `Unsupported syntax: ${ts.SyntaxKind[node.kind]}` }
}

/**
 * Recover a {@link SortComparator} from a generic `(a, b) => …` sort callback
 * arrow (#2018 P5). The LEGACY fallback for a comparator the runtime evaluator
 * can't model (`localeCompare` string sorts — `serializeParsedExpr` refuses
 * them); the adapter calls this only when the eval path returns null. Operates
 * on the generic `arrow` ParsedExpr (params + body subtree) — no `ts` re-parse.
 *
 * The accepted catalogue is finite so the walker stays shallow — no constant
 * folding, no symbol resolution. Returns null if the shape doesn't match
 * exactly, in which case the adapter surfaces BF101.
 *
 * A body is split on top-level `||` into one leaf per operand, giving a
 * multi-key comparator (`a.x - b.x || a.y - b.y` → sort by x, then y). Accepted
 * leaf shapes (each paired ascending / descending by operand order):
 *
 *   a.field - b.field                → field, numeric
 *   a - b                            → self,  numeric
 *   a.field.localeCompare(b.field)   → field, string
 *   a.localeCompare(b)               → self,  string
 *   a.field > b.field ? 1 : -1       → field, auto (relational ternary)
 *   a < b ? -1 : a > b ? 1 : 0       → self/field, auto (3-way)
 *   a === b ? 0 : <relational ternary>  → leading-tie 3-way
 *
 * Function-reference comparators and `localeCompare(b, locale, opts)` (the
 * multi-arg form) return null — deferred follow-ups.
 */
export function sortComparatorFromArrow(arrow: ParsedExpr): SortComparator | null {
  if (arrow.kind !== 'arrow' || arrow.params.length !== 2) return null
  const [paramA, paramB] = arrow.params

  // A `||`-chain is a multi-key comparator: each operand is an independent
  // leaf applied as the next tie-breaker. A non-`||` body is single-key.
  const keys: SortKey[] = []
  for (const operand of flattenLogicalOr(arrow.body)) {
    const key = classifyLeafComparator(operand, paramA, paramB)
    if (!key) return null
    keys.push(key)
  }
  if (keys.length === 0) return null
  return { keys }
}

/**
 * Flatten a top-level `||` chain into its operands (`a || b || c` → `[a, b, c]`).
 * A non-`||` expression returns a single-element list.
 */
function flattenLogicalOr(expr: ParsedExpr): ParsedExpr[] {
  if (expr.kind === 'logical' && expr.op === '||') {
    return [...flattenLogicalOr(expr.left), ...flattenLogicalOr(expr.right)]
  }
  return [expr]
}

/**
 * Classify a single comparator leaf (one `||` operand) into a SortKey.
 * Accepts subtraction (numeric), `localeCompare` (string), and
 * relational-ternary (auto) shapes; returns null otherwise.
 */
function classifyLeafComparator(expr: ParsedExpr, paramA: string, paramB: string): SortKey | null {
  // Subtraction: `a.field - b.field` / `a - b` → numeric.
  if (expr.kind === 'binary' && expr.op === '-') {
    return classifyComparatorOperands(expr.left, expr.right, paramA, paramB, 'numeric')
  }

  // localeCompare (zero-arg form): `<lhs>.localeCompare(<rhs>)` → string. The
  // locale/options form (2–3 args) stays refused.
  if (
    expr.kind === 'call' &&
    expr.callee.kind === 'member' &&
    expr.callee.property === 'localeCompare' &&
    expr.args.length === 1
  ) {
    return classifyComparatorOperands(expr.callee.object, expr.args[0], paramA, paramB, 'string')
  }

  // Relational-ternary sign comparator → auto.
  if (expr.kind === 'conditional') {
    return classifyTernaryComparator(expr, paramA, paramB)
  }

  return null
}

/**
 * Classify two operands against the comparator's two param names. Both must
 * resolve to either the param identifier itself (`self`) or a single-level
 * field access on it (`field`), reference different params, and match on key
 * shape + field name. `paramA` first is ascending, reversed is descending.
 */
function classifyComparatorOperands(
  left: ParsedExpr,
  right: ParsedExpr,
  paramA: string,
  paramB: string,
  type: 'numeric' | 'string',
): SortKey | null {
  const leftRef = classifySortOperand(left, paramA, paramB)
  const rightRef = classifySortOperand(right, paramA, paramB)
  if (!leftRef || !rightRef) return null
  if (leftRef.param === rightRef.param) return null
  if (leftRef.key.kind !== rightRef.key.kind) return null
  if (leftRef.key.kind === 'field' && rightRef.key.kind === 'field' && leftRef.key.field !== rightRef.key.field) {
    return null
  }
  const direction = leftRef.param === 'A' ? 'asc' : 'desc'
  return { key: leftRef.key, type, direction }
}

/**
 * Classify a relational-ternary comparator leaf into an `auto` SortKey.
 * Handles the 2-way sign form (`a.f > b.f ? 1 : -1`), the canonical 3-way
 * (`a.f < b.f ? -1 : a.f > b.f ? 1 : 0`), and a leading equality tie
 * (`a.f === b.f ? 0 : <relational ternary>`).
 */
function classifyTernaryComparator(
  node: Extract<ParsedExpr, { kind: 'conditional' }>,
  paramA: string,
  paramB: string,
): SortKey | null {
  const cond = node.test

  // Leading equality tie: `a.f === b.f ? 0 : <ternary>`.
  if (
    cond.kind === 'binary' &&
    (cond.op === '===' || cond.op === '==') &&
    sameKeyOperands(cond.left, cond.right, paramA, paramB) &&
    numericSign(node.consequent) === 0
  ) {
    const elseBranch = node.alternate
    if (elseBranch.kind === 'conditional') {
      return classifyTernaryComparator(elseBranch, paramA, paramB)
    }
    return null
  }

  // Relational condition: `<left> <op> <right>` with op ∈ {<,>,<=,>=}.
  if (cond.kind !== 'binary') return null
  const isGreater = cond.op === '>' || cond.op === '>='
  const isLess = cond.op === '<' || cond.op === '<='
  if (!isGreater && !isLess) return null

  const leftRef = classifySortOperand(cond.left, paramA, paramB)
  const rightRef = classifySortOperand(cond.right, paramA, paramB)
  if (!leftRef || !rightRef) return null
  if (leftRef.param === rightRef.param) return null
  if (leftRef.key.kind !== rightRef.key.kind) return null
  if (leftRef.key.kind === 'field' && rightRef.key.kind === 'field' && leftRef.key.field !== rightRef.key.field) {
    return null
  }

  // whenTrue must be a non-zero sign literal (±1); whenFalse a bounded shape
  // (sign literal or a nested ternary on the same key). Direction is derived
  // solely from this outer comparison.
  const trueSign = numericSign(node.consequent)
  if (trueSign === null || trueSign === 0) return null
  if (!isBoundedTernaryElse(node.alternate, leftRef.key, paramA, paramB)) return null

  // Rewrite so the condition reads as `aKey <op> bKey` (paramA left).
  const greaterForA = leftRef.param === 'A' ? isGreater : !isGreater
  const asc = greaterForA ? trueSign > 0 : trueSign < 0
  return { key: leftRef.key, type: 'auto', direction: asc ? 'asc' : 'desc' }
}

/** True when both operands resolve to the same key on opposite params. */
function sameKeyOperands(left: ParsedExpr, right: ParsedExpr, paramA: string, paramB: string): boolean {
  const l = classifySortOperand(left, paramA, paramB)
  const r = classifySortOperand(right, paramA, paramB)
  if (!l || !r) return false
  if (l.param === r.param) return false
  if (l.key.kind !== r.key.kind) return false
  if (l.key.kind === 'field' && r.key.kind === 'field' && l.key.field !== r.key.field) return false
  return true
}

/**
 * Sign of a numeric literal with optional unary minus: 1, -1, or 0. Returns
 * null for anything that isn't a (signed) numeric literal.
 */
function numericSign(expr: ParsedExpr): number | null {
  if (expr.kind === 'unary' && expr.op === '-') {
    const inner = numericSign(expr.argument)
    return inner === null ? null : -inner
  }
  if (expr.kind === 'literal' && expr.literalType === 'number' && typeof expr.value === 'number') {
    const n = expr.value
    if (Number.isNaN(n)) return null
    if (n === 0) return 0
    return n > 0 ? 1 : -1
  }
  return null
}

/**
 * The `whenFalse` arm of a relational ternary is bounded if it's a sign
 * literal (±1 / 0) or a nested ternary on the same key (the canonical 3-way).
 */
function isBoundedTernaryElse(
  expr: ParsedExpr,
  key: { kind: 'self' } | { kind: 'field'; field: string },
  paramA: string,
  paramB: string,
): boolean {
  if (numericSign(expr) !== null) return true
  if (expr.kind === 'conditional') {
    const nested = classifyTernaryComparator(expr, paramA, paramB)
    return nested !== null && sortKeyEquals(nested.key, key)
  }
  return false
}

function sortKeyEquals(
  a: { kind: 'self' } | { kind: 'field'; field: string },
  b: { kind: 'self' } | { kind: 'field'; field: string },
): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'field' && b.kind === 'field') return a.field === b.field
  return true
}

/**
 * Resolve a sort operand to a `self` / `field` key on param A or B. A bare
 * param identifier is `self`; a single-level non-computed field access on a
 * param is `field`. Anything deeper returns null.
 */
function classifySortOperand(
  expr: ParsedExpr,
  paramA: string,
  paramB: string,
): { key: { kind: 'self' } | { kind: 'field'; field: string }; param: 'A' | 'B' } | null {
  if (expr.kind === 'identifier') {
    if (expr.name === paramA) return { key: { kind: 'self' }, param: 'A' }
    if (expr.name === paramB) return { key: { kind: 'self' }, param: 'B' }
    return null
  }
  if (expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier') {
    if (expr.object.name === paramA) return { key: { kind: 'field', field: expr.property }, param: 'A' }
    if (expr.object.name === paramB) return { key: { kind: 'field', field: expr.property }, param: 'B' }
  }
  return null
}


/**
 * Per-binding entry stored in `fieldMap`: the dotted path from the
 * synthetic param down to the field, plus an optional default
 * ParsedExpr captured from `({ field = <default> }) => …` (#1531).
 * Defaults are folded into the rewrite as `(<path> ?? <default>)` so
 * adapters reuse the standard logical-`??` lowering instead of
 * needing a residual-undefined accessor pipeline.
 */
type DestructureBinding = {
  path: string[]
  // Present only when the destructure carried `= <expr>`. The
  // ParsedExpr is captured once here and re-emitted verbatim at every
  // substitution site for the bound name. Its identifiers are NOT
  // re-substituted against `fieldMap`, so a default that references
  // another destructured field (`({ a, b = a }) => b`) would resolve
  // `a` against the outer scope rather than `_t.a` — a silent
  // semantic mismatch. The post-collection validation in the
  // `isObjectBindingPattern` arm of `convertNode` explicitly refuses
  // any default whose identifier set intersects `fieldMap.keys()`,
  // so by the time substitution runs every retained default is
  // guaranteed cross-binding-free (#1536 review).
  defaultExpr?: ParsedExpr
}

/**
 * Walk an object-binding pattern and populate `fieldMap` with
 * `localName → { path, defaultExpr? }` entries. Nested patterns extend
 * the path; renamed bindings use the property name (the field on
 * the source object) rather than the local rename. Returns an
 * error result for any shape outside the supported set so the
 * caller can surface an `unsupported` IR node verbatim.
 */
function collectDestructureBindings(
  pattern: ts.ObjectBindingPattern,
  pathPrefix: readonly string[],
  fieldMap: Map<string, DestructureBinding>,
  raw: string,
  excludedTopKeys?: Set<string>,
): { ok: true; restName?: string } | { ok: false; reason: string } {
  let restName: string | undefined
  for (const el of pattern.elements) {
    if (!ts.isBindingElement(el)) {
      return { ok: false, reason: 'Unsupported binding element in destructured filter param' }
    }
    if (el.dotDotDotToken) {
      // Top-level rest pattern (#1532) is supported when every
      // reference to the rest binding is a `restName.X` member access
      // — that's safe to rewrite to `_t.X`, because the residual
      // object only omits explicitly-bound keys, and any `X` not
      // declared in the destructure has the same value via `_t.X` or
      // `restName.X`. Other shapes (value use, computed key) refuse
      // at the post-collection validation step. Nested rest
      // (`pathPrefix.length > 0`) stays refused — we have no
      // "residual object at nested key" accessor for templates.
      if (pathPrefix.length > 0) {
        return { ok: false, reason: 'Rest patterns at nested destructure levels are not supported' }
      }
      if (!ts.isIdentifier(el.name)) {
        return { ok: false, reason: 'Rest patterns must bind to a simple identifier' }
      }
      restName = el.name.text
      continue
    }
    if (ts.isObjectBindingPattern(el.name)) {
      // Nested object pattern: `{ user: { name } }`. The outer slot
      // MUST carry an identifier propertyName — the JS grammar for
      // nested destructure requires `key: <pattern>`, so the
      // shorthand `{ { name } }` doesn't exist. Computed / string
      // / numeric property names stay refused.
      //
      // Default on the NESTED-PATTERN SLOT itself
      // (`({ user: { name } = {} })`) is out of scope — that shape
      // says "if user is undefined, substitute {} before
      // destructuring name", which needs an outer-level `??` paired
      // with the inner walk and multiplies the rewrite paths.
      // Inner-LEAF defaults (`({ user: { name = 'anon' } })`) work
      // fine — they're surfaced by the recursive call below when the
      // inner leaf element is visited, and compose naturally with
      // the threaded property path.
      if (el.initializer) {
        return { ok: false, reason: 'Default values on a nested-pattern slot in destructured filter param are not supported' }
      }
      if (!el.propertyName || !ts.isIdentifier(el.propertyName)) {
        return { ok: false, reason: 'Non-identifier (computed/string/numeric) keys in destructured filter param are not supported' }
      }
      // Track the outer key the nested pattern consumed at this level.
      // It never becomes a local binding (only the nested leaves do),
      // but a top-level rest binding still excludes it (#1532 review):
      // `({ user: { name }, ...rest }) => rest.user` is statically
      // undefined per JS spec, and was previously silently rewritten
      // to `_t.user`. The collision check needs the property name set,
      // not the local-binding `fieldMap` keys.
      if (excludedTopKeys && pathPrefix.length === 0) {
        excludedTopKeys.add(el.propertyName.text)
      }
      const inner = collectDestructureBindings(
        el.name,
        [...pathPrefix, el.propertyName.text],
        fieldMap,
        raw,
        excludedTopKeys,
      )
      if (!inner.ok) return inner
      continue
    }
    if (!ts.isIdentifier(el.name)) {
      // Array binding pattern (`[a, b]`) and other shapes — kept refused
      // per #1530 out-of-scope. Filter predicates rarely receive tuples.
      return { ok: false, reason: 'Array binding patterns in destructured filter param are not supported' }
    }
    // Leaf binding. A non-identifier propertyName (`{ 'x': y }`,
    // `{ 0: y }`) would silently fall back to `localName` and rewrite
    // `y` to `<synthetic>.y` instead of `<synthetic>['x']` — a
    // semantic bug. Refuse explicitly until we extend the path
    // representation to carry computed segments.
    let fieldName: string
    if (el.propertyName) {
      if (!ts.isIdentifier(el.propertyName)) {
        return { ok: false, reason: 'Non-identifier (computed/string/numeric) keys in destructured filter param are not supported' }
      }
      fieldName = el.propertyName.text
    } else {
      fieldName = el.name.text // shorthand: `{done}` ≡ `{done: done}`
    }
    // Leaf default value (`{ done = false }`): parse the initializer
    // through the standard expression pipeline so the rewrite emits
    // `(_t.done ?? false)` instead of a bare accessor (#1531). A
    // default that itself fails to parse surfaces the inner reason
    // rather than the catch-all "Default values… not supported".
    //
    // Semantic gap: JS destructure defaults trigger only on
    // `undefined`, while `??` triggers on `undefined` OR `null`. The
    // gap matters only when a field is explicitly set to `null`; for
    // typed receivers (objects with optional fields) the two are
    // equivalent. Users hitting the `null` case should fold the
    // default inline.
    let defaultExpr: ParsedExpr | undefined
    if (el.initializer) {
      const parsed = convertNode(el.initializer, raw)
      // An object-literal default isn't lowered into a destructured filter
      // predicate yet — refuse it exactly as before the kind existed, with
      // the same reason text the `unsupported` fallback produced (A-1).
      if (parsed.kind === 'unsupported' || parsed.kind === 'object-literal') {
        const reason = parsed.kind === 'unsupported' ? parsed.reason : 'Unsupported syntax: ObjectLiteralExpression'
        return { ok: false, reason: `Default value in destructured filter param failed to parse: ${reason}` }
      }
      defaultExpr = parsed
    }
    fieldMap.set(el.name.text, { path: [...pathPrefix, fieldName], defaultExpr })
    // Top-level leaf: record the consumed source-object key, NOT the
    // local binding name. `({done: d, ...rest}) => rest.done` is the
    // canonical miss for `fieldMap.has(...)` collision detection —
    // `fieldMap` keys on local rename `d`, but JS rest excludes the
    // source key `done` (#1532 review).
    if (excludedTopKeys && pathPrefix.length === 0) {
      excludedTopKeys.add(fieldName)
    }
  }
  return { ok: true, restName }
}

/**
 * Walk a default expression and return the first function-call-like
 * subnode's kind, or `null` if no such node exists (#1536 review). The
 * rewrite inlines the default at every reference site, so any node
 * that obviously fires a function (`call`, `array-method`,
 * `higher-order`, `arrow-fn`) breaks JS's "default evaluated at most
 * once per call" semantic when the bound name is referenced more than
 * once in the body.
 *
 * The check is intentionally narrow: it only refuses function-call-like
 * shapes, not all side effects. `member` access is allowed even though
 * a getter / Proxy trap can technically run code on every read — pure
 * struct-field access is the overwhelmingly common shape in template
 * predicates, and refusing it would lock out idioms like
 * `{ x = config.fallback }`. Users who pass objects with side-effecting
 * getters into a filter predicate are outside the spirit of "render a
 * snapshot of state", so we don't try to defend against them. The
 * remaining shapes (literal / identifier / member / unary / binary /
 * logical / conditional / template-literal / array-literal with pure
 * parts) duplicate cleanly under inlining.
 */
function findImpureDefaultNode(expr: ParsedExpr): string | null {
  switch (expr.kind) {
    case 'literal':
    case 'identifier':
    case 'unsupported':
    case 'object-literal':
      return null
    case 'member':
      return findImpureDefaultNode(expr.object)
    case 'index-access':
      return findImpureDefaultNode(expr.object) ?? findImpureDefaultNode(expr.index)
    case 'unary':
      return findImpureDefaultNode(expr.argument)
    case 'binary':
    case 'logical':
      return findImpureDefaultNode(expr.left) ?? findImpureDefaultNode(expr.right)
    case 'conditional':
      return findImpureDefaultNode(expr.test)
        ?? findImpureDefaultNode(expr.consequent)
        ?? findImpureDefaultNode(expr.alternate)
    case 'template-literal':
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          const inner = findImpureDefaultNode(part.expr)
          if (inner) return inner
        }
      }
      return null
    case 'array-literal':
      for (const el of expr.elements) {
        const inner = findImpureDefaultNode(el)
        if (inner) return inner
      }
      return null
    case 'call':
    case 'array-method':
    case 'arrow':
    case 'regex':
      return expr.kind
  }
}

/**
 * Walk the predicate body and classify every reference to the
 * top-level rest binding (#1532). Two outcomes route to BF021 via
 * the caller's `unsupported` return path:
 *
 *  - Value-use of `restName` in any position other than a static
 *    member-access object (`fn(rest)`, `Object.keys(rest)`, bare
 *    `return rest`, `rest in obj`, computed `rest[k]`, etc.).
 *    These shapes need a residual-object value, which Go's template
 *    runtime has no primitive for at predicate scope.
 *
 *  - `restName.X` where `X` is a top-level key the destructure
 *    explicitly consumed (`excludedTopKeys`). Per JS spec the rest
 *    binding excludes those keys, so the read is statically always
 *    `undefined` — flag the user bug rather than silently rewrite
 *    to `_t.X` (which WOULD return the value, masking the mistake).
 *    `excludedTopKeys` carries source-object property names, not
 *    local binding names — so renamed (`{done: d}`) and
 *    nested-pattern (`{user: {name}}`) outer keys are caught
 *    alongside plain shorthand (`{done}`) (#1532 review).
 *
 * Recurses into nested arrow / higher-order bodies (lexical capture
 * still uses the outer `restName`), but short-circuits when an
 * inner callback's param shadows `restName` — the inner reference
 * is then a different binding, and walking it would emit a
 * spurious BF021 (#1532 review). `substituteDestructuredFields`
 * does NOT recurse through arrows, so the validator's "refuse all
 * remaining rest references in arrow bodies" stance keeps the
 * substitution path total.
 */
function validateRestUsage(
  expr: ParsedExpr,
  restName: string,
  excludedTopKeys: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  let valueUse = false
  let collision: string | null = null
  let methodCall: string | null = null

  const walk = (e: ParsedExpr): void => {
    if (valueUse || collision !== null || methodCall !== null) return
    switch (e.kind) {
      case 'identifier':
        if (e.name === restName) valueUse = true
        return
      case 'member':
        // Static `restName.X` is the only shape we can lower.
        // Computed `restName[k]` needs runtime evaluation of `k`
        // against the residual object — refuse as value-use.
        if (e.object.kind === 'identifier' && e.object.name === restName) {
          if (e.computed) {
            valueUse = true
            return
          }
          if (excludedTopKeys.has(e.property)) {
            collision = e.property
          }
          return
        }
        walk(e.object)
        return
      case 'call':
        // `restName.foo(...)` method call — the substitution rewrites
        // `restName.foo` to `_t.foo`, but JS evaluates the call with
        // `this` bound to the member receiver (`restName` vs `_t`),
        // and the residual object also excludes consumed keys. So
        // the lowering would change observable semantics in two
        // independent ways. Refuse with a dedicated message rather
        // than silently rewriting (#1532 review).
        if (
          e.callee.kind === 'member' &&
          !e.callee.computed &&
          e.callee.object.kind === 'identifier' &&
          e.callee.object.name === restName
        ) {
          methodCall = e.callee.property
          return
        }
        walk(e.callee)
        for (const a of e.args) walk(a)
        return
      case 'binary':
      case 'logical':
        walk(e.left)
        walk(e.right)
        return
      case 'unary':
        walk(e.argument)
        return
      case 'conditional':
        walk(e.test)
        walk(e.consequent)
        walk(e.alternate)
        return
      case 'template-literal':
        for (const part of e.parts) {
          if (part.type === 'expression') walk(part.expr)
        }
        return
      case 'arrow':
        // Inner arrow that re-uses `restName` as one of its own
        // parameters shadows the outer rest binding — references inside
        // its body belong to the inner param, not us (#1532 review).
        if (e.params.includes(restName)) return
        walk(e.body)
        return
      case 'array-literal':
        for (const el of e.elements) walk(el)
        return
      case 'array-method':
        walk(e.object)
        for (const a of e.args) walk(a)
        return
      case 'literal':
      case 'unsupported':
      case 'object-literal':
        return
    }
  }

  walk(expr)

  if (collision !== null) {
    // Phrase the diagnostic in terms of the SOURCE key being consumed
    // by the destructure, not a local binding name. `{ done: d, ...rest }`
    // and `{ user: {name}, ...rest }` both consume a top-level key
    // (`done` / `user`) that has no local identifier in user code —
    // suggesting "reference '<key>' directly" would point at an
    // undefined identifier (#1532 review).
    return {
      ok: false,
      reason: `Rest binding '${restName}.${collision}' reads source key '${collision}' which the destructure already consumed, so the value is statically excluded from '${restName}' and is always undefined. Workaround: read '${collision}' from the iterated item directly (via its destructured binding or by adding it to the destructure), or remove '${collision}' from the destructure so the rest binding includes it.`,
    }
  }
  if (methodCall !== null) {
    return {
      ok: false,
      reason: `Method call '${restName}.${methodCall}()' on a rest binding cannot be lowered — rewriting to '_t.${methodCall}()' would change the call's 'this' receiver (residual object → original item) and also bypass the rest binding's key exclusion. Workaround: bind the method's result to a closure variable outside the predicate, or add /* @client */ to evaluate the predicate on the client.`,
    }
  }
  if (valueUse) {
    return {
      ok: false,
      reason: `Rest binding '${restName}' cannot be passed as a value to a template-compiled predicate (only '${restName}.<key>' member access is supported). Workaround: add /* @client */ to evaluate the predicate on the client, or rewrite to reference individual destructured fields.`,
    }
  }
  return { ok: true }
}

/**
 * Pick a synthetic param name for a rewritten destructured filter
 * (`({done}) => done` → `(_t) => _t.done`). The name must NOT collide
 * with anything the body might reference — a `_t` already on the body
 * (e.g. a signal getter) would silently capture into the rewrite.
 *
 * Start with `_t` and add underscores until no collision exists. The
 * candidate set is "every name the destructure introduced" + "every
 * identifier referenced inside the body" (collectIdentifiers). Both
 * are reachable from the local rewrite context, so we avoid all of
 * them up-front rather than risk a runtime bug from a missed name.
 * For nested destructure the map's keys are still just the
 * locally-introduced leaf names — intermediate property names
 * (`user` in `{ user: { name } }`) are consumed in the path and
 * never bound in scope, so they don't need collision avoidance.
 */
function pickSyntheticParam(fieldMap: Map<string, DestructureBinding>, body: ParsedExpr): string {
  const used = new Set<string>(fieldMap.keys())
  collectIdentifiers(body, used)
  // Default expressions (`{ name = otherVar }`) become part of the
  // rewritten body — their free identifiers (`otherVar`) must also
  // be excluded from the synthetic param candidate set to avoid
  // silently shadowing a closure capture (#1531).
  for (const entry of fieldMap.values()) {
    if (entry.defaultExpr) collectIdentifiers(entry.defaultExpr, used)
  }
  let name = '_t'
  while (used.has(name)) name = name + '_'
  return name
}

function collectIdentifiers(expr: ParsedExpr, out: Set<string>): void {
  switch (expr.kind) {
    case 'identifier':
      out.add(expr.name)
      return
    case 'call':
      out.add('_'); // ensure the synthetic-fallback name is reserved on bare callees
      collectIdentifiers(expr.callee, out)
      expr.args.forEach(a => collectIdentifiers(a, out))
      return
    case 'member':
      collectIdentifiers(expr.object, out)
      return
    case 'index-access':
      collectIdentifiers(expr.object, out)
      collectIdentifiers(expr.index, out)
      return
    case 'binary':
    case 'logical':
      collectIdentifiers(expr.left, out)
      collectIdentifiers(expr.right, out)
      return
    case 'unary':
      collectIdentifiers(expr.argument, out)
      return
    case 'conditional':
      collectIdentifiers(expr.test, out)
      collectIdentifiers(expr.consequent, out)
      collectIdentifiers(expr.alternate, out)
      return
    case 'template-literal':
      for (const part of expr.parts) {
        if (part.type === 'expression') collectIdentifiers(part.expr, out)
      }
      return
    case 'arrow':
      collectIdentifiers(expr.body, out)
      return
    case 'array-literal':
      expr.elements.forEach(e => collectIdentifiers(e, out))
      return
    case 'array-method':
      collectIdentifiers(expr.object, out)
      expr.args.forEach(e => collectIdentifiers(e, out))
      return
    case 'literal':
    case 'regex':
    case 'unsupported':
    // Mirror `unsupported`: an object literal was not carried before this
    // kind existed, so it collects no identifiers (byte-identical A-1).
    case 'object-literal':
      return
  }
}

/**
 * Rewrite a parsed body that referenced destructured names (`done`)
 * into the equivalent dotted-access form against a synthetic param
 * (`_t.done`). Identifiers not in `fieldMap` are left alone — they're
 * either closure captures (signals, props) or already-synthetic names.
 *
 * When `restName` is set, `restName.X` member access is rewritten to
 * `syntheticParam.X` (#1532). The caller has already validated that
 * every reference to `restName` in the body is a static
 * `restName.X` shape and `X` does not collide with `fieldMap`, so
 * this walk just rewires the object position.
 */
function substituteDestructuredFields(
  expr: ParsedExpr,
  fieldMap: Map<string, DestructureBinding>,
  syntheticParam: string,
  restName?: string,
): ParsedExpr {
  const walk = (e: ParsedExpr): ParsedExpr => {
    switch (e.kind) {
      case 'identifier': {
        const entry = fieldMap.get(e.name)
        if (entry === undefined) return e
        // Build `<syntheticParam>.<path[0]>.<path[1]>…` as a left-leaning
        // chain of `member` nodes. Single-level destructure produces a
        // one-hop chain identical to the pre-#1530 shape.
        let node: ParsedExpr = { kind: 'identifier', name: syntheticParam }
        for (const segment of entry.path) {
          node = { kind: 'member', object: node, property: segment, computed: false }
        }
        // Default value (#1531): wrap the accessor in `?? <default>` so
        // a missing field falls back to the user-supplied literal /
        // expression. Adapters already lower `??` through the standard
        // logical-operator path, so no per-target work is needed.
        if (entry.defaultExpr) {
          return { kind: 'logical', op: '??', left: node, right: entry.defaultExpr }
        }
        return node
      }
      case 'call':
        return { kind: 'call', callee: walk(e.callee), args: e.args.map(walk) }
      case 'member':
        if (
          restName !== undefined &&
          e.object.kind === 'identifier' &&
          e.object.name === restName &&
          !e.computed
        ) {
          return {
            kind: 'member',
            object: { kind: 'identifier', name: syntheticParam },
            property: e.property,
            computed: false,
          }
        }
        return { kind: 'member', object: walk(e.object), property: e.property, computed: e.computed }
      case 'index-access':
        return { kind: 'index-access', object: walk(e.object), index: walk(e.index) }
      case 'binary':
        return { kind: 'binary', op: e.op, left: walk(e.left), right: walk(e.right) }
      case 'logical':
        return { kind: 'logical', op: e.op, left: walk(e.left), right: walk(e.right) }
      case 'unary':
        return { kind: 'unary', op: e.op, argument: walk(e.argument) }
      case 'conditional':
        return { kind: 'conditional', test: walk(e.test), consequent: walk(e.consequent), alternate: walk(e.alternate) }
      case 'template-literal':
        return {
          kind: 'template-literal',
          parts: e.parts.map(p =>
            p.type === 'expression' ? { type: 'expression', expr: walk(p.expr) } : p,
          ),
        }
      case 'arrow':
        // A nested arrow inside the predicate body shadows the outer
        // param (a higher-order callback like `.sort(cmp)` / `.filter(p)`
        // reaches here as the arrow argument of a generic `call`). Leave
        // its body alone — its comparator/predicate references its own
        // params, never the enclosing destructure. Skipping the rewrite is
        // the conservative choice; worst case the adapter emits BF101.
        return e
      case 'array-literal':
        return { kind: 'array-literal', elements: e.elements.map(walk) }
      case 'array-method':
        if (e.method === 'flat') {
          // `flatDepth` is a normalised literal — no destructure refs to
          // substitute. Preserve verbatim.
          return { kind: 'array-method', method: 'flat', object: walk(e.object), args: [], flatDepth: e.flatDepth }
        }
        return { kind: 'array-method', method: e.method, object: walk(e.object), args: e.args.map(walk) }
      case 'literal':
      case 'regex':
      case 'unsupported':
      // Mirror `unsupported`: object literals were not substituted into
      // before this kind existed — return verbatim (byte-identical A-1).
      case 'object-literal':
        return e
    }
  }
  return walk(expr)
}

/**
 * Convert TypeScript binary operator to string representation.
 */
function getOperatorString(kind: ts.SyntaxKind): string {
  switch (kind) {
    // Comparison
    case ts.SyntaxKind.EqualsEqualsToken: return '=='
    case ts.SyntaxKind.EqualsEqualsEqualsToken: return '==='
    case ts.SyntaxKind.ExclamationEqualsToken: return '!='
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: return '!=='
    case ts.SyntaxKind.GreaterThanToken: return '>'
    case ts.SyntaxKind.LessThanToken: return '<'
    case ts.SyntaxKind.GreaterThanEqualsToken: return '>='
    case ts.SyntaxKind.LessThanEqualsToken: return '<='

    // Arithmetic
    case ts.SyntaxKind.PlusToken: return '+'
    case ts.SyntaxKind.MinusToken: return '-'
    case ts.SyntaxKind.AsteriskToken: return '*'
    case ts.SyntaxKind.SlashToken: return '/'
    case ts.SyntaxKind.PercentToken: return '%'

    default: return 'unknown'
  }
}

/**
 * Convert TypeScript prefix unary operator to string representation.
 */
function getUnaryOperatorString(op: ts.PrefixUnaryOperator): string {
  switch (op) {
    case ts.SyntaxKind.ExclamationToken: return '!'
    case ts.SyntaxKind.MinusToken: return '-'
    case ts.SyntaxKind.PlusToken: return '+'
    case ts.SyntaxKind.TildeToken: return '~'
    default: return 'unknown'
  }
}

// =============================================================================
// Support Checking
// =============================================================================

/**
 * Check if a parsed expression is supported for SSR template conversion.
 */
export function isSupported(expr: ParsedExpr): SupportResult {
  return checkSupport(expr)
}

function checkSupport(expr: ParsedExpr): SupportResult {
  switch (expr.kind) {
    case 'unsupported':
      return { supported: false, reason: expr.reason }

    // A bare object literal is still refused as a standalone template
    // expression — adapters that lower one as a *value* (Go map / Perl
    // hashref) do so in their own emitter, like `array-literal`, not
    // through this support gate. The reason string is the exact text the
    // `unsupported` fallback produced before the `object-literal` kind
    // existed, so diagnostics stay byte-identical (Roadmap A-1).
    case 'object-literal':
      return { supported: false, reason: 'Unsupported syntax: ObjectLiteralExpression' }

    case 'identifier':
      return { supported: true, level: 'L1' }

    case 'literal':
      return { supported: true, level: 'L1' }

    case 'arrow':
    case 'regex':
      // Arrow functions / regex literals are only supported as the
      // argument of a recognised higher-order callback call (handled in
      // the `call` arm below); they're unsupported standalone.
      return { supported: false, reason: 'Standalone arrow functions / regex literals are not supported' }

    case 'array-literal': {
      // Array literal is lowerable iff every element is. Adapters that
      // don't have an array-literal form in their template language
      // (Go templates) still need to refuse it — they do so in their
      // own `arrayLiteral` emitter method, not here, because we can't
      // see which adapter is consuming the IR at this point.
      for (const el of expr.elements) {
        const elSupport = checkSupport(el)
        if (!elSupport.supported) return elSupport
      }
      return { supported: true, level: 'L2' }
    }

    case 'array-method': {
      // A regex-pattern `.replace` is carried structurally (a `regex` first
      // arg) but is the deferred form (#1448) — no template language lowers it.
      // Refuse with the dedicated reason rather than the generic standalone-regex
      // message, preserving the diagnostic the parser used to emit directly.
      if (expr.method === 'replace' && expr.args[0]?.kind === 'regex') {
        return {
          supported: false,
          reason:
            'String.prototype.replace supports only a string pattern + string replacement (the regex form is deferred); use a string pattern or wrap the expression in /* @client */',
        }
      }
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) return objSupport
      for (const arg of expr.args) {
        const argSupport = checkSupport(arg)
        if (!argSupport.supported) return argSupport
      }
      return { supported: true, level: 'L2' }
    }


    case 'call': {
      // Higher-order callback methods (`.filter`/`.sort`/`.reduce`/… with an
      // arrow argument) lower via the runtime evaluator (#2018). Supported iff
      // the receiver and the callback BODY are supported. Recognised before the
      // `UNSUPPORTED_METHODS` gate so the eval-lowered shapes aren't refused
      // (a BARE method reference — `arr.filter` uncalled, no arrow arg — still
      // falls through to the gate). A nested callback inside the body is NOT
      // refused here: the evaluator refuses it (`serializeParsedExpr` → null)
      // and each adapter then either lowers it faithfully (Mojo's inline
      // `grep`, Go's `len (bf_filter_eval …)`) or surfaces BF101 at its
      // predicate fallback's exact degrade points (#2038) — a blanket refusal
      // here would break the faithful shapes (#1443 PR4).
      const cb = asCallbackMethodCall(expr)
      if (cb) {
        const objSupport = checkSupport(cb.object)
        if (!objSupport.supported) return objSupport
        const bodySupport = checkSupport(cb.arrow.body)
        if (!bodySupport.supported) {
          return {
            supported: false,
            level: 'L5_UNSUPPORTED',
            reason: `Higher-order method '.${cb.method}()' with complex callback. ${bodySupport.reason || 'Simplify the callback.'}`,
          }
        }
        for (const rest of cb.args) {
          const restSupport = checkSupport(rest)
          if (!restSupport.supported) return restSupport
        }
        return { supported: true, level: 'L5' }
      }

      // Check if callee is supported
      const calleeSupport = checkSupport(expr.callee)
      if (!calleeSupport.supported) {
        return calleeSupport
      }

      // Check for higher-order array methods: items().filter(...)
      // This handles the case where the pattern wasn't recognized as higher-order
      if (expr.callee.kind === 'member') {
        const methodName = expr.callee.property
        // No template lowering → BF101. `UNSUPPORTED_METHOD_REASONS` supplies
        // a tailored reason for some methods (e.g. `forEach`); the rest get the
        // generic hint. Both already carry next steps, hence `selfContained`.
        if (UNSUPPORTED_METHODS.has(methodName)) {
          return {
            supported: false,
            level: 'L5_UNSUPPORTED',
            selfContained: true,
            reason:
              UNSUPPORTED_METHOD_REASONS[methodName] ??
              `'${methodName}()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).`,
          }
        }
      }

      // Signal calls like count() with no args are L1
      if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
        return { supported: true, level: 'L1' }
      }

      // Other function calls - check args
      for (const arg of expr.args) {
        const argSupport = checkSupport(arg)
        if (!argSupport.supported) {
          return argSupport
        }
      }
      return { supported: true, level: 'L2' }
    }

    case 'member': {
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) {
        return objSupport
      }
      // .length is L2
      if (expr.property === 'length') {
        return { supported: true, level: 'L2' }
      }
      return { supported: true, level: 'L2' }
    }

    case 'index-access': {
      // `arr[index]` — supported when both the receiver and the index
      // expression are themselves supported (the index is typically a
      // loop variable or arithmetic over one). #1897 (data-table).
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) return objSupport
      const indexSupport = checkSupport(expr.index)
      if (!indexSupport.supported) return indexSupport
      return { supported: true, level: 'L2' }
    }

    case 'binary': {
      const leftSupport = checkSupport(expr.left)
      if (!leftSupport.supported) return leftSupport
      const rightSupport = checkSupport(expr.right)
      if (!rightSupport.supported) return rightSupport

      // Comparison operators are L3
      if (['===', '==', '!==', '!=', '>', '<', '>=', '<='].includes(expr.op)) {
        return { supported: true, level: 'L3' }
      }

      // Arithmetic operators are L3
      if (['+', '-', '*', '/', '%'].includes(expr.op)) {
        return { supported: true, level: 'L3' }
      }

      return { supported: false, reason: `Unknown operator: ${expr.op}` }
    }

    case 'unary': {
      const argSupport = checkSupport(expr.argument)
      if (!argSupport.supported) return argSupport

      // Negation is L4
      if (expr.op === '!') {
        return { supported: true, level: 'L4' }
      }
      // Numeric negation is L3
      if (expr.op === '-' || expr.op === '+') {
        return { supported: true, level: 'L3' }
      }

      return { supported: false, reason: `Unsupported unary operator: ${expr.op}` }
    }

    case 'logical': {
      const leftSupport = checkSupport(expr.left)
      if (!leftSupport.supported) return leftSupport
      const rightSupport = checkSupport(expr.right)
      if (!rightSupport.supported) return rightSupport

      return { supported: true, level: 'L4' }
    }

    case 'conditional': {
      const testSupport = checkSupport(expr.test)
      if (!testSupport.supported) return testSupport
      const consSupport = checkSupport(expr.consequent)
      if (!consSupport.supported) return consSupport
      const altSupport = checkSupport(expr.alternate)
      if (!altSupport.supported) return altSupport

      return { supported: true, level: 'L4' }
    }

    case 'template-literal': {
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          const partSupport = checkSupport(part.expr)
          if (!partSupport.supported) return partSupport
        }
      }
      return { supported: true, level: 'L2' }
    }

    default:
      return { supported: false, reason: 'Unknown expression kind' }
  }
}

/**
 * Check if expression contains any higher-order callback method call
 * (`.filter`/`.sort`/`.reduce`/… with an arrow argument — see
 * {@link asCallbackMethodCall}) anywhere in the tree.
 */
export function containsHigherOrder(expr: ParsedExpr): boolean {
  if (asCallbackMethodCall(expr) !== null) return true
  switch (expr.kind) {
    case 'call':
      return expr.args.some(containsHigherOrder) || containsHigherOrder(expr.callee)
    case 'member':
      return containsHigherOrder(expr.object)
    case 'index-access':
      return containsHigherOrder(expr.object) || containsHigherOrder(expr.index)
    case 'binary':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'unary':
      return containsHigherOrder(expr.argument)
    case 'logical':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'conditional':
      return containsHigherOrder(expr.test) || containsHigherOrder(expr.consequent) || containsHigherOrder(expr.alternate)
    case 'arrow':
      return containsHigherOrder(expr.body)
    case 'array-literal':
      return expr.elements.some(containsHigherOrder)
    case 'array-method':
      return containsHigherOrder(expr.object) || expr.args.some(containsHigherOrder)
    default:
      return false
  }
}

// =============================================================================
// Debug Helper
// =============================================================================

// =============================================================================
// Block Body Parser (for arrow functions with block body)
// =============================================================================

/**
 * Parse a block body into ParsedStatement array.
 * Used for filter predicates with block bodies like:
 * ```
 * filter(t => {
 *   const f = filter()
 *   if (f === 'active') return !t.done
 *   return true
 * })
 * ```
 */
export function parseBlockBody(
  block: ts.Block,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement[] | null {
  const statements: ParsedStatement[] = []

  for (const stmt of block.statements) {
    const parsed = parseStatement(stmt, sourceFile, getJS)
    if (parsed === null) {
      // Unsupported statement type
      return null
    }
    statements.push(parsed)
  }

  return statements
}

/**
 * Like {@link parseBlockBody} but tolerant: a statement `parseStatement` can't
 * represent is **skipped** rather than failing the whole block. Used to carry a
 * block-body memo's structure on the IR for adapters that only pattern-match a
 * recognised prefix of statements (e.g. a `const k = getter(); if (!k) return
 * CONST` guard) and ignore the rest — including a trailing client-directive
 * (`@client`) return that the strict parser would reject. Mirrors the tolerant
 * `continue`-on-unrecognised walks those adapters previously ran over a
 * re-parsed source string, so it never carries a *more* permissive result.
 */
export function parseBlockBodyTolerant(
  block: ts.Block,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement[] {
  const statements: ParsedStatement[] = []
  for (const stmt of block.statements) {
    const parsed = parseStatement(stmt, sourceFile, getJS)
    if (parsed !== null) statements.push(parsed)
  }
  return statements
}

/**
 * Parse a single statement into ParsedStatement.
 */
function parseStatement(
  stmt: ts.Statement,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement | null {
  // Variable declaration: const f = filter()
  if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0]
    if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) {
      return null
    }
    const name = decl.name.text
    const initText = getJS(decl.initializer)
    const init = parseExpression(initText)
    if (init.kind === 'unsupported') {
      return null
    }
    return { kind: 'var-decl', name, init }
  }

  // Return statement: return !t.done
  if (ts.isReturnStatement(stmt)) {
    if (!stmt.expression) {
      // return; (no value) -> return undefined, treat as return true
      return { kind: 'return', value: { kind: 'literal', value: true, literalType: 'boolean' } }
    }
    // A bare object-literal return (`return { a: 1 }`) re-parses as a *block*
    // statement if its braces lead the source, yielding `unsupported`. Unwrap
    // any parens, and when the returned expression is an object literal, wrap
    // the text in parens to force expression context so it parses as an
    // `object-literal` ParsedExpr (consumed by the Go object-memo lowering).
    let retExpr: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(retExpr)) retExpr = retExpr.expression
    const valueText = getJS(retExpr)
    const value = parseExpression(
      ts.isObjectLiteralExpression(retExpr) ? `(${valueText})` : valueText,
    )
    if (value.kind === 'unsupported') {
      return null
    }
    return { kind: 'return', value }
  }

  // If statement: if (f === 'active') return !t.done
  if (ts.isIfStatement(stmt)) {
    const conditionText = getJS(stmt.expression)
    const condition = parseExpression(conditionText)
    if (condition.kind === 'unsupported' || condition.kind === 'object-literal') {
      return null
    }

    // Parse consequent (then branch)
    const consequent = parseIfBranch(stmt.thenStatement, sourceFile, getJS)
    if (consequent === null) {
      return null
    }

    // Parse alternate (else branch) if present
    let alternate: ParsedStatement[] | undefined
    if (stmt.elseStatement) {
      // else if -> recurse as if statement
      if (ts.isIfStatement(stmt.elseStatement)) {
        const elseIf = parseStatement(stmt.elseStatement, sourceFile, getJS)
        if (elseIf === null) {
          return null
        }
        alternate = [elseIf]
      } else {
        // else { ... }
        const elseBranch = parseIfBranch(stmt.elseStatement, sourceFile, getJS)
        if (elseBranch === null) {
          return null
        }
        alternate = elseBranch
      }
    }

    return { kind: 'if', condition, consequent, alternate }
  }

  // Unsupported statement (for, while, switch, etc.)
  return null
}

// =============================================================================
// Block → Expression Normalization (#2040)
// =============================================================================

/**
 * The actionable refusal reason for a block body that is not purely-functionally
 * expressible. Carried on the `unsupported` ParsedExpr so adapters surface it as
 * the BF101 message. A loop that mutates a local to accumulate a value is a fold
 * (already expressible via `.reduce`); a loop that does anything else, a `break`,
 * a re-assignment, or a side-effecting/I-O call is genuinely imperative and has
 * no value-position lowering.
 */
export const IMPERATIVE_BLOCK_REASON =
  'Block body cannot be normalized to a value expression. Only pure ' +
  '`const` bindings, value-producing `if` / early `return`, and a final ' +
  '`return` are supported. Imperative shapes (raw `for` / `while` loops, ' +
  '`break`, local re-assignment, side-effecting or I/O calls) are not. ' +
  'Rewrite an accumulation loop as `.reduce(...)`, or move the imperative ' +
  'body to a `/* @client */` value so it runs natively on the client.'

/**
 * Whether a statement sequence always reaches a `return` on every control-flow
 * path (so anything textually after it is dead). A bare `return` terminates; an
 * `if` terminates only when it has an `else` and both branches terminate. Used
 * by {@link foldBlockToExpr} to decide whether the statements following an `if`
 * belong to the fall-through (else) path.
 */
function statementsTerminate(stmts: ParsedStatement[]): boolean {
  for (const s of stmts) {
    if (s.kind === 'return') return true
    if (
      s.kind === 'if' &&
      s.alternate !== undefined &&
      statementsTerminate(s.consequent) &&
      statementsTerminate(s.alternate)
    ) {
      return true
    }
  }
  return false
}

/**
 * Refusal reason when inlining a `const` binding would capture a free variable
 * of its initializer under a nested callback parameter of the same name. The
 * let-inline substitution is not a hygienic (alpha-renaming) substitution, so
 * rather than silently miscompile the callback we refuse and adapters surface
 * BF101.
 */
export const CAPTURE_BLOCK_REASON =
  'Block body cannot be normalized: inlining a `const` binding would capture ' +
  'one of its free variables under a nested callback parameter of the same ' +
  'name (e.g. `const x = a; … list.map(a => a + x)`). Rename the inner ' +
  'parameter, or move the body to a `/* @client */` value so it runs natively ' +
  'on the client.'

/**
 * Refusal reason when a `const` initializer may have side effects (it contains
 * a function/method call) and the binding is NOT used exactly once on a single
 * runtime path. Let-inline substitutes the initializer at each use site, which
 * would drop the effect (zero uses) or duplicate it (multiple uses / a use
 * inside a callback that runs per element) — exactly the side-effecting shape
 * the fold must refuse rather than miscompile.
 */
export const IMPURE_INLINE_BLOCK_REASON =
  'Block body cannot be normalized: a `const` whose initializer may have side ' +
  'effects (a function or method call) is not used exactly once on every path, ' +
  'so inlining it would drop the effect on some path or duplicate it on ' +
  'another. Bind a pure value, use the binding exactly once unconditionally, ' +
  'or move the body to a `/* @client */` value so it runs natively on the client.'

/**
 * Options for {@link foldBlockToExpr}.
 */
export interface FoldBlockOptions {
  /**
   * Names of zero-argument calls that are idempotent reads with no observable
   * side effect — chiefly reactive getters (signal / memo accessors), which
   * return the same value each time within a render. Inlining such a read at
   * multiple sites is evaluation-count-neutral, so the fold may treat
   * `getter()` as pure. The caller (e.g. `jsx-to-ir`) supplies the set from its
   * analyzer-collected signal/memo names; callers without that context (the
   * plain `convertNode` callback path) omit it and every call stays "possibly
   * impure". A non-empty arg list or a member-call (`a.b()`) is never treated as
   * pure by this set.
   */
  pureCallNames?: ReadonlySet<string>
}

/**
 * Whether an expression is provably free of side effects, so it is safe to
 * inline at any number of use sites. Conservative: a function / method call is
 * possibly impure, EXCEPT a zero-arg call to a name in `pureCallNames` (an
 * idempotent reactive getter read). Member access is treated as pure, matching
 * `substituteDestructuredFields` and the rest of the compiler's expression
 * handling.
 */
function isPureInit(e: ParsedExpr, pureCallNames?: ReadonlySet<string>): boolean {
  const pure = (x: ParsedExpr) => isPureInit(x, pureCallNames)
  switch (e.kind) {
    case 'identifier':
    case 'literal':
    case 'regex':
      return true
    case 'member':
      return pure(e.object)
    case 'index-access':
      return pure(e.object) && pure(e.index)
    case 'binary':
    case 'logical':
      return pure(e.left) && pure(e.right)
    case 'unary':
      return pure(e.argument)
    case 'conditional':
      return pure(e.test) && pure(e.consequent) && pure(e.alternate)
    case 'template-literal':
      return e.parts.every(p => p.type !== 'expression' || pure(p.expr))
    case 'array-literal':
      return e.elements.every(pure)
    case 'object-literal':
      return e.properties.every(p => pure(p.value))
    case 'call':
      // A zero-arg reactive getter read (`filter()`, `count()`) is idempotent;
      // any other call may be effectful or non-deterministic.
      return (
        e.callee.kind === 'identifier' &&
        e.args.length === 0 &&
        pureCallNames !== undefined &&
        pureCallNames.has(e.callee.name)
      )
    // A method call may be effectful; an arrow value can capture impurity;
    // `unsupported` is opaque. Treat all as possibly impure.
    case 'array-method':
    case 'arrow':
    case 'unsupported':
      return false
  }
}

/**
 * The `{ min, max }` number of times `name` is evaluated on a single runtime
 * path through `expr` — the minimum-cost path and the maximum-cost path. Used to
 * decide whether inlining a possibly-impure init is evaluation-count-preserving:
 * sound only when it is evaluated **exactly once on every path** (`min === 1 &&
 * max === 1`), so the substituted call neither drops nor duplicates its effect.
 *
 * Path semantics:
 *   - `conditional` evaluates the test then exactly one arm → test + the min/max
 *     of the two arms (a binding used in only one arm has `min` 0: it is skipped
 *     on the other path).
 *   - `logical` (`&&` / `||` / `??`) evaluates the left, then the right only on
 *     some paths (short-circuit) → the right contributes to `max` but not `min`.
 *   - a nested `arrow` body may run any number of times (a callback invoked per
 *     element / comparison, or never) → a use inside has `min` 0 and `max`
 *     `Infinity`, forcing an impure binding referenced from a callback to be
 *     refused.
 */
function usesPerPath(name: string, expr: ParsedExpr): { min: number; max: number } {
  const add = (a: { min: number; max: number }, b: { min: number; max: number }) => ({
    min: a.min + b.min,
    max: a.max + b.max,
  })
  const sum = (xs: ParsedExpr[]) => xs.reduce((acc, x) => add(acc, walk(x)), { min: 0, max: 0 })
  const walk = (e: ParsedExpr): { min: number; max: number } => {
    switch (e.kind) {
      case 'identifier':
        return e.name === name ? { min: 1, max: 1 } : { min: 0, max: 0 }
      case 'literal':
      case 'regex':
      case 'unsupported':
        return { min: 0, max: 0 }
      case 'member':
        return walk(e.object)
      case 'index-access':
        return add(walk(e.object), walk(e.index))
      case 'binary':
        return add(walk(e.left), walk(e.right))
      case 'logical': {
        // The right operand is only evaluated on some paths (short-circuit), so
        // it contributes to the max but never to the guaranteed min.
        const l = walk(e.left)
        const r = walk(e.right)
        return { min: l.min, max: l.max + r.max }
      }
      case 'unary':
        return walk(e.argument)
      case 'conditional': {
        const t = walk(e.test)
        const c = walk(e.consequent)
        const a = walk(e.alternate)
        return { min: t.min + Math.min(c.min, a.min), max: t.max + Math.max(c.max, a.max) }
      }
      case 'template-literal':
        return sum(e.parts.flatMap(p => (p.type === 'expression' ? [p.expr] : [])))
      case 'call':
        return add(walk(e.callee), sum(e.args))
      case 'array-literal':
        return sum(e.elements)
      case 'array-method':
        return add(walk(e.object), e.method === 'flat' ? { min: 0, max: 0 } : sum(e.args))
      case 'object-literal':
        return sum(e.properties.map(p => p.value))
      case 'arrow':
        // A callback body may run any number of times (per element, or never).
        return walk(e.body).max > 0 ? { min: 0, max: Number.POSITIVE_INFINITY } : { min: 0, max: 0 }
    }
  }
  return walk(expr)
}

/**
 * Inline `name → value` everywhere it appears free in `expr` (the let-inline
 * step). Returns `null` if the substitution would capture a free variable of
 * `value` under a nested callback parameter of the same name — that shape is
 * unsound to inline non-hygienically, so the caller refuses with
 * {@link CAPTURE_BLOCK_REASON}. A nested arrow parameter that shadows `name`
 * leaves that inner reference untouched (it is the parameter, not the binding).
 * Mirrors the structural walk of `substituteDestructuredFields`; every
 * `ParsedExpr` kind is handled so a new kind surfaces as a compile error here.
 */
function inlineBinding(
  expr: ParsedExpr,
  name: string,
  value: ParsedExpr,
): ParsedExpr | null {
  // Free variables of `value` that an enclosing callback parameter could capture.
  const valueFree = new Set<string>()
  collectIdentifiers(value, valueFree)
  let captured = false

  const walk = (e: ParsedExpr, enclosing: ReadonlySet<string>): ParsedExpr => {
    switch (e.kind) {
      case 'identifier': {
        if (e.name !== name) return e
        // Shadowed by an enclosing callback param → this is the parameter, not
        // the binding; leave it.
        if (enclosing.has(e.name)) return e
        // Inlining here: does any enclosing param capture a free var of `value`?
        for (const p of enclosing) {
          if (valueFree.has(p)) {
            captured = true
            return e
          }
        }
        return value
      }
      case 'call':
        return { kind: 'call', callee: walk(e.callee, enclosing), args: e.args.map(a => walk(a, enclosing)) }
      case 'member':
        return { kind: 'member', object: walk(e.object, enclosing), property: e.property, computed: e.computed }
      case 'index-access':
        return { kind: 'index-access', object: walk(e.object, enclosing), index: walk(e.index, enclosing) }
      case 'binary':
        return { kind: 'binary', op: e.op, left: walk(e.left, enclosing), right: walk(e.right, enclosing) }
      case 'logical':
        return { kind: 'logical', op: e.op, left: walk(e.left, enclosing), right: walk(e.right, enclosing) }
      case 'unary':
        return { kind: 'unary', op: e.op, argument: walk(e.argument, enclosing) }
      case 'conditional':
        return { kind: 'conditional', test: walk(e.test, enclosing), consequent: walk(e.consequent, enclosing), alternate: walk(e.alternate, enclosing) }
      case 'template-literal':
        return {
          kind: 'template-literal',
          parts: e.parts.map(p =>
            p.type === 'expression' ? { type: 'expression', expr: walk(p.expr, enclosing) } : p,
          ),
        }
      case 'arrow': {
        const innerEnclosing = e.params.length === 0 ? enclosing : new Set([...enclosing, ...e.params])
        return { kind: 'arrow', params: e.params, body: walk(e.body, innerEnclosing) }
      }
      case 'array-literal':
        return { kind: 'array-literal', elements: e.elements.map(el => walk(el, enclosing)) }
      case 'array-method':
        if (e.method === 'flat') {
          return { kind: 'array-method', method: 'flat', object: walk(e.object, enclosing), args: [], flatDepth: e.flatDepth }
        }
        return { kind: 'array-method', method: e.method, object: walk(e.object, enclosing), args: e.args.map(a => walk(a, enclosing)) }
      case 'object-literal':
        return {
          kind: 'object-literal',
          properties: e.properties.map(p => ({ ...p, value: walk(p.value, enclosing) })),
          raw: e.raw,
        }
      case 'literal':
      case 'regex':
      case 'unsupported':
        return e
    }
  }

  const result = walk(expr, new Set())
  return captured ? null : result
}

/**
 * Fold a value-producing block body — a {@link ParsedStatement} sequence of
 * `const` bindings, value-producing `if` / early `return`, and a terminal
 * `return` — into a single {@link ParsedExpr}, so block-bodied memos / derived /
 * callbacks flow through the same expression surface as expression-bodied ones
 * (#2040, carved from #2018 stage 5). This generalizes the per-idiom block-memo
 * recognizers (#1897 / #1945 / #2015) the same way the evaluator replaced the
 * `bf_sort` / `bf_reduce` catalogue: one normalization, no growing pattern list.
 *
 * Transformations:
 *   - `const x = <init>; …` → inline `x`'s init into the rest (let-inline).
 *   - `if (c) <then> [else <else>] …` → `c ? fold(then-path) : fold(else-path)`,
 *     where a branch that does not itself terminate continues into the
 *     statements following the `if` (the early-return idiom).
 *   - `return <v>` → `<v>`.
 *
 * The rest is folded first, leaving each binding as a free identifier, so its
 * use count can be measured before inlining. Inlining is refused (→ `ok: false`)
 * when it would be unsound:
 *   - a possibly-impure init (one containing a call) used zero or more than once
 *     on a path would drop or duplicate the side effect (a pure init is always
 *     safe to inline any number of times);
 *   - a substitution would capture a free variable of the init under a nested
 *     callback parameter of the same name (substitution is not hygienic).
 *
 * Returns `{ ok: false }` for a sequence that cannot produce a value on some
 * path (falls through with no `return`) — the genuinely-imperative residue that
 * {@link IMPERATIVE_BLOCK_REASON} describes. The input is assumed to be the
 * STRICT parse ({@link parseBlockBody}, not the tolerant variant): every source
 * statement is represented, so a `false` here reflects the real shape rather
 * than a silently-dropped statement.
 */
export function foldBlockToExpr(
  stmts: ParsedStatement[],
  opts?: FoldBlockOptions,
): { ok: true; expr: ParsedExpr } | { ok: false; reason: string } {
  if (stmts.length === 0) {
    return { ok: false, reason: IMPERATIVE_BLOCK_REASON }
  }
  const [head, ...rest] = stmts
  switch (head.kind) {
    case 'var-decl': {
      // Fold the remaining statements first, leaving `head.name` free so its use
      // count can drive the soundness check. Any earlier-binding references in
      // the rest are inlined by the enclosing `var-decl` frames; references to
      // `head.name` inside `head.init` cannot occur (a `const` can't read itself).
      const restFold = foldBlockToExpr(rest, opts)
      if (!restFold.ok) return restFold
      const uses = usesPerPath(head.name, restFold.expr)
      // A possibly-impure init is only safe to inline when it is evaluated
      // exactly once on EVERY path — same as the original block, which runs the
      // `const` initializer unconditionally once. `min !== 1` catches an effect
      // dropped on some path (unused, or used in only one ternary arm / a
      // short-circuited operand / a callback); `max !== 1` catches duplication.
      // A pure init is safe at any count (drop / duplicate is unobservable);
      // idempotent reactive getter reads in `pureCallNames` count as pure.
      if (!isPureInit(head.init, opts?.pureCallNames) && !(uses.min === 1 && uses.max === 1)) {
        return { ok: false, reason: IMPURE_INLINE_BLOCK_REASON }
      }
      const inlined = inlineBinding(restFold.expr, head.name, head.init)
      if (inlined === null) {
        return { ok: false, reason: CAPTURE_BLOCK_REASON }
      }
      return { ok: true, expr: inlined }
    }
    case 'return':
      return { ok: true, expr: head.value }
    case 'if': {
      // A branch that doesn't return falls through to the statements after the
      // `if` (early-return idiom). A branch that returns makes `rest` dead for
      // that path, so it is not appended. `rest` is intentionally duplicated
      // into both fall-through paths; because each path is a separate ternary
      // arm, a binding used once per arm is still evaluated at most once per
      // runtime path.
      const thenPath = statementsTerminate(head.consequent)
        ? head.consequent
        : [...head.consequent, ...rest]
      const elseBase = head.alternate ?? []
      const elsePath = statementsTerminate(elseBase)
        ? elseBase
        : [...elseBase, ...rest]
      const consequent = foldBlockToExpr(thenPath, opts)
      if (!consequent.ok) return consequent
      const alternate = foldBlockToExpr(elsePath, opts)
      if (!alternate.ok) return alternate
      return {
        ok: true,
        expr: {
          kind: 'conditional',
          test: head.condition,
          consequent: consequent.expr,
          alternate: alternate.expr,
        },
      }
    }
  }
}

/**
 * Rewrite a ternary whose arms are used in BOOLEAN context — e.g. the result of
 * folding a block-bodied filter predicate (`if (c) return A; return B` →
 * `c ? A : B`) — into an equivalent `&&` / `||` expression, so it flows through
 * the ordinary boolean-expression lowering instead of needing a dedicated
 * block-condition renderer per adapter (#2040). Boolean-literal arms collapse:
 *
 *   c ? true  : false  →  c
 *   c ? true  : f      →  c || f
 *   c ? t     : false  →  c && t
 *   c ? false : f      →  !c && f
 *   c ? t     : true   →  !c || t
 *   c ? t     : f      →  (c && t) || (!c && f)
 *
 * Arms are flattened recursively (an `else if` chain is a nested ternary); the
 * test is left as-is. Only valid where the consumer interprets the value as a
 * boolean (a filter predicate). Non-conditional input is returned unchanged.
 */
export function predicateTernaryToLogical(expr: ParsedExpr): ParsedExpr {
  if (expr.kind !== 'conditional') return expr
  const cond = expr.test
  const t = predicateTernaryToLogical(expr.consequent)
  const f = predicateTernaryToLogical(expr.alternate)
  const isTrue = (x: ParsedExpr) => x.kind === 'literal' && x.literalType === 'boolean' && x.value === true
  const isFalse = (x: ParsedExpr) => x.kind === 'literal' && x.literalType === 'boolean' && x.value === false
  const not = (x: ParsedExpr): ParsedExpr => ({ kind: 'unary', op: '!', argument: x })
  const and = (a: ParsedExpr, b: ParsedExpr): ParsedExpr => ({ kind: 'logical', op: '&&', left: a, right: b })
  const or = (a: ParsedExpr, b: ParsedExpr): ParsedExpr => ({ kind: 'logical', op: '||', left: a, right: b })
  if (isTrue(t) && isFalse(f)) return cond
  if (isTrue(t)) return or(cond, f)
  if (isFalse(f)) return and(cond, t)
  if (isFalse(t)) return and(not(cond), f)
  if (isTrue(f)) return or(not(cond), t)
  return or(and(cond, t), and(not(cond), f))
}

/**
 * Parse an if branch (then or else) into ParsedStatement array.
 */
function parseIfBranch(
  branch: ts.Statement,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement[] | null {
  // Block: { ... }
  if (ts.isBlock(branch)) {
    return parseBlockBody(branch, sourceFile, getJS)
  }

  // Single statement (no braces): return !t.done
  const parsed = parseStatement(branch, sourceFile, getJS)
  if (parsed === null) {
    return null
  }
  return [parsed]
}

/**
 * Convert ParsedExpr back to a string for debugging.
 */
export function exprToString(expr: ParsedExpr): string {
  switch (expr.kind) {
    case 'identifier':
      return expr.name
    case 'literal':
      if (expr.literalType === 'string') return `"${expr.value}"`
      if (expr.value === null) return 'null'
      return String(expr.value)
    case 'call':
      return `${exprToString(expr.callee)}(${expr.args.map(exprToString).join(', ')})`
    case 'member':
      return `${exprToString(expr.object)}.${expr.property}`
    case 'index-access':
      return `${exprToString(expr.object)}[${exprToString(expr.index)}]`
    case 'binary':
      return `${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)}`
    case 'unary':
      return `${expr.op}${exprToString(expr.argument)}`
    case 'logical':
      return `${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)}`
    case 'conditional':
      return `${exprToString(expr.test)} ? ${exprToString(expr.consequent)} : ${exprToString(expr.alternate)}`
    case 'template-literal':
      return '`' + expr.parts.map(p =>
        p.type === 'string' ? p.value : `\${${exprToString(p.expr)}}`
      ).join('') + '`'
    case 'arrow': {
      // Single-param arrows round-trip without parens (`x => …`); multi-param
      // need them (`(a, b) => …`).
      const params = expr.params.length === 1 ? expr.params[0] : `(${expr.params.join(', ')})`
      return `${params} => ${exprToString(expr.body)}`
    }
    case 'regex':
      return expr.raw
    case 'array-literal':
      return `[${expr.elements.map(exprToString).join(', ')}]`
    case 'array-method':
      if (expr.method === 'flat') {
        // Preserve the normalised depth so diagnostics don't misleadingly
        // print `.flat()` for a `.flat(2)` / `.flat(Infinity)` source.
        const d = expr.flatDepth
        const depthSrc = d === 'infinity' ? 'Infinity' : String(d)
        return `${exprToString(expr.object)}.flat(${d === 1 ? '' : depthSrc})`
      }
      return `${exprToString(expr.object)}.${expr.method}(${expr.args.map(exprToString).join(', ')})`
    case 'unsupported':
    // `raw` holds the original expression string (same value the old
    // `unsupported` carried), so the round-trip stays byte-identical.
    case 'object-literal':
      return `[UNSUPPORTED: ${expr.raw}]`
  }
}

/**
 * Round-trip a ParsedExpr back to JS source text. Unlike `exprToString`
 * (which is a debug formatter), this aims for lossless re-parsing:
 * string literals are JSON-escaped, computed-member keys preserve
 * their quoted form, and unsupported nodes pass through their raw
 * source. Used by adapter-side AST rewrites (templatePrimitives
 * substitution, etc.) where the result must be re-fed into a
 * downstream conversion pipeline.
 */
export function stringifyParsedExpr(expr: ParsedExpr): string {
  switch (expr.kind) {
    case 'identifier':
      return expr.name
    case 'literal':
      if (expr.literalType === 'string') return JSON.stringify(expr.value)
      if (expr.literalType === 'null') return 'null'
      return String(expr.value)
    case 'call':
      return `${stringifyParsedExpr(expr.callee)}(${expr.args.map(stringifyParsedExpr).join(', ')})`
    case 'member': {
      const obj = stringifyParsedExpr(expr.object)
      if (!expr.computed) return `${obj}.${expr.property}`
      // Numeric indices round-trip verbatim (`arr[0]`); string keys
      // need quoting so `obj['key']` doesn't degrade to `obj[key]`
      // (a bare-identifier lookup with different semantics).
      const key = /^-?\d+$/.test(expr.property)
        ? expr.property
        : JSON.stringify(expr.property)
      return `${obj}[${key}]`
    }
    case 'index-access':
      return `${stringifyParsedExpr(expr.object)}[${stringifyParsedExpr(expr.index)}]`
    case 'binary':
      return `${stringifyParsedExpr(expr.left)} ${expr.op} ${stringifyParsedExpr(expr.right)}`
    case 'unary':
      return `${expr.op}${stringifyParsedExpr(expr.argument)}`
    case 'logical':
      return `${stringifyParsedExpr(expr.left)} ${expr.op} ${stringifyParsedExpr(expr.right)}`
    case 'conditional':
      return `${stringifyParsedExpr(expr.test)} ? ${stringifyParsedExpr(expr.consequent)} : ${stringifyParsedExpr(expr.alternate)}`
    case 'template-literal':
      return '`' + expr.parts.map(p =>
        p.type === 'string' ? p.value : `\${${stringifyParsedExpr(p.expr)}}`
      ).join('') + '`'
    case 'arrow': {
      // Round-trip to valid JS for the CSR / Hono path and downstream
      // re-parsers. A higher-order callback (`.sort`/`.filter`/…) reaches here
      // as the arrow argument of a generic `call`. Single-param arrows round-
      // trip without parens (`x => …`); multi-param need them (`(a, b) => …`).
      const params = expr.params.length === 1 ? expr.params[0] : `(${expr.params.join(', ')})`
      return `${params} => ${stringifyParsedExpr(expr.body)}`
    }
    case 'regex':
      return expr.raw
    case 'array-literal':
      return `[${expr.elements.map(stringifyParsedExpr).join(', ')}]`
    case 'array-method':
      if (expr.method === 'flat') {
        // Round-trip the normalised depth back to JS for the CSR / Hono
        // path: `'infinity'` → `Infinity`, `1` is left implicit (`.flat()`).
        const d = expr.flatDepth
        const depthSrc = d === 'infinity' ? 'Infinity' : String(d)
        return `${stringifyParsedExpr(expr.object)}.flat(${d === 1 ? '' : depthSrc})`
      }
      return `${stringifyParsedExpr(expr.object)}.${expr.method}(${expr.args.map(stringifyParsedExpr).join(', ')})`
    case 'unsupported':
    // `raw` is the original expression string, so re-stringification is
    // byte-identical to the pre-`object-literal` behaviour (Roadmap A-1).
    case 'object-literal':
      return expr.raw
  }
}

/**
 * Serialize a pure-expression `ParsedExpr` (a higher-order callback body) into
 * the minimal JSON the runtime evaluator consumes — the format pinned by the
 * `eval-vectors` golden cases and read by Go `eval.go` `EvalNode` / Perl
 * `Evaluator.pm` `evaluate`. Only the evaluator-recognized fields are emitted
 * per kind (a literal carries just `value`; `literalType` / `raw` are dropped —
 * the evaluator never reads them; `member.computed` is kept when set so a
 * computed member stays distinguishable), keeping the embedded body blob small
 * and stable.
 *
 * Returns `null` when the tree contains a shape outside the evaluator's surface
 * — a folded `higher-order` / `array-method`, an `arrow-fn`, an `unsupported`
 * node, an operator the evaluator doesn't implement, or a `call` whose callee
 * isn't an allowlisted builtin (`Math.*` / `String` / `Number` / `Boolean`) — so
 * the caller refuses the body (BF101 / `@client`) instead of emitting a blob the
 * evaluator would read as nil. The evaluator's support criterion is
 * purely-functional expressibility; this is its compile-time gate. (#2018)
 */
export function serializeParsedExpr(expr: ParsedExpr): string | null {
  const node = toEvalNode(expr)
  return node === null ? null : JSON.stringify(node)
}

/**
 * The free variables a higher-order callback body references — every bare
 * identifier in a value position, minus the callback's own `params`. The
 * adapter materializes each into the evaluator's `base_env` (mapping the JS name
 * to its SSR value). Walks exactly the value positions {@link serializeParsedExpr}
 * serializes (so it sees object-literal *values* and template-expression parts,
 * and skips member property names / object keys, which are not references).
 * Returns a sorted, de-duplicated list for stable emit. (#2018)
 */
export function freeVarsInBody(body: ParsedExpr, params: ReadonlySet<string>): string[] {
  const found = new Set<string>()
  const visit = (e: ParsedExpr): void => {
    switch (e.kind) {
      case 'identifier':
        if (!params.has(e.name)) found.add(e.name)
        return
      case 'binary':
      case 'logical':
        visit(e.left)
        visit(e.right)
        return
      case 'unary':
        visit(e.argument)
        return
      case 'conditional':
        visit(e.test)
        visit(e.consequent)
        visit(e.alternate)
        return
      case 'member':
        visit(e.object)
        return
      case 'index-access':
        visit(e.object)
        visit(e.index)
        return
      case 'call':
        // A builtin callee (`String`/`Number`/`Boolean`, or `Math.<fn>`) is
        // resolved syntactically by the evaluator — its identifier is NOT a
        // captured free var. Visiting it would add `Math` / `String` to the
        // env, making the adapter emit an undefined `$Math` / `.Math` base_env
        // entry (Copilot review #2031). Skip the callee identifier in that
        // case; the arguments are still real references and are visited.
        if (evalBuiltinCalleeName(e.callee) === null) visit(e.callee)
        e.args.forEach(visit)
        return
      case 'template-literal':
        for (const p of e.parts) if (p.type === 'expression') visit(p.expr)
        return
      case 'array-literal':
        e.elements.forEach(visit)
        return
      case 'object-literal':
        // Object *values* are references; keys are not. (Shorthand `{ x }`
        // carries the ref on its `value` identifier, which is visited here.)
        for (const p of e.properties) visit(p.value)
        return
      // Non-serializable kinds don't occur in a serializable body
      // (serializeParsedExpr returns null for them); nothing to collect.
      case 'literal':
      case 'array-method':
      case 'arrow':
      case 'regex':
      case 'unsupported':
        return
    }
  }
  visit(body)
  return [...found].sort()
}

// Operators the evaluator implements (Go `eval.go` evalBinary / evalUnary, Perl
// `Evaluator.pm` _binary / _unary). An op outside these sets — loose `==`,
// `instanceof`, `**`, bitwise/shift, or the parser's `'unknown'` sentinel — is
// refused so the body falls back to BF101 rather than serializing an op the
// evaluator would silently mis-handle.
const EVAL_BINARY_OPS: ReadonlySet<string> = new Set([
  '+', '-', '*', '/', '%', '<', '<=', '>', '>=', '===', '!==',
])
const EVAL_UNARY_OPS: ReadonlySet<string> = new Set(['!', '-', '+'])

// The only call shapes the evaluator executes (Go `eval.go` evalBuiltinName /
// evalCallBuiltin, Perl `Evaluator.pm` _call_builtin): a bare `String` / `Number`
// / `Boolean`, or a NON-computed `Math.<fn>` for a fixed `<fn>` set. Any other
// callee — a bare function (`foo(x)`), a method (`x.bar(...)`), or a *computed*
// builtin (`Math['max']`, which the evaluator rejects) — evaluates to nil at
// runtime, so the gate refuses it at compile time instead (BF101 / `@client`).
const EVAL_BUILTIN_IDENTS: ReadonlySet<string> = new Set(['String', 'Number', 'Boolean'])
const EVAL_MATH_METHODS: ReadonlySet<string> = new Set([
  'max', 'min', 'abs', 'floor', 'ceil', 'round',
])

/** The allowlisted builtin name a call callee resolves to (`Math.max` / `String`), or null. */
function evalBuiltinCalleeName(callee: ParsedExpr): string | null {
  if (callee.kind === 'identifier') {
    return EVAL_BUILTIN_IDENTS.has(callee.name) ? callee.name : null
  }
  if (
    callee.kind === 'member' &&
    !callee.computed &&
    callee.object.kind === 'identifier' &&
    callee.object.name === 'Math' &&
    EVAL_MATH_METHODS.has(callee.property)
  ) {
    return `Math.${callee.property}`
  }
  return null
}

/** Build the evaluator's minimal node object, or null for an out-of-surface kind. */
function toEvalNode(e: ParsedExpr): Record<string, unknown> | null {
  switch (e.kind) {
    case 'literal':
      return { kind: 'literal', value: e.value }
    case 'identifier':
      return { kind: 'identifier', name: e.name }
    case 'binary': {
      if (!EVAL_BINARY_OPS.has(e.op)) return null
      const left = toEvalNode(e.left)
      const right = toEvalNode(e.right)
      return left && right ? { kind: 'binary', op: e.op, left, right } : null
    }
    case 'logical': {
      // `op` is the fixed `&&` | `||` | `??` union — all evaluator-supported.
      const left = toEvalNode(e.left)
      const right = toEvalNode(e.right)
      return left && right ? { kind: 'logical', op: e.op, left, right } : null
    }
    case 'unary': {
      if (!EVAL_UNARY_OPS.has(e.op)) return null
      const argument = toEvalNode(e.argument)
      return argument ? { kind: 'unary', op: e.op, argument } : null
    }
    case 'conditional': {
      const test = toEvalNode(e.test)
      const consequent = toEvalNode(e.consequent)
      const alternate = toEvalNode(e.alternate)
      return test && consequent && alternate
        ? { kind: 'conditional', test, consequent, alternate }
        : null
    }
    case 'member': {
      const object = toEvalNode(e.object)
      if (!object) return null
      // Carry `computed` only when set (absent reads as `false`): the evaluator
      // reads it to reject a computed builtin (`Math['max']`), so preserving it
      // keeps a computed member distinguishable from a plain `.prop` access. (A
      // computed builtin *call* is already refused by the callee gate above.)
      const node: Record<string, unknown> = { kind: 'member', object, property: e.property }
      if (e.computed) node.computed = true
      return node
    }
    case 'index-access': {
      const object = toEvalNode(e.object)
      const index = toEvalNode(e.index)
      return object && index ? { kind: 'index-access', object, index } : null
    }
    case 'call': {
      // The evaluator executes only the builtin allowlist; a non-builtin callee
      // would evaluate to nil at runtime, so refuse it here (the purity gate).
      if (evalBuiltinCalleeName(e.callee) === null) return null
      const callee = toEvalNode(e.callee)
      if (!callee) return null
      const args: Record<string, unknown>[] = []
      for (const a of e.args) {
        const c = toEvalNode(a)
        if (!c) return null
        args.push(c)
      }
      return { kind: 'call', callee, args }
    }
    case 'template-literal': {
      const parts: Record<string, unknown>[] = []
      for (const p of e.parts) {
        if (p.type === 'string') {
          parts.push({ type: 'string', value: p.value })
        } else {
          const expr = toEvalNode(p.expr)
          if (!expr) return null
          parts.push({ type: 'expression', expr })
        }
      }
      return { kind: 'template-literal', parts }
    }
    case 'array-literal': {
      const elements: Record<string, unknown>[] = []
      for (const el of e.elements) {
        const c = toEvalNode(el)
        if (!c) return null
        elements.push(c)
      }
      return { kind: 'array-literal', elements }
    }
    case 'object-literal': {
      const properties: Record<string, unknown>[] = []
      for (const p of e.properties) {
        const value = toEvalNode(p.value)
        if (!value) return null
        properties.push({ key: p.key, value })
      }
      return { kind: 'object-literal', properties }
    }
    // Outside the evaluator's pure-expression surface — refuse so the caller
    // falls back to BF101 / `@client`. A nested `arrow` (a callback inside the
    // body) is refused here, keeping the evaluator non-recursive.
    case 'array-method':
    case 'arrow':
    case 'regex':
    case 'unsupported':
      return null
  }
}

/**
 * Extract the textual identifier path from a parsed expression's
 * callee — `{kind:'identifier', name:'String'}` → `"String"`,
 * `{kind:'member', object:{kind:'identifier', name:'JSON'},
 * property:'stringify'}` → `"JSON.stringify"`. Returns `null` for
 * any other callee shape (call result, computed member, etc.) so
 * adapter `templatePrimitives` registries can match identifier
 * paths exclusively (#1187 R1).
 */
export function identifierPath(callee: ParsedExpr): string | null {
  if (callee.kind === 'identifier') return callee.name
  if (callee.kind === 'member' && !callee.computed) {
    const head = identifierPath(callee.object)
    return head ? `${head}.${callee.property}` : null
  }
  return null
}
