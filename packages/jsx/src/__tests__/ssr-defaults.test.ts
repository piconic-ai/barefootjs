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
})
