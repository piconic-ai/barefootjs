/**
 * GoTemplateAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Go-template-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { renderGoTemplateComponent, GoNotAvailableError } from '@barefootjs/go-template/test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'go-template',
  factory: () => new GoTemplateAdapter(),
  render: renderGoTemplateComponent,
  // `branch-self-closing` no longer needs a skip — the conditional-
  // marker divergence (Hono `bf-c="sN"` attribute vs Go
  // `<!--bf-cond-start:sN-->` / `<!--bf-cond-end:sN-->` comment pairs)
  // is now collapsed by `normalizeHTML` in adapter-tests (#1266).
  //
  // `nullish-coalescing-jsx` / `return-nullish-coalescing` have a
  // separate semantic divergence: the Go template's `{{if ne .Banner
  // ""}}` condition treats an unset `Banner` (Go nil) as `!= ""` and
  // takes the truthy branch with empty content, while Hono's JS
  // `??` operator falls through to the JSX default. That's a Go-
  // adapter branch-selection bug — fixing it is out of scope for
  // #1266.
  //
  // `return-map` uses a `data-key` serialisation shape that differs
  // between Hono (runtime helper) and Go (template variable) in a
  // way that isn't structural — leaving it on `skipJsx` until a
  // normaliser for the `data-key` shape lands or the fixture splits
  // into per-adapter `expectedHtml`.
  //
  // `style-object-dynamic`, `static-array-children`,
  // `static-array-from-props`, and `static-array-from-props-with-component`
  // are no longer here — they're covered by `expectedDiagnostics`
  // below, asserting that the adapter emits `BF101` / `BF103` /
  // `BF104` at build time instead of silently emitting invalid
  // template syntax (#1266).
  skipJsx: [
    'nullish-coalescing-jsx',
    'return-nullish-coalescing',
    'return-map',
    // #1297 fixed the harness-side IR emission gate (multi-component
    // sources now emit one `ir` file per component, and the harness
    // picks the entry-point IR). The remaining gap is adapter-side:
    // the go-template adapter has no SSR context-propagation
    // mechanism, so `<Ctx.Provider value="dark">` doesn't make
    // `useContext(Ctx)` resolve to `"dark"` at template-eval time —
    // the template emits `.Theme` against a struct that has no
    // `Theme` field. Provider SSR coverage on go-template waits on
    // that adapter feature; see #1297 follow-up.
    'context-provider',
    // #1244 stress catalog: JSX spread of a reactive object
    // (`<div {...attrs()} />`). The Go template adapter silently
    // drops the spread at emit time — the resulting `<div bf-s=...>`
    // has none of the spread's keys, diverging from the Hono / CSR
    // reference (`<div id="a" class="on" ...>`). Tracked as a sub-
    // issue of #1244; lift into `expectedDiagnostics` once the
    // adapter raises a CompilerError for the unsupported shape.
    'jsx-spread-reactive',
    // #1244 stress catalog: member-expression JSX tag (`<Pkg.Comp />`).
    // The adapter lowers the tag to `{{template "Pkg.Comp" .Pkg.CompSlot0}}`
    // — a Go template name containing a `.` and a struct path that
    // doesn't exist. Same sub-issue follow-up as above.
    'member-expression-tag',
    // #1244 stress catalog: `children={<span/>}` — the Hono reference
    // emits `bf-s` on the inner `<span>` (it tracks the span as a
    // hoisted child of Demo). The Go adapter doesn't carry that
    // scope through `.Children` interpolation, so the rendered HTML
    // omits the inner `bf-s` and diverges from expectedHtml. Same
    // class as the existing `record-index-lookup-via-child-prop`
    // CSR divergence; sub-issue of #1244.
    'children-jsx-expression',
  ],
  // Per-fixture build-time contracts for shapes the Go template
  // adapter intentionally refuses to lower. Lives here (not on the
  // shared fixtures) so adding a new adapter doesn't require touching
  // any cross-adapter file — every adapter declares its own
  // refusal set against the canonical fixture corpus.
  expectedDiagnostics: {
    // JS object literal in attribute position: `convertExpressionToGo`
    // can't lower into Go template syntax — surfaces as BF101 with an
    // @client suggestion.
    'style-object-dynamic': [{ code: 'BF101', severity: 'error' }],
    // Sibling-imported child component inside a loop body: the adapter
    // emits `{{template "X" .}}` which only resolves if the user has
    // compiled the sibling file and registered the template on the
    // same instance. BF103 makes that requirement loud. (The barefoot
    // CLI passes `siblingTemplatesRegistered: true` so CLI builds
    // suppress the diagnostic — see compileJSX `siblingTemplatesRegistered`.)
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // Array-destructure loop param (`([k, v]) => ...`): Go's `{{range
    // $a, $b := ...}}` only supports single-name bindings, so the
    // adapter would otherwise emit invalid template syntax.
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Same destructure shape with a child component body — fires both
    // BF103 (imported child in loop) and BF104 (destructure param).
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // #1244 stress catalog: same `convertExpressionToGo` refusal shape
    // as `style-object-dynamic` above — a JS object literal in
    // attribute position can't lower into Go template syntax, so the
    // adapter surfaces BF101 instead of emitting invalid template.
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // #1244 stress catalog: tagged-template-literal callees
    // (`cn\`base \${tone()}\``) likewise can't lower into Go template
    // syntax — same BF101 refusal.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #1310: rest destructure in .map() callback. Hono / CSR lower
    // these via the inline residual-object accessor (#1309), but the
    // Go template adapter has no analogous lowering — `paramBindings`
    // is non-empty so the generic destructure-refusal at
    // `go-template-adapter.ts` fires BF104 regardless of whether the
    // binding is rest or plain. Pinning the contract here makes the
    // limitation declarative: when the Go adapter grows a native
    // rest-lowering, dropping these entries flips the contract on.
    'rest-destructure-object-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
  },
  // `JSON_STRINGIFY_VIA_CONST` and `MATH_FLOOR_VIA_CONST` now pass
  // via `GoTemplateAdapter.templatePrimitives` (#1188). The two
  // remaining cases stay skipped because the V1 registry is
  // identifier-path-only and explicit:
  //   - `USER_IMPORT_VIA_CONST` — a bespoke user import isn't in
  //     the registry and can't be rendered server-side without
  //     user-supplied template-fn mappings.
  //   - `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` — uses `customSerialize`
  //     too, same reason.
  // Adding new entries to `templatePrimitives` should narrow this
  // skip set; see `templatePrimitives` declaration in
  // `go-template-adapter.ts` for the full V1 surface.
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
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
  const result = compileJSX(source.trimStart(), 'test.tsx', {
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

  describe('JSX children forwarding (#1203)', () => {
    test('forwards element children via Children: template.HTML(...)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return (
    <main data-x={x()}>
      <Card>
        <span>hello</span>
        <span>world</span>
      </Card>
    </main>
  )
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('"html/template"')
      expect(types).toContain(
        'Children: template.HTML("<span>hello</span><span>world</span>")',
      )
    })

    test('text-only children stay on the plain string path (#461 carry-over)', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Button>+1</Button></main>
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).toContain('Children: "+1"')
      expect(types).not.toContain('template.HTML')
      expect(types).not.toContain('"html/template"')
    })

    test('omits Children entry when component has no JSX children', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
'use client'
import { createSignal } from "@barefootjs/client"

export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Card label="x" /></main>
}
`)
      const types = adapter.generateTypes(ir)!
      expect(types).not.toContain('Children:')
      expect(types).not.toContain('template.HTML')
    })

    test('drops dynamic children that would emit Go template actions', () => {
      // V1 limitation: a `template.HTML` value isn't re-parsed by the
      // parent's `{{.Children}}` pipeline, so any `{{...}}` inside the
      // rendered fragment would output literally. Dynamic-expression /
      // nested-component / conditional children stay on the existing
      // drop path (same as before this issue) until a re-evaluation
      // hook lands.
      const cases = [
        // signal expression inside child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [c] = createSignal(0)
  return <main><Card><span>{c()}</span></Card></main>
}`,
        // nested component child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [x] = createSignal(0)
  return <main data-x={x()}><Card><Button/></Card></main>
}`,
        // conditional child
        `'use client'
import { createSignal } from "@barefootjs/client"
export function Page() {
  const [v] = createSignal(true)
  return <main><Card>{v() ? <span>a</span> : <span>b</span>}</Card></main>
}`,
      ]
      for (const src of cases) {
        const adapter = new GoTemplateAdapter()
        const ir = compileToIR(src, adapter)
        const types = adapter.generateTypes(ir)!
        expect(types).not.toContain('Children:')
        expect(types).not.toContain('template.HTML')
      }
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

  describe('templatePrimitives — JS-compat callees (#1188)', () => {
    // The registry fires when the call appears DIRECTLY in a JSX
    // expression position (`<div data-x={JSON.stringify(...)}>`).
    // Chained-const usage (`const j = JSON.stringify(...); <div
    // data-x={j}>`) routes through the Go adapter's struct-field
    // lift today and doesn't invoke the registry — that's a
    // separate limitation not addressed here. The conformance
    // test for the via-const shape inspects the CLIENT JS, where
    // the call IS inlined (relocate accepts it via the registry's
    // boolean-acceptance side).

    test('JSON.stringify(props.x) emits bf_json in SSR template (inline)', () => {
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { config: object }) {
          return <div data-config={JSON.stringify(props.config)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_json .Config')
      // No raw JS leaked into the Go template.
      expect(result.template).not.toContain('JSON.stringify')
    })

    test('Math.floor(props.score) emits bf_floor in SSR template (inline)', () => {
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { score: number }) {
          return <div data-rounded={Math.floor(props.score)}>hi</div>
        }
      `)
      expect(result.template).toContain('bf_floor .Score')
      expect(result.template).not.toContain('Math.floor')
    })

    test('Math.ceil / Math.round both map to their bf_* equivalents', () => {
      const ceilResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={Math.ceil(props.v)}>hi</div>
        }
      `)
      expect(ceilResult.template).toContain('bf_ceil .V')

      const roundResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={Math.round(props.v)}>hi</div>
        }
      `)
      expect(roundResult.template).toContain('bf_round .V')
    })

    test('String(props.x) and Number(props.x) emit bf_string / bf_number', () => {
      const stringResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: number }) {
          return <div data-x={String(props.v)}>hi</div>
        }
      `)
      expect(stringResult.template).toContain('bf_string .V')

      const numberResult = compileAndGenerate(`
        'use client'
        export function Foo(props: { v: string }) {
          return <div data-x={Number(props.v)}>hi</div>
        }
      `)
      expect(numberResult.template).toContain('bf_number .V')
    })

    test('registry exposes the expected V1 callees', () => {
      // Pin the V1 surface so a future refactor doesn't accidentally
      // drop a primitive. New entries are additive — extend this
      // list rather than replace.
      const a = new GoTemplateAdapter()
      const keys = Object.keys(a.templatePrimitives ?? {}).sort()
      expect(keys).toEqual(['JSON.stringify', 'Math.ceil', 'Math.floor', 'Math.round', 'Number', 'String'])
    })

    test('unregistered identifier-path callee is NOT accepted by the registry', () => {
      // The registry is identifier-path-only and explicit. A
      // user-import like `customSerialize` is NOT registered, so
      // the Go adapter can't render it server-side. Pin so a
      // future refactor doesn't accidentally start accepting
      // arbitrary identifier-paths via this map.
      const a = new GoTemplateAdapter()
      expect(a.templatePrimitives?.['customSerialize']).toBeUndefined()
    })

    test('wrong-arity primitive call falls back to BF101 instead of emitting invalid template', () => {
      // V1 emit fns blindly read `args[0]`. The arity gate must
      // reject 0-arg / 2-arg shapes so we don't ship invalid Go
      // template syntax (`bf_json` with no operand) or silently
      // drop extra args.
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { config: object; replacer: any }) {
          return <div data-x={JSON.stringify(props.config, props.replacer)}>hi</div>
        }
      `)
      // The substituted form must NOT appear with a stray second
      // arg; the call falls through and surfaces an error
      // instead.
      expect(result.template).not.toContain('bf_json')
    })

    test('computed-member callee does NOT match a string-keyed registry path', () => {
      // `arr[0](x)` parses as a call whose callee is a
      // computed-member. `identifierPath` must return null for
      // computed members so a same-named primitive in the
      // registry can't be triggered through array indexing.
      // Pin: the substitution path doesn't fire here.
      const result = compileAndGenerate(`
        'use client'
        export function Foo(props: { fns: ((x: any) => string)[]; v: any }) {
          return <div data-x={props.fns[0](props.v)}>hi</div>
        }
      `)
      expect(result.template).not.toContain('bf_json')
      expect(result.template).not.toContain('bf_string')
    })

    test('two-tier source-of-truth keeps emit + arity in sync', () => {
      // Regression for the previous parallel-map shape (#1200
      // review): ensure every `templatePrimitives` key has a
      // matching arity entry, so a registry-only addition can't
      // silently bypass the arity gate.
      const a = new GoTemplateAdapter()
      const arities = (a as unknown as { templatePrimitiveArities: Record<string, number> }).templatePrimitiveArities
      for (const key of Object.keys(a.templatePrimitives ?? {})) {
        expect(arities[key]).toBeGreaterThan(0)
      }
    })

    test('Math.floor(Number(...)) end-to-end via go run produces the expected rendered HTML', async () => {
      // The other tests assert template emission strings; this one
      // closes the loop by actually running `go run` against the
      // generated template + Go runtime helpers, so a regression in
      // the Go-side `Floor`/`Number` funcs surfaces here. Also
      // exercises chained-primitive composition (`bf_floor
      // (bf_number .Score)`) which the inline-direct emit path
      // produces for nested calls.
      //
      // The prop is typed `string` rather than `number` because
      // generateTypes maps TS `number` to Go `int`, and an `int`
      // field can't hold the fractional value we need to actually
      // exercise floor's rounding behaviour. Coercing through
      // `Number(props.score)` keeps the Go field as `string` and
      // shifts the float arithmetic into the runtime helpers.
      // Skipped on hosts without Go ≥ 1.25 (existing harness
      // GoNotAvailableError path).
      try {
        const html = await renderGoTemplateComponent({
          source: `
'use client'
export function Foo(props: { score: string }) {
  return <div data-rounded={Math.floor(Number(props.score))}>hi</div>
}
          `,
          adapter: new GoTemplateAdapter(),
          props: { score: '3.7' },
        })
        // Math.floor(Number("3.7")) === 3. Go float64 with integer
        // value formats as "3" via %v.
        expect(html).toContain('data-rounded="3"')
      } catch (err) {
        if (err instanceof GoNotAvailableError) {
          console.log('Skipping Math.floor e2e: go command not found')
          return
        }
        throw err
      }
    })

    test('JSON.stringify end-to-end via go run produces the expected rendered HTML', async () => {
      try {
        const html = await renderGoTemplateComponent({
          source: `
'use client'
export function Foo(props: { name: string }) {
  return <div data-config={JSON.stringify(props.name)}>hi</div>
}
          `,
          adapter: new GoTemplateAdapter(),
          props: { name: 'alice' },
        })
        // `JSON.stringify("alice")` → `"alice"` (with quotes).
        // The template interpolates into an attribute value, so the
        // outer quotes get HTML-entity escaped.
        expect(html).toContain('&#34;alice&#34;')
      } catch (err) {
        if (err instanceof GoNotAvailableError) {
          console.log('Skipping JSON.stringify e2e: go command not found')
          return
        }
        throw err
      }
    })
  })

  describe('NewXxxProps template-parts dispatch (#1275)', () => {
    // Companion to the Mojo / Hono unit tests for the
    // `record-index-lookup-via-child-prop` conformance fixture. The IR
    // producer collapses `template` → `expression` for component props
    // but preserves the parts on `ExpressionAttr.parts`; the Go adapter
    // must read those parts and emit an IIFE (`switch`-based) in the
    // generated `NewXxxProps` so the variant class is materialised at
    // SSR time. The previous behaviour silently dropped the prop —
    // visible end-to-end as `class=""` on the scaffold's Button.
    test('record-index-lookup via child prop emits a Go switch IIFE, not a dropped field', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  return <Slot className={\`base \${classes[variant]}\`}>hi</Slot>
}
`, adapter)
      const out = adapter.generate(ir)
      const goCode = out.types ?? ''
      // The ClassName field MUST be set on the SlotInput literal.
      expect(goCode).toContain('ClassName:')
      // The IIFE shape: a self-invoking func that switches on the
      // variant key and returns the matching case.
      expect(goCode).toContain('func() string {')
      expect(goCode).toContain('in.Variant.(string)')
      expect(goCode).toContain('case "a": return "class-a"')
      expect(goCode).toContain('case "b": return "class-b"')
    })

    test('intermediate-const composition (Button shape) carries through', () => {
      const adapter = new GoTemplateAdapter()
      const ir = compileToIR(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  const composed = \`base \${classes[variant]}\`
  return <Slot className={composed}>hi</Slot>
}
`, adapter)
      const out = adapter.generate(ir)
      const goCode = out.types ?? ''
      expect(goCode).toContain('ClassName:')
      expect(goCode).toContain('case "a": return "class-a"')
    })
  })
})
