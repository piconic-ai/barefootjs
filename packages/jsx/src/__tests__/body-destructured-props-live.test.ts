/**
 * Body-destructured (or plain member-access alias) props stay reactive too
 * (#2934) — the body-destructure twin of `destructured-props-live.test.ts`.
 * A pure single-prop passthrough local in a bare-props-form component
 * (`function Foo(props) { const { value } = props; ... }`, or the
 * equivalent `const value = props.value`) has its own extraction dropped
 * and every reference rewritten to a live `_p.<key>` read (or
 * `(_p.<key> ?? <fallback>)`), same as `props.xxx` access and parameter
 * destructuring. See `props-binding.ts`'s `resolveBodyPropAliases` and
 * `ir-to-client-js/rewrite-destructured-props.ts`'s `rewriteBodyAliasReads`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileClientJs(source: string, filename = 'Component.tsx') {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  expect(errors).toEqual([])
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return { content: clientJs!.content, result }
}

describe('body-destructured props compile to live reads', () => {
  test('a body-destructured prop no longer gets a captured-once extraction line', () => {
    const source = `
      'use client'
      import { createSignal, createMemo, createEffect } from '@barefootjs/client'

      function Child(props: {
        value: number
        onClick: () => void
        label?: string
        size?: string
        items?: string[]
      }) {
        const { value, onClick, label = 'n', size = 'md', items = [] } = props
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
    const { content } = compileClientJs(source, 'Child.tsx')

    // No captured-once local for any body-destructured prop.
    expect(content).not.toMatch(/const value = /)
    expect(content).not.toMatch(/const onClick = /)
    expect(content).not.toMatch(/const label = /)
    expect(content).not.toMatch(/const size = /)
    expect(content).not.toMatch(/const items = /)

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
  })

  test('the CSR template lambda also reads a defaulted body alias live, matching the parameter form (#2934)', () => {
    // This is the sibling bug the init-body fix alone doesn't cover: the
    // CSR `template:` lambda (used for a fresh client-side mount with no
    // SSR markup) is built at Phase 1 from a SEPARATE `ParamInfo` cache
    // (`jsx-to-ir.ts`'s `_destructuredPropInfoByName`) that, for a
    // props-object-mode component, held only type-member info with no
    // default of its own — so `data-label={label}` compiled to a bare
    // `_p.label` there, omitting the attribute entirely on a CSR-fresh
    // mount where `_p.label` is `undefined`, instead of applying the
    // `'none'` default like the parameter-destructured form already did.
    const source = `
      'use client'
      function Child(props: { label?: string }) {
        const { label = 'none' } = props
        return <div data-label={label}>{label}</div>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).not.toMatch(/const label = /)
    expect(content).toContain("escapeAttr((_p.label ?? 'none'))")
    expect(content).toContain("escapeTextOrMarkup((_p.label ?? 'none'))")
    // Never the bare, default-dropping form.
    expect(content).not.toMatch(/\(_p\.label\) != null/)
  })

  test('a renamed body-destructured prop (`onPick: pick`) reads the caller-facing key live everywhere', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      function Badge(props: { text: string; n: number }) {
        const { text, n: count } = props
        createEffect(() => {
          console.log(count)
        })
        return <span>{text}:{count}</span>
      }
    `
    const { content } = compileClientJs(source, 'Badge.tsx')
    expect(content).not.toMatch(/const count = /)
    expect(content).not.toContain('_p.count')
    expect(content).toContain('console.log(_p.n)')
  })

  test('a plain member-access alias (`const label = props.label`, no destructure) gets identical treatment', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      function Child(props: { label: string }) {
        const label = props.label
        createEffect(() => {
          console.log(label)
        })
        return <span>{label}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).not.toMatch(/const label = /)
    expect(content).toContain('console.log(_p.label)')
  })

  test('a computation derived from a body-destructured prop stays an ordinary once-evaluated local', () => {
    const source = `
      'use client'
      function Child(props: { value: number }) {
        const { value } = props
        const doubled = value * 2
        return <span>{doubled}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).toContain('const doubled = _p.value * 2')
  })

  test('a `let` body destructure is never treated as a live alias (reassignment stays a real local)', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      function Child(props: { count: number }) {
        let { count } = props
        count += 1
        createEffect(() => {
          console.log(count)
        })
        return <span>{count}</span>
      }
    `
    const { content } = compileClientJs(source, 'Child.tsx')
    expect(content).toMatch(/let count = _p\.count/)
    expect(content).toContain('count += 1')
  })

  test('shadowing is preserved: a `.map()` callback param and a handler-local both keep their own binding', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function List(props: { title: string; items: { a: string }[] }) {
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
      function Wrapper(props: { children: unknown }) {
        const { children } = props
        const [open, setOpen] = createSignal(true)
        return <div onClick={() => setOpen(!open())}>{open() ? children : null}</div>
      }
    `
    const { content } = compileClientJs(source, 'Wrapper.tsx')
    expect(content).toContain('const children = _p.children')
  })
})
