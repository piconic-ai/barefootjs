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

import type { ComponentIR, IRMetadata, IRNode, IRElement, TypeInfo } from './types.ts'
import { isBooleanAttr } from './html-constants.ts'

/**
 * A `const x = useContext(SomeContext)` consumer in a component body. SSR
 * template adapters have no JS runtime context stack, so a consumer's value is
 * threaded in at the data-construction layer: the adapter exposes a field/stash
 * var defaulted to the context default, which an enclosing `<Ctx.Provider
 * value>` overwrites for descendant child slots.
 */
export interface ContextConsumer {
  /** The local const bound to the `useContext` call (e.g. `theme`). */
  localName: string
  /** The `createContext` identifier read (e.g. `ThemeContext`). */
  contextName: string
  /**
   * The `createContext(<default>)` argument as a JS literal, or `null` when
   * absent / not a literal (the consumer then defaults to the empty value).
   */
  defaultValue: string | number | boolean | null
  /**
   * Set to `'object'` when the `createContext(<default>)` argument is an
   * OBJECT LITERAL (`createContext<{ config: X }>({ config: {} })`) — a shape
   * `defaultValue` alone can't distinguish from "no default at all" (both
   * collapse to `null`). Adapters with a live SSR context stack (twig, jinja,
   * erb, minijinja, xslate, mojolicious) never read this: their consumer seed
   * (`bf.use_context(name, default)`) only matters when NO enclosing Provider
   * ran, and every existing fixture exercising an object-shaped default keeps
   * its consumer nested inside a Provider that supplies a live value at
   * render time — see each adapter's `memo/seed.ts` (or equivalent). Go has no
   * such runtime stack: it bakes the Provider's value into the descendant's
   * constructor call at COMPILE time (`extendProviderContext` /
   * `emitStaticChildInstances`, go-template-adapter.ts), so an object-shaped
   * default needs its own Go type (`map[string]interface{}`, not the scalar
   * `string` fallback `contextConsumerGoType` used to pick for every
   * non-literal default) — `defaultKind` is what lets it tell "object" apart
   * from "no default" (#2087).
   */
  defaultKind?: 'object'
}

/**
 * Collect every `const x = useContext(Ctx)` consumer in a component, resolving
 * each `Ctx` to its `createContext(<default>)` default via the component's
 * module-scope `createContext` constants. Returns `[]` when the component
 * consumes no context. Single source of truth for the SSR-context adapters.
 */
export function collectContextConsumers(metadata: IRMetadata): ContextConsumer[] {
  const constants = metadata.localConstants ?? []
  // Map each createContext const name → its default-arg literal value.
  const contextDefaults = new Map<string, string | number | boolean | null>()
  // Map each createContext const name → 'object' when its default is an
  // object-literal (a shape `contextDefaults` alone can't distinguish from
  // "no default" — both parse to `null`). Only Go consults this (see
  // `ContextConsumer.defaultKind`'s docstring).
  const contextDefaultKinds = new Map<string, 'object'>()
  for (const c of constants) {
    if (c.systemConstructKind !== 'createContext' || c.value === undefined) continue
    contextDefaults.set(c.name, parseCreateContextDefault(c.value))
    if (isObjectLiteralCreateContextDefault(c.value)) contextDefaultKinds.set(c.name, 'object')
  }
  if (contextDefaults.size === 0) return []

  const consumers: ContextConsumer[] = []
  for (const c of constants) {
    if (c.value === undefined) continue
    const ctxName = parseUseContextArg(c.value)
    if (ctxName === null || !contextDefaults.has(ctxName)) continue
    consumers.push({
      localName: c.name,
      contextName: ctxName,
      defaultValue: contextDefaults.get(ctxName) ?? null,
      defaultKind: contextDefaultKinds.get(ctxName),
    })
  }
  return consumers
}

/** Parse `useContext(Ident)` → `Ident`, else `null`. */
function parseUseContextArg(source: string): string | null {
  const expr = parseSingleExpression(source)
  if (!expr || !ts.isCallExpression(expr)) return null
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== 'useContext') return null
  if (expr.arguments.length !== 1) return null
  const arg = expr.arguments[0]
  return ts.isIdentifier(arg) ? arg.text : null
}

/** Parse `createContext(<literal>)` → the default value, else `null`. */
function parseCreateContextDefault(source: string): string | number | boolean | null {
  const expr = parseSingleExpression(source)
  if (!expr || !ts.isCallExpression(expr)) return null
  if (expr.arguments.length === 0) return null
  const arg = expr.arguments[0]
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text
  if (ts.isNumericLiteral(arg)) return Number(arg.text)
  if (arg.kind === ts.SyntaxKind.TrueKeyword) return true
  if (arg.kind === ts.SyntaxKind.FalseKeyword) return false
  return null
}

