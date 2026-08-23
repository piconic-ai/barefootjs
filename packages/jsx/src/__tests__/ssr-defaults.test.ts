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

  test('self-derived signal collision (#2669, shape A): entry stays a PROP entry, not the evaluated signal value', () => {
    // `props.label` and the signal getter `label` share a name — the
    // bare-props-arg form is the only shape where this collides (a
    // destructured-arg `function C({ label })` + `const [label] = ...`
    // is a JS redeclaration error, so it can't happen there). The
    // emitted template reads the stash var `label` as the RAW caller
    // prop and OVERWRITES it with the derived signal value under that
    // SAME name (`{% set label = (label if label is defined else
    // 'Default') %}`). Seeding the stash with the pre-fix `{ value:
    // 'Default' }` (the EVALUATED signal value, discarding `propName`)
    // means a caller-passed `label` can never win — production seeds
    // 'Default', the template sees a non-none value, and keeps it. The
    // fix: this entry must stay a PROP entry (`propName` set, `value:
    // null`) so the template's own `?? 'Default'` guard supplies the
    // real fallback, and a caller-supplied prop still wins via
    // `propName`.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const [label, setLabel] = createSignal(props.label ?? 'Default')
        return <span>{label()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ propName: 'label', value: null })
  })

  test('self-derived signal collision (#2669, shape B): non-idempotent derivation must not seed the pre-fix double-applied value', () => {
    // `(props.count ?? 1) * 2` is NOT idempotent: seeding the stash with
    // the pre-fix EVALUATED value (2, for no caller prop) makes the
    // template's own recompute apply the `* 2` a second time (`2 * 2 =
    // 4`) — wrong even with no caller props at all. Pin that the entry
    // is the RAW-prop shape (`value: null`), not `{ value: 2 }`.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { count?: number }) {
        const [count, setCount] = createSignal((props.count ?? 1) * 2)
        return <span>{count()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ propName: 'count', value: null })
  })

  test('self-derived memo collision (#2669): the same rule applies to a memo whose computation derives from a same-named prop', () => {
    // Same collision, memo flavor: `createMemo(() => (props.label ??
    // 'Default') + n())` — the memo's OWN name (`label`) is the
    // template variable the emitted template both reads (raw prop) and
    // overwrites (derived memo value). `n` is an unrelated ordinary
    // signal and must be unaffected (plain `{ value }` entry, no
    // `propName`).
    const metadata = metadataFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const [n, setN] = createSignal(0)
        const label = createMemo(() => (props.label ?? 'Default') + n())
        return <span>{label()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ propName: 'label', value: null })
    expect(defaults?.n).toEqual({ value: 0 })
  })

  test('NON-self-derived collision (#2669, shape C — out of scope, must be unchanged): signal value still wins, no `propName`', () => {
    // Same-named `label` getter and `label` prop, but the signal's OWN
    // initializer does NOT derive from `props.label` (it's a plain
    // string literal) — the JSX body separately reads `label()` AND
    // `props.label`. That's a template-variable-ALIASING defect (both
    // expressions lower to the same template variable, so no seeding
    // choice can be right for both readers) — a different bug, tracked
    // separately, and this fix must leave it byte-identical: the entry
    // stays the plain evaluated-signal-value shape with no `propName`.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const [label, setLabel] = createSignal('sig')
        return <span>{label()}{props.label}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ value: 'sig' })
  })

  test('self-derived signal collision THROUGH a component-scope const (#2685 review): entry stays a PROP entry', () => {
    // One hop of pure indirection past #2669's shape A: `referencesOwnProp`
    // (built on `collectPropRefs`) only saw a DIRECT `props.<name>` access
    // in the initializer — a `const mid = props.label` sitting between the
    // prop read and `createSignal(mid ?? 'Default')` defeated the
    // detection, so this entry regressed to the pre-#2669 `{ value:
    // 'Default' }` shape (no `propName`) even after the #2669 fix landed.
    // Same fix, widened: `collectPropRefsTransitive` now looks through
    // component-scope const locals.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const mid = props.label
        const [label, setLabel] = createSignal(mid ?? 'Default')
        return <span>{label()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ propName: 'label', value: null })
  })

  test('self-derived memo collision THROUGH a component-scope const (#2685 review)', () => {
    const metadata = metadataFor(`
      'use client'
      import { createMemo } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const mid = props.label
        const label = createMemo(() => mid ?? 'Default')
        return <span>{label()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ propName: 'label', value: null })
  })

  test('multi-hop const chain resolves transitively (#2685 review): `const a = props.x; const b = a`', () => {
    // Two hops of indirection (`b` reads `a`, `a` reads `props.x`) — the
    // signal here is named `count`, a DIFFERENT name from the prop `x`, so
    // this exercises the bare-props safety net's transitive resolution
    // (not the self-derivation `propName` collision path above): `x` must
    // still be seeded, or the template-stash adapters' bare-scalar
    // recompute for `x` aborts at render time (#1297/#2126).
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { x?: number }) {
        const a = props.x
        const b = a
        const [count, setCount] = createSignal(b ?? 1)
        return <span>{count()}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ value: 1 })
    expect(defaults?.x).toEqual({ propName: 'x', value: null })
  })

  test('safety-net seeding sees a prop through a component-scope const (#2685 review)', () => {
    // The #1297/#2126 bare-props safety net (`collectPropRefs` at the
    // bottom of `extractSsrDefaults`) only saw a DIRECT `props.X` access
    // too — this is that same gap, single hop: `const mid = props.initial;
    // createSignal(mid ?? 0)` misses seeding `initial`, which is a
    // `Global symbol "$initial" requires explicit package name` render
    // abort on Perl-strict backends. `count` (the signal's own name) is
    // unrelated to `initial`, so this is NOT the self-collision path —
    // purely the safety net.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Counter(props: { initial?: number }) {
        const mid = props.initial
        const [count, setCount] = createSignal(mid ?? 0)
        return <p>{count()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.count).toEqual({ value: 0 })
    expect(defaults?.initial).toEqual({ propName: 'initial', value: null })
  })

  test('NEGATIVE (#2685 review): a const NOT derived from props keeps the signal-wins behavior', () => {
    // Same-named `label` getter and `label` prop, wrapped in a const — but
    // the const's OWN value doesn't read `props` at all, so
    // `collectPropRefsTransitive` must NOT report a collision here. Must
    // stay the plain evaluated-signal-value shape with no `propName` — the
    // const-chain widening only ever ADDS prop references it finds by
    // actually walking through `props.X`, never invents one.
    //
    // (The value resolves to `null`, not `'sig'`: `tryStaticEval` doesn't
    // bind component-scope const locals into its evaluation `bindings` —
    // see the signal loop's `bindings` comment above — so `mid` itself is
    // unresolved for VALUE purposes independent of this fix; only the
    // separate `propName`-detection walk this test is pinning follows the
    // const chain.)
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const mid = 'sig'
        const [label, setLabel] = createSignal(mid)
        return <span>{label()}{props.label}</span>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    expect(defaults?.label).toEqual({ value: null })
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

  // #2698 review: a property access on a non-plain-object base (an array
  // element bound by `.map()`) must refuse (UNRESOLVED), not silently read
  // `undefined` via `hasOwnProperty` — an array exposes prototype members
  // (`.map`, `.filter`, …) that aren't own properties, so the old guard
  // (`typeof !== 'object'`) let arrays through and misreported them as a
  // real `undefined` value instead of an unrepresentable read.
  test('.map() body property-access on an ARRAY element is UNRESOLVED, not undefined', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C() {
        const [x] = createSignal([[1, 2], [3, 4]].map(t => t.foo))
        return <p>{x()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    // UNRESOLVED aborts the whole `.map()` (not a per-element `null`) —
    // resultToJsonable renders the abort as the same `null` a genuinely
    // undefined value would, but the two paths reach it differently: this
    // pin exists to keep the array case going through the abort path.
    expect(defaults?.x).toEqual({ value: null })
  })

  test('.map() body property-access on a PLAIN-OBJECT element still resolves a missing key to undefined', () => {
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C() {
        const [x] = createSignal([{ a: 1 }, {}].map(t => t.a))
        return <p>{x()}</p>
      }
    `)

    const defaults = extractSsrDefaults(metadata)
    // Unlike the array case, a missing key on a plain object resolves that
    // ONE element to `undefined` (→ `null`) and the `.map()` keeps going —
    // it does not abort the whole computation.
    expect(defaults?.x).toEqual({ value: [1, null] })
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

  test('self-derived signal collision (#2669): the caller-supplied prop now wins, and an absent prop falls back to null', () => {
    // End-to-end proof of the fix's effect at the `deriveStashFromDefaults`
    // layer: run the real `extractSsrDefaults` output for shape A through
    // the seeding function. Pre-fix, this entry was `{ value: 'Default' }`
    // (propName-less) so a caller's `label: 'Hello'` was IGNORED —
    // `deriveStashFromDefaults` had no `propName` to resolve against and
    // always used the static value. Post-fix the entry is a PROP entry, so
    // the caller's value wins, and an absent prop resolves to the RAW
    // fallback `null` (not the old evaluated `'Default'`) — the emitted
    // template's own `?? 'Default'` guard supplies the real default from
    // there.
    const metadata = metadataFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { label?: string }) {
        const [label, setLabel] = createSignal(props.label ?? 'Default')
        return <span>{label()}</span>
      }
    `)
    const defaults = extractSsrDefaults(metadata)!

    expect(deriveStashFromDefaults(defaults, { label: 'Hello' })).toEqual({ label: 'Hello' })
    expect(deriveStashFromDefaults(defaults, {})).toEqual({ label: null })
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
