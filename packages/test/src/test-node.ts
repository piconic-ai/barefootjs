/**
 * TestNode — Queryable representation of a compiled BarefootJS component.
 *
 * Produced by converting the compiler IR into a flat, assertion-friendly shape.
 */

export interface EventHandler {
  setters: string[]
  via: string[]
}

export interface TestNodeData {
  tag: string | null
  type: 'element' | 'text' | 'expression' | 'conditional' | 'loop' | 'component' | 'fragment'
  children: TestNode[]
  text: string | null
  props: Record<string, string | boolean | null>
  classes: string[]
  role: string | null
  aria: Record<string, string>
  dataState: string | null
  events: string[]
  handlers: Partial<Record<string, EventHandler>>
  reactive: boolean
  componentName: string | null
}

export interface TestNodeQuery {
  tag?: string
  role?: string
  componentName?: string
}

export class TestNode implements TestNodeData {
  tag: string | null
  type: TestNodeData['type']
  children: TestNode[]
  text: string | null
  props: Record<string, string | boolean | null>
  classes: string[]
  role: string | null
  aria: Record<string, string>
  dataState: string | null
  events: string[]
  handlers: Partial<Record<string, EventHandler>>
  reactive: boolean
  componentName: string | null

  get onClick(): EventHandler | undefined { return this.handlers.click }
  get onInput(): EventHandler | undefined { return this.handlers.input }
  get onChange(): EventHandler | undefined { return this.handlers.change }
  get onSubmit(): EventHandler | undefined { return this.handlers.submit }

  on(event: string): EventHandler | null {
    return this.handlers[event] ?? null
  }

  constructor(data: TestNodeData) {
    this.tag = data.tag
    this.type = data.type
    this.children = data.children
    this.text = data.text
    this.props = data.props
    this.classes = data.classes
    this.role = data.role
    this.aria = data.aria
    this.dataState = data.dataState
    this.events = data.events
    this.handlers = data.handlers
    this.reactive = data.reactive
    this.componentName = data.componentName
  }

  /** Return the first descendant (or self) matching the query. */
  find(query: TestNodeQuery): TestNode | null {
    if (this.matches(query)) return this
    for (const child of this.children) {
      const found = child.find(query)
      if (found) return found
    }
    return null
  }

  /** Return all descendants (and self) matching the query. */
  findAll(query: TestNodeQuery): TestNode[] {
    const results: TestNode[] = []
    this.collectMatches(query, results)
    return results
  }

  /** Return the first descendant whose text contains the given string. */
  findByText(text: string): TestNode | null {
    if (this.text !== null && this.text.includes(text)) return this
    for (const child of this.children) {
      const found = child.findByText(text)
      if (found) return found
    }
    return null
  }

  private matches(query: TestNodeQuery): boolean {
    if (query.tag !== undefined && this.tag !== query.tag) return false
    if (query.role !== undefined && this.role !== query.role) return false
    if (query.componentName !== undefined && this.componentName !== query.componentName) return false
    return true
  }

  private collectMatches(query: TestNodeQuery, results: TestNode[]): void {
    if (this.matches(query)) results.push(this)
    for (const child of this.children) {
      child.collectMatches(query, results)
    }
  }
}
