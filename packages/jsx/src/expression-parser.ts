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
  | { kind: 'higher-order'; method: 'filter' | 'every' | 'some' | 'find' | 'findIndex'; object: ParsedExpr; param: string; predicate: ParsedExpr }
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
  | { kind: 'unsupported'; raw: string; reason: string }

/**
 * Structured form of a JS `(a, b) => …` sort comparator. Built once
 * at parse time and consumed by both adapters' arrayMethod emit and
 * (when chained directly before `.map()`) the loop-hoist path in
 * `jsx-to-ir.ts`. The shape is intentionally finite — see
 * `extractSortComparatorFromTS` for the accepted catalogue.
 */
export type SortComparator = {
  // What value to compare on each item:
  //   { kind: 'self' }         → primitive array, compare items directly
  //   { kind: 'field', field } → struct-field accessor
  key: { kind: 'self' } | { kind: 'field'; field: string }
  // How to compare:
  //   'numeric' → `a - b` subtraction semantics
  //   'string'  → `localeCompare` semantics
  type: 'numeric' | 'string'
  direction: 'asc' | 'desc'
  // Original JS source of the comparator body; preserved so `@client`
  // fallback can re-emit the user's exact expression if the call site
  // ever gets relocated to the runtime.
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
  // Higher-order array methods. Five of these (`filter`, `every`,
  // `some`, `find`, `findIndex`) are intercepted as `higher-order`
  // IR before reaching this gate; `map` is intercepted as an
  // IRLoop. The rest stay refused — see #1448 Tier C for the
  // design questions.
  'filter', 'map', 'reduce', 'reduceRight', 'every', 'some',
  'findLast', 'findLastIndex',
  'forEach', 'flatMap', 'flat',
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
])

