/**
 * Destructured props stay reactive: every value-position read of a
 * destructured prop name in the compiled `init*` body is a live `_p.<key>`
 * read (or `(_p.<key> ?? <fallback>)`), the same shape `props.xxx` access
 * compiles to. See `props-binding.ts`'s `livePropReadExpr` and
 * `ir-to-client-js/rewrite-destructured-props.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function compileClientJs(source: string, filename = 'Component.tsx') {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  expect(errors).toEqual([])
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return { content: clientJs!.content, result }
}

describe('destructured props compile to live reads', () => {
  test('BF043 no longer exists as an error code', () => {
    // Checked by string value, not by a removed `ErrorCodes` key (that
    // would be a compile error) — same convention as
    // `invalid-signal-usage.audit.test.ts`'s BF012 deletion audit.
    expect(Object.values(ErrorCodes)).not.toContain('BF043')
  })

  test('a destructured prop no longer gets a captured-once extraction line, and no BF043 diagnostic appears', () => {
    const source = `
      'use client'
      import { createSignal, createMemo, createEffect } from '@barefootjs/client'

      function Child({ value, onClick, label = 'n', size = 'md', items = [] }: {
        value: number
        onClick: () => void
        label?: string
        size?: string
        items?: string[]
      }) {
        const doubled = createMemo(() => value * 2)
        const [local, setLocal] = createSignal(value)
        createEffect(() => {
          console.log('value is', value)
        })
        return (
          <div className={size}>
            <span data-label={label}>{value}</span>
            <span>{doubled()}</span>
            <span>{items.length}</span>
            <button onClick={() => { setLocal(value); onClick() }}>click</button>
          </div>
        )
      }
    `
    const { content, result } = compileClientJs(source, 'Child.tsx')

    // No captured-once local for any destructured prop.
    expect(content).not.toContain('const value = _p.value')
    expect(content).not.toContain('const onClick = _p.onClick')
    expect(content).not.toContain('const label = ')
    expect(content).not.toContain('const size = ')
    expect(content).not.toContain('const items = ')

    // Memo computation reads the live prop directly.
    expect(content).toMatch(/createMemo\(\(\) => _p\.value \* 2\)/)

    // The user effect reads the live prop, not a captured local.
    expect(content).toContain("console.log('value is', _p.value)")

    // The handler reads the live prop for both the signal update and the
    // callback-prop invocation.
    expect(content).toContain('_p.onClick()')
    expect(content).toContain('setLocal(_p.value)')

    // `items`'s destructure default survives as a live fallback, not a
    // one-time extraction.
    expect(content).toContain('(_p.items ?? []).length')

    // No BF043 diagnostic (retired) anywhere in errors/warnings.
    expect(result.errors.some((e) => e.code === 'BF043')).toBe(false)
  })

  test('an aliased destructured prop (`{ n: count }`) reads the caller-facing key live everywhere', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      function Badge({ text, n: count }: { text: string; n: number }) {
        createEffect(() => {
          console.log(count)
        })
        return <span>{text}:{count}</span>
      }
    `
    const { content } = compileClientJs(source, 'Badge.tsx')
    expect(content).not.toContain('const count = ')
    expect(content).not.toContain('_p.count')
    expect(content).toContain('console.log(_p.n)')
  })

  test('an accessor-typed prop (`value: () => number`) still gets CALLED at the live read site', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      function Child({ value }: { value: () => number }) {
        createEffect(() => {
          console.log(value())
        })
        return <span>{value()}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).not.toContain('const value = _p.value')
    expect(content).toContain('_p.value()')
  })

  test('shadowing is preserved: a `.map()` callback param and a handler-local both keep their own binding', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function List({ title, items }: { title: string; items: { a: string }[] }) {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <span>{title}</span>
            <ul>
              {items.map((title) => <li key={title.a}>{title.a}</li>)}
            </ul>
            <button onClick={() => {
              const title = 'local'
              console.log(title)
              setCount(count() + 1)
            }}>click</button>
          </div>
        )
      }
    `
    const { content } = compileClientJs(source, 'List.tsx')
    // The outer `title` prop is rewritten wherever it is a free reference.
    expect(content).toContain('_p.title')
    // The `.map()` callback's OWN `title` parameter must never be rewritten
    // — `(_p.title) => _p.title.a` would be invalid JS.
    expect(content).not.toMatch(/\(_p\.title\)\s*=>/)
    expect(content).toMatch(/\(title\)\s*=>[\s\S]*?title\.a/)
    // The handler-local `const title = 'local'` shadows the prop for the
    // rest of that handler — its own reference must stay bare.
    expect(content).toContain("const title = 'local'")
    expect(content).toContain('console.log(title)')
  })

  test('`children` keeps its one-time captured-once extraction (not rewritten live)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Wrapper({ children }: { children: unknown }) {
        const [open, setOpen] = createSignal(true)
        return <div onClick={() => setOpen(!open())}>{open() ? children : null}</div>
      }
    `
    const { content } = compileClientJs(source, 'Wrapper.tsx')
    expect(content).toContain('const children = _p.children')
  })
})

/**
 * Body-destructured props in props-object mode (`function Child(props) {
 * const { value } = props; ... }`) — issue #2934. Before this fix, a
 * body destructure captured its value ONCE (`const value = _p.value`)
 * instead of reading it live, unlike the parameter form covered above.
 * These pin the same live-read behavior for the body form, routed through
 * the SAME rewrite door (`rewriteDestructuredPropReads`,
 * `bodyDestructuredPropParams`), plus the edge cases the fix had to get
 * right: `children`, renames, defaults, `let`/mutation, and the Phase-1
 * CSR `template:` default gap.
 */
