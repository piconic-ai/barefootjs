/**
 * A CSR-materialised child must run its `init` while CONNECTED, so
 * `useContext` resolves by DOM position instead of falling back to the
 * global context store.
 *
 * `createComponent` builds the element with `parseHTML(...).firstChild`
 * and calls `initFn` on it before any caller has attached it (see
 * `component.ts`'s step 6 → step 9). `useContext`'s ancestor walk
 * therefore finds nothing and drops to `contextStore`, which is
 * last-writer-wins across every provider of that context on the page.
 *
 * Why the bug hides during a plain hydration pass: the doc-order walker
 * inits each provider immediately before creating its own children, so
 * the global store still happens to hold that provider's value. The
 * divergence only surfaces when a child is materialised LATER — after a
 * sibling provider has overwritten the global — which is what an
 * interaction that mounts a new child does. That is the shape this test
 * pins: two providers of one context, then a late child mount under the
 * FIRST one.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('CSR child init runs connected (context resolves by position)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a late-mounted child sees its own provider, not the last one on the page', async () => {
    const { hydrate, flushHydration, upsertChild, createContext, useContext, provideContext } =
      await import('../../src/runtime')

    const ctx = createContext<string>('DEFAULT')

    /** Records `[childTag, contextValueSeenDuringInit]`. */
    const seen: Array<[string, string]> = []
    /** Child mounts deferred to simulate a later interaction. */
    const laterMounts: Array<() => void> = []

    hydrate('CtxKid', {
      init: (el: Element, props: any) => {
        seen.push([props.tag, useContext(ctx)])
      },
      template: () => `<b>kid</b>`,
    })

    hydrate('CtxProv', {
      init: (el: Element, props: any) => {
        provideContext(ctx, props.value)
        // Child mounted during this init pass — the global store still
        // holds this provider's value, so this one is right either way.
        upsertChild(el, 'CtxKid', 's0', { tag: `${props.value}:during` })
        // Child mounted after every provider has run.
        laterMounts.push(() => {
          upsertChild(el, 'CtxKid', 's1', { tag: `${props.value}:later` })
        })
      },
      template: () =>
        `<div><span data-bf-ph="s0"></span><span data-bf-ph="s1"></span></div>`,
    })

    // Two SSR-rendered providers of the SAME context, each with its own
    // CSR placeholders for children.
    document.body.innerHTML = `
      <div bf-s="CtxProv_one" bf-p='{"value":"ONE"}'>
        <span data-bf-ph="s0"></span><span data-bf-ph="s1"></span>
      </div>
      <div bf-s="CtxProv_two" bf-p='{"value":"TWO"}'>
        <span data-bf-ph="s0"></span><span data-bf-ph="s1"></span>
      </div>
    `

    flushHydration()

    // Both providers have now run; the global store holds "TWO".
    expect(seen).toEqual([
      ['ONE:during', 'ONE'],
      ['TWO:during', 'TWO'],
    ])

    seen.length = 0
    for (const mount of laterMounts) mount()

    // Each late child must see the provider it is nested under.
    // Pre-fix, 'ONE:later' saw 'TWO' — its init ran detached, so the
    // ancestor walk failed and the global store answered instead.
    expect(seen).toEqual([
      ['ONE:later', 'ONE'],
      ['TWO:later', 'TWO'],
    ])
  })

  test('a CSR child is connected by the time its init observes the DOM', async () => {
    const { hydrate, flushHydration, upsertChild } = await import('../../src/runtime')

    const connectedAtInit: boolean[] = []

    hydrate('ConnKid', {
      init: (el: Element) => {
        connectedAtInit.push(el.isConnected)
      },
      template: () => `<b>kid</b>`,
    })

    hydrate('ConnHost', {
      init: (el: Element) => {
        upsertChild(el, 'ConnKid', 's0', {})
      },
      template: () => `<div><span data-bf-ph="s0"></span></div>`,
    })

    document.body.innerHTML =
      `<div bf-s="ConnHost_a"><span data-bf-ph="s0"></span></div>`

    flushHydration()

    // Pre-fix: [false] — init ran on the element returned by
    // `parseHTML(...).firstChild`, before `ph.replaceWith(comp)`.
    expect(connectedAtInit).toEqual([true])
  })

  test('the ComponentDef path honours mountAt too, not just the registry path', async () => {
    const { createComponent } = await import('../../src/runtime')

    // `createComponent` accepts a `ComponentDef` directly (CSR mode, no
    // registry lookup). That branch returns early, so it needs its own
    // connect-before-init — otherwise `mountAt` would be a registry-only
    // guarantee and `def.init` would still run detached. Pinned here so the
    // two modes cannot drift apart silently.
    const connectedAtInit: boolean[] = []

    const host = document.createElement('div')
    const placeholder = document.createElement('span')
    host.appendChild(placeholder)
    document.body.appendChild(host)

    const el = createComponent(
      {
        name: 'DefKid',
        init: (node: Element) => { connectedAtInit.push(node.isConnected) },
        template: () => `<b>def-kid</b>`,
      } as any,
      {},
      undefined,
      undefined,
      placeholder,
    )

    expect(connectedAtInit).toEqual([true])
    // And the placeholder really was consumed, exactly once.
    expect(placeholder.parentNode).toBeNull()
    expect(host.innerHTML).toBe('<b bf-s="DefKid_' + el.getAttribute('bf-s')!.split('_')[1] + '">def-kid</b>')
  })
})
