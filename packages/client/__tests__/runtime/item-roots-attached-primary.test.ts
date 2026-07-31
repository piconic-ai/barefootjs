/**
 * A multi-root item's `__bfExtras` stash must stay reachable when the primary
 * is already in the DOM.
 *
 * `itemRootElements` (`qsa-item.ts`) yields the primary, then walks its
 * siblings until a loop-boundary comment, then reads the stash for extras that
 * are not siblings yet. The walk has to end with `break`: a `return` ends the
 * generator and skips the stash.
 *
 * That distinction is invisible today, because nothing attaches a row before
 * its body runs — with a detached primary `nextSibling` is `null`, the walk
 * never runs, and the stash is reached anyway. It decides the outcome the
 * moment a row IS attached first, which is the direction the connect-before-
 * init work is going (`csr-loop-row-init-connected.test.ts`). Without this,
 * the first sibling an attached primary sees is a boundary comment, the
 * generator ends, and the item's child placeholders are never replaced.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { BF_LOOP_START, BF_LOOP_END } from '@barefootjs/shared'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

describe('itemRootElements reaches the extras stash with an attached primary', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  /**
   * Build one multi-root item the way the compiler emits a Fragment row: a
   * primary plus one extra, with the child's placeholder on the EXTRA so the
   * lookup has to get past the primary to find it.
   */
  async function renderItems(attachPrimaryFirst: boolean) {
    const { hydrate, mapArray, createSignal, upsertChildItem } = await import('../../src/runtime')

    hydrate('Chip', { init: () => {}, template: () => `<span>chip</span>` })

    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    ul.appendChild(document.createComment(`${BF_LOOP_START}:loop0`))
    const end = document.createComment(`${BF_LOOP_END}:loop0`)
    ul.appendChild(end)

    const placedIn: string[] = []
    const [items] = createSignal([{ id: '1' }, { id: '2' }])

    mapArray(
      () => items(),
      ul,
      (it: { id: string }) => String(it.id),
      (item: () => { id: string }, _i: number, existing?: HTMLElement) => {
        if (existing) return existing
        const tpl = document.createElement('template')
        tpl.innerHTML =
          `<li class="p${item().id}">${item().id}</li>` +
          `<li class="x${item().id}"><div data-bf-ph="s0"></div></li>`
        const primary = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement
        const extras: HTMLElement[] = []
        let sib = tpl.content.firstElementChild!.nextElementSibling
        while (sib) {
          extras.push(sib.cloneNode(true) as HTMLElement)
          sib = sib.nextElementSibling
        }
        ;(primary as unknown as { __bfExtras: HTMLElement[] }).__bfExtras = extras

        // The case under test: the primary is in the DOM before the body's
        // tail runs, so its first sibling is the loop's end marker.
        if (attachPrimaryFirst) ul.insertBefore(primary, end)

        const child = upsertChildItem(primary, 'Chip', 's0', {})
        placedIn.push(child ? (child.parentElement?.className ?? 'no-parent') : 'NOT FOUND')
        return primary
      },
      'loop0',
    )

    return { placedIn, html: ul.innerHTML }
  }

  test('detached primary — the stash is reached because the walk never runs', async () => {
    const { placedIn } = await renderItems(false)
    expect(placedIn).toEqual(['x1', 'x2'])
  })

  test('attached primary — the stash is still reached after the walk breaks', async () => {
    const { placedIn, html } = await renderItems(true)
    // Fails as ['NOT FOUND', 'NOT FOUND'] if the boundary check `return`s.
    expect(placedIn).toEqual(['x1', 'x2'])
    // And the placeholders really were replaced, not merely reported found.
    expect(html).not.toContain('data-bf-ph="s0"')
  })
})
