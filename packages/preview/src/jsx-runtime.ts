// Minimal DOM-based JSX runtime for CSR preview.
// Produces { tag, props } objects (Hono JSX shape) so Slot's
// isValidElement() works, then mounts them to the real DOM.

export type VNode = {
  tag: string | Function
  props: Record<string, unknown>
}

const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
  'ellipse', 'g', 'defs', 'use', 'text', 'tspan',
])

export function jsx(tag: string | Function, props: Record<string, unknown>): VNode {
  return { tag, props: props ?? {} }
}

export { jsx as jsxs, jsx as jsxDEV }

export function Fragment(props: { children?: unknown }) {
  return { tag: Fragment, props: props ?? {} }
}

export function mount(vnode: unknown, container: HTMLElement) {
  const node = toDOM(vnode)
  if (node) container.appendChild(node)
}

function toDOM(vnode: unknown): Node | null {
  if (vnode == null || typeof vnode === 'boolean') return null
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return document.createTextNode(String(vnode))
  }
  if (Array.isArray(vnode)) {
    const frag = document.createDocumentFragment()
    for (const child of vnode) {
      const n = toDOM(child)
      if (n) frag.appendChild(n)
    }
    return frag
  }
  if (!isVNode(vnode)) return null

  const { tag, props } = vnode

  // Fragment
  if (typeof tag === 'function' && tag === Fragment) {
    return toDOM(props.children)
  }

  // Function component
  if (typeof tag === 'function') {
    return toDOM(tag(props))
  }

  // HTML / SVG element
  const isSvg = SVG_TAGS.has(tag)
  const el = isSvg
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag)

  const { children, className, dangerouslySetInnerHTML, ...rest } = props
  if (className) el.setAttribute('class', String(className))
  if (dangerouslySetInnerHTML && typeof dangerouslySetInnerHTML === 'object') {
    el.innerHTML = (dangerouslySetInnerHTML as { __html: string }).__html ?? ''
  }

  for (const [key, value] of Object.entries(rest)) {
    if (value == null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else {
      el.setAttribute(key === 'htmlFor' ? 'for' : key, value === true ? '' : String(value))
    }
  }

  if (!dangerouslySetInnerHTML) appendChildren(el, children)
  return el
}

function appendChildren(el: Node, children: unknown) {
  if (children == null || typeof children === 'boolean') return
  if (Array.isArray(children)) {
    for (const child of children) appendChildren(el, child)
  } else {
    const n = toDOM(children)
    if (n) el.appendChild(n)
  }
}

function isVNode(v: unknown): v is VNode {
  return !!(v && typeof v === 'object' && 'tag' in v && 'props' in v)
}
