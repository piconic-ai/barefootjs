/**
 * Backend-neutral boolean-result classification shared by every DSL
 * template adapter (Blade, ERB, Jinja, MiniJinja, Mojolicious, Pebble, Twig,
 * Xslate; #3475 lifted the per-adapter copies here). It decides which
 * `ParsedExpr` shapes evaluate to a JS boolean, rewrites a ternary that only
 * PARTLY does (#3349), and names the ARIA attributes whose binding is
 * boolean by definition. The adapters use it for two decisions:
 *
 * 1. **Stringification.** A boolean-shaped attribute / text binding is routed
 *    through the runtime's `bool_str` helper so it serialises as JS
 *    `String(boolean)` ("true" / "false"). No host language gets this for
 *    free: Perl renders a comparison as `''` / `1` and `false` as `0`;
 *    Python's `str(True)` is `"True"`; PHP's `(string) true` is `"1"` and
 *    `(string) false` is `""`; Java's `Boolean.toString()` happens to match,
 *    but Pebble still routes explicitly so `bf.string` handles every JS value
 *    shape the same way.
 * 2. **Condition-position truthiness** (Blade, Jinja, MiniJinja, Pebble,
 *    Twig). A condition that is already boolean-shaped is emitted as is;
 *    anything else is wrapped in the runtime's JS-faithful `truthy` before it
 *    becomes an `if` / ternary test, because those hosts disagree with JS on
 *    empty containers (`[]` / `{}` are JS-truthy, falsy in Python, PHP and
 *    Pebble) and PHP also on the string `'0'`. Perl never needed this: an
 *    array / hash reference is always true there.
 *
 * Detected boolean-result shapes:
 *   - `binary` with a comparison operator (`<`, `>`, `<=`, `>=`, `==`,
 *     `===`, `!=`, `!==`)
 *   - `unary` with logical `!`
 *   - `literal` with `literalType: 'boolean'`
 *   - `logical` (`&&` / `||` / `??`) when both sides are boolean-result
 *     (`x > 0 && y < 10`, not `x() || 'fallback'`)
 *   - `conditional` (`?:`) when both branches are boolean-result
 *   - with a caller's `isBooleanName`, a getter call, `props.X` or bare
 *     name declared `boolean`
 *
 * Anything else is not boolean-result, including a bare identifier
 * (`accepted`) or call (`accepted()`) without a witness: its type is not
 * recoverable from source text.
 */

import { parseExpression, type ParsedExpr } from '../expression-parser.ts'
import type { IRMetadata, TypeInfo } from '../types.ts'

const COMPARISON_OPS = new Set([
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '===',
  '!=',
  '!==',
])

/**
 * Whether `node` evaluates to a JS boolean: structurally, or, when the
 * caller passes `isBooleanName`, through a leaf declared `boolean` — a
 * zero-arg getter call (`on()`), `props.on`, or a bare name — the same
 * witness shape `isStringTypedOperand` takes for strings. A logical
 * expression mixing a boolean prop with a comparison (`props.on &&
 * !props.off`) then classifies as boolean (#3443).
 */
export function isBooleanResultParsed(
  node: ParsedExpr,
  isBooleanName?: (name: string, componentProperty?: boolean) => boolean,
): boolean {
  switch (node.kind) {
    case 'literal':
      return node.literalType === 'boolean'
    case 'binary':
      return COMPARISON_OPS.has(node.op)
    case 'unary':
      return node.op === '!'
    case 'logical':
      // `x > 0 && y < 10` is boolean; `x() || 'fallback'` is not.
      // Only both-sides-boolean qualifies.
      return (
        isBooleanResultParsed(node.left, isBooleanName) && isBooleanResultParsed(node.right, isBooleanName)
      )
    case 'conditional':
      // `cond ? bool : bool` is boolean; `cond ? 'a' : 'b'` is not.
      return (
        isBooleanResultParsed(node.consequent, isBooleanName) &&
        isBooleanResultParsed(node.alternate, isBooleanName)
      )
    case 'call':
      return !!isBooleanName && node.callee.kind === 'identifier' && node.args.length === 0 && isBooleanName(node.callee.name)
    case 'member':
      return !!isBooleanName && !node.computed && node.object.kind === 'identifier' && node.object.name === 'props' &&
        isBooleanName(node.property, true)
    case 'identifier':
      return !!isBooleanName && isBooleanName(node.name)
    default:
      return false
  }
}

