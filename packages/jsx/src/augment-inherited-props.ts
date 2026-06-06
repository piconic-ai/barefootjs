/**
 * Shared adapter helpers for the SolidJS props-object pattern (#checkbox).
 *
 * These two functions are the SINGLE SOURCE OF TRUTH for logic that the
 * Go-template and Mojolicious template adapters previously carried as
 * near-identical private copies. They live in `@barefootjs/jsx` (the IR
 * layer) so the two adapters can share one implementation; they are
 * deliberately NOT wired into the core IR-construction pipeline — only the
 * Go and Mojo adapters call them, so every other IR consumer (Hono, the
 * client codegen, etc.) is unaffected.
 */

import ts from 'typescript'

import type { ComponentIR, IRNode, IRElement, TypeInfo } from './types'
import { isBooleanAttr } from './html-constants'

/**
 * (#checkbox) Enumerate inherited-attribute accesses for the SolidJS
 * props-object pattern.
 *
 * `function Checkbox(props: CheckboxProps)` only lists `CheckboxProps`'s own
 * members in `propsParams`; the inherited `ButtonHTMLAttributes` members the
 * component actually reads (`props.className` in the classes memo, `props.id`,
 * `props.disabled` on the root element) are never enumerated, so the generated
 * Input/Props structs (Go) or stash vars (Mojo) have no field to bind a
 * caller's `className: ''` / `id` / `disabled` to. This scans the component's
 * expressions for `props.<name>` accesses (where `props` is the resolved
 * `propsObjectName`) and appends any not-already-a-param as a synthetic prop
 * param, with a type inferred from how the access is used:
 *   - a boolean attribute (`disabled={props.disabled ?? false}`) → `boolean`;
 *   - a pure bare-reference attribute (`id={props.id}`) → `unknown`
 *     (nillable, so the attribute is omitted when unset — Hono parity);
 *   - otherwise (`className`, read in a string memo) → `string`.
 *
 * Scans memos, signals, init statements, effects, and template attribute
 * expressions. (The Mojo adapter previously omitted `effects` from its scan;
 * unifying on the Go behaviour of also scanning `effects` is intentional — the
 * function only ever ADDS a param, and it changes no fixture output.)
 *
 * Idempotent: re-running (e.g. once in `generate`, again in `generateTypes` on
 * a round-tripped IR) is a no-op once the params are present. Mutates
 * `ir.metadata.propsParams` in place so every downstream emitter sees one
 * consistent param list.
 *
 * The single source of truth for BOTH the Go and Mojo adapters — change here,
 * not in an adapter copy.
 */
