/**
 * GoTemplateAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Go-template-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { runJSXConformanceTests } from '@barefootjs/adapter-tests'
import { renderGoTemplateComponent, GoNotAvailableError } from '@barefootjs/go-template/test-render'
import { compileJSXSync, type ComponentIR } from '@barefootjs/jsx'

// =============================================================================
// JSX-Based Conformance Tests
// =============================================================================

runJSXConformanceTests({
  createAdapter: () => new GoTemplateAdapter(),
  render: renderGoTemplateComponent,
  // Uses fixture.expectedHtml (pre-generated from Hono adapter) for comparison
  // Static array with child components from separate files is not yet supported
  // by the Go template renderer (child templates are not registered)
  // Dynamic style objects (non-static values) require Go template interpolation
  // support for JS template literals, which is not yet implemented.
  // `branch-self-closing` and `nullish-coalescing-jsx` diverge on conditional
  // marker strategy: the Go adapter emits `<!--bf-cond-start:sN-->` / `<!--bf-cond-end:sN-->`
  // comment pairs around the active branch, while Hono places a `bf-c="sN"`
  // attribute on the single element. Both are valid hydration markers — the
  // runtime accepts either — but the literal HTML differs, so the Hono-derived
  // `expectedHtml` does not match Go-template output. Same class of divergence
  // as `fragment-conditional`, which is already handled by comment markers in
  // both adapters.
  skip: [
    'static-array-children',
    'style-object-dynamic',
    'branch-self-closing',
    'nullish-coalescing-jsx',
    // Same conditional-marker / data-key divergences at return position.
    // `return-nullish-coalescing` hits the same `bf-c` vs comment-marker
    // split as `nullish-coalescing-jsx`. `return-map` uses the
    // `data-key` serialisation that differs between Hono (runtime helper)
    // and Go (template variable).
    'return-nullish-coalescing',
    'return-map',
  ],
  onRenderError: (err, id) => {
    if (err instanceof GoNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compile JSX source to ComponentIR using the GoTemplateAdapter.
 */
