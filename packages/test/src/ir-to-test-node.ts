/**
 * IR → TestNode conversion.
 *
 * Recursively transforms each IRNode variant into a TestNode.
 */

import type {
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRMetadata,
} from '@barefootjs/jsx'
import { resolveSetters, buildLocalFunctionSetterMap, type SetterRef, type FnSetterResolution } from '@barefootjs/jsx'

type IRAttribute = IRElement['attrs'][number]
type AttrValue = IRAttribute['value']
type TemplateAttr = Extract<AttrValue, { kind: 'template' }>
import { TestNode, type EventHandler } from './test-node.ts'

interface ConvertContext {
  cmap: Map<string, string>
  setterToSignal: Map<string, string>
  fnSetters: Map<string, FnSetterResolution[]>
  /** Prop name → literal destructure-default value (`{ size = 'md' }` → `size: 'md'`). */
  defaults: Map<string, string>
}

export function irNodeToTestNode(node: IRNode, constantMap?: Map<string, string>, metadata?: IRMetadata): TestNode {
  const cmap = constantMap ?? new Map<string, string>()
  const setterToSignal = new Map<string, string>()
  const fnSetters = new Map<string, FnSetterResolution[]>()
  const defaults = new Map<string, string>()
  if (metadata) {
    for (const s of metadata.signals) {
      if (s.setter) setterToSignal.set(s.setter, s.getter)
    }
    for (const [k, v] of buildLocalFunctionSetterMap(metadata, setterToSignal)) {
      fnSetters.set(k, v)
    }
    // renderToTest models the component compiled with NO incoming props,
    // so a literal destructure default IS the statically-known value of
    // that prop (#2069). Non-literal defaults (arrows, objects, computed
    // expressions) stay unresolved — surfacing a stale expression string
    // would be worse than the raw reference.
    for (const p of metadata.propsParams) {
      const lit = p.defaultValue !== undefined ? parseLiteralDefault(p.defaultValue) : null
      if (lit !== null) defaults.set(p.name, lit)
    }
  }
  return convert(node, { cmap, setterToSignal, fnSetters, defaults })
}

/**
 * Parse a `ParamInfo.defaultValue` JS-text into a plain string when it is
 * a self-contained literal: quoted string, number, or boolean. Returns
 * null for anything else.
 */
