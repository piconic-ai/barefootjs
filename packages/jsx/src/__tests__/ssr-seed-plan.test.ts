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

  test('block-bodied memo → opaque (v1 gates to expression-bodied memos)', () => {
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
    expect(label.kind).toBe('opaque')
    if (label.kind === 'opaque') expect(label.origin).toBe('memo')
  })

  test('unsupported body (object literal) → opaque', () => {
    const plan = planFor(`
      'use client'
      import { createMemo, createSignal } from '@barefootjs/client'
      function C() {
        const [n, setN] = createSignal(1)
        const obj = createMemo(() => ({ value: n() }))
        return <p>{obj().value}</p>
      }
    `)

    expect(step(plan, 'obj').kind).toBe('opaque')
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
})