export function augmentInheritedPropAccesses(ir: ComponentIR): void {
  const propsObj = ir.metadata.propsObjectName
  if (!propsObj) return // only the props-object pattern is affected

  const existing = new Set(ir.metadata.propsParams.map(p => p.name))

  // Collect bare-reference attribute exprs (`attr={props.id}`) and boolean
  // attributes from the template so we can classify accessed props by use.
  const bareRefProps = new Set<string>()
  const booleanAttrProps = new Set<string>()
  const accessed = new Set<string>()
  const accessRe = new RegExp(`(?:^|[^\\w$.])${propsObj}\\.([A-Za-z_$][\\w$]*)`, 'g')
  const scan = (s: string | undefined): void => {
    if (!s) return
    for (const m of s.matchAll(accessRe)) accessed.add(m[1])
  }

  // Memos, signals, init statements, effects: any `props.X` read.
  for (const memo of ir.metadata.memos) scan(memo.computation)
  for (const signal of ir.metadata.signals) scan(signal.initialValue)
  for (const stmt of ir.metadata.initStatements ?? []) scan(stmt.body)
  for (const eff of ir.metadata.effects ?? []) scan((eff as { body?: string }).body)

  // Function-scope plain-const initializers (the Switch pattern): the classes
  // string is assembled in a top-of-body `const trackClasses = \`… ${props.className
  // ?? ''}\`` rather than a memo, so the `props.className` read only lives here.
  // Module-level consts can't reference `props` (it's function-scoped), so the
  // `isModule` filter avoids scanning unrelated module literals. Reads land in a
  // string context, so the default `string` classification is correct.
  for (const c of ir.metadata.localConstants ?? []) {
    if (c.isModule) continue
    scan(c.value)
  }

  // Template attribute exprs — also note bare-ref / boolean usage.
  const walk = (node: IRNode | undefined): void => {
    if (!node) return
    const el = node as unknown as IRElement
    for (const attr of el.attrs ?? []) {
      const v = attr.value as { kind?: string; expr?: string; presenceOrUndefined?: boolean }
      if (v?.kind === 'expression' && typeof v.expr === 'string') {
        scan(v.expr)
        const expr = v.expr.trim()
        const prefix = `${propsObj}.`
        // A boolean HTML attribute (`disabled={props.disabled ?? false}`)
        // marks the referenced prop as boolean even when wrapped in a
        // `?? false` default — extract the prop name from the expr.
        if (isBooleanAttr(attr.name) || v.presenceOrUndefined) {
          const m = expr.match(new RegExp(`^${propsObj}\\.([A-Za-z_$][\\w$]*)`))
          if (m) booleanAttrProps.add(m[1])
        } else if (expr.startsWith(prefix)) {
          const rest = expr.slice(prefix.length)
          // A pure bare-reference attribute (`id={props.id}`) → nillable.
          if (/^[A-Za-z_$][\w$]*$/.test(rest)) bareRefProps.add(rest)
        }
      }
    }
    for (const child of (el.children ?? []) as unknown[]) {
      const c = child as { element?: IRNode }
      walk((c.element ?? child) as IRNode)
    }
  }
  walk(ir.root)

  for (const name of accessed) {
    if (existing.has(name)) continue
    let raw: string
    if (booleanAttrProps.has(name)) raw = 'boolean'
    else if (bareRefProps.has(name)) raw = 'unknown' // → interface{} (nillable, omittable)
    else raw = 'string' // read in a memo / string context (e.g. className)
    const type: TypeInfo =
      raw === 'boolean'
        ? { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
        : raw === 'string'
          ? { kind: 'primitive', raw: 'string', primitive: 'string' }
          : { kind: 'unknown', raw: 'unknown' }
    ir.metadata.propsParams.push({ name, type, optional: true })
    existing.add(name)
  }
}

/**
 * Statically evaluate `[<string literals>].join(<sep?>)` to its joined string.
 *
 * Module-scope class consts are frequently assembled as
 * `const stateClasses = ['[&[data-state=on]]:…', …].join(' ')` so the source
 * stays readable. The Hono reference inlines the flattened string at runtime;
 * the SSR adapters must inline the same byte-for-byte literal instead of
 * emitting a `$stateClasses` / `.StateClasses` reference to a binding that
 * doesn't exist server-side.
 *
 * Returns the joined string, or `null` when the shape doesn't match (non-call,
 * non-`.join`, non-array receiver, any non-string-literal element, or a
 * non-string-literal separator). Comments / whitespace between elements are
 * irrelevant — the TS parser already discarded them. The default separator is
 * `,` to match JS `Array.prototype.join` with no argument.
 *
 * The single source of truth for the Mojo + Xslate adapters' module-const
 * inlining (Go keeps an equivalent private copy). `source` is the const
 * initializer's text; the function parses it with the TS parser so escapes
 * resolve exactly as JS would.
 */
export function evalStringArrayJoin(source: string): string | null {
  const sf = ts.createSourceFile(
    '__join.ts', `const __x = (${source});`, ts.ScriptTarget.Latest, /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  let node = stmt.declarationList.declarations[0]?.initializer
  while (node && ts.isParenthesizedExpression(node)) node = node.expression
  if (!node || !ts.isCallExpression(node)) return null
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return null
  if (callee.name.text !== 'join') return null
  let recv: ts.Expression = callee.expression
  while (ts.isParenthesizedExpression(recv)) recv = recv.expression
  if (!ts.isArrayLiteralExpression(recv)) return null
  const parts: string[] = []
  for (const el of recv.elements) {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
      parts.push(el.text)
    } else {
      return null
    }
  }
  let sep = ','
  if (node.arguments.length >= 1) {
    const arg = node.arguments[0]
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) sep = arg.text
    else return null
  }
  return parts.join(sep)
}

/** A minimal `{ name }` shape — both adapters pass their own param/const lists. */
interface NamedConst {
  name: string
  value?: string
  isModule?: boolean
}

/** A parsed `Record<staticKeys, scalar>[propKey]` map entry. */
export interface RecordIndexEntry {
  key: string
  value: { kind: 'number' | 'string'; text: string }
}