function parseLiteralDefault(js: string): string | null {
  const v = js.trim()
  if (
    (v.startsWith("'") && v.endsWith("'") && !v.slice(1, -1).includes("'")) ||
    (v.startsWith('"') && v.endsWith('"') && !v.slice(1, -1).includes('"'))
  ) {
    return v.slice(1, -1)
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  if (v === 'true' || v === 'false') return v
  return null
}

function convert(node: IRNode, ctx: ConvertContext): TestNode {
  switch (node.type) {
    case 'element':
      return convertElement(node, ctx)
    case 'text':
      return convertText(node)
    case 'expression':
      return convertExpression(node, ctx)
    case 'conditional':
      return convertConditional(node, ctx)
    case 'loop':
      return convertLoop(node, ctx)
    case 'component':
      return convertComponent(node, ctx)
    case 'fragment':
      return convertFragment(node, ctx)
    case 'slot':
      return convertSlot(node)
    case 'if-statement':
      return convertIfStatement(node, ctx)
    case 'provider':
      return convertProvider(node, ctx)
    case 'async':
      return convertAsync(node, ctx)
    default: {
      const _exhaustive: never = node
      throw new Error(`Unhandled IR node type: ${(_exhaustive as IRNode).type}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

function convertElement(node: IRElement, ctx: ConvertContext): TestNode {
  const props: Record<string, string | boolean | null> = {}
  const aria: Record<string, string> = {}
  let role: string | null = null
  let dataState: string | null = null
  let classes: string[] = []

  for (const attr of node.attrs) {
    const value = resolveAttrValue(attr, ctx)

    if (attr.name === 'className' || attr.name === 'class') {
      classes = collectClassTokens(attr.value, value, ctx)
      continue
    }

    if (attr.name === 'role') {
      if (typeof value === 'string') role = value
      continue
    }

    if (attr.name.startsWith('aria-')) {
      const key = attr.name.slice(5) // strip "aria-"
      if (typeof value === 'string') aria[key] = value
      else if (value === true) aria[key] = 'true'
      continue
    }

    if (attr.name === 'data-state') {
      if (typeof value === 'string') dataState = value
      continue
    }

    props[attr.name] = value
  }

  const events = node.events.map(e => e.name)
  const handlers: Record<string, EventHandler> = {}
  for (const event of node.events) {
    const refs = resolveSetters(event.handler, ctx.setterToSignal, ctx.fnSetters)
    handlers[event.name] = refsToHandler(refs)
  }
  const children = node.children.map(c => convert(c, ctx))

  return new TestNode({
    tag: node.tag,
    type: 'element',
    children,
    text: null,
    props,
    classes,
    role,
    aria,
    dataState,
    events,
    handlers,
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function convertText(node: IRText): TestNode {
  return new TestNode({
    tag: null,
    type: 'text',
    children: [],
    text: node.value,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Expression
// ---------------------------------------------------------------------------

function convertExpression(node: IRExpression, ctx: ConvertContext): TestNode {
  // A bare reference to a defaulted prop (`<div>{label}</div>` with
  // `{ label = 'Hello' }`) resolves to its literal default, so
  // `findByText('Hello')` sees the zero-props render (#2069). Prop refs
  // are flagged reactive (they update on parent re-render), so this
  // keys off defaults-map membership, not the reactive flag: signal /
  // memo reads are call expressions (`count()`), never bare identifiers,
  // and keep their source text — wiring is the assertion surface there.
  const text = ctx.defaults.get(node.expr.trim()) ?? node.expr
  return new TestNode({
    tag: null,
    type: 'expression',
    children: [],
    text,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: node.reactive,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Conditional
// ---------------------------------------------------------------------------

function convertConditional(node: IRConditional, ctx: ConvertContext): TestNode {
  const children: TestNode[] = [convert(node.whenTrue, ctx)]
  if (node.whenFalse) {
    children.push(convert(node.whenFalse, ctx))
  }

  return new TestNode({
    tag: null,
    type: 'conditional',
    children,
    text: node.condition,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: node.reactive,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function convertLoop(node: IRLoop, ctx: ConvertContext): TestNode {
  const children = node.children.map(c => convert(c, ctx))

  return new TestNode({
    tag: null,
    type: 'loop',
    children,
    text: node.array,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function convertComponent(node: IRComponent, ctx: ConvertContext): TestNode {
  const props: Record<string, string | boolean | null> = {}
  const events: string[] = []
  const handlers: Record<string, EventHandler> = {}
  for (const prop of node.props) {
    switch (prop.value.kind) {
      case 'literal':
        props[prop.name] = prop.value.value
        break
      case 'expression':
      case 'spread':
        props[prop.name] = prop.value.expr
        break
      case 'template':
        props[prop.name] = resolveTemplateAttr(prop.value, ctx)
        break
      case 'boolean-shorthand':
      case 'boolean-attr':
        props[prop.name] = true
        break
      case 'jsx-children':
        props[prop.name] = null
        break
    }

    // Component callback props that look like event handlers
    // (`<Button onClick={...}>`). The parent IR sees these as props, but for
    // wiring they behave like events: when the callback fires, which setters
    // run. Keyed by the DOM-style event name (`onClick` -> `click`) so the
    // shorthand getters and `on()` work the same as for native elements.
    if (/^on[A-Z]/.test(prop.name) && prop.value.kind === 'expression') {
      const eventName = prop.name.charAt(2).toLowerCase() + prop.name.slice(3)
      events.push(eventName)
      handlers[eventName] = refsToHandler(
        resolveSetters(prop.value.expr, ctx.setterToSignal, ctx.fnSetters),
      )
    }
  }

  const children = node.children.map(c => convert(c, ctx))

  return new TestNode({
    tag: null,
    type: 'component',
    children,
    text: null,
    props,
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events,
    handlers,
    reactive: false,
    componentName: node.name,
  })
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

function convertFragment(node: IRFragment, ctx: ConvertContext): TestNode {
  const children = node.children.map(c => convert(c, ctx))

  return new TestNode({
    tag: null,
    type: 'fragment',
    children,
    text: null,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------

function convertSlot(_node: IRSlot): TestNode {
  return new TestNode({
    tag: null,
    type: 'text',
    children: [],
    text: `<slot:${_node.name}>`,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// IfStatement
// ---------------------------------------------------------------------------

function convertIfStatement(node: IRIfStatement, ctx: ConvertContext): TestNode {
  const children: TestNode[] = [convert(node.consequent, ctx)]
  if (node.alternate) {
    children.push(convert(node.alternate, ctx))
  }

  return new TestNode({
    tag: null,
    type: 'conditional',
    children,
    text: node.condition,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function convertProvider(node: IRProvider, ctx: ConvertContext): TestNode {
  // Transparent — just pass through children
  const children = node.children.map(c => convert(c, ctx))

  if (children.length === 1) return children[0]

  return new TestNode({
    tag: null,
    type: 'fragment',
    children,
    text: null,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Async
// ---------------------------------------------------------------------------

function convertAsync(node: IRAsync, ctx: ConvertContext): TestNode {
  // Represent the resolved content as a fragment; tests assert on final state.
  const children = node.children.map(c => convert(c, ctx))

  return new TestNode({
    tag: null,
    type: 'fragment',
    children,
    text: null,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    handlers: {},
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Constant-based class value resolution
// ---------------------------------------------------------------------------

function refsToHandler(refs: SetterRef[]): EventHandler {
  const setters: string[] = []
  const via: string[] = []
  for (const ref of refs) {
    if (!setters.includes(ref.setter)) setters.push(ref.setter)
    for (const v of ref.via ?? []) {
      if (!via.includes(v)) via.push(v)
    }
  }
  return { setters, via }
}

/**
 * Split a resolved className value into tokens, dropping any span that
 * still carries an unresolved runtime interpolation (`${className}`,
 * `foo-${x}`). Those are dynamic passthroughs the IR can't evaluate —
 * they aren't real class tokens, and leaking them verbatim pollutes
 * `.classes` for exact-match assertions.
 */
function splitClassTokens(value: string): string[] {
  return value.split(/\s+/).filter(t => t && !t.includes('${'))
}

/**
 * Resolve a className attribute value into its class tokens.
 *
 * For a structured template attr the parts are walked directly so class
 * collection keeps union semantics per part kind:
 *   - `lookup` (`${MAP[KEY]}`) → every case's tokens (PR #2000)
 *   - `ternary` (`cond ? 'on' : 'off'`) → both branches' tokens,
 *     matching the intermediate-const `valueBranches` union (#525)
 *   - `string` spans → literal text, with `${ident}` interpolations
 *     substituted from resolved consts / literal prop defaults
 * For expression attrs the value resolves through local consts (cmap)
 * and literal prop defaults. Anything still carrying a `${...}`
 * interpolation is dropped by `splitClassTokens`.
 */
function collectClassTokens(attrValue: AttrValue, resolved: string | boolean | null, ctx: ConvertContext): string[] {
  if (attrValue.kind === 'template') {
    const joined = attrValue.parts
      .map(part => {
        if (part.type === 'string') return substituteInterpolations(part.value, ctx)
        if (part.type === 'ternary') return `${part.whenTrue} ${part.whenFalse}`
        return Object.values(part.cases).join(' ')
      })
      .join('')
    return splitClassTokens(joined)
  }

  if (typeof resolved !== 'string') return []

  const isDynamic = attrValue.kind === 'expression' || attrValue.kind === 'spread'
  if (isDynamic) {
    const value = resolveClassValue(resolved, ctx)
    if (value !== null) return splitClassTokens(value)
  }
  return splitClassTokens(resolved)
}

/**
 * Replace `${ident}` interpolations with a resolved const or a literal
 * prop default; unresolvable spans are kept verbatim so the caller's
 * token filter can drop them.
 */
function substituteInterpolations(value: string, ctx: ConvertContext): string {
  return value.replace(/\$\{([^}]+)\}/g, (raw, expr) => {
    const trimmed = expr.trim()
    return ctx.cmap.get(trimmed) ?? ctx.defaults.get(trimmed) ?? raw
  })
}

function resolveClassValue(value: string, ctx: ConvertContext): string | null {
  // Simple identifier lookup: a local const or a literal prop default.
  if (ctx.cmap.has(value)) {
    return ctx.cmap.get(value)!
  }
  if (ctx.defaults.has(value)) {
    return ctx.defaults.get(value)!
  }

  // Template literal: `...${var}...`
  if (value.startsWith('`') && value.endsWith('`')) {
    return substituteInterpolations(value.slice(1, -1), ctx)
  }

  return null
}

// ---------------------------------------------------------------------------
// Attribute value resolution
// ---------------------------------------------------------------------------

function resolveAttrValue(attr: IRAttribute, ctx: ConvertContext): string | boolean | null {
  switch (attr.value.kind) {
    case 'boolean-attr':
      return true
    case 'literal':
      return attr.value.value
    case 'expression':
    case 'spread':
      // A bare reference to a defaulted prop (`type={type}` with
      // `{ type = 'button' }`) resolves to its literal default —
      // renderToTest models the zero-props render, where the default
      // IS the value (#2069). Anything non-bare keeps the expression
      // text (the wiring-visible representation).
      return ctx.defaults.get(attr.value.expr.trim()) ?? attr.value.expr
    case 'template':
      return resolveTemplateAttr(attr.value, ctx)
    case 'boolean-shorthand':
      return true
    case 'jsx-children':
      return null
  }
}

function resolveTemplateAttr(tl: TemplateAttr, ctx: ConvertContext): string {
  return tl.parts
    .map(part => {
      // `${ident}` interpolations against a literal prop default
      // resolve like local consts do (#2069).
      if (part.type === 'string') return substituteInterpolations(part.value, ctx)
      if (part.type === 'ternary') return `{${part.condition}}`
      // `lookup` (`Record<T, string>[key]`) — the test framework
      // doesn't render against a specific key, so concatenate every
      // case's value separated by whitespace. For className lookups
      // this lets a test assert any variant's classes are present
      // (e.g. `toContain('bg-primary')` for the default case,
      // `toContain('bg-secondary')` for the secondary case) without
      // the framework having to pick a concrete branch.
      return Object.values(part.cases).join(' ')
    })
    .join('')
}
