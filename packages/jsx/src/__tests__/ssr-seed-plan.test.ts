// Backend-neutral SSR seed plan (`computeSsrSeedPlan`, attached to
// `IRMetadata.ssrSeedPlan` by `buildMetadata`). The plan ports the
// derived/opaque/env-reader scope analysis the template adapters' seed paths
// perform, so these tests pin the decision rules against metadata built by
// the real pipeline (`analyzeComponent` + `buildMetadata`).

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import type { SsrSeedPlan, SsrSeedStep } from '../ssr-seed-plan'

function planFor(source: string, componentName?: string): SsrSeedPlan {
  const ctx = analyzeComponent(source, 'test.tsx', componentName)
  const plan = buildMetadata(ctx).ssrSeedPlan
  expect(plan).toBeDefined()
  return plan!
}

function step(plan: SsrSeedPlan, name: string): SsrSeedStep {
  const found = plan.steps.find(s => s.name === name)
  expect(found).toBeDefined()
  return found!
}

describe('computeSsrSeedPlan', () => {
  test('getter aliases seed after their prop-derived memo, including alias hops', () => {
    const plan = planFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function App(props: { count: number }) {
        const [n] = createSignal(1.5)
        const total = createMemo(() => n() + props.count)
        const totalAlias = total
        const secondAlias = totalAlias
        return <p>{totalAlias()}{secondAlias()}</p>
      }
    `)
    expect(plan.steps.map(s => s.name)).toEqual(['n', 'total', 'totalAlias', 'secondAlias'])
    for (const name of ['totalAlias', 'secondAlias']) {
      const alias = step(plan, name)
      expect(alias.kind).toBe('derived')
      if (alias.kind === 'derived') {
        expect(alias.parsed).toEqual({ kind: 'call', callee: { kind: 'identifier', name: 'total' }, args: [] })
        expect(alias.frees).toContain('total')
      }
    }
  })

  test('env signal (aliased) → env-reader step; derived memo over it', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSearchParams } from '@barefootjs/client'
      function List() {
        const [sp] = createSearchParams()
        const sort = createMemo(() => sp().get('sort') ?? 'date')
        return <p>{sort()}</p>
      }
    `)

    const sp = step(plan, 'sp')
    expect(sp.kind).toBe('env-reader')
    if (sp.kind === 'env-reader') {
      expect(sp.reader.canonicalName).toBe('searchParams')
      expect(sp.reader.key).toBe('search')
    }

    const sort = step(plan, 'sort')
    expect(sort.kind).toBe('derived')
    if (sort.kind === 'derived') {
      expect(sort.origin).toBe('memo')
      expect(sort.frees).toEqual(['sp'])
      expect(sort.expr).toBe("sp().get('sort') ?? 'date'")
      expect(sort.parsed).toBeDefined()
    }
  })

  test('chained memos in a props-object component: declaration order, scope accumulates', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSearchParams } from '@barefootjs/client'
      function List(props: { items: { tag: string; name: string }[] }) {
        const [sp] = createSearchParams()
        const tag = createMemo(() => sp().get('tag') ?? '')
        const visible = createMemo(() => props.items.filter((p) => p.tag === tag()))
        return <ul>{visible().map((i) => <li>{i.name}</li>)}</ul>
      }
    `)

    expect(plan.baseScope).toContain('props')
    expect(plan.steps.map(s => s.name)).toEqual(['sp', 'tag', 'visible'])

    expect(step(plan, 'tag').kind).toBe('derived')
    const visible = step(plan, 'visible')
    expect(visible.kind).toBe('derived')
    if (visible.kind === 'derived') {
      for (const free of visible.frees) {
        expect(['props', 'tag']).toContain(free)
      }
    }
  })

  test('forward reference to a later memo → opaque; the later memo itself is derived', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [n, setN] = createSignal(1)
        const early = createMemo(() => late() + 1)
        const late = createMemo(() => n() * 2)
        return <p>{early()}</p>
      }
    `)

    expect(step(plan, 'early').kind).toBe('opaque')
    expect(step(plan, 'late').kind).toBe('derived')
  })

  test('self reference → opaque (name enters scope only after its own step)', () => {
    const plan = planFor(`
      'use client'
      import { createMemo } from '@barefootjs/client'
      function C() {
        const loop = createMemo(() => loop())
        return <p>{loop()}</p>
      }
    `)

    expect(step(plan, 'loop').kind).toBe('opaque')
  })

  test('shadowed callback param leaking as an outer free identifier → opaque', () => {
    const plan = planFor(`
      'use client'
      import { createMemo } from '@barefootjs/client'
      function C(props: { items: { ok: boolean }[] }) {
        const bad = createMemo(() => props.items.filter((p) => p.ok) && p)
        return <p>{bad()}</p>
      }
    `)

    expect(step(plan, 'bad').kind).toBe('opaque')
  })

  test('module string const counts as base scope; memo referencing it is derived', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      const activeCls = 'text-bold'
      function C() {
        const [on, setOn] = createSignal(false)
        const cls = createMemo(() => on() ? activeCls : 'text-dim')
        return <p class={cls()}>x</p>
      }
    `, 'C')

    expect(plan.baseScope).toContain('activeCls')
    const cls = step(plan, 'cls')
    expect(cls.kind).toBe('derived')
    if (cls.kind === 'derived') {
      expect(cls.frees).toContain('on')
      expect(cls.frees).toContain('activeCls')
    }
  })

  test('block-bodied memo → derived from its fold (#3523)', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [on, setOn] = createSignal(false)
        const label = createMemo(() => {
          const v = on()
          return v ? 'yes' : 'no'
        })
        return <p>{label()}</p>
      }
    `)

    const label = step(plan, 'label')
    expect(label.kind).toBe('derived')
    if (label.kind === 'derived') expect(label.frees).toContain('on')
  })

  test('block-bodied memo that does not fold → opaque', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [on, setOn] = createSignal(false)
        const label = createMemo(() => {
          let n = 0
          for (const x of [1, 2]) n += x
          return on() ? n : 0
        })
        return <p>{label()}</p>
      }
    `)

    const label = step(plan, 'label')
    expect(label.kind).toBe('opaque')
    if (label.kind === 'opaque') expect(label.origin).toBe('memo')
  })

  test.each([
    ["(label = 'inner') => label"],
    ["(label = 'inner') => { const k = label\n return k }"],
  ])('memo callback with a parameter → opaque: %s', (callback) => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C({ label }: { label: string }) {
        const [on] = createSignal(false)
        const m = createMemo(${callback})
        return <p>{m()}{on() ? 'y' : 'n'}</p>
      }
    `)
    expect(step(plan, 'm').kind).toBe('opaque')
  })

  test('block memo with a /* @client */ directive → opaque', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [date] = createSignal<Date | undefined>(undefined)
        const label = createMemo(() => {
          const d = date()
          if (!d) return 'none'
          return /* @client */ d.toLocaleDateString('en-US')
        })
        return <p>{label()}</p>
      }
    `)
    expect(step(plan, 'label').kind).toBe('opaque')
  })

  test('object-literal body → derived (#2696: value-position object literal, isSupportedValue)', () => {
    // Was `opaque` before `checkSupport` gained its `pos` parameter — a
    // memo's WHOLE body is a value position (an assignment, never a
    // render), so an object literal there is exactly the shape
    // `isSupportedValue` now admits (every property value — here `n()` —
    // is itself supported).
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [n, setN] = createSignal(1)
        const obj = createMemo(() => ({ value: n() }))
        return <p>{obj().value}</p>
      }
    `)

    const obj = step(plan, 'obj')
    expect(obj.kind).toBe('derived')
    if (obj.kind === 'derived') {
      expect(obj.origin).toBe('memo')
      expect(obj.frees).toEqual(['n'])
    }
  })

  test('literal signal init → derived with empty frees (constant-skip is emit-side)', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C() {
        const [v, setV] = createSignal('b')
        return <p>{v()}</p>
      }
    `)

    const v = step(plan, 'v')
    expect(v.kind).toBe('derived')
    if (v.kind === 'derived') {
      expect(v.origin).toBe('signal')
      expect(v.frees).toEqual([])
      expect(v.expr).toBe("'b'")
    }
  })

  test('prop-derived signal init → derived with the prop free', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Toggle(props: { defaultOn?: boolean }) {
        const [on, setOn] = createSignal(props.defaultOn ?? false)
        return <button aria-pressed={on()}>t</button>
      }
    `)

    expect(plan.baseScope).toContain('props')
    const on = step(plan, 'on')
    expect(on.kind).toBe('derived')
    if (on.kind === 'derived') {
      expect(on.origin).toBe('signal')
      expect(on.frees).toEqual(['props'])
    }
  })

  test('prop-derived signal init THROUGH a component-scope const (#2685 review): still derived, resolves to the prop free', () => {
    // Pre-fix, `mid` (a component-scope const, not part of `baseScope`)
    // was a free identifier `classify` couldn't find in `available`, so
    // this step fell to `opaque` — no adapter emits an in-template
    // recompute for it at all (a DIFFERENT, worse-than-#2669 defect: even
    // with `propName` restored on the manifest side, an absent caller prop
    // would render permanently empty instead of the signal's own
    // `'Default'`). `resolveThroughLocalConsts` inlines `mid` to
    // `props.defaultOn` before classification, so this now derives exactly
    // like the direct-access form above.
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Toggle(props: { defaultOn?: boolean }) {
        const mid = props.defaultOn
        const [on, setOn] = createSignal(mid ?? false)
        return <button aria-pressed={on()}>t</button>
      }
    `)

    const on = step(plan, 'on')
    expect(on.kind).toBe('derived')
    if (on.kind === 'derived') {
      expect(on.origin).toBe('signal')
      // The RESOLVED free set names `props` (what the inlined form reads),
      // never the intermediate const `mid` — a consumer emitting `on`'s
      // seed line never needs to know `mid` existed.
      expect(on.frees).toEqual(['props'])
    }
  })

  test('a seed calling a zero-param local arrow helper derives through its body (#3562)', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { mode?: string; label?: string }) {
        const isWide = () => props.mode === 'wide'
        const [shown] = createSignal(isWide() ? props.label : 'narrow')
        return <p>{shown()}</p>
      }
    `)
    const shown = step(plan, 'shown')
    expect(shown.kind).toBe('derived')
    if (shown.kind === 'derived') expect(shown.frees).toEqual(['props'])
  })

  test('a helper whose body a callback param would capture stays opaque (#3562)', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { items: string[]; tag?: string }) {
        const tag = props.tag
        const matches = () => tag === 'x'
        const [n] = createSignal(props.items.filter(tag => matches()).length)
        return <p>{n()}</p>
      }
    `)
    expect(step(plan, 'n').kind).toBe('opaque')
  })

  test.each([
    ['an async arrow', 'const helper = async () => props.flag'],
    ['a generator function', 'const helper = function* () { return props.flag }'],
    ['a body that mutates state', 'let n = 0\n        const helper = () => (n += 1)'],
  ])('a helper call to %s stays opaque (#3562 review)', (_label, decl) => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { flag?: boolean }) {
        ${decl}
        const [shown] = createSignal(helper() ? 'yes' : 'no')
        return <p>{shown()}</p>
      }
    `)
    expect(step(plan, 'shown').kind).toBe('opaque')
  })

  test('a helper that takes params is not inlined at a call site (#3562)', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { mode?: string }) {
        const is = (m: string) => props.mode === m
        const [wide] = createSignal(is('wide'))
        return <p>{String(wide())}</p>
      }
    `)
    expect(step(plan, 'wide').kind).toBe('opaque')
  })

  test('multi-hop const chain THROUGH TWO component-scope consts (#2685 review): still derived', () => {
    const plan = planFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function C(props: { x?: number }) {
        const a = props.x
        const b = a
        const [count, setCount] = createSignal(b ?? 1)
        return <p>{count()}</p>
      }
    `)

    const count = step(plan, 'count')
    expect(count.kind).toBe('derived')
    if (count.kind === 'derived') {
      expect(count.frees).toEqual(['props'])
    }
  })

  test('const chain that bottoms out on an UNAVAILABLE name → opaque (fails safe, not a wrong substitution)', () => {
    // `mid` inlines to `laterMemo`, a memo declared AFTER `on` in source —
    // per the plan's ordering guarantee, `laterMemo` is not yet in
    // `available` when `on` is classified, so this must stay `opaque`
    // exactly like a direct forward-reference would (mirrors the existing
    // "forward reference … → opaque" case above, one hop of const
    // indirection removed).
    const plan = planFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      function C() {
        const mid = laterMemo()
        const [on, setOn] = createSignal(mid ?? false)
        const laterMemo = createMemo(() => true)
        return <button aria-pressed={on()}>{laterMemo()}</button>
      }
    `)

    const on = step(plan, 'on')
    expect(on.kind).toBe('opaque')
  })

  test('a derived step reading only inlined module consts, or nothing, is constant (#3542)', () => {
    const plan = planFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      const PREFIX = 'pre'
      function C(props: { label: string }) {
        const [first] = createSignal([{ a: 'p' }].map((t) => t.a).join(','))
        const [tagged] = createSignal(PREFIX + '-x')
        const [label] = createSignal(props.label + '!')
        const both = createMemo(() => PREFIX + first())
        return <p>{first()}{tagged()}{label()}{both()}</p>
      }
    `)
    const constantOf = (name: string) => {
      const s = step(plan, name)
      return s.kind === 'derived' ? s.constant : null
    }
    expect(constantOf('first')).toBe(true)
    expect(constantOf('tagged')).toBe(true)
    expect(constantOf('label')).toBe(false)
    expect(constantOf('both')).toBe(false)
  })
})