/** The structured result of a `Record<staticKeys, scalar>[propKey]` access. */
export interface RecordIndexAccess {
  /** The bare prop identifier used as the index key (`size` in `sizeMap[size]`). */
  indexPropName: string
  /** The map's entries in source order — each a static key + scalar literal value. */
  entries: RecordIndexEntry[]
  /**
   * When the index key is a local const with a `props.X ?? '<lit>'` default
   * (the Toggle `classes` memo's `const variant = props.variant ?? 'default'`),
   * the `<lit>` fallback key — so a caller can render the default entry's value
   * when the prop is unset. Absent when the key is a bare prop with no default.
   */
  defaultKey?: string
}

/**
 * Structural parse of a spread-object VALUE of the form `IDENT[KEY]` where:
 *   - `IDENT` resolves via `localConstants` to a MODULE-scope (`isModule`)
 *     object literal whose every property has a static (string-literal or
 *     identifier) key and a scalar (number or string) literal value
 *     (a `Record<staticKeys, scalar>` map like `sizeMap`), AND
 *   - `KEY` is a bare identifier that is a prop (`propsParams`).
 *
 * Returns the structured `{ indexPropName, entries }` when convertible, else
 * `null` for any unsupported shape (non-element-access, non-identifier
 * object/index, non-prop index, non-module const, non-object-literal const,
 * computed/spread/dynamic key, or non-scalar value) so the caller falls back
 * to its normal lowering / BF101.
 *
 * The single source of truth for BOTH adapters' `recordIndexAccessTo*` emitters
 * — only the final language-specific emit differs (Go inline `map[string]any{…}
 * [fmt.Sprint(in.Field)]`; Mojo `{ … }->{$key}`). (#checkbox / icon `sizeMap[size]`.)
 */
export function parseRecordIndexAccess(
  val: ts.Expression,
  localConstants: readonly NamedConst[],
  propsParams: ReadonlyArray<{ name: string }>,
  /**
   * Optional resolver for an index key that isn't a bare prop. The Toggle
   * `classes` memo indexes by a memo-local const (`variantClasses[variant]`
   * where `const variant = props.variant ?? 'default'`); the caller passes its
   * block-scoped binding map here so the structural parse stays generic. When
   * provided and the key isn't a prop, it's resolved to the underlying prop
   * plus an optional default-key literal. Returns `null` to reject.
   */
  resolveKey?: (name: string) => { propName: string; defaultLiteral?: string } | null,
): RecordIndexAccess | null {
  if (!ts.isElementAccessExpression(val)) return null
  const obj = val.expression
  const arg = val.argumentExpression
  if (!ts.isIdentifier(obj) || !ts.isIdentifier(arg)) return null
  // KEY resolution. A caller-supplied local key wins first — the Toggle memo's
  // `const variant = props.variant ?? 'default'` shadows the same-named
  // `variant` prop, and only the local binding carries the `'default'` fallback.
  // Otherwise the key must be a bare prop (`sizeMap[size]`).
  let indexPropName: string
  let defaultKey: string | undefined
  const resolved = resolveKey?.(arg.text)
  if (resolved) {
    indexPropName = resolved.propName
    defaultKey = resolved.defaultLiteral
  } else if (propsParams.some(p => p.name === arg.text)) {
    indexPropName = arg.text
  } else {
    return null
  }
  // IDENT must resolve to a module-scope object-literal const.
  const constInfo = localConstants.find(c => c.name === obj.text && c.isModule)
  if (constInfo?.value === undefined) return null

  const sf = ts.createSourceFile(
    '__rec.ts', `(${constInfo.value})`, ts.ScriptTarget.Latest, /* setParentNodes */ true,
  )
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let parsed: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(parsed)) parsed = parsed.expression
  if (!ts.isObjectLiteralExpression(parsed)) return null

  const entries: RecordIndexEntry[] = []
  for (const prop of parsed.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    let key: string
    if (ts.isIdentifier(prop.name)) {
      key = prop.name.text
    } else if (
      ts.isStringLiteral(prop.name) ||
      ts.isNoSubstitutionTemplateLiteral(prop.name)
    ) {
      key = prop.name.text
    } else {
      return null
    }
    let v: ts.Expression = prop.initializer
    while (ts.isParenthesizedExpression(v)) v = v.expression
    if (ts.isNumericLiteral(v)) {
      entries.push({ key, value: { kind: 'number', text: v.text } })
    } else if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
      entries.push({ key, value: { kind: 'string', text: v.text } })
    } else {
      return null
    }
  }
  return { indexPropName, entries, defaultKey }
}