/**
 * Rewrites the boolean-result branches of a ternary whose OTHER branch is
 * not boolean (`yes() ? false : s()`), so a taken boolean branch carries
 * JS `String(boolean)` instead of Perl's `0` / `''` / `1` (#3349). The whole
 * value isn't boolean-shaped, so `bool_str` can't wrap it; instead a literal
 * `true` / `false` branch becomes the string literal `'true'` / `'false'`,
 * and any other boolean-result branch `b` becomes `b ? 'true' : 'false'`.
 * The existing ternary lowering then renders the rewritten tree unchanged.
 * Nested ternary branches are rewritten recursively; anything that is not
 * a mixed ternary is returned as is.
 */
export function stringifyBooleanTernaryBranches(node: ParsedExpr): ParsedExpr {
  if (node.kind !== 'conditional' || isBooleanResultParsed(node)) return node
  return {
    ...node,
    consequent: stringifyBooleanBranch(node.consequent),
    alternate: stringifyBooleanBranch(node.alternate),
  }
}

function stringifyBooleanBranch(branch: ParsedExpr): ParsedExpr {
  if (!isBooleanResultParsed(branch)) return stringifyBooleanTernaryBranches(branch)
  if (branch.kind === 'literal') {
    return { kind: 'literal', value: String(branch.value), literalType: 'string' }
  }
  return {
    kind: 'conditional',
    test: branch,
    consequent: { kind: 'literal', value: 'true', literalType: 'string' },
    alternate: { kind: 'literal', value: 'false', literalType: 'string' },
  }
}


/**
 * Names whose value is always a JS boolean, for {@link isBooleanResultParsed}'s
 * `isBooleanName` (#3443):
 *
 * - `names`, read as a bare identifier or getter call: signals and memos
 *   typed `boolean` (or, untyped, seeded with a boolean literal), local
 *   constants typed or seeded so, and — only when the props are
 *   destructured — the `boolean` props. A local constant of another type
 *   shadows a same-named prop: with a props object (`props.enabled`) a bare
 *   `enabled` is never the prop.
 * - `props`, read as `props.X`: the `boolean` props by their source key.
 *
 * A prop counts only when it can't be `undefined` (required, or carrying a
 * default proven boolean); an omitted one stringifies as `undefined`, not
 * `false`, and so does one defaulted to `undefined` or any other non-boolean
 * expression. A loop
 * or callback binding of the same name shadows a bare name, which the
 * caller's scope decides.
 */
export function collectBooleanValueNames(
  metadata: Pick<IRMetadata, 'signals' | 'memos' | 'propsParams' | 'localConstants' | 'propsObjectName'>,
): { names: Set<string>; props: Set<string> } {
  const isBoolean = (type: TypeInfo | null | undefined): boolean =>
    type?.kind === 'primitive' && type.primitive === 'boolean'
  const isBooleanSeed = (type: TypeInfo | null | undefined, seed: string | undefined): boolean => {
    const text = seed?.trim()
    return isBoolean(type) || ((!type || type.kind === 'unknown') && (text === 'true' || text === 'false'))
  }
  const names = new Set<string>()
  const props = new Set<string>()
  for (const signal of metadata.signals) {
    if (isBooleanSeed(signal.type, signal.initialValue)) names.add(signal.getter)
  }
  for (const memo of metadata.memos ?? []) {
    if (isBoolean(memo.type)) names.add(memo.name)
  }
  // A destructure default sees only the bindings before it, so one that
  // reads an earlier proven-boolean param (`{ off = false, on = off }`) is
  // boolean too.
  const provenParams = new Set<string>()
  for (const param of metadata.propsParams) {
    if (!isBoolean(param.type)) continue
    if (param.optional && !(param.parsed && isBooleanResultParsed(param.parsed, (n, member) => !member && provenParams.has(n)))) continue
    provenParams.add(param.name)
    props.add(param.sourceName ?? param.name)
    if (!metadata.propsObjectName) names.add(param.name)
  }
  // A body destructure of a boolean prop (`const { on } = props` →
  // `props.on`), or one defaulted to a boolean (`const { on = false } =
  // props` → `props.on ?? false`), is boolean whatever the prop's
  // optionality: the default covers the absent case.
  const propsObject = metadata.propsObjectName
  const booleanTyped = new Set(
    metadata.propsParams.filter(p => isBoolean(p.type)).map(p => p.sourceName ?? p.name),
  )
  const readsBooleanProp = (e: ParsedExpr | undefined): boolean => {
    if (!e) return false
    if (e.kind === 'member') {
      return !e.computed && !!propsObject && e.object.kind === 'identifier' && e.object.name === propsObject &&
        props.has(e.property)
    }
    if (e.kind === 'logical' && (e.op === '??' || e.op === '||')) {
      const left = e.left
      return left.kind === 'member' && !left.computed && !!propsObject && left.object.kind === 'identifier' &&
        left.object.name === propsObject && booleanTyped.has(left.property) &&
        e.right.kind === 'literal' && e.right.literalType === 'boolean'
    }
    return false
  }
  for (const constant of metadata.localConstants ?? []) {
    if (readsBooleanProp(constant.parsed) || isBooleanSeed(constant.type ?? undefined, constant.value)) names.add(constant.name)
    else names.delete(constant.name)
  }
  return { names, props }
}

