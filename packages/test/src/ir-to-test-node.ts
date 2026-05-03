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
} from '@barefootjs/jsx'

type IRAttribute = IRElement['attrs'][number]
type IRTemplateLiteral = Exclude<IRAttribute['value'], string | null>
import { TestNode } from './test-node'

export function irNodeToTestNode(node: IRNode, constantMap?: Map<string, string>): TestNode {
  const cmap = constantMap ?? new Map<string, string>()
  return convert(node, cmap)
}

function convert(node: IRNode, cmap: Map<string, string>): TestNode {
  switch (node.type) {
    case 'element':
      return convertElement(node, cmap)
    case 'text':
      return convertText(node)
    case 'expression':
      return convertExpression(node)
    case 'conditional':
      return convertConditional(node, cmap)
    case 'loop':
      return convertLoop(node, cmap)
    case 'component':
      return convertComponent(node, cmap)
    case 'fragment':
      return convertFragment(node, cmap)
    case 'slot':
      return convertSlot(node)
    case 'if-statement':
      return convertIfStatement(node, cmap)
    case 'provider':
      return convertProvider(node, cmap)
    case 'async':
      return convertAsync(node, cmap)
    default: {
      const _exhaustive: never = node
      throw new Error(`Unhandled IR node type: ${(_exhaustive as IRNode).type}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Element
// ---------------------------------------------------------------------------

function convertElement(node: IRElement, cmap: Map<string, string>): TestNode {
  const props: Record<string, string | boolean | null> = {}
  const aria: Record<string, string> = {}
  let role: string | null = null
  let dataState: string | null = null
  let classes: string[] = []

  for (const attr of node.attrs) {
    const value = resolveAttrValue(attr)

    if (attr.name === 'className' || attr.name === 'class') {
      if (typeof value === 'string') {
        if (attr.dynamic && cmap.size > 0) {
          const resolved = resolveClassValue(value, cmap)
          if (resolved !== null) {
            classes = resolved.split(/\s+/).filter(Boolean)
            continue
          }
        }
        classes = value.split(/\s+/).filter(Boolean)
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
  const children = node.children.map(c => convert(c, cmap))

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
    reactive: node.reactive,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Conditional
// ---------------------------------------------------------------------------

function convertConditional(node: IRConditional, cmap: Map<string, string>): TestNode {
  const children: TestNode[] = [convert(node.whenTrue, cmap)]
  if (node.whenFalse) {
    children.push(convert(node.whenFalse, cmap))
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
    reactive: node.reactive,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function convertLoop(node: IRLoop, cmap: Map<string, string>): TestNode {
  const children = node.children.map(c => convert(c, cmap))

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
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function convertComponent(node: IRComponent, cmap: Map<string, string>): TestNode {
  const props: Record<string, string | boolean | null> = {}
  for (const prop of node.props) {
    props[prop.name] = prop.value
  }

  const children = node.children.map(c => convert(c, cmap))

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
    events: [],
    reactive: false,
    componentName: node.name,
  })
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

function convertFragment(node: IRFragment, cmap: Map<string, string>): TestNode {
  const children = node.children.map(c => convert(c, cmap))

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
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// IfStatement
// ---------------------------------------------------------------------------

function convertIfStatement(node: IRIfStatement, cmap: Map<string, string>): TestNode {
  const children: TestNode[] = [convert(node.consequent, cmap)]
  if (node.alternate) {
    children.push(convert(node.alternate, cmap))
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
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function convertProvider(node: IRProvider, cmap: Map<string, string>): TestNode {
  // Transparent — just pass through children
  const children = node.children.map(c => convert(c, cmap))

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
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Async
// ---------------------------------------------------------------------------

function convertAsync(node: IRAsync, cmap: Map<string, string>): TestNode {
  // Represent the resolved content as a fragment; tests assert on final state.
  const children = node.children.map(c => convert(c, cmap))

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
    reactive: false,
    componentName: null,
  })
}

// ---------------------------------------------------------------------------
// Constant-based class value resolution
// ---------------------------------------------------------------------------

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
  if (attr.value === null) return true // boolean attribute

  if (typeof attr.value === 'string') return attr.value

  // IRTemplateLiteral
  return resolveTemplateLiteral(attr.value)
}

function resolveTemplateLiteral(tl: IRTemplateLiteral): string {
  return tl.parts
    .map(part => {
      if (part.type === 'string') return part.value
      if (part.type === 'ternary') return `{${part.condition}}`
      // `lookup` placeholder — keys-only since the test framework
      // doesn't pick a concrete branch.
      return `{${part.key}}`
    })
    .join('')
}
