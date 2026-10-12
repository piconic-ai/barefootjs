/**
 * Backend-neutral boolean-result classification shared by the adapters whose
 * host language has no boolean type (Mojolicious, Xslate: Perl renders a
 * comparison as `''` / `1` and the literal `false` as `0`). Both adapters
 * route a boolean-shaped attribute value through their `bool_str` runtime
 * helper; this module decides which `ParsedExpr` shapes are boolean-shaped
 * and rewrites a ternary that only PARTLY is (#3349).
 *
 * Detected boolean-result shapes:
 *   - `binary` with a comparison operator (`<`, `>`, `<=`, `>=`, `==`,
 *     `===`, `!=`, `!==`)
 *   - `unary` with logical `!`
 *   - `literal` with `literalType: 'boolean'`
 *   - `logical` (`&&` / `||` / `??`) when both sides are boolean-result
 *   - `conditional` (`?:`) when both branches are boolean-result
 *   - with a caller's `isBooleanName`, a getter call, `props.X` or bare
 *     name declared `boolean`
 */

import type { ParsedExpr } from '../expression-parser.ts'
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
 * default); an omitted one stringifies as `undefined`, not `false`. A loop
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
  for (const param of metadata.propsParams) {
    if (!isBoolean(param.type) || (param.optional && param.defaultValue === undefined)) continue
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
