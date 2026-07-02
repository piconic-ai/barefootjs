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
}

export function irNodeToTestNode(node: IRNode, constantMap?: Map<string, string>, metadata?: IRMetadata): TestNode {
  const cmap = constantMap ?? new Map<string, string>()
  const setterToSignal = new Map<string, string>()
  const fnSetters = new Map<string, FnSetterResolution[]>()
  if (metadata) {
    for (const s of metadata.signals) {
      if (s.setter) setterToSignal.set(s.setter, s.getter)
    }
    for (const [k, v] of buildLocalFunctionSetterMap(metadata, setterToSignal)) {
      fnSetters.set(k, v)
    }
  }
  return convert(node, { cmap, setterToSignal, fnSetters })
}

function convert(node: IRNode, ctx: ConvertContext): TestNode {
  switch (node.type) {
    case 'element':
      return convertElement(node, ctx)
    case 'text':
      return convertText(node)
    case 'expression':
      return convertExpression(node)
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
    const value = resolveAttrValue(attr)

    if (attr.name === 'className' || attr.name === 'class') {
      if (typeof value === 'string') {
        const isDynamic = attr.value.kind === 'expression' || attr.value.kind === 'template' || attr.value.kind === 'spread'
        if (isDynamic && ctx.cmap.size > 0) {
          const resolved = resolveClassValue(value, ctx.cmap)
          if (resolved !== null) {
            classes = splitClassTokens(resolved)
            continue
          }
        }
        classes = splitClassTokens(value)
      }
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

function convertExpression(node: IRExpression): TestNode {
  return new TestNode({
    tag: null,
    type: 'expression',
    children: [],
    text: node.expr,
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
        props[prop.name] = resolveTemplateAttr(prop.value)
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

function resolveClassValue(value: string, cmap: Map<string, string>): string | null {
  // Simple identifier lookup
  if (cmap.has(value)) {
    return cmap.get(value)!
  }

  // Template literal: `...${var}...`
  if (value.startsWith('`') && value.endsWith('`')) {
    const inner = value.slice(1, -1)
    return inner.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const trimmed = expr.trim()
      return cmap.get(trimmed) ?? ''
    })
  }

  return null
}

// ---------------------------------------------------------------------------
// Attribute value resolution
// ---------------------------------------------------------------------------

function resolveAttrValue(attr: IRAttribute): string | boolean | null {
  switch (attr.value.kind) {
    case 'boolean-attr':
      return true
    case 'literal':
      return attr.value.value
    case 'expression':
      return attr.value.expr
    case 'spread':
      return attr.value.expr
    case 'template':
      return resolveTemplateAttr(attr.value)
    case 'boolean-shorthand':
      return true
    case 'jsx-children':
      return null
  }
}

function resolveTemplateAttr(tl: TemplateAttr): string {
  return tl.parts
    .map(part => {
      if (part.type === 'string') return part.value
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