// =============================================================================
// Expression Parser
// =============================================================================

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
    if (callee.kind === 'member' && ['filter', 'every', 'some', 'find', 'findIndex'].includes(callee.property)) {
      if (args.length === 1 && args[0].kind === 'arrow-fn') {
        const arrowFn = args[0] as { kind: 'arrow-fn'; param: string; body: ParsedExpr }
        return {
          kind: 'higher-order',
          method: callee.property as 'filter' | 'every' | 'some' | 'find' | 'findIndex',
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
      if (callee.property === 'join' && args.length === 1) {
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
      if (callee.property === 'at' && args.length === 1) {
        return { kind: 'array-method', method: 'at', object: callee.object, args }
      }
      // `.concat(other)` — merges two arrays in order. Go uses
      // `bf_concat` (reflect-based append into `[]any`); Mojo uses
      // `bf->concat` (Perl list builder). Variadic shapes (`.concat(a, b)`)
      // are out of scope for this PR — gated to single-arg here.
      if (callee.property === 'concat' && args.length === 1) {
        return { kind: 'array-method', method: 'concat', object: callee.object, args }
      }
      // `.slice(start)` / `.slice(start, end)` — both forms route
      // through `bf_slice` (Go) / `bf->slice` (Mojo); the helpers
      // treat a missing / undef `end` as "to length".
      if (callee.property === 'slice' && (args.length === 1 || args.length === 2)) {
        return { kind: 'array-method', method: 'slice', object: callee.object, args }
      }
      // `.reverse()` and `.toReversed()` — both zero-arg shapes
      // share the runtime lowering. SSR templates render a snapshot
      // of state, so JS's mutate-and-return-receiver (`reverse`)
      // vs return-new-array (`toReversed`) distinction has no
      // template-level meaning; both produce a new reversed array.
      if ((callee.property === 'reverse' || callee.property === 'toReversed') && args.length === 0) {
        return { kind: 'array-method', method: callee.property, object: callee.object, args }
      }
      // `.toLowerCase()` — string-only (the IR carries a value-builtin
      // tag, not a receiver-type discriminator, so the `array-method`
      // label is a misnomer for string methods but the mechanical
      // pipeline matches). Go uses the existing `bf_lower` helper;
      // Mojo uses Perl's native `lc`. See #1448 Tier A.
      if (callee.property === 'toLowerCase' && args.length === 0) {
        return { kind: 'array-method', method: 'toLowerCase', object: callee.object, args }
      }
      // `.toUpperCase()` — Go uses the existing `bf_upper` helper;
      // Mojo uses Perl's native `uc`.
      if (callee.property === 'toUpperCase' && args.length === 0) {
        return { kind: 'array-method', method: 'toUpperCase', object: callee.object, args }
      }
      // `.trim()` — Go uses the existing `bf_trim` helper; Mojo uses
      // a new `bf->trim` method that mirrors JS's "strip leading +
      // trailing whitespace" semantic via a Perl regex.
      if (callee.property === 'trim' && args.length === 0) {
        return { kind: 'array-method', method: 'trim', object: callee.object, args }
      }
      // `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B). The comparator
      // is extracted into a structured `SortComparator` at parse time;
      // unrecognised shapes fall through to `unsupported` so adapters
      // surface BF101 (with `@client` as the escape hatch). Block
      // bodies, multi-key comparators, and function-reference
      // comparators are out of scope for this PR — see #1448 Tier B
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
            `(reverse the operands for descending order). ` +
            `Wrap the call in /* @client */ to evaluate at hydration.`,
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
      const collect = collectDestructureBindings(param.name, [], fieldMap, raw)
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
        const check = validateRestUsage(body, restName, fieldMap)
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
 * Accepted shapes (paired ascending / descending):
 *
 *   (a, b) => a.field - b.field            → field, numeric, asc
 *   (a, b) => b.field - a.field            → field, numeric, desc
 *   (a, b) => a - b                        → self,  numeric, asc
 *   (a, b) => b - a                        → self,  numeric, desc
 *   (a, b) => a.field.localeCompare(b.field) → field, string, asc
 *   (a, b) => b.field.localeCompare(a.field) → field, string, desc
 *   (a, b) => a.localeCompare(b)           → self,  string, asc
 *   (a, b) => b.localeCompare(a)           → self,  string, desc
 *
 * Anything outside (block bodies, multi-key `a.x-b.x || a.y-b.y`,
 * function-reference comparators, ternary comparators) returns null.
 * Block-body support is deferred to a follow-up.
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

  // Body must be an expression. Arrow-fn carries `.body` directly;
  // function-expression wraps a single `return <expr>;`. Block bodies
  // deferred to a follow-up PR.
  let body: ts.Expression
  if (ts.isArrowFunction(node)) {
    if (ts.isBlock(node.body)) return null
    body = node.body
  } else {
    const stmts = node.body.statements
    if (stmts.length !== 1 || !ts.isReturnStatement(stmts[0]) || !stmts[0].expression) return null
    body = stmts[0].expression
  }

  // Normalise the comparator body source so consumers of
  // `SortComparator.raw` get the same string regardless of whether
  // the user wrote an arrow expression (`(a, b) => a.x - b.x`) or
  // a function expression (`function (a, b) { return a.x - b.x }`).
  // Pre-normalisation the function-expression form leaked the whole
  // function declaration into `raw`, breaking `@client` fallback
  // emit that wraps `raw` in a synthetic arrow.
  //
  // `body.getText()` resolves against the node's source file via the
  // parent chain — `ts.createSourceFile`-parsed nodes (the only
  // shape this helper accepts) carry that wiring.
  const raw = body.getText()

  // Subtraction: `a.field - b.field` / `a - b` etc.
  if (ts.isBinaryExpression(body) && body.operatorToken.kind === ts.SyntaxKind.MinusToken) {
    return classifyComparatorOperands(body.left, body.right, paramA, paramB, 'numeric', method, raw)
  }

  // localeCompare call: `<lhs>.localeCompare(<rhs>)`.
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
      method,
      raw,
    )
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
  method: 'sort' | 'toSorted',
  raw: string,
): SortComparator | null {
  const leftRef = classifySortOperand(left, paramA, paramB)
  const rightRef = classifySortOperand(right, paramA, paramB)
  if (!leftRef || !rightRef) return null
  if (leftRef.param === rightRef.param) return null
  if (leftRef.key.kind !== rightRef.key.kind) return null
  if (leftRef.key.kind === 'field' && rightRef.key.kind === 'field' && leftRef.key.field !== rightRef.key.field) {
    return null
  }
  const direction = leftRef.param === 'A' ? 'asc' : 'desc'
  return {
    key: leftRef.key,
    type,
    direction,
    raw,
    paramA,
    paramB,
    method,
  }
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
      const inner = collectDestructureBindings(
        el.name,
        [...pathPrefix, el.propertyName.text],
        fieldMap,
        raw,
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
 *  - `restName.X` where `X` is also a declared field in `fieldMap`.
 *    Per JS spec the rest binding excludes the explicitly-named
 *    keys, so the read is statically always `undefined` — flag the
 *    user bug rather than silently rewrite to `_t.X` (which WOULD
 *    return the value, masking the mistake).
 *
 * The walker recurses into nested arrow / higher-order bodies on
 * purpose: lexical capture means an inner arrow that references
 * the outer `restName` is still a use of the same binding, and
 * `substituteDestructuredFields` does NOT recurse through arrows.
 * Refusing here keeps the substitution path total — every retained
 * rest reference is a top-level `restName.X` that the substitution
 * step rewrites correctly. If a future inner-arrow shadowing model
 * lands, this can relax to track shadowing scopes.
 */
function validateRestUsage(
  expr: ParsedExpr,
  restName: string,
  fieldMap: Map<string, DestructureBinding>,
): { ok: true } | { ok: false; reason: string } {
  let valueUse = false
  let collision: string | null = null

  const walk = (e: ParsedExpr): void => {
    if (valueUse || collision !== null) return
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
          if (fieldMap.has(e.property)) {
            collision = e.property
          }
          return
        }
        walk(e.object)
        return
      case 'call':
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
        walk(e.body)
        return
      case 'higher-order':
        walk(e.object)
        walk(e.predicate)
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
    return {
      ok: false,
      reason: `Rest binding '${restName}.${collision}' shadows a declared key '${collision}' and is statically undefined. Workaround: reference the declared binding '${collision}' directly, or remove '${collision}' from the destructure.`,
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
        if (UNSUPPORTED_METHODS.has(methodName)) {
          return {
            supported: false,
            level: 'L5_UNSUPPORTED',
            reason: `Higher-order method '${methodName}()' requires client-side evaluation. Use @client directive or pre-compute in Go.`,
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