function compileToIR(source: string, adapter?: GoTemplateAdapter): ComponentIR {
  const result = compileJSXSync(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new GoTemplateAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

/**
 * Compile JSX source and return the generated template output.
 */
function compileAndGenerate(source: string, adapter?: GoTemplateAdapter) {
  const a = adapter ?? new GoTemplateAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

// =============================================================================
// Go-Template-Specific Tests
// =============================================================================

describe('GoTemplateAdapter - Adapter Specific', () => {
  describe('generate - Go struct types', () => {
    test('deduplicates struct field when signal name matches prop name (#461)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Example(props: { label?: string }) {
  const [label, setLabel] = createSignal(props.label ?? 'Default')
  return <div>{label()}</div>
}
`)
      const result = adapter.generate(ir)

      expect(result.types).toBeDefined()
      // Should have exactly one Label field, not two
      const labelFields = result.types!.match(/\bLabel\b.*`json:"label"`/g) ?? []
      expect(labelFields.length).toBe(1)

      // NewExampleProps should have exactly one Label assignment
      const labelAssignments = result.types!.match(/Label:/g) ?? []
      expect(labelAssignments.length).toBe(1)
    })

    test('generates Go struct types', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return <div>{count()}</div>
}
`)
      const result = adapter.generate(ir)

      expect(result.types).toBeDefined()
      expect(result.types).toContain('package components')
      expect(result.types).toContain('type CounterProps struct')
      expect(result.types).toContain('ScopeID string')
      expect(result.types).toContain('Initial int')
      expect(result.types).toContain('Count int')
    })
  })

  describe('generateTypes', () => {
    test('generates types with custom package name', () => {
      const customAdapter = new GoTemplateAdapter({ packageName: 'views' })
      const ir = compileToIR(`
export function Button(props: { label: string }) {
  return <button>{props.label}</button>
}
`, customAdapter)

      const types = customAdapter.generateTypes(ir)

      expect(types).toContain('package views')
      expect(types).toContain('type ButtonProps struct')
      expect(types).toContain('Label string')
    })

    test('generates fields for multiple static child components with slotId', () => {
      const adapter = new GoTemplateAdapter()
      // ReactiveChild is not defined here — only referenced as a child component.
      // The compiler creates IRComponent nodes for any PascalCase JSX element.
      const ir = compileToIR(`
"use client"
import { createSignal, createMemo } from "@barefootjs/client"

export default function ReactiveProps() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return (
    <div>
      <ReactiveChild value={count()} label="Child A" />
      <ReactiveChild value={doubled()} label="Child B (doubled)" />
    </div>
  )
}
`)

      const types = adapter.generateTypes(ir)!

      // Two ReactiveChild instances should produce two distinct Props fields
      const fieldMatches = types.match(/ReactiveChild\w+ ReactiveChildProps/g) ?? []
      expect(fieldMatches.length).toBe(2)

      // Each instance should have a NewReactiveChildProps initializer
      const initMatches = types.match(/NewReactiveChildProps\(ReactiveChildInput\{/g) ?? []
      expect(initMatches.length).toBe(2)

      // Each should have its own ScopeID derived from parent
      const scopeMatches = types.match(/ScopeID: scopeID \+ "_/g) ?? []
      expect(scopeMatches.length).toBe(2)

      // Label values should be present
      expect(types).toContain('Label: "Child A"')
      expect(types).toContain('Label: "Child B (doubled)"')
    })
  })

  describe('Portal component handling', () => {
    test('renders Portal component with children as portal collection', () => {
      // Portal is referenced as a child component (not defined in file).
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal>
        <div data-slot="dialog-overlay"></div>
      </Portal>
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
      expect(result.template).toContain('data-slot=\\"dialog-overlay\\"')
    })

    test('renders Portal with dynamic attribute in children', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal>
        <div data-slot="dialog-overlay" data-state={open() ? 'open' : 'closed'}></div>
      </Portal>
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
      expect(result.template).toContain('bfPortalHTML')
      expect(result.template).toContain('data-state')
    })

    test('Portal without children renders empty portal add', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <Portal />
    </div>
  )
}
`)
      expect(result.template).toContain('.Portals.Add')
    })

    test('non-Portal component renders normally', () => {
      // DialogTrigger is referenced but not defined — compiler creates IRComponent.
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function DialogDemo() {
  const [open, setOpen] = createSignal(false)
  return (
    <div>
      <DialogTrigger />
    </div>
  )
}
`)
      expect(result.template).toContain('{{template "DialogTrigger"')
      expect(result.template).not.toContain('.Portals.Add')
    })
  })

  describe('block body filter rendering', () => {
    test('renders loop with simple block body filter', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  return (
    <ul>
      {todos().filter(t => { return !t.done }).map(todo => (
        <li>Item</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('not .Done')
      expect(result.template).toContain('Item')
    })

    test('renders loop with variable declaration and simple if', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoList() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [filter, setFilter] = createSignal('all')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
        return true
      }).map(todo => (
        <li>TodoItem</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('{{if')
      expect(result.template).toContain('$.Filter')
      expect(result.template).toContain('TodoItem')
    })

    test('renders loop with TodoApp filter pattern', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [filter, setFilter] = createSignal('all')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
        if (f === 'completed') return t.done
        return true
      }).map(todo => (
        <li>TodoItem</li>
      ))}
    </ul>
  )
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('{{if')
      expect(result.template).toContain('$.Filter')
      expect(result.template).toContain('active')
      expect(result.template).toContain('completed')
      expect(result.template).toContain('TodoItem')
    })
  })

  describe('higher-order methods - regression', () => {
    test('simple every(t => t.done) uses bf_every', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Todo = { text: string; done: boolean }

export function TodoStatus() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  return <div>{todos().every(t => t.done)}</div>
}
`)
      expect(result.template).toContain('bf_every .Todos "Done"')
    })
  })

  describe('find/findIndex - adapter specific', () => {
    test('renders find() with equality + comparison mixed predicate', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { price: number; category: string }

export function ItemFinder() {
  const [items, setItems] = createSignal<Item[]>([])
  const [type, setType] = createSignal('')
  return <div>{items().find(t => t.price > 100 && t.category === type())}</div>
}
`)
      expect(result.template).toContain('{{range')
      expect(result.template).toContain('gt .Price 100')
      expect(result.template).toContain('eq .Category $.Type')
      expect(result.template).toContain('{{break}}')
    })

    test('renders find() in condition', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

type Item = { name: string; done: boolean }

export function ItemChecker() {
  const [items, setItems] = createSignal<Item[]>([])
  return <div>{items().find(t => t.done) ? 'Found' : 'Not found'}</div>
}
`)
      expect(result.template).toContain('bf_find .Items "Done" true')
      expect(result.template).toContain('Found')
    })
  })

  describe('component root scope comment propagation', () => {
    test('component root in client component outputs bfScopeComment', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Wrapper() {
  const [active, setActive] = createSignal(false)
  return <Badge active={active()} />
}
`)
      // Component root should have scope comment for hydration boundary
      expect(result.template).toContain('{{bfScopeComment .}}')
      expect(result.template).toContain('{{template "Badge"')
    })

    test('element root in client component does NOT output bfScopeComment', () => {
      // Element roots use bf-s attribute directly, not scope comments
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`)
      expect(result.template).not.toContain('{{bfScopeComment .}}')
      expect(result.template).toContain('<div')
    })

    test('if-statement root with component branches outputs bfScopeComment', () => {
      const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function ConditionalComponent(props: { variant: string }) {
  const [active, setActive] = createSignal(false)
  if (props.variant === 'primary') {
    return <PrimaryBadge active={active()} />
  }
  return <DefaultBadge active={active()} />
}
`)
      // Both branches should have scope comments
      const template = result.template
      const scopeCommentCount = (template.match(/\{\{bfScopeComment \.\}\}/g) ?? []).length
      expect(scopeCommentCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('script registration - asset paths', () => {
    const source = `
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`

    test('defaults to /static/client/', () => {
      const result = compileAndGenerate(source)
      expect(result.template).toContain('{{.Scripts.Register "/static/client/barefoot.js"}}')
      expect(result.template).toContain('{{.Scripts.Register "/static/client/Counter.client.js"}}')
    })

    test('honors clientJsBasePath and barefootJsPath options', () => {
      const adapter = new GoTemplateAdapter({
        clientJsBasePath: '/examples/echo/client/',
        barefootJsPath: '/examples/echo/client/barefoot.js',
      })
      const result = compileAndGenerate(source, adapter)
      expect(result.template).toContain('{{.Scripts.Register "/examples/echo/client/barefoot.js"}}')
      expect(result.template).toContain('{{.Scripts.Register "/examples/echo/client/Counter.client.js"}}')
      expect(result.template).not.toContain('/static/client/')
    })
  })

  describe('cva-style class derivation (#1177)', () => {
    // The registry <Button> uses
    //   const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
    // Make sure jsx-to-ir's const resolution + the adapter's
    // template-literal renderer agree on every piece of that.
    const variantSource = `
"use client"

const baseClasses = 'inline-flex items-center'
const variantClasses: Record<string, string> = {
  default: 'bg-primary',
  secondary: 'bg-secondary',
}

export function Tag(props: { variant?: 'default' | 'secondary'; className?: string }) {
  const classes = \`\${baseClasses} \${variantClasses[props.variant ?? 'default']} \${props.className ?? ''}\`
  return <span className={classes}>tag</span>
}
`

    test('inlines string-literal const + emits switch for Record lookup', () => {
      const result = compileAndGenerate(variantSource)
      const tpl = result.template
      // baseClasses substituted as static text:
      expect(tpl).toContain('inline-flex items-center')
      // variantClasses[...] became a Go switch with both cases:
      expect(tpl).toMatch(/\{\{if eq [^}]+ "default"\}\}bg-primary/)
      expect(tpl).toMatch(/\{\{else if eq [^}]+ "secondary"\}\}bg-secondary/)
      expect(tpl).toContain('{{end}}')
    })

    test('html-escapes UnoCSS arbitrary-value classes inside attribute values', () => {
      const escapingSource = `
"use client"

const baseClasses = '[class*="size-"]:size-4'

export function Tagged(props: { className?: string }) {
  const classes = \`\${baseClasses} \${props.className ?? ''}\`
  return <span className={classes}>x</span>
}
`
      const tpl = compileAndGenerate(escapingSource).template
      // The literal `"` in `[class*="size-"]` would otherwise terminate
      // the wrapping attribute. Must be entity-escaped.
      expect(tpl).toContain('[class*=&quot;size-&quot;]:size-4')
      // And no raw `"` should appear inside the class= value (any
      // remaining `"` must be an attribute boundary, not literal).
      const classAttrMatch = tpl.match(/class="([^"]*)/)
      expect(classAttrMatch).not.toBeNull()
      expect(classAttrMatch![1]).not.toContain('"')
    })
  })
})
