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
  | { kind: 'literal'; value: string | number | boolean | null; literalType: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'call'; callee: ParsedExpr; args: ParsedExpr[] }
  | { kind: 'member'; object: ParsedExpr; property: string; computed: boolean }
  | { kind: 'binary'; op: string; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'unary'; op: string; argument: ParsedExpr }
  | { kind: 'conditional'; test: ParsedExpr; consequent: ParsedExpr; alternate: ParsedExpr }
  | { kind: 'logical'; op: '&&' | '||' | '??'; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'template-literal'; parts: TemplatePart[] }
  | { kind: 'arrow-fn'; param: string; body: ParsedExpr }
  | { kind: 'higher-order'; method: 'filter' | 'every' | 'some' | 'find' | 'findIndex' | 'findLast' | 'findLastIndex'; object: ParsedExpr; param: string; predicate: ParsedExpr }
  | { kind: 'array-literal'; elements: ParsedExpr[] }
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
  // `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B). The comparator is
  // extracted into a structured `SortComparator` at parse time — the
  // arrow function never reaches `args`, so adapters don't have to
  // re-walk the arrow-fn ParsedExpr to recover the key / direction
  // (and the same shape feeds both standalone position and the
  // `.sort().map()` chained-loop hoist in `jsx-to-ir.ts`). If the
  // comparator doesn't match the supported catalogue
  // (`extractSortComparatorFromTS` below), parsing falls
  // through to `unsupported` so adapters surface BF101 with an
  // @client suggestion.
  | {
      kind: 'array-method'
      method: 'sort' | 'toSorted'
      object: ParsedExpr
      args: []
      comparator: SortComparator
    }
  // `.reduce(fn, init)` (#1448 Tier C). Like sort, the reducer is
  // extracted into a structured `ReduceOp` at parse time — the
  // two-param arrow never reaches `args`, so adapters fold via a
  // runtime helper instead of re-walking the callback. The accepted
  // catalogue is the arithmetic-fold family only (`acc + key` /
  // `acc * key`, numeric or string-concat); any other reducer body,
  // or a missing initial value, falls through to `unsupported` so
  // adapters surface BF101 with an @client suggestion. See
  // `extractReduceOpFromTS` below.
  | {
      kind: 'array-method'
      method: 'reduce' | 'reduceRight'
      object: ParsedExpr
      args: []
      reduceOp: ReduceOp
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
  // `.flatMap(fn)` value-returning field projection (#1448 Tier C). The
  // callback is extracted into a structured `FlatMapOp` (self / field
  // projection) at parse time, mirroring sort / reduce. The projected
  // per-item value is flattened one level (flatMap = map + flat(1)).
  // Array-literal / complex callbacks fall through to `unsupported`; the
  // JSX-returning `.flatMap` is handled as an `IRLoop` upstream and never
  // reaches here. See `extractFlatMapOpFromTS` below.
  | {
      kind: 'array-method'
      method: 'flatMap'
      object: ParsedExpr
      args: []
      flatMapOp: FlatMapOp
    }
  | { kind: 'unsupported'; raw: string; reason: string }

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
 * Structured form of a JS `(a, b) => …` sort comparator. Built once
 * at parse time and consumed by both adapters' arrayMethod emit and
 * (when chained directly before `.map()`) the loop-hoist path in
 * `jsx-to-ir.ts`. The shape is intentionally finite — see
 * `extractSortComparatorFromTS` for the accepted catalogue.
 */
export type SortComparator = {
  // Comparison keys in priority order. A simple comparator has one
  // key; a `||`-chained multi-key comparator has one per operand.
  // Always length >= 1.
  keys: SortKey[]
  // Original JS source of the comparator body; preserved so `@client`
  // fallback can re-emit the user's exact expression if the call site
  // ever gets relocated to the runtime. For block-body comparators
  // this is the returned expression, not the `{ … }` block — so the
  // client fallback's synthetic `(a, b) => raw` arrow stays valid.
  raw: string
  // The two parameter names the user wrote (e.g. `a`/`b`, or
  // `lhs`/`rhs`). Only consumed by the client-side `@client`
  // fallback path that ships the raw comparator body to JS — it
  // needs to bind these names in a closure so `raw` evaluates
  // against the right operands. Server-side lowering doesn't read
  // them.
  paramA: string
  paramB: string
  // Which JS method name the user wrote — both shapes share the same
  // lowering (templates render a snapshot, so the JS mutate vs new
  // distinction is moot) but we preserve the original for source maps
  // and error messages.
  method: 'sort' | 'toSorted'
}

/**
 * Structured form of a JS `.reduce((acc, item) => …, init)` call,
 * built once at parse time and consumed by both template adapters'
 * `reduceMethod()` emit (#1448 Tier C). The shape is intentionally
 * finite — only the arithmetic-fold family is lowerable in a
 * declarative template; arbitrary accumulator bodies are not. See
 * `extractReduceOpFromTS` for the accepted catalogue.
 */
export type ReduceOp = {
  // The fold operator between accumulator and per-item value. `+`
  // covers numeric sums and (with a string init) string concatenation;
  // `*` covers numeric products. Subtraction / division are excluded —
  // they're order-sensitive and rarely written as a `.reduce`.
  op: '+' | '*'
  // What value each item contributes to the fold:
  //   { kind: 'self' }         → `acc + item`        (primitive array)
  //   { kind: 'field', field } → `acc + item.field`  (struct-field accessor)
  key: { kind: 'self' } | { kind: 'field'; field: string }
  // Numeric fold vs string concatenation. Determined by the init
  // literal's type: a number init folds numerically; a string init
  // (only valid with `+`) concatenates. Both template runtimes apply
  // the same coercion so their output stays byte-equal; this can
  // diverge from JS for floating-point sums whose decimal expansion
  // differs by runtime (rare in SSR data — integer sums agree).
  type: 'numeric' | 'string'
  // Decoded initial-accumulator value (never raw source). For a numeric
  // fold this is TypeScript's canonical decimal form (`1_000` -> `1000`,
  // `0x10` -> `16`) so `strconv.ParseFloat` / Perl agree; for a concat
  // fold it's the contents of a quoted string literal (only single- or
  // double-quoted `ts.StringLiteral` seeds are accepted — template
  // literals and escape-carrying literals are refused at parse time, so
  // the value is an escape-free single-line string, e.g. the empty
  // string "" or a separator like ", "). Round-trip emitters re-quote a
  // string init via `JSON.stringify`; a numeric init re-emits as-is.
  init: string
  // Original JS source of the reducer body (the returned expression
  // for block bodies). Lets the `@client` fallback ship the user's
  // exact arrow to the JS runtime.
  raw: string
  // The two parameter names the user wrote (e.g. `acc`/`item`, or
  // `sum`/`t`). Only the `@client` fallback reads them — it binds them
  // in a synthetic `(acc, item) => raw` arrow. Server-side lowering
  // works off `op` / `key` / `init` and ignores them.
  paramAcc: string
  paramItem: string
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

/**
 * A single non-computed projection leaf on the flatMap callback param —
 * the item itself (`i`) or one of its fields (`i.field`). Shared by the
 * scalar and tuple `FlatMapOp` projections.
 */
export type FlatMapLeaf = { kind: 'self' } | { kind: 'field'; field: string }

/**
 * Structured form of a value-returning `.flatMap(fn)` callback (#1448
 * Tier C). The accepted catalogue:
 *
 *   i => i            → self  projection (flatten one level)
 *   i => i.field      → field projection (flatten a per-item array field)
 *   i => [i.a, i.b]   → tuple projection (gather per-item leaves)
 *
 * The scalar `self` / `field` projections return a value that is then
 * flattened one level (flatMap = map + flat(1)) — a non-array value is
 * kept as-is, matching JS. The `tuple` projection returns an array
 * literal; flat(1) removes only that literal's wrapper, so each leaf is
 * appended verbatim (an array-valued leaf is NOT spread). Leaves outside
 * self / field (literals, `i.a + 1`, calls, deep access) refuse with
 * BF101. See `extractFlatMapOpFromTS`.
 */
export type FlatMapOp = {
  // What each item projects to before the one-level flatten.
  projection: FlatMapLeaf | { kind: 'tuple'; elements: FlatMapLeaf[] }
  // The callback param name the user wrote (for the `@client` round-trip).
  param: string
  // Original JS source of the callback body (for the `@client` fallback).
  raw: string
}

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
  // intercepted as `higher-order` IR before reaching this gate;
  // `map` is intercepted as an IRLoop. `reduce` / `reduceRight` stay
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
 * A single entry of a JSX `style={{ … }}` object, lowered for SSR. The key is
 * already CSS-cased (`backgroundColor` → `background-color`); the value is
 * either a static string literal or a raw JS expression for the adapter to
 * lower (`color` → its template interpolation).
 */
export type StyleObjectEntry =
  | { cssKey: string; kind: 'literal'; value: string }
  | { cssKey: string; kind: 'expr'; expr: string }

/** camelCase → kebab-case for CSS property names (`backgroundColor` →
 *  `background-color`, `WebkitTransform` → `-webkit-transform`). */
function cssKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
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

  // Numeric literal: 0, 5, 3.14
  if (ts.isNumericLiteral(node)) {
    const value = parseFloat(node.text)
    return { kind: 'literal', value, literalType: 'number' }
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

    // Detect higher-order methods: arr.filter(x => pred), arr.every(x => pred), arr.some(x => pred)
    if (callee.kind === 'member' && ['filter', 'every', 'some', 'find', 'findIndex', 'findLast', 'findLastIndex'].includes(callee.property)) {
      if (args.length === 1 && args[0].kind === 'arrow-fn') {
        const arrowFn = args[0] as { kind: 'arrow-fn'; param: string; body: ParsedExpr }
        return {
          kind: 'higher-order',
          method: callee.property as 'filter' | 'every' | 'some' | 'find' | 'findIndex' | 'findLast' | 'findLastIndex',
          object: callee.object,
          param: arrowFn.param,
          predicate: arrowFn.body,
        }
      }
      // .filter(Boolean) — non-arrow callable with a fixed JS semantic
      // (the identity-truthy predicate). Synthesise the equivalent
      // `x => x` so adapters can re-use their existing higher-order
      // lowering instead of needing a separate callee-resolution path.
      // Other identifier-callable predicates would need #1389-style
      // user-supplied callee resolution; out of scope here.
      if (
        callee.property === 'filter' &&
        args.length === 1 &&
        args[0].kind === 'identifier' &&
        args[0].name === 'Boolean'
      ) {
        return {
          kind: 'higher-order',
          method: 'filter',
          object: callee.object,
          param: '_',
          predicate: { kind: 'identifier', name: '_' },
        }
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
      // regex-literal pattern parses as `unsupported` (convertNode has
      // no regex arm), so it's refused explicitly here rather than
      // emitting a broken `.Replace` — the Perl `s///` vs Go
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
        // vs Go `regexp.ReplaceAllString` flavour gap, #1448) — detect it
        // on the TS node so the message is accurate. Any OTHER unsupported
        // pattern/replacement (an object literal, an unsupported call, …)
        // surfaces ITS OWN reason rather than being mislabelled as the
        // regex form.
        const patternNode = node.arguments[0]
        if (patternNode && ts.isRegularExpressionLiteral(patternNode)) {
          return {
            kind: 'unsupported',
            raw,
            reason:
              'String.prototype.replace supports only a string pattern + string replacement (the regex form is deferred); use a string pattern or wrap the expression in /* @client */',
          }
        }
        const badArg =
          args[0].kind === 'unsupported'
            ? args[0]
            : args[1].kind === 'unsupported'
              ? args[1]
              : undefined
        if (badArg && badArg.kind === 'unsupported') {
          return { kind: 'unsupported', raw, reason: badArg.reason }
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
      // `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B). The comparator
      // is extracted into a structured `SortComparator` at parse time;
      // unrecognised shapes fall through to `unsupported` so adapters
      // surface BF101 (with `@client` as the escape hatch). Supported:
      // subtraction / localeCompare / relational-ternary leaves, any
      // of them `||`-chained (multi-key), and single-`return` block
      // bodies. Function-reference comparators and `localeCompare`
      // locale/options args stay out of scope — see #1448 Tier B
      // follow-up.
      if ((callee.property === 'sort' || callee.property === 'toSorted') && node.arguments.length === 1) {
        // Extract from the raw TS AST (not args[0] ParsedExpr) — the
        // standard arrow-fn convertNode path refuses two-param arrows,
        // so the comparator would otherwise reach us as `unsupported`.
        const comparator = extractSortComparatorFromTS(node.arguments[0], callee.property)
        if (comparator) {
          return {
            kind: 'array-method',
            method: callee.property,
            object: callee.object,
            args: [],
            comparator,
          }
        }
        return {
          kind: 'unsupported',
          raw,
          reason:
            `Sort comparator shape not supported. Accepted:\n` +
            `  (a, b) => a - b\n` +
            `  (a, b) => a.field - b.field\n` +
            `  (a, b) => a.localeCompare(b)\n` +
            `  (a, b) => a.field.localeCompare(b.field)\n` +
            `  (a, b) => a.field > b.field ? 1 : -1   (relational ternary)\n` +
            `  any of the above ||-chained for multi-key tie-breaks\n` +
            `(reverse the operands for descending order). ` +
            `Wrap the call in /* @client */ to evaluate at hydration.`,
        }
      }

      // `.reduce(fn, init)` / `.reduceRight(fn, init)` (#1448 Tier C).
      // The reducer + init are extracted into a structured `ReduceOp` at
      // parse time; the two-param arrow never reaches the standard
      // convertNode path (which refuses it), so we read the raw TS AST.
      // Only the arithmetic-fold catalogue lowers — anything else, or a
      // missing init, falls through to `unsupported` (BF101 + @client
      // hint). `reduceRight` shares the catalogue; the method name is
      // preserved so adapters fold right-to-left (only observable for
      // string concatenation — numeric sum / product are commutative).
      if (
        (callee.property === 'reduce' || callee.property === 'reduceRight') &&
        node.arguments.length === 2
      ) {
        const reduceOp = extractReduceOpFromTS(node.arguments[0], node.arguments[1])
        if (reduceOp) {
          return {
            kind: 'array-method',
            method: callee.property,
            object: callee.object,
            args: [],
            reduceOp,
          }
        }
        const m = callee.property
        return {
          kind: 'unsupported',
          raw,
          reason:
            `Reduce shape not supported. Accepted (arithmetic fold, explicit init):\n` +
            `  arr.${m}((acc, x) => acc + x, 0)\n` +
            `  arr.${m}((acc, x) => acc + x.field, 0)\n` +
            `  arr.${m}((acc, x) => acc * x.field, 1)\n` +
            `  arr.${m}((acc, x) => acc + x.field, '')   (string concat)\n` +
            `The accumulator must be the left operand and the initial ` +
            `value a number / string literal. ` +
            `Wrap the call in /* @client */ to evaluate at hydration.`,
        }
      }
      // A `.reduce(fn)` without an initial value can't be lowered: JS
      // throws on an empty array, which a template can't mirror. Fall
      // through to the BF101 gate with the @client escape hatch.

      // `.flatMap(fn)` value-returning projection (#1448 Tier C). The
      // callback is extracted into a structured `FlatMapOp` (self / field
      // scalar projection, or an array-literal tuple of self / field
      // leaves) from the raw TS AST. The JSX-returning form is handled as
      // an `IRLoop` upstream and never reaches here; richer callbacks
      // refuse with BF101 + the @client hint. Go uses `bf_flat_map` /
      // `bf_flat_map_tuple`; Mojo uses `bf->flat_map` / `bf->flat_map_tuple`.
      // Intercept EVERY `.flatMap(...)` call (not just the 1-arg form) so
      // the off-catalogue and wrong-arity shapes get this tailored reason
      // rather than the generic "flatMap has no template lowering" gate
      // message, which now misleads (the field-projection form does lower).
      if (callee.property === 'flatMap') {
        const flatMapOp =
          node.arguments.length === 1 ? extractFlatMapOpFromTS(node.arguments[0]) : null
        if (flatMapOp) {
          return {
            kind: 'array-method',
            method: 'flatMap',
            object: callee.object,
            args: [],
            flatMapOp,
          }
        }
        return {
          kind: 'unsupported',
          raw,
          reason:
            `flatMap shape not supported. Accepted (self / field leaves, no thisArg):\n` +
            `  arr.flatMap(i => i)          (flatten one level)\n` +
            `  arr.flatMap(i => i.field)    (flatten a per-item array field)\n` +
            `  arr.flatMap(i => [i.a, i.b]) (gather per-item fields)\n` +
            `Richer callbacks (computed / nested access, arithmetic, calls, ` +
            `literal elements) and the 2-arg \`flatMap(fn, thisArg)\` form ` +
            `aren't lowered. Wrap the call in /* @client */ to evaluate at hydration.`,
        }
      }
    }

    return { kind: 'call', callee, args }
  }

  // Array literal: [a, b, c]
  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map(el => convertNode(el, raw))
    return { kind: 'array-literal', elements }
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
    // For simple number/string access, store as property
    if (ts.isNumericLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    if (ts.isStringLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    // Complex computed access
    return { kind: 'unsupported', raw, reason: 'Complex computed property access' }
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

  // Arrow function: x => expr  /  ({field}) => field  /  (x) => expr
  if (ts.isArrowFunction(node)) {
    // Only support single parameter
    if (node.parameters.length !== 1) {
      return { kind: 'unsupported', raw, reason: 'Only single parameter arrow functions are supported' }
    }
    const param = node.parameters[0]

    // Only expression body is supported (not block body). Block bodies
    // route through `parseBlockBody` at the higher-order recognition
    // call site so the adapter's filter-block path handles them
    // separately.
    if (ts.isBlock(node.body)) {
      return { kind: 'unsupported', raw, reason: 'Block body arrow functions are not supported' }
    }
    const body = convertNode(node.body, raw)

    // Destructured-object param: `({done}) => done` (#1443),
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
    if (ts.isObjectBindingPattern(param.name)) {
      const fieldMap = new Map<string, DestructureBinding>()
      // `excludedTopKeys` mirrors the JS rest-binding exclusion set:
      // the source-object keys explicitly consumed at the top level
      // (#1532 review). Used by `validateRestUsage` for the
      // `rest.X is always undefined` collision check — `fieldMap`
      // keys on local rename / leaf names and would miss
      // `({done: d, ...rest}) => rest.done` or `({user: {name}, ...rest}) => rest.user`.
      const excludedTopKeys = new Set<string>()
      const collect = collectDestructureBindings(param.name, [], fieldMap, raw, excludedTopKeys)
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
      return { kind: 'arrow-fn', param: syntheticParam, body: rewritten }
    }

    if (!ts.isIdentifier(param.name)) {
      return { kind: 'unsupported', raw, reason: 'Destructuring parameters are not supported' }
    }
    return { kind: 'arrow-fn', param: param.name.text, body }
  }

  // Function expression: `function (x) { return x.done }` (#1443).
  // Normalise the single-param + single-return shape into the arrow
  // form so the higher-order detector at the call site recognises it
  // alongside `(x) => x.done`. Multi-statement / multi-param / nested-
  // destructure shapes stay unsupported.
  if (ts.isFunctionExpression(node)) {
    if (node.parameters.length !== 1) {
      return { kind: 'unsupported', raw, reason: 'Only single-parameter function expressions are supported' }
    }
    const param = node.parameters[0]
    if (!ts.isIdentifier(param.name)) {
      return { kind: 'unsupported', raw, reason: 'Destructured params in function expressions are not supported' }
    }
    const stmts = node.body.statements
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) {
      return { kind: 'unsupported', raw, reason: 'Function expressions must be `function (x) { return <expr> }`' }
    }
    return {
      kind: 'arrow-fn',
      param: param.name.text,
      body: convertNode(stmts[0].expression, raw),
    }
  }

  // Default: unsupported
  return { kind: 'unsupported', raw, reason: `Unsupported syntax: ${ts.SyntaxKind[node.kind]}` }
}

/**
 * Recover a `SortComparator` from the comparator arg of `.sort(cmp)` /
 * `.toSorted(cmp)` (#1448 Tier B). Operates on the raw TS AST rather
 * than the converted ParsedExpr because the standard `convertNode`
 * arrow-fn path rejects two-param arrows (it was built for the
 * single-param higher-order shape `.filter(x => …)`); for sort we
 * need both param names to decide direction (`a-b` asc vs `b-a` desc).
 *
 * The accepted catalogue is finite so the walker stays shallow — no
 * constant folding, no symbol resolution, no inference of "this looks
 * like it might sort numerically". Returns null if the shape doesn't
 * match exactly, in which case the caller emits an `unsupported` IR
 * node and adapters surface BF101.
 *
 * Body shapes:
 *   - expression-bodied arrow (`(a, b) => …`)
 *   - single-`return` block body — both arrow (`(a, b) => { return …; }`)
 *     and function expression. Multi-statement / local-var bodies stay
 *     refused (deferred follow-up).
 *
 * A body is split on top-level `||` into one leaf per operand, giving
 * a multi-key comparator (`a.x - b.x || a.y - b.y` → sort by x, then y).
 * Accepted leaf shapes (each paired ascending / descending by operand
 * order):
 *
 *   a.field - b.field                → field, numeric
 *   a - b                            → self,  numeric
 *   a.field.localeCompare(b.field)   → field, string
 *   a.localeCompare(b)               → self,  string
 *   a.field > b.field ? 1 : -1       → field, auto (relational ternary)
 *   a.field < b.field ? -1 : 1       → field, auto
 *   a < b ? -1 : a > b ? 1 : 0       → self/field, auto (3-way)
 *   a === b ? 0 : <relational ternary>  → leading-tie 3-way
 *
 * Function-reference comparators and `localeCompare(b, locale, opts)`
 * (the multi-arg form) return null — deferred follow-ups.
 */
export function extractSortComparatorFromTS(
  node: ts.Node,
  method: 'sort' | 'toSorted',
): SortComparator | null {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return null
  if (node.parameters.length !== 2) return null

  const pA = node.parameters[0]
  const pB = node.parameters[1]
  if (!ts.isIdentifier(pA.name) || !ts.isIdentifier(pB.name)) return null
  const paramA = pA.name.text
  const paramB = pB.name.text

  // Resolve the comparator body. Expression-bodied arrows carry it
  // directly; block bodies (both arrow `=> { … }` and function
  // expressions) must reduce to exactly one `return <expr>;`. Anything
  // with locals or multiple statements stays refused — a deferred
  // follow-up.
  let body: ts.Expression
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
    body = node.body
  } else {
    const block = node.body as ts.Block
    const stmts = block.statements
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) return null
    body = stmts[0].expression
  }

  // Normalise the comparator body source so consumers of
  // `SortComparator.raw` get the same string regardless of whether
  // the user wrote an arrow expression (`(a, b) => a.x - b.x`) or a
  // block body (`(a, b) => { return a.x - b.x }`). For block bodies
  // this is the returned expression, not the `{ … }` block — so the
  // `@client` fallback's synthetic `(a, b) => raw` arrow stays valid.
  //
  // `body.getText()` resolves against the node's source file via the
  // parent chain — `ts.createSourceFile`-parsed nodes (the only
  // shape this helper accepts) carry that wiring.
  const raw = body.getText()

  // A `||`-chain is a multi-key comparator: each operand is an
  // independent leaf applied as the next tie-breaker. A non-`||` body
  // is a single-key comparator (one-element chain).
  const keys: SortKey[] = []
  for (const operand of flattenLogicalOr(body)) {
    const key = classifyLeafComparator(operand, paramA, paramB)
    if (!key) return null
    keys.push(key)
  }
  if (keys.length === 0) return null

  return { keys, raw, paramA, paramB, method }
}

/** Strip redundant parentheses so the classifiers see the real node. */
function unwrapParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

/**
 * Flatten a left-associative top-level `||` chain into its operands.
 * `a || b || c` parses as `((a || b) || c)`; this returns `[a, b, c]`.
 * A non-`||` expression returns a single-element list.
 */
function flattenLogicalOr(expr: ts.Expression): ts.Expression[] {
  const inner = unwrapParens(expr)
  if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return [...flattenLogicalOr(inner.left), ...flattenLogicalOr(inner.right)]
  }
  return [inner]
}

/**
 * Classify a single comparator leaf (one `||` operand) into a SortKey.
 * Accepts subtraction (numeric), `localeCompare` (string), and
 * relational-ternary (auto) shapes; returns null otherwise.
 */
function classifyLeafComparator(
  expr: ts.Expression,
  paramA: string,
  paramB: string,
): SortKey | null {
  const body = unwrapParens(expr)

  // Subtraction: `a.field - b.field` / `a - b` → numeric.
  if (ts.isBinaryExpression(body) && body.operatorToken.kind === ts.SyntaxKind.MinusToken) {
    return classifyComparatorOperands(body.left, body.right, paramA, paramB, 'numeric')
  }

  // localeCompare (zero-arg form): `<lhs>.localeCompare(<rhs>)` →
  // string. The locale/options form (2–3 args) stays refused — it
  // needs per-adapter collation plumbing (deferred follow-up).
  if (
    ts.isCallExpression(body) &&
    ts.isPropertyAccessExpression(body.expression) &&
    body.expression.name.text === 'localeCompare' &&
    body.arguments.length === 1
  ) {
    return classifyComparatorOperands(
      body.expression.expression, // receiver of .localeCompare
      body.arguments[0],
      paramA,
      paramB,
      'string',
    )
  }

  // Relational-ternary sign comparator → auto.
  if (ts.isConditionalExpression(body)) {
    return classifyTernaryComparator(body, paramA, paramB)
  }

  return null
}

/**
 * Classify two operands against the comparator's two param names.
 * Both operands must resolve to either:
 *   - the param identifier itself              → `key.kind === 'self'`
 *   - a single-level field access on the param → `key.kind === 'field'`
 * The two operands must reference different params (one paramA, one
 * paramB) and match on key shape + field name. Order of the params
 * determines `direction`: `paramA` first is ascending, reversed is
 * descending.
 *
 * Anything deeper (chained `.x.y`, computed `.[i]`, calls, literals)
 * or mismatched keys returns null.
 */
function classifyComparatorOperands(
  left: ts.Expression,
  right: ts.Expression,
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
 * Handles the 2-way sign form (`a.f > b.f ? 1 : -1`), the canonical
 * 3-way (`a.f < b.f ? -1 : a.f > b.f ? 1 : 0`), and a leading
 * equality tie (`a.f === b.f ? 0 : <relational ternary>`).
 *
 * Direction is derived from (relational op, operand order, sign of the
 * `whenTrue` branch); the `whenFalse` branch only needs to be a bounded
 * shape (sign literal or a nested ternary on the same key) so we don't
 * silently accept arbitrary expressions.
 */
function classifyTernaryComparator(
  node: ts.ConditionalExpression,
  paramA: string,
  paramB: string,
): SortKey | null {
  const cond = unwrapParens(node.condition)

  // Leading equality tie: `a.f === b.f ? 0 : <ternary>`. The equality
  // arm returns 0 (tie); the real ordering lives in the else branch.
  if (
    ts.isBinaryExpression(cond) &&
    (cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken) &&
    sameKeyOperands(cond.left, cond.right, paramA, paramB) &&
    numericSign(node.whenTrue) === 0
  ) {
    const elseBranch = unwrapParens(node.whenFalse)
    if (ts.isConditionalExpression(elseBranch)) {
      return classifyTernaryComparator(elseBranch, paramA, paramB)
    }
    return null
  }

  // Relational condition: `<left> <op> <right>` with op ∈ {<,>,<=,>=}.
  if (!ts.isBinaryExpression(cond)) return null
  const op = cond.operatorToken.kind
  const isGreater =
    op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken
  const isLess = op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken
  if (!isGreater && !isLess) return null

  const leftRef = classifySortOperand(cond.left, paramA, paramB)
  const rightRef = classifySortOperand(cond.right, paramA, paramB)
  if (!leftRef || !rightRef) return null
  if (leftRef.param === rightRef.param) return null
  if (leftRef.key.kind !== rightRef.key.kind) return null
  if (leftRef.key.kind === 'field' && rightRef.key.kind === 'field' && leftRef.key.field !== rightRef.key.field) {
    return null
  }

  // whenTrue must be a non-zero sign literal (±1); whenFalse a bounded
  // shape (sign literal or a nested ternary on the same key).
  //
  // Direction is derived solely from this outer comparison — the nested
  // whenFalse branch is only validated for key agreement, not direction
  // consistency. A contradictory hand-written 3-way (e.g.
  // `a.f < b.f ? -1 : a.f < b.f ? 1 : 0`) is therefore lowered per the
  // outer comparison; the JS-runtime (Hono/CSR) path runs the literal
  // body, so such a degenerate comparator could order differently
  // there. The canonical asc/desc 3-way forms agree on both paths.
  const trueSign = numericSign(node.whenTrue)
  if (trueSign === null || trueSign === 0) return null
  if (!isBoundedTernaryElse(node.whenFalse, leftRef.key, paramA, paramB)) return null

  // Rewrite so the condition reads as `aKey <op> bKey` (paramA left).
  // `b.f > a.f` ⇔ `a.f < b.f`, so a paramB-on-left operand flips it.
  const greaterForA = leftRef.param === 'A' ? isGreater : !isGreater

  // `a.f > b.f ? +n` → bigger sorts later  → ascending
  // `a.f < b.f ? +n` → bigger sorts earlier → descending
  const asc = greaterForA ? trueSign > 0 : trueSign < 0
  return { key: leftRef.key, type: 'auto', direction: asc ? 'asc' : 'desc' }
}

/** True when both operands resolve to the same key on opposite params. */
function sameKeyOperands(
  left: ts.Expression,
  right: ts.Expression,
  paramA: string,
  paramB: string,
): boolean {
  const l = classifySortOperand(left, paramA, paramB)
  const r = classifySortOperand(right, paramA, paramB)
  if (!l || !r) return false
  if (l.param === r.param) return false
  if (l.key.kind !== r.key.kind) return false
  if (l.key.kind === 'field' && r.key.kind === 'field' && l.key.field !== r.key.field) return false
  return true
}

/**
 * Sign of a numeric literal with optional unary minus: 1, -1, or 0.
 * Returns null for anything that isn't a (signed) numeric literal.
 */
function numericSign(expr: ts.Expression): number | null {
  const e = unwrapParens(expr)
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) {
    const inner = numericSign(e.operand)
    return inner === null ? null : -inner
  }
  if (ts.isNumericLiteral(e)) {
    const n = Number(e.text)
    if (Number.isNaN(n)) return null
    if (n === 0) return 0
    return n > 0 ? 1 : -1
  }
  return null
}

/**
 * The `whenFalse` arm of a relational ternary is bounded if it's a
 * sign literal (±1 / 0) or a nested ternary on the same key (the
 * canonical 3-way form). The outer comparison already fixes direction,
 * so the nested branch only needs to agree on which key it compares.
 */
function isBoundedTernaryElse(
  expr: ts.Expression,
  key: { kind: 'self' } | { kind: 'field'; field: string },
  paramA: string,
  paramB: string,
): boolean {
  const e = unwrapParens(expr)
  if (numericSign(e) !== null) return true
  if (ts.isConditionalExpression(e)) {
    const nested = classifyTernaryComparator(e, paramA, paramB)
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

function classifySortOperand(
  expr: ts.Expression,
  paramA: string,
  paramB: string,
): { key: { kind: 'self' } | { kind: 'field'; field: string }; param: 'A' | 'B' } | null {
  if (ts.isIdentifier(expr)) {
    if (expr.text === paramA) return { key: { kind: 'self' }, param: 'A' }
    if (expr.text === paramB) return { key: { kind: 'self' }, param: 'B' }
    return null
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    if (expr.expression.text === paramA) {
      return { key: { kind: 'field', field: expr.name.text }, param: 'A' }
    }
    if (expr.expression.text === paramB) {
      return { key: { kind: 'field', field: expr.name.text }, param: 'B' }
    }
  }
  return null
}

/**
 * Recover a `ReduceOp` from the `(reducer, init)` args of
 * `.reduce(...)` (#1448 Tier C). Operates on the raw TS AST because the
 * standard `convertNode` arrow-fn path rejects two-param arrows.
 *
 * The accepted catalogue is intentionally finite — only the
 * arithmetic-fold family lowers to a declarative template:
 *
 *   (acc, x) => acc + x          → self,  numeric (init: number)
 *   (acc, x) => acc + x.field    → field, numeric (init: number)
 *   (acc, x) => acc * x          → self,  numeric (init: number)
 *   (acc, x) => acc * x.field    → field, numeric (init: number)
 *   (acc, x) => acc + x          → self,  string  (init: string → concat)
 *   (acc, x) => acc + x.field    → field, string  (init: string → concat)
 *
 * The accumulator must be the binary expression's *left* operand
 * (canonical reduce form; reversed operands change string-concat
 * order), the per-item value must be the item param itself or a
 * single non-computed field access on it, and the init must be a
 * number or string literal (negative numbers via prefix `-` allowed).
 * String concatenation requires `+`. Block bodies reduce to a single
 * `return`, mirroring the sort extractor. Anything else returns null
 * and the caller emits `unsupported` (BF101).
 */
export function extractReduceOpFromTS(
  reducerNode: ts.Node,
  initNode: ts.Node,
): ReduceOp | null {
  const init = classifyReduceInit(initNode)
  if (!init) return null

  if (!ts.isArrowFunction(reducerNode) && !ts.isFunctionExpression(reducerNode)) return null
  // Exactly `(acc, item)` — the index / array reducer params can't be
  // expressed in a template fold, so refuse the 3- / 4-param forms.
  if (reducerNode.parameters.length !== 2) return null
  const pAcc = reducerNode.parameters[0]
  const pItem = reducerNode.parameters[1]
  if (!ts.isIdentifier(pAcc.name) || !ts.isIdentifier(pItem.name)) return null
  const paramAcc = pAcc.name.text
  const paramItem = pItem.name.text

  // Resolve the reducer body: expression-bodied arrow directly; block
  // bodies (arrow `=> { … }` and function expressions) must reduce to
  // exactly one `return <expr>;` — mirrors `extractSortComparatorFromTS`.
  let body: ts.Expression
  if (ts.isArrowFunction(reducerNode) && !ts.isBlock(reducerNode.body)) {
    body = reducerNode.body
  } else {
    const block = reducerNode.body as ts.Block
    const stmts = block.statements
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) return null
    body = stmts[0].expression
  }
  const raw = body.getText()

  const expr = unwrapParens(body)
  if (!ts.isBinaryExpression(expr)) return null
  let op: '+' | '*'
  if (expr.operatorToken.kind === ts.SyntaxKind.PlusToken) op = '+'
  else if (expr.operatorToken.kind === ts.SyntaxKind.AsteriskToken) op = '*'
  else return null

  // The accumulator must be the left operand (`acc + x`, not `x + acc`).
  const left = unwrapParens(expr.left)
  if (!ts.isIdentifier(left) || left.text !== paramAcc) return null

  const key = classifyReduceKey(unwrapParens(expr.right), paramItem)
  if (!key) return null

  // String concatenation only makes sense with `+`.
  const type: 'numeric' | 'string' = init.type
  if (type === 'string' && op !== '+') return null

  return { op, key, type, init: init.value, raw, paramAcc, paramItem }
}

/**
 * Recover a `FlatMapOp` from the single-argument callback of a
 * value-returning `.flatMap(fn)` (#1448 Tier C). Operates on the raw TS
 * AST, mirroring `extractReduceOpFromTS`.
 *
 * The accepted catalogue:
 *
 *   i => i            → self  (flatMap(identity) === flat(1))
 *   i => i.field      → field (flatten a per-item array field)
 *   i => [i.a, i.b]   → tuple (gather per-item self / field leaves)
 *
 * The callback must take exactly one identifier param (the index / array
 * params can't be expressed in a template projection), and the body must
 * be the param itself, a single non-computed field access on it, or an
 * array literal whose every element is one of those leaves. Block bodies
 * reduce to a single `return`, like the reduce / sort extractors. Any
 * other body (deep access, computed members, calls, arithmetic, a
 * literal element) returns null and the caller emits `unsupported`
 * (BF101).
 */
export function extractFlatMapOpFromTS(cbNode: ts.Node): FlatMapOp | null {
  if (!ts.isArrowFunction(cbNode) && !ts.isFunctionExpression(cbNode)) return null
  // Exactly `(item)` — a `(item, index)` / `(item, index, array)` callback
  // can't be lowered to a declarative projection.
  if (cbNode.parameters.length !== 1) return null
  const p = cbNode.parameters[0]
  if (!ts.isIdentifier(p.name)) return null
  const param = p.name.text

  let body: ts.Expression
  if (ts.isArrowFunction(cbNode) && !ts.isBlock(cbNode.body)) {
    body = cbNode.body
  } else {
    const block = cbNode.body as ts.Block
    const stmts = block.statements
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) return null
    body = stmts[0].expression
  }
  const raw = body.getText()
  const inner = unwrapParens(body)

  // Array-literal body → tuple projection. Every element must be a
  // self / field leaf; a literal / computed / nested element refuses the
  // whole shape (the per-item evaluation of richer expressions isn't
  // lowered). flat(1) removes only the literal's wrapper, so each leaf is
  // appended verbatim — handled by the `bf_flat_map_tuple` runtime.
  if (ts.isArrayLiteralExpression(inner)) {
    // An empty tuple (`i => []`) is a degenerate no-op projection (always
    // yields nothing). Refuse it so the emitters never produce a
    // zero-arg `bf_flat_map_tuple` / `bf->flat_map_tuple(...,)` call.
    if (inner.elements.length === 0) return null
    const elements: FlatMapLeaf[] = []
    for (const el of inner.elements) {
      // Spread / holes (`[...xs]`, `[, x]`) aren't leaves.
      if (ts.isSpreadElement(el) || ts.isOmittedExpression(el)) return null
      const leaf = classifyReduceKey(unwrapParens(el), param)
      if (!leaf) return null
      elements.push(leaf)
    }
    return { projection: { kind: 'tuple', elements }, param, raw }
  }

  // Scalar body. Reuse the reduce key classifier — `i` → self,
  // `i.field` → field, null for anything deeper (`i.a.b`, `i[k]`, a call).
  const leaf = classifyReduceKey(inner, param)
  if (!leaf) return null

  return { projection: leaf, param, raw }
}

/**
 * Classify a reduce per-item operand into a `ReduceOp` key. Accepts
 * the bare item param (`x` → self) and a single non-computed field
 * access (`x.field` → field); returns null for anything deeper
 * (`x.a.b`, `x[k]`, a literal, a call, …).
 */
function classifyReduceKey(
  expr: ts.Expression,
  paramItem: string,
): { kind: 'self' } | { kind: 'field'; field: string } | null {
  if (ts.isIdentifier(expr)) {
    return expr.text === paramItem ? { kind: 'self' } : null
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    if (expr.expression.text === paramItem) return { kind: 'field', field: expr.name.text }
  }
  return null
}

/**
 * Classify a reduce initial-value node into the *decoded* fold seed.
 * Accepts a numeric literal (optionally prefixed with `-`) and a string
 * literal; returns `{ type, value }` where `value` is the canonical
 * value — never the raw source text. Any other init (a variable, a
 * call, an object) returns null — the fold start value must be
 * statically known.
 *
 * Numeric: `node.text` is TypeScript's canonical decimal form, so
 * separators and non-decimal radices fold uniformly across adapters
 * (`1_000` → `1000`, `0x10` → `16`, `1e3` → `1000`). The Go runtime's
 * `strconv.ParseFloat` and Perl both accept that decimal string —
 * passing the raw source (`0x10`, `1_000`) would silently fold to 0 on
 * Go while Perl accepted it (#1728 review).
 *
 * String: `node.text` is the *unescaped* contents. To keep the three
 * adapters byte-equal without teaching each one to re-decode JS escapes
 * (`\n`, `\u{…}`, `\\`, an escaped quote), we refuse any string literal
 * whose contents differ from its raw inner source — i.e. any literal
 * carrying an escape sequence. Accepted seeds are therefore escape-free
 * single-line strings (`''`, `', '`, `'-'`), which embed safely in both
 * the Go-template `"…"` operand and the Perl single-quoted literal. The
 * realistic concat seed (`''`) is unaffected; richer seeds fall back to
 * the `@client` escape hatch.
 */
function classifyReduceInit(
  node: ts.Node,
): { type: 'numeric' | 'string'; value: string } | null {
  // Unwrap redundant parens (`(0)` / `(-1)`) so they classify like the
  // bare literal — matches the extractor's `unwrapParens` use elsewhere.
  let n: ts.Node = unwrapParens(node as ts.Expression)
  // `-1` parses as a prefix-minus over a numeric literal.
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) {
    if (ts.isNumericLiteral(n.operand)) return { type: 'numeric', value: '-' + n.operand.text }
    return null
  }
  if (ts.isNumericLiteral(n)) return { type: 'numeric', value: n.text }
  if (ts.isStringLiteral(n)) {
    // Refuse literals carrying escapes so the decoded value equals its
    // raw inner source (and thus embeds safely + byte-equal everywhere).
    const raw = n.getText()
    if (raw.length < 2 || raw.slice(1, -1) !== n.text) return null
    return { type: 'string', value: n.text }
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
      if (parsed.kind === 'unsupported') {
        return { ok: false, reason: `Default value in destructured filter param failed to parse: ${parsed.reason}` }
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
      return null
    case 'member':
      return findImpureDefaultNode(expr.object)
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
    case 'higher-order':
    case 'arrow-fn':
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
      case 'arrow-fn':
        // Inner arrow that re-uses `restName` as its own parameter
        // shadows the outer rest binding — references inside its
        // body belong to the inner param, not us (#1532 review).
        if (e.param === restName) return
        walk(e.body)
        return
      case 'higher-order':
        walk(e.object)
        // The predicate is the inner-callback body; its `param`
        // shadows the outer rest binding when names match.
        if (e.param !== restName) walk(e.predicate)
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
    case 'arrow-fn':
      collectIdentifiers(expr.body, out)
      return
    case 'higher-order':
      collectIdentifiers(expr.object, out)
      collectIdentifiers(expr.predicate, out)
      return
    case 'array-literal':
      expr.elements.forEach(e => collectIdentifiers(e, out))
      return
    case 'array-method':
      collectIdentifiers(expr.object, out)
      expr.args.forEach(e => collectIdentifiers(e, out))
      return
    case 'literal':
    case 'unsupported':
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
      case 'arrow-fn':
        // A nested arrow inside the predicate body shadows the outer
        // param. Leave its body alone — its own param-resolution path
        // handles closure references against the outer fieldMap on its
        // own terms. This matches how JS scope rules treat the outer
        // destructured `done` once a shadowing inner arrow declares a
        // different name (the inner arrow's body sees the outer
        // `done` only if it doesn't shadow it, which we can't know
        // without per-scope tracking). Skipping the rewrite is the
        // conservative choice — worst case the resulting predicate
        // doesn't lower and the adapter emits BF101.
        return e
      case 'higher-order':
        return e
      case 'array-literal':
        return { kind: 'array-literal', elements: e.elements.map(walk) }
      case 'array-method':
        if (e.method === 'sort' || e.method === 'toSorted') {
          // Sort comparator is a structured value, not a ParsedExpr —
          // destructured-field substitution doesn't apply (the
          // comparator references its own paramA / paramB, never the
          // enclosing destructure). Preserve verbatim.
          return { kind: 'array-method', method: e.method, object: walk(e.object), args: [], comparator: e.comparator }
        }
        if (e.method === 'reduce' || e.method === 'reduceRight') {
          // `ReduceOp` is a structured value referencing its own
          // paramAcc / paramItem, never the enclosing destructure —
          // preserve verbatim, same as the sort comparator above.
          return { kind: 'array-method', method: e.method, object: walk(e.object), args: [], reduceOp: e.reduceOp }
        }
        if (e.method === 'flat') {
          // `flatDepth` is a normalised literal — no destructure refs to
          // substitute. Preserve verbatim, same as sort / reduce above.
          return { kind: 'array-method', method: 'flat', object: walk(e.object), args: [], flatDepth: e.flatDepth }
        }
        if (e.method === 'flatMap') {
          // `FlatMapOp` references its own callback param, never the
          // enclosing destructure — preserve verbatim, like reduce / sort.
          return { kind: 'array-method', method: 'flatMap', object: walk(e.object), args: [], flatMapOp: e.flatMapOp }
        }
        return { kind: 'array-method', method: e.method, object: walk(e.object), args: e.args.map(walk) }
      case 'literal':
      case 'unsupported':
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

    case 'identifier':
      return { supported: true, level: 'L1' }

    case 'literal':
      return { supported: true, level: 'L1' }

    case 'arrow-fn': {
      // Arrow functions are only supported as arguments to higher-order methods
      // They shouldn't appear standalone in supported contexts
      return { supported: false, reason: 'Standalone arrow functions are not supported' }
    }

    case 'higher-order': {
      // Check if predicate uses L1-L4 features
      const predSupport = checkSupport(expr.predicate)
      if (!predSupport.supported) {
        return {
          supported: false,
          level: 'L5_UNSUPPORTED',
          reason: `Higher-order method '${expr.method}()' with complex predicate. ${predSupport.reason || 'Simplify the predicate.'}`,
        }
      }
      // Nested higher-order INSIDE the predicate body (e.g.
      // `x => x.tags.filter(t => t.active).length > 0`) was refused
      // here historically because adapter emitters would produce
      // broken output for `[grep ...]->{length}` style chains. Note
      // this check is intentionally NOT extended to `expr.object`:
      // chained-receiver forms like `arr.filter(p).filter(q)` lower
      // correctly via the emitter's recursive `emit(object)` (which
      // wraps the inner result in another `grep`). The Copilot
      // review on #1444 asked us to either update this comment or
      // also reject chained receivers — preserving the chained
      // case is the right move because it already works.
      if (containsHigherOrder(expr.predicate)) {
        return {
          supported: false,
          level: 'L5_UNSUPPORTED',
          reason: `Nested higher-order methods inside a predicate body are not supported. Use @client directive.`,
        }
      }
      // The source array also has to be lowerable. Skipping this check
      // (matching the pre-#1443 behaviour) silently let `array-literal`
      // sources fall through to the adapter's `unsupported` arm and
      // through the regex pipeline — the recursion that #1421 / #1427
      // worked around.
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) {
        return objSupport
      }
      return { supported: true, level: 'L5' }
    }

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
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) return objSupport
      for (const arg of expr.args) {
        const argSupport = checkSupport(arg)
        if (!argSupport.supported) return argSupport
      }
      return { supported: true, level: 'L2' }
    }


    case 'call': {
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
 * Check if expression contains any higher-order method calls.
 */
export function containsHigherOrder(expr: ParsedExpr): boolean {
  switch (expr.kind) {
    case 'higher-order':
      return true
    case 'call':
      return expr.args.some(containsHigherOrder) || containsHigherOrder(expr.callee)
    case 'member':
      return containsHigherOrder(expr.object)
    case 'binary':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'unary':
      return containsHigherOrder(expr.argument)
    case 'logical':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'conditional':
      return containsHigherOrder(expr.test) || containsHigherOrder(expr.consequent) || containsHigherOrder(expr.alternate)
    case 'arrow-fn':
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
    const valueText = getJS(stmt.expression)
    const value = parseExpression(valueText)
    if (value.kind === 'unsupported') {
      return null
    }
    return { kind: 'return', value }
  }

  // If statement: if (f === 'active') return !t.done
  if (ts.isIfStatement(stmt)) {
    const conditionText = getJS(stmt.expression)
    const condition = parseExpression(conditionText)
    if (condition.kind === 'unsupported') {
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
    case 'arrow-fn':
      return `${expr.param} => ${exprToString(expr.body)}`
    case 'higher-order':
      return `${exprToString(expr.object)}.${expr.method}(${expr.param} => ${exprToString(expr.predicate)})`
    case 'array-literal':
      return `[${expr.elements.map(exprToString).join(', ')}]`
    case 'array-method':
      if (expr.method === 'sort' || expr.method === 'toSorted') {
        // Reconstruct against the user's actual param names — the
        // comparator body in `raw` references them directly, so
        // hardcoding `(a,b)` would produce un-re-parseable output
        // for any user who wrote e.g. `(lhs, rhs) => lhs - rhs`.
        const { paramA, paramB, raw } = expr.comparator
        return `${exprToString(expr.object)}.${expr.method}((${paramA},${paramB}) => ${raw})`
      }
      if (expr.method === 'reduce' || expr.method === 'reduceRight') {
        const { paramAcc, paramItem, raw, type, init } = expr.reduceOp
        // `init` is the decoded value: re-quote a string seed, re-emit a
        // numeric seed as-is (it's already a valid number literal).
        const initSrc = type === 'string' ? JSON.stringify(init) : init
        return `${exprToString(expr.object)}.${expr.method}((${paramAcc},${paramItem}) => ${raw}, ${initSrc})`
      }
      if (expr.method === 'flat') {
        // Preserve the normalised depth so diagnostics don't misleadingly
        // print `.flat()` for a `.flat(2)` / `.flat(Infinity)` source.
        const d = expr.flatDepth
        const depthSrc = d === 'infinity' ? 'Infinity' : String(d)
        return `${exprToString(expr.object)}.flat(${d === 1 ? '' : depthSrc})`
      }
      if (expr.method === 'flatMap') {
        const { param, raw } = expr.flatMapOp
        return `${exprToString(expr.object)}.flatMap(${param} => ${raw})`
      }
      return `${exprToString(expr.object)}.${expr.method}(${expr.args.map(exprToString).join(', ')})`
    case 'unsupported':
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
    case 'arrow-fn':
      return `${expr.param} => ${stringifyParsedExpr(expr.body)}`
    case 'higher-order':
      return `${stringifyParsedExpr(expr.object)}.${expr.method}(${expr.param} => ${stringifyParsedExpr(expr.predicate)})`
    case 'array-literal':
      return `[${expr.elements.map(stringifyParsedExpr).join(', ')}]`
    case 'array-method':
      if (expr.method === 'sort' || expr.method === 'toSorted') {
        // Round-trip the original param names so downstream
        // re-parsers (templatePrimitive substitution etc.) see
        // valid JS — `raw` references the user's names verbatim.
        const { paramA, paramB, raw } = expr.comparator
        return `${stringifyParsedExpr(expr.object)}.${expr.method}((${paramA},${paramB}) => ${raw})`
      }
      if (expr.method === 'reduce' || expr.method === 'reduceRight') {
        // Round-trip the user's param names + init so downstream
        // re-parsers (the CSR / Hono JS path, templatePrimitive
        // substitution) see valid JS — `raw` references the names
        // verbatim. `init` is the decoded value: re-quote a string
        // seed via JSON.stringify, re-emit a numeric seed as-is.
        const { paramAcc, paramItem, raw, type, init } = expr.reduceOp
        const initSrc = type === 'string' ? JSON.stringify(init) : init
        return `${stringifyParsedExpr(expr.object)}.${expr.method}((${paramAcc},${paramItem}) => ${raw}, ${initSrc})`
      }
      if (expr.method === 'flat') {
        // Round-trip the normalised depth back to JS for the CSR / Hono
        // path: `'infinity'` → `Infinity`, `1` is left implicit (`.flat()`).
        const d = expr.flatDepth
        const depthSrc = d === 'infinity' ? 'Infinity' : String(d)
        return `${stringifyParsedExpr(expr.object)}.flat(${d === 1 ? '' : depthSrc})`
      }
      if (expr.method === 'flatMap') {
        // Round-trip the user's callback param + body so the CSR / Hono
        // path re-parses valid JS (`raw` references the param verbatim).
        const { param, raw } = expr.flatMapOp
        return `${stringifyParsedExpr(expr.object)}.flatMap(${param} => ${raw})`
      }
      return `${stringifyParsedExpr(expr.object)}.${expr.method}(${expr.args.map(stringifyParsedExpr).join(', ')})`
    case 'unsupported':
      return expr.raw
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
