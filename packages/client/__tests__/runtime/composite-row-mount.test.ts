/**
 * Connect-before-init for template-clone loop rows, and the things that
 * attaching a row early could plausibly break.
 *
 * Each body below mirrors what the compiler emits for a composite row: clone,
 * `mountRowRoot`, then the tail that initialises the row's children. The point
 * of the mount is that the tail runs against a connected element — `useContext`
 * resolves by walking `parentElement`, so a child that inits inside a detached
 * row finds no ancestors and falls through to the global last-writer-wins
 * context store, silently reading another provider's value.
 *
 * The rest of these are the adversarial cases. Attaching a row earlier than
 * before puts it in front of the reconciler, the multi-root lookup, and the
 * duplicate-key and failure paths, all of which previously only ever saw
 * detached rows.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { BF_LOOP_START, BF_LOOP_END } from '@barefootjs/shared'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

/** A loop container with real range markers, as SSR emits them. */
function loopContainer() {
  const ul = document.createElement('ul')
  document.body.appendChild(ul)
  ul.appendChild(document.createComment(`${BF_LOOP_START}:l0`))
  ul.appendChild(document.createComment(`${BF_LOOP_END}:l0`))
  return ul
}

describe('composite loop rows connect before their tail runs', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a row reads its OWN provider, not the last one on the page', async () => {
    const {
      hydrate, mapArray, createSignal, createContext, useContext, provideContext,
      upsertChild, setCurrentScope, mountRowRoot,
    } = await import('../../src/runtime')

    const ctx = createContext<string>('DEFAULT')
    const seen: string[] = []
    hydrate('Chip', {
      init: () => { seen.push(useContext(ctx) as string) },
      template: () => `<span>c</span>`,
    })

    // Two providers of the same context. B provides last, so it owns the
    // global fallback that a detached lookup would land on.
    function host(label: string) {
      const h = document.createElement('div')
      document.body.appendChild(h)
      const ul = document.createElement('ul')
      h.appendChild(ul)
      const prev = setCurrentScope(h)
      provideContext(ctx, label)
      setCurrentScope(prev)
      return ul
    }
    const ulA = host('A')
    host('B')

    const [items] = createSignal([{ id: '1' }])
    mapArray(() => items(), ulA, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li data-key="${item().id}"><div data-bf-ph="s0"></div></li>`
        const el = mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement
        upsertChild(el, 'Chip', 's0', {})
        return el
      }, 'l0')

    // Reads 'B' — the wrong provider — if the row inits detached.
    expect(seen).toEqual(['A'])
  })

  test('each row gets its own child, not a neighbour\'s', async () => {
    const { hydrate, mapArray, createSignal, upsertChild, mountRowRoot } =
      await import('../../src/runtime')
    hydrate('Chip', { init: () => {}, template: (p: { n: string }) => `<span>${p.n}</span>` })

    const ul = loopContainer()
    const [items] = createSignal([{ id: '1' }, { id: '2' }, { id: '3' }])
    mapArray(() => items(), ul, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li data-key="${item().id}"><div data-bf-ph="s0"></div></li>`
        const el = mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement
        upsertChild(el, 'Chip', 's0', { n: item().id })
        return el
      }, 'l0')

    // Rows are attached while later rows are still being built, so a lookup
    // that escaped its own row would land in one of these.
    const rows = [...ul.querySelectorAll('li')]
    expect(rows.map((r) => r.querySelectorAll('span').length)).toEqual([1, 1, 1])
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual(['1', '2', '3'])
  })

  test('a multi-root row inits connected and keeps its extras paired through a reorder', async () => {
    const { hydrate, mapArray, createSignal, upsertChildItem, mountRowRoot } =
      await import('../../src/runtime')
    const connectedAtInit: boolean[] = []
    hydrate('Chip', {
      init: (el: Element) => { connectedAtInit.push(el.isConnected) },
      template: () => `<span>c</span>`,
    })

    const ul = loopContainer()
    const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
    mapArray(() => items(), ul, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML =
          `<li class="p${item().id}"><div data-bf-ph="s0"></div></li>` +
          `<li class="x${item().id}">x</li>`
        const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement
        const extras: HTMLElement[] = []
        let sib = tpl.content.firstElementChild!.nextElementSibling
        while (sib) { extras.push(sib.cloneNode(true) as HTMLElement); sib = sib.nextElementSibling }
        ;(el as unknown as { __bfExtras: HTMLElement[] }).__bfExtras = extras
        mountRowRoot(el)
        upsertChildItem(el, 'Chip', 's0', {})
        return el
      }, 'l0')

    expect(connectedAtInit).toEqual([true, true])

    const shape = () => [...ul.querySelectorAll('li')].map((e) => e.className)
    expect(shape()).toEqual(['p1', 'x1', 'p2', 'x2'])
    setItems([{ id: '2' }, { id: '1' }])
    // Each primary must still travel with its own extra.
    expect(shape()).toEqual(['p2', 'x2', 'p1', 'x1'])
  })

  test('reconciled order survives front-insert, reorder, append and removal', async () => {
    const { hydrate, mapArray, createSignal, upsertChild, mountRowRoot } =
      await import('../../src/runtime')
    hydrate('Chip', { init: () => {}, template: () => `<span>c</span>` })

    const ul = loopContainer()
    const [items, setItems] = createSignal([{ id: '1' }])
    mapArray(() => items(), ul, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li data-key="${item().id}"><div data-bf-ph="s0"></div></li>`
        const el = mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement
        upsertChild(el, 'Chip', 's0', {})
        return el
      }, 'l0')

    const order = () => [...ul.querySelectorAll('li')].map((e) => e.getAttribute('data-key'))
    expect(order()).toEqual(['1'])
    // A fresh row belongs at the FRONT, but is mounted at the end of the range
    // first — the reorder has to move it.
    setItems([{ id: '9' }, { id: '1' }])
    expect(order()).toEqual(['9', '1'])
    setItems([{ id: '1' }, { id: '9' }, { id: '7' }])
    expect(order()).toEqual(['1', '9', '7'])
    setItems([{ id: '7' }])
    expect(order()).toEqual(['7'])
  })

  test('a duplicate key collapses without leaving the discarded row attached', async () => {
    const { hydrate, mapArray, createSignal, upsertChild, mountRowRoot } =
      await import('../../src/runtime')
    hydrate('Chip', { init: () => {}, template: () => `<span>c</span>` })

    const ul = loopContainer()
    const [items] = createSignal([{ id: 'dup' }, { id: 'dup' }])
    mapArray(() => items(), ul, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li data-key="${item().id}"><div data-bf-ph="s0"></div></li>`
        const el = mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement
        upsertChild(el, 'Chip', 's0', {})
        return el
      }, 'l0')

    // Both rows mount; the second wins the key. The loser must not linger.
    expect(ul.querySelectorAll('li').length).toBe(1)
  })

  test('a body that throws after mounting leaves no half-built row behind', async () => {
    const { mapArray, createSignal, mountRowRoot } = await import('../../src/runtime')

    const ul = loopContainer()
    const [items] = createSignal([{ id: '1' }])
    expect(() => {
      mapArray(() => items(), ul, (it: { id: string }) => it.id,
        (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
          if (existing) return existing
          const tpl = document.createElement('template')
          tpl.innerHTML = `<li data-key="${item().id}">boom</li>`
          mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement)
          throw new Error('tail failed')
        }, 'l0')
    }).toThrow('tail failed')

    // A detached row could never be left on screen; a mounted one can, so the
    // mount is undone on the way out.
    expect(ul.querySelectorAll('li').length).toBe(0)
  })

  test('an inner loop inside the row does not strand the outer mount point', async () => {
    const { hydrate, mapArray, createSignal, upsertChild, mountRowRoot } =
      await import('../../src/runtime')
    const outerConnected: boolean[] = []
    hydrate('Chip', {
      init: (el: Element) => { outerConnected.push(el.isConnected) },
      template: () => `<span>c</span>`,
    })

    const ul = loopContainer()
    const [items] = createSignal([{ id: '1' }])
    mapArray(() => items(), ul, (it: { id: string }) => it.id,
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML = `<li data-key="${item().id}"><ul class="inner"></ul><div data-bf-ph="s0"></div></li>`
        const el = mountRowRoot(tpl.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement

        // A whole inner list runs between the mount and the outer row's own
        // child init — its teardown must not blank the outer point.
        const inner = el.querySelector('ul.inner') as HTMLElement
        const [innerItems] = createSignal([{ id: 'a' }, { id: 'b' }])
        mapArray(() => innerItems(), inner, (x: { id: string }) => x.id,
          (x: () => { id: string }, _j: number, ex?: HTMLElement) => {
            if (ex) return ex
            const t2 = document.createElement('template')
            t2.innerHTML = `<li class="inner-row">${x().id}</li>`
            return mountRowRoot(t2.content.firstElementChild!.cloneNode(true) as HTMLElement) as HTMLElement
          }, 'l1')

        upsertChild(el, 'Chip', 's0', {})
        return el
      }, 'l0')

    expect(outerConnected).toEqual([true])
    expect(ul.querySelectorAll('.inner-row').length).toBe(2)
  })
})