/**
 * {@link isBooleanResultParsed} over expression source text: parses `expr`
 * and classifies the tree structurally (no `isBooleanName` witness). An
 * unparseable expression is not boolean-result.
 */
export function isBooleanResultExpr(expr: string): boolean {
  const parsed = parseExpression(expr.trim())
  if (!parsed) return false
  return isBooleanResultParsed(parsed)
}

/**
 * True when `expr`'s top-level shape is an explicit one-argument JS
 * `String(x)` call (the `EVAL_BUILTIN_IDENTS` builtin the compiler
 * recognizes structurally; each DSL adapter lowers it to its runtime's
 * `string` helper).
 *
 * Guards the {@link isAriaBooleanAttr}-driven `bool_str` override in the DSL
 * adapters' attribute emitters: an author who wrote `String(...)` has opted
 * into JS `String()` semantics, and `bool_str` over that already-stringified
 * value is a truthiness test of a string (`"false"` is a non-empty, truthy
 * string in Python, Ruby, PHP and Java), so it must not run on top.
 */
export function isExplicitStringCall(expr: string): boolean {
  const parsed = parseExpression(expr.trim())
  return (
    !!parsed &&
    parsed.kind === 'call' &&
    parsed.callee.kind === 'identifier' &&
    parsed.callee.name === 'String' &&
    parsed.args.length === 1
  )
}

/**
 * ARIA attributes whose spec values are `"true"`, `"false"`, and (for
 * tri-state members) `"mixed"`. When a fixture binds one of these to an
 * arbitrary JS expression (`aria-checked={accepted()}`), the expression's
 * type isn't recoverable from source text, but the attribute name witnesses
 * that the binding is boolean-shaped, so the DSL adapters route it through
 * their `bool_str` runtime helper for the spec-canonical `"true"` /
 * `"false"`.
 *
 * Deliberately conservative: only attributes whose spec value set is exactly
 * `true | false` or `true | false | mixed`. Tokenised ARIA attributes
 * (`aria-current` is `page | step | …`, `aria-sort` is `ascending | …`) are
 * excluded so a string-valued binding is never coerced to `"true"` /
 * `"false"`.
 */
const ARIA_BOOLEAN_ATTRS = new Set([
  // Strict boolean state (true | false; some allow `undefined` = attribute
  // absent, which the runtime emits as no-attr regardless).
  'aria-atomic',
  'aria-busy',
  'aria-disabled',
  'aria-hidden',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-readonly',
  'aria-required',
  // true | false | undefined (absent): selection / disclosure state (#1897:
  // tabs' `aria-selected={props.selected ?? false}` rendered Perl's `1` /
  // `0` without this).
  'aria-selected',
  'aria-expanded',
  // Tri-state (true | false | mixed). `bool_str` only maps truthy / falsy to
  // true / false; a fixture that wants the literal "mixed" binds a
  // string-valued JSX attr (`aria-checked="mixed"`), which lowers through
  // the `literal` emit path and never reaches this set.
  'aria-checked',
  'aria-pressed',
])

/** Whether `name` is one of {@link ARIA_BOOLEAN_ATTRS}. */
export function isAriaBooleanAttr(name: string): boolean {
  return ARIA_BOOLEAN_ATTRS.has(name)
}
