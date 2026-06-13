// Static SSR-defaults extraction (issue #1416).
//
// The extractor walks an IRMetadata produced by `buildMetadata` and
// returns the JSON-encodable seed map the build pipeline embeds in
// each manifest entry. We assert it covers the three patterns that
// matter end-to-end for the Mojo scaffold:
//
//   - Prop destructure defaults (`variant = 'default'`) for UI
//     registry components.
//   - The rest-props bag (`...props`) modeled as an empty hash.
//   - Signal initial values whose only free identifier is the props
//     parameter (`createSignal(props.initial ?? 99)`), and memo
//     computations that derive from those signals (`count() * 2`).

import { describe, test, expect } from 'bun:test'
import { extractSsrDefaults } from '../ssr-defaults'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'

function metadataFor(source: string, componentName?: string) {
  const ctx = analyzeComponent(source, 'test.tsx', componentName)
  return buildMetadata(ctx)
}

describe('extractSsrDefaults', () => {
  test('destructured prop defaults extract literal values', () => {
    const metadata = metadataFor(`
      function Badge({
        variant = 'default',
        asChild = false,
        className = '',
        ...props
      }: { variant?: string; asChild?: boolean; className?: string }) {
        return <span className={className} {...props}>x</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults).toBeDefined()
    expect(defaults?.variant).toEqual({ propName: 'variant', value: 'default' })
    expect(defaults?.asChild).toEqual({ propName: 'asChild', value: false })
    expect(defaults?.className).toEqual({ propName: 'className', value: '' })
    expect(defaults?.props).toEqual({ isRestProps: true, value: {} })
  })

  test('signal initial value with `?? <literal>` extracts the RHS', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Counter(props: { initial?: number }) {
        const [count, setCount] = createSignal(props.initial ?? 99)
        return <p>{count()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults).toBeDefined()
    expect(defaults?.count).toEqual({ value: 99 })
  })

  test('seeds a bare-props prop a signal initializer reads (`props.initial`)', () => {
    // The #1297 prop-derived seeding lowers `createSignal(props.initial ?? 0)`
    // to a *bare scalar* recompute in the template (`my $count = ($initial
    // // 0)`), so `$initial` must be a stash var or Perl strict aborts with
    // `Global symbol "$initial" requires explicit package name`. The
    // bare-props-arg form previously skipped all props; this regression
    // guards that the referenced prop is now seeded (as undef → the
    // recompute's `?? 0` supplies the real fallback).
    const metadata = metadataFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function Counter(props: { initial?: number }) {
        const [count, setCount] = createSignal(props.initial ?? 0)
        const doubled = createMemo(() => count() * 2)
        return <p>{count()}{doubled()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ value: 0 })
    expect(defaults?.doubled).toEqual({ value: 0 })
    expect(defaults?.initial).toEqual({ propName: 'initial', value: null })
  })

  test('memo derived from a signal evaluates through the chain', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function Counter(props: { initial?: number }) {
        const [count, setCount] = createSignal(props.initial ?? 5)
        const doubled = createMemo(() => count() * 2)
        return <p>{doubled()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults).toBeDefined()
    expect(defaults?.count).toEqual({ value: 5 })
    expect(defaults?.doubled).toEqual({ value: 10 })
  })

  test('block-body memo with an early-return guard folds to the default-state branch (#1897)', () => {
    // The data-table `sortedData` shape: a `/* @client */`-guarded sort
    // whose early return yields the unsorted module-const array when the
    // sort-key signal is at its initial (null) value. The SSR default is
    // that early-return array, not `null` — the `if (!key)` guard is
    // taken because `sortKey()` resolves to its seeded `null` initial.
    const metadata = metadataFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      const rows = [{ id: 'a' }, { id: 'b' }]
      function Table() {
        const [sortKey, setSortKey] = createSignal<string | null>(null)
        const sorted = createMemo(() => {
          const key = sortKey()
          if (!key) return rows
          return /* @client */ [...rows].sort((a, b) => a.id < b.id ? -1 : 1)
        })
        return <ul>{sorted().map(r => <li>{r.id}</li>)}</ul>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.sorted).toEqual({ value: [{ id: 'a' }, { id: 'b' }] })
  })

  test('non-evaluable initials yield null (caller falls back at render time)', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { lookup } from './lookup'
      function Foo() {
        const [s, setS] = createSignal(lookup())
        return <p>{s()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.s).toEqual({ value: null })
  })

  test('no props / signals / memos → undefined (no entry in manifest)', () => {
    const metadata = metadataFor(`
      function Empty() {
        return <p>hello</p>
      }
    `)

    expect(extractSsrDefaults(metadata)).toBeUndefined()
  })

  test('numeric arithmetic flows through evaluation', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function Bar(props: { a?: number }) {
        const [count, setCount] = createSignal(props.a ?? 3)
        const squared = createMemo(() => count() * count())
        return <p>{squared()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ value: 3 })
    expect(defaults?.squared).toEqual({ value: 9 })
  })

  // (#checkbox) A className memo interpolating module string consts — incl. a
  // `[...].join(' ')` const — plus `props.className ?? ''` resolves to a
  // concrete string so the SSR `class="..."` renders the full token list
  // (Checkbox's `classes` memo). Without seeding module consts / evaluating
  // `.join`, the memo collapsed to `null` and the class attribute rendered
  // empty.
  test('module-const + join template-literal className memo resolves to a string', () => {
    const metadata = metadataFor(`
      'use client'
      import { createMemo } from '@barefootjs/client'
      const base = 'a b'
      const states = ['c', 'd'].join(' ')
      function Box(props: { tone?: string }) {
        const classes = createMemo(() => \`\${base} \${states} \${props.className ?? ''} tail\`)
        return <button class={classes()}>x</button>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    // props.className is undefined → `?? ''` → '' → 'a b c d  tail' (the double
    // space mirrors Hono's empty-className interpolation).
    expect(defaults?.classes).toEqual({ value: 'a b c d  tail' })
  })
})