/** True when `createContext(<arg>)`'s argument is an object-literal (`{ config: {} }`). */
function isObjectLiteralCreateContextDefault(source: string): boolean {
  const expr = parseSingleExpression(source)
  if (!expr || !ts.isCallExpression(expr)) return false
  if (expr.arguments.length === 0) return false
  return ts.isObjectLiteralExpression(expr.arguments[0])
}

function parseSingleExpression(source: string): ts.Expression | null {
  const sf = ts.createSourceFile('__ctx.ts', `(${source})`, ts.ScriptTarget.Latest, false)
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return null
  let e: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

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
  const scan = (s: string | undefined, also?: Set<string>): void => {
    if (!s) return
    for (const m of s.matchAll(accessRe)) {
      accessed.add(m[1])
      also?.add(m[1])
    }
  }

  // Coalesce-literal type pins: a read of the form `props.X ?? <literal>`
  // (or `|| <literal>`) fixes X's type to the literal's. The Go adapter
  // seeds a prop-derived signal/memo constructor from the synthetic field
  // (`Count: in.Initial` where `Count int` came from evaluating
  // `props.initial ?? 0`), so classifying `initial` with the string
  // default produces a Go type mismatch the compiler rejects.
  const coalesceLiteralTypes = new Map<string, 'number' | 'boolean' | 'string'>()
  const pinCoalesceLiterals = (s: string | undefined): void => {
    if (!s || !s.includes(propsObj)) return
    const sf = ts.createSourceFile('__aug.ts', `(${s})`, ts.ScriptTarget.Latest, false)
    const visit = (n: ts.Node): void => {
      if (
        ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        let left: ts.Expression = n.left
        while (ts.isParenthesizedExpression(left)) left = left.expression
        if (
          ts.isPropertyAccessExpression(left) &&
          ts.isIdentifier(left.expression) &&
          left.expression.text === propsObj
        ) {
          const name = left.name.text
          let right: ts.Expression = n.right
          while (ts.isParenthesizedExpression(right)) right = right.expression
          if (ts.isPrefixUnaryExpression(right)) right = right.operand
          const kind = ts.isNumericLiteral(right)
            ? 'number'
            : right.kind === ts.SyntaxKind.TrueKeyword || right.kind === ts.SyntaxKind.FalseKeyword
              ? 'boolean'
              : ts.isStringLiteralLike(right)
                ? 'string'
                : null
          if (kind && !coalesceLiteralTypes.has(name)) coalesceLiteralTypes.set(name, kind)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }

  // Memos, signals, init statements, effects: any `props.X` read.
  for (const memo of ir.metadata.memos) {
    scan(memo.computation)
    pinCoalesceLiterals(memo.computation)
  }
  for (const signal of ir.metadata.signals) {
    scan(signal.initialValue)
    pinCoalesceLiterals(signal.initialValue)
  }
  for (const stmt of ir.metadata.initStatements ?? []) scan(stmt.body)
  for (const eff of ir.metadata.effects ?? []) scan((eff as { body?: string }).body)

  // Function-scope plain-const initializers (the Switch pattern): a
  // `const trackClasses = \`… ${props.className ?? ''}\`` holds the only
  // `props.X` read. Skip module consts — they can't reference function-scoped
  // `props`. Reads land in string context, so the default `string` type holds.
  for (const c of ir.metadata.localConstants ?? []) {
    if (c.isModule) continue
    scan(c.value)
    pinCoalesceLiterals(c.value)
  }

  // Template attribute exprs — also note bare-ref / boolean usage.
  const walk = (node: IRNode | undefined): void => {
    if (!node) return
    // Non-attribute expression carriers (#2126 follow-up): a `props.X`
    // read can reach the template as a bare scalar through a dynamic
    // text child (`<p>{props.label}</p>`), a conditional / if-statement
    // condition (`{props.show && …}`), or a loop's array expression
    // (`(props.items ?? []).map(…)`). With a typed props object those
    // names are already in `propsParams`; with an untyped `props`
    // parameter these reads were invisible to this pass, so the emitted
    // template referenced a var the props type / ssrDefaults never
    // declared (a strict-mode 500 on Perl-family adapters, a missing
    // struct field on Go). Text reads keep the default `string`
    // classification; condition / loop-array reads land in the nillable
    // bucket (`unknown` → omittable/interface-typed) since their values
    // are only ever truth-tested or iterated.
    const carrier = node as unknown as { type?: string; expr?: string; condition?: string; array?: string }
    if (carrier.type === 'expression') {
      scan(carrier.expr)
      pinCoalesceLiterals(carrier.expr)
    }
    scan(carrier.condition, bareRefProps)
    pinCoalesceLiterals(carrier.condition)
    scan(carrier.array, bareRefProps)
    const el = node as unknown as IRElement
    // Component nodes carry the same AttrValue shapes under `props`
    // (`<Child value={props.foo} />` reads `$foo` at child-props
    // construction time in the SSR template) — but they are NOT HTML
    // attributes: boolean-attr inference by name doesn't apply, and the
    // value's type belongs to the child's contract, not to how this
    // component renders it. Classify these reads as nillable (`unknown`)
    // unless a `?? <literal>` pins a concrete type.
    for (const prop of (node as unknown as { props?: IRElement['attrs'] }).props ?? []) {
      const v = prop.value as { kind?: string; expr?: string; parts?: Array<{ type: string } & Record<string, string>> }
      if (v?.parts) {
        for (const part of v.parts) {
          if (part.type === 'string') scan(part.value)
          else if (part.type === 'ternary') {
            scan(part.condition)
            scan(part.whenTrue)
            scan(part.whenFalse)
          } else if (part.type === 'lookup') scan(part.key)
        }
      }
      if (v?.kind === 'expression' && typeof v.expr === 'string') {
        scan(v.expr, bareRefProps)
        pinCoalesceLiterals(v.expr)
      }
    }
    for (const attr of el.attrs ?? []) {
      const v = attr.value as {
        kind?: string
        expr?: string
        presenceOrUndefined?: boolean
        parts?: Array<
          | { type: 'string'; value: string }
          | { type: 'ternary'; condition: string; whenTrue: string; whenFalse: string }
          | { type: 'lookup'; key: string }
        >
      }
      // Template-literal attr values (`className={\`… \${props.className ??
      // ''}\`}`) carry their `props.X` reads inside the parts structure,
      // not a flat expr string (#1896 — TabsContent's template referenced
      // `.ClassName` while the Props struct never declared it). Scan every
      // textual field of every part shape.
      if (v?.parts) {
        for (const part of v.parts) {
          if (part.type === 'string') scan(part.value)
          else if (part.type === 'ternary') {
            scan(part.condition)
            scan(part.whenTrue)
            scan(part.whenFalse)
          } else if (part.type === 'lookup') scan(part.key)
        }
      }
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
    // Conditional / if-statement nodes keep their subtrees in branch
    // fields, not `children` (#1896 — DialogTrigger's asChild
    // if-statement hid the button branch's `id={props.id}` from this
    // scan, so the template referenced `.ID` without a Props field).
    const branchy = node as unknown as {
      whenTrue?: IRNode
      whenFalse?: IRNode
      consequent?: IRNode
      alternate?: IRNode
    }
    walk(branchy.whenTrue)
    walk(branchy.whenFalse)
    walk(branchy.consequent)
    walk(branchy.alternate)
  }
  walk(ir.root)

  for (const name of accessed) {
    if (existing.has(name)) continue
    let raw: string
    if (booleanAttrProps.has(name)) raw = 'boolean'
    else if (coalesceLiteralTypes.has(name)) raw = coalesceLiteralTypes.get(name)!
    else if (bareRefProps.has(name)) raw = 'unknown' // → interface{} (nillable, omittable)
    else raw = 'string' // read in a memo / string context (e.g. className)
    const type: TypeInfo =
      raw === 'unknown'
        ? { kind: 'unknown', raw: 'unknown' }
        : { kind: 'primitive', raw, primitive: raw as 'string' | 'number' | 'boolean' }
    ir.metadata.propsParams.push({ name, type, optional: true })
    existing.add(name)
  }
}

/**
 * Parse a const initializer to its static string value: a string literal,
 * a no-substitution template literal, or a `[<string literals>].join(sep)`
 * call. Returns `null` for anything else. The TS parser resolves escapes
 * and quoting exactly as JS would, matching the value the Hono reference
 * inlines at runtime. Shared by the Go, Mojo, and Xslate adapters.
 */
export function parseStaticStringConst(source: string): string | null {
  const sf = ts.createSourceFile(
    '__const.ts', `const __x = (${source});`, ts.ScriptTarget.Latest, /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  let init = stmt.declarationList.declarations[0]?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init) return null
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    return init.text
  }
  return evalStringArrayJoin(source)
}

/**
 * Statically evaluate a template literal whose every interpolation is a
 * bare identifier present in `resolved` to its flat string, else `null`.
 * Companion to `parseStaticStringConst` for COMPOSED module consts
 * (#1896 / #1897 — radio-group's
 * `itemClasses = \`\${itemBaseClasses} \${itemFocusClasses} …\``).
 */
export function evalTemplateOfStringConsts(
  source: string,
  resolved: ReadonlyMap<string, string>,
): string | null {
  const sf = ts.createSourceFile(
    '__const.ts', `const __x = (${source});`, ts.ScriptTarget.Latest, /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  let init = stmt.declarationList.declarations[0]?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init || !ts.isTemplateExpression(init)) return null
  let out = init.head.text
  for (const span of init.templateSpans) {
    if (!ts.isIdentifier(span.expression)) return null
    const value = resolved.get(span.expression.text)
    if (value === undefined) return null
    out += value + span.literal.text
  }
  return out
}

/**
 * Build the module string-const map from the IR's localConstants —
 * the SINGLE SOURCE OF TRUTH for all three SSR template adapters.
 * A const qualifies when module-scope and statically resolvable as:
 *   - a pure string / no-substitution-template literal,
 *   - `[<string literals>].join(sep)`,
 *   - a template literal COMPOSED of other qualifying module consts
 *     (resolved to a fixed point, so composition order doesn't matter).
 */
export function collectModuleStringConsts(
  constants: IRMetadata['localConstants'] | undefined,
): Map<string, string> {
  const map = new Map<string, string>()
  const candidates = (constants ?? []).filter(
    c => c.isModule && c.value !== undefined,
  )
  let progressed = true
  while (progressed) {
    progressed = false
    for (const c of candidates) {
      if (map.has(c.name)) continue
      const literal =
        parseStaticStringConst(c.value!) ??
        evalTemplateOfStringConsts(c.value!, map)
      if (literal !== null) {
        map.set(c.name, literal)
        progressed = true
      }
    }
  }
  return map
}

/**
 * Resolve `IDENT.key` / `IDENT['key']` where `IDENT` is a module-scope
 * object-literal const and the key/value are static literals — a fully
 * compile-time lookup (the icon registry's `strokePaths['chevron-down']`,
 * pagination's `variantClasses.ghost`; #1896 / #1897). Returns the
 * looked-up scalar, or `null` for any other shape so callers fall back
 * to their generic lowering. Shared by all three SSR template adapters;
 * the prop-KEYED variant of the pattern lives in `parseRecordIndexAccess`.
 */
export function lookupStaticRecordLiteral(
  objectName: string,
  key: string,
  constants: IRMetadata['localConstants'] | undefined,
): { kind: 'string' | 'number'; text: string } | null {
  const constInfo = (constants ?? []).find(c => c.name === objectName && c.isModule)
  if (constInfo?.value === undefined) return null
  const sf = ts.createSourceFile(
    '__rec.ts', `(${constInfo.value})`, ts.ScriptTarget.Latest, /*setParentNodes*/ true,
  )
  if (sf.statements.length !== 1) return null
  const stmt = sf.statements[0]
  if (!ts.isExpressionStatement(stmt)) return null
  let parsed: ts.Expression = stmt.expression
  while (ts.isParenthesizedExpression(parsed)) parsed = parsed.expression
  if (!ts.isObjectLiteralExpression(parsed)) return null
  for (const prop of parsed.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = prop.name
    const propKey =
      ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
        ? name.text
        : null
    if (propKey !== key) continue
    let v: ts.Expression = prop.initializer
    while (ts.isParenthesizedExpression(v)) v = v.expression
    if (ts.isNumericLiteral(v)) return { kind: 'number', text: v.text }
    if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
      return { kind: 'string', text: v.text }
    }
    return null
  }
  return null
}

/**
 * Statically evaluate `[<string literals>].join(<sep?>)` (e.g. a module-scope
 * `const stateClasses = ['…', …].join(' ')`) to its joined string, so SSR
 * adapters inline the flattened literal byte-for-byte like the Hono reference
 * instead of referencing a binding that doesn't exist server-side. Default
 * separator `,` matches JS `Array.prototype.join`. Returns `null` for any
 * other shape (non-`.join` call, non-array receiver, non-string-literal element
 * or separator). Shared by the Go, Mojo, and Xslate adapters (all three
 * resolve module consts through `collectModuleStringConsts` above, which
 * folds these joins during its fixed-point pass).
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
   * Resolves an index key that isn't a bare prop (a memo-local const like
   * `const variant = props.variant ?? 'default'`) to its underlying prop + an
   * optional default-key literal; returns `null` to reject. Keeps the parse
   * generic — the caller owns the block-scoped binding map.
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