describe('body-destructured props (props-object mode) compile to live reads (#2934)', () => {
  test('basic body destructure: no captured-once locals, live reads everywhere, including defaults', () => {
    const source = `
      'use client'
      import { createMemo, createEffect } from '@barefootjs/client'

      interface Props {
        value: number
        label?: string
        onClick: () => void
        items?: string[]
      }

      function Child(props: Props) {
        const { value, label = 'n', onClick, items = [] } = props
        const doubled = createMemo(() => value * 2)
        createEffect(() => {
          console.log('value is', value)
        })
        return (
          <div>
            <span data-label={label}>{value}</span>
            <span>{doubled()}</span>
            <span>{items.length}</span>
            <button onClick={() => onClick()}>click</button>
          </div>
        )
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')

    // The alias declaration line is gone — not just unused, ABSENT.
    expect(content).not.toContain('const value = _p.value')
    expect(content).not.toContain('const label =')
    expect(content).not.toContain('const onClick = _p.onClick')
    expect(content).not.toContain('const items =')

    // Live reads at every reference site.
    expect(content).toMatch(/createMemo\(\(\) => _p\.value \* 2\)/)
    expect(content).toContain("console.log('value is', _p.value)")
    expect(content).toContain('_p.onClick()')

    // Defaults survive as a live `??` fallback, not a one-time extraction.
    expect(content).toContain("(_p.label ?? 'n')")
    expect(content).toContain('(_p.items ?? []).length')
  })

  test('the alias declaration line is directly asserted absent (not just implied by live reads)', () => {
    // This is its own explicit assertion because the failure mode is a
    // SILENT no-op: if the alias line were left in the text, it would
    // parse as a real shadowing local (see `rewrite-destructured-props.ts`'s
    // docstring) and every "live read" assertion above could pass for
    // the WRONG reason — the alias just happens to read the same value at
    // mount. Only checking for the declaration's absence catches that.
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      interface Props { value: number }
      function Child(props: Props) {
        const { value } = props
        createEffect(() => { console.log(value) })
        return <span>{value}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).not.toMatch(/\bconst\s+value\s*=/)
  })

  test('a renamed body destructure (`{ n: count }`) reads the caller-facing key live, not a local', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      interface Props { text: string; n: number }
      function Badge(props: Props) {
        const { text, n: count } = props
        createEffect(() => {
          console.log(count)
        })
        return <span>{text}:{count}</span>
      }
    `
    const { content } = compileClientJs(source, 'Badge.tsx')
    expect(content).not.toMatch(/\bconst\s+count\s*=/)
    expect(content).not.toContain('_p.count')
    expect(content).toContain('console.log(_p.n)')
  })

  test('`children` keeps its captured-once extraction — plain and renamed', () => {
    // `createSignal` forces `children` into init scope as a real
    // declaration (a purely static component instead inlines `_p.children`
    // directly at the JSX use site with no local at all — a different,
    // unrelated code path — so the signal is load-bearing for this
    // assertion, same as the parameter-form sibling test above).
    const plain = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Props { children: unknown }
      function Wrapper(props: Props) {
        const { children } = props
        const [open, setOpen] = createSignal(true)
        return <div onClick={() => setOpen(!open())}>{open() ? children : null}</div>
      }
    `
    const { content: plainContent } = compileClientJs(plain, 'Wrapper.tsx')
    expect(plainContent).toContain('const children = _p.children')

    const renamed = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Props { children: unknown }
      function Wrapper(props: Props) {
        const { children: kids } = props
        const [open, setOpen] = createSignal(true)
        return <div onClick={() => setOpen(!open())}>{open() ? kids : null}</div>
      }
    `
    const { content: renamedContent } = compileClientJs(renamed, 'Wrapper.tsx')
    expect(renamedContent).toContain('const kids = _p.children')
    expect(renamedContent).not.toContain('_p.kids')
  })

  test('shadowing is preserved: a `.map()` callback param and a handler-local both keep their own binding', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Props { title: string; items: { a: string }[] }
      function List(props: Props) {
        const { title, items } = props
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <span>{title}</span>
            <ul>
              {items.map((title) => <li key={title.a}>{title.a}</li>)}
            </ul>
            <button onClick={() => {
              const title = 'local'
              console.log(title)
              setCount(count() + 1)
            }}>click</button>
          </div>
        )
      }
    `
    const { content } = compileClientJs(source, 'List.tsx')
    expect(content).toContain('_p.title')
    expect(content).not.toMatch(/\(_p\.title\)\s*=>/)
    expect(content).toMatch(/\(title\)\s*=>[\s\S]*?title\.a/)
    expect(content).toContain("const title = 'local'")
    expect(content).toContain('console.log(title)')
  })

  test('`let { value } = props` stays a real captured, mutable local (not touched by the rewrite)', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      interface Props { value: number }
      function Child(props: Props) {
        let value = props.value
        value = value + 1
        createEffect(() => {
          console.log(value)
        })
        return <span>{value}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    // `let value` here is a plain identifier declaration (not a
    // destructure pattern), so `collectConstant`'s destructure-expansion
    // branch never even sees it — but the analyzer's ordinary
    // mutated-local tracking must still keep it as a real local either way.
    expect(content).toMatch(/let\s+value\s*=\s*_p\.value/)
    expect(content).toContain('value = value + 1')
    expect(content).toContain('console.log(value)')
  })

  test('a genuinely `let`-destructured body binding (`let { value } = props`, reassigned) stays captured and mutable', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      interface Props { value: number }
      function Child(props: Props) {
        let { value } = props
        value = value + 1
        createEffect(() => {
          console.log(value)
        })
        return <span>{value}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    // Must stay a real, captured, mutable local — the live-read rewrite
    // must NOT touch a `let` binding, since it's reassigned afterward.
    expect(content).toMatch(/let\s+value\s*=\s*_p\.value/)
    expect(content).toContain('value = value + 1')
    expect(content).toContain('console.log(value)')
  })

  test('the CSR `template:` lambda applies a body-destructured default (Phase-1 fix)', () => {
    const source = `
      'use client'
      interface Props { label?: string }
      export function Badge(props: Props) {
        const { label = 'n' } = props
        return <span data-label={label}>{label}</span>
      }
    `
    const result = compileJSX(source, 'Badge.tsx', { adapter })
    expect(result.errors.filter((e) => e.severity === 'error')).toEqual([])
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''
    const hydrateMatch = content.match(/hydrate\(['"]Badge['"][\s\S]*?\}\)/)
    expect(hydrateMatch).not.toBeNull()
    const hydrateCall = hydrateMatch?.[0] ?? ''
    const templateMatch = hydrateCall.match(/template:\s*\(?_p\)?\s*=>\s*`([\s\S]*?)`\s*[,}]/)
    expect(templateMatch).not.toBeNull()
    const tmpl = templateMatch?.[1] ?? ''
    // The default must be applied INSIDE the template, matching Hono's SSR
    // `props.label ?? 'n'` — a bare `_p.label` would silently omit the
    // attribute/text on first render when the caller sends nothing.
    expect(tmpl).toContain("_p.label ?? 'n'")
  })
})
