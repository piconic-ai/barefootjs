/**
 * Move B (#2760's follow-up): destructured props stay reactive.
 *
 * Replaces the deleted BF043 describe block (`props-destructuring.test.ts`)
 * conceptually — instead of pinning a warning that steered users away from
 * destructuring, this pins that destructuring no longer needs a warning at
 * all. Every value-position read of a destructured prop name in the
 * compiled `init*` body now compiles to a live `_p.<key>` read (or
 * `(_p.<key> ?? <fallback>)`), the same shape `props.xxx` access already
 * compiled to — see `props-binding.ts`'s `livePropReadExpr` and
 * `ir-to-client-js/rewrite-destructured-props.ts`'s
 * `rewriteDestructuredPropReads`.
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

describe('destructured props compile to live reads (Move B)', () => {
  test('BF043 no longer exists as an error code', () => {
    // Retired — Move B made the warning it described untrue. Checked by
    // string value (not by referencing a removed `ErrorCodes` key, which
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
