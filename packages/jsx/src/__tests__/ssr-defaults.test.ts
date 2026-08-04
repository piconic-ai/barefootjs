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
import { extractSsrDefaults, deriveStashFromDefaults } from '../ssr-defaults'
import type { SsrDefault } from '../ssr-defaults'
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

  test('seeds every declared bare-props prop, including direct template reads (#2126)', () => {
    // Template-stash adapters flatten `props.label` to the bare scalar
    // `$label` even when no signal/memo references it (`<%= $label %>` in
    // the body), so a prop the caller forgets to pass must still exist in
    // the stash. Every prop declared on the props type gets an entry —
    // not just the ones a signal / memo initializer reads.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Greeting(props: { label?: string }) {
        const [n, setN] = createSignal(0)
        return <div><p>{props.label}</p><button onClick={() => setN(n() + 1)}>{n()}</button></div>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ propName: 'label', value: null })
    expect(defaults?.n).toEqual({ value: 0 })
  })

  test('aliased destructured prop (#2460): `propName` is the CALLER-facing key, not the local binding', () => {
    // `{ n: count }` — the caller passes `n`, the template variable (and
    // stash entry key) is the local binding `count`. The manifest
    // consumer (`_derive_stash_from_defaults` in the Perl runtime) reads
    // the caller's props by `propName`, so `propName` must be `n`, not
    // `count` — using the local name here silently drops the caller's
    // value (the stash entry falls back to the static `value`, `null`).
    const metadata = metadataFor(`
      function Badge({ text, n: count }: { text: string; n: number }) {
        return <span>{text}:{count}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults).toBeDefined()
    // Keyed by the LOCAL binding (the template variable name)...
    expect(defaults?.count).toEqual({ propName: 'n', value: null })
    // ...but `propName` is the CALLER-facing key.
    expect(defaults?.text).toEqual({ propName: 'text', value: null })
  })

  test('aliased destructured prop with a default (#2460): `propName` still resolves to the source key', () => {
    const metadata = metadataFor(`
      function Badge({ n: count = 7 }: { n?: number }) {
        return <span>{count}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ propName: 'n', value: 7 })
  })

  test('un-aliased destructured prop (regression): `propName` equals the local name', () => {
    const metadata = metadataFor(`
      function Badge({ text, n }: { text: string; n: number }) {
        return <span>{text}:{n}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.n).toEqual({ propName: 'n', value: null })
    expect(defaults?.text).toEqual({ propName: 'text', value: null })
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

// TS twin of the Ruby/Python/PHP/Perl/Rust `derive*FromDefaults` runtime
// ports (#2524 SSR half). Matches `derive_vars_from_defaults`'s edge cases
// exactly — see that Ruby method's docstring
// (packages/adapter-erb/lib/barefoot_js.rb:337-360) for the reference
// semantics this mirrors.
describe('deriveStashFromDefaults', () => {
  test('aliased prop: resolves the CALLER-facing propName, not the local key', () => {
    // `{ n: count }` — extractSsrDefaults keys the entry by the LOCAL
    // binding (`count`) with `propName: 'n'`. The caller supplies `n`.
    const defaults: Record<string, SsrDefault> = {
      count: { propName: 'n', value: null },
    }
    expect(deriveStashFromDefaults(defaults, { n: 7 })).toEqual({ count: 7 })
  })

  test('un-aliased prop: propName equals the local key, resolves the same way', () => {
    const defaults: Record<string, SsrDefault> = {
      n: { propName: 'n', value: null },
    }
    expect(deriveStashFromDefaults(defaults, { n: 7 })).toEqual({ n: 7 })
  })

  test('caller omits the prop: falls back to the static default value', () => {
    const defaults: Record<string, SsrDefault> = {
      count: { propName: 'n', value: 3 },
    }
    expect(deriveStashFromDefaults(defaults, {})).toEqual({ count: 3 })
  })

  test('caller supplies null / undefined for the propName: falls back to the static value', () => {
    // Mirrors every runtime port's "present AND defined" check — an
    // explicit null/undefined caller value does not count as an override.
    const defaults: Record<string, SsrDefault> = {
      count: { propName: 'n', value: 3 },
    }
    expect(deriveStashFromDefaults(defaults, { n: null })).toEqual({ count: 3 })
    expect(deriveStashFromDefaults(defaults, { n: undefined })).toEqual({ count: 3 })
  })

  test('caller supplies a falsy-but-defined propName value: the caller value wins', () => {
    // `0` / `''` / `false` are legitimate override values, not "absent".
    const defaults: Record<string, SsrDefault> = {
      count: { propName: 'n', value: 99 },
    }
    expect(deriveStashFromDefaults(defaults, { n: 0 })).toEqual({ count: 0 })
  })

  test('propName-less entry (signal / memo local): always uses the static value', () => {
    // A caller cannot override an internal signal/memo by construction —
    // even a same-named caller prop must not leak in.
    const defaults: Record<string, SsrDefault> = {
      doubled: { value: 10 },
    }
    expect(deriveStashFromDefaults(defaults, { doubled: 999 })).toEqual({ doubled: 10 })
  })

  test('isRestProps entry: prefers the caller-assembled rest bag under its OWN key', () => {
    const defaults: Record<string, SsrDefault> = {
      rest: { isRestProps: true, value: {} },
    }
    expect(deriveStashFromDefaults(defaults, { rest: { href: '/x' } })).toEqual({
      rest: { href: '/x' },
    })
  })

  test('isRestProps entry: falls back to the static value (normally {}) when the caller supplied none', () => {
    const defaults: Record<string, SsrDefault> = {
      rest: { isRestProps: true, value: {} },
    }
    expect(deriveStashFromDefaults(defaults, {})).toEqual({ rest: {} })
  })

  test('isRestProps entry: an explicit `undefined` caller value still counts as supplied', () => {
    // Unlike the ordinary propName branch (nullish check), the isRestProps
    // branch tests presence via `in` — the rest bag is a caller-assembled
    // aggregate, not a single scalar with a meaningful "absent" state, so
    // an explicit `undefined` still wins over the static fallback instead
    // of falling through to it.
    const defaults: Record<string, SsrDefault> = {
      rest: { isRestProps: true, value: { fallback: true } },
    }
    const result = deriveStashFromDefaults(defaults, { rest: undefined })
    expect('rest' in result).toBe(true)
    expect(result.rest).toBeUndefined()
  })

  test('a bare (non-object) entry passes through as-is', () => {
    // Defensive parity with every runtime port's `ref($d) eq 'HASH'` /
    // `isinstance(d, dict)` guard — never emitted by `extractSsrDefaults`
    // itself, but a caller may hand this a manifest round-tripped through a
    // generic JSON domain.
    const defaults = { flag: true } as unknown as Record<string, SsrDefault>
    expect(deriveStashFromDefaults(defaults, {})).toEqual({ flag: true })
  })

  test('a literal null entry hits the same non-object passthrough guard', () => {
    // `d === null` is checked ALONGSIDE `typeof d !== 'object'` (not just
    // the latter) — `typeof null === 'object'` in JS, so without the
    // explicit `d === null` check a null entry would wrongly fall into the
    // object-shaped branches below and throw reading `d.isRestProps`.
    const defaults = { flag: null } as unknown as Record<string, SsrDefault>
    expect(deriveStashFromDefaults(defaults, {})).toEqual({ flag: null })
  })

  test('mixed defaults map resolves every entry kind independently', () => {
    const defaults: Record<string, SsrDefault> = {
      count: { propName: 'n', value: null },
      text: { propName: 'text', value: null },
      doubled: { value: 0 },
      rest: { isRestProps: true, value: {} },
    }
    expect(
      deriveStashFromDefaults(defaults, { n: 7, rest: { extra: 'x' } }),
    ).toEqual({
      count: 7,
      text: null,
      doubled: 0,
      rest: { extra: 'x' },
    })
  })
})
