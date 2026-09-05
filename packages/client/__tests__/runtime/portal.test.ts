/**
 * createPortal Test
 *
 * Tests for client-side portal utility.
 * API inspired by React's createPortal(children, domNode).
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createPortal } from '../../src/runtime/portal'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('createPortal', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  describe('with HTML string', () => {
    test('mounts HTML to custom container', () => {
      const portal = createPortal('<div class="modal">Hello</div>', container)

      expect(container.children.length).toBe(1)
      expect(container.children[0]).toBe(portal.element)
      expect(portal.element.className).toBe('modal')
      expect(portal.element.textContent).toBe('Hello')
    })

    test('mounts HTML to document.body by default', () => {
      const initialBodyChildren = document.body.children.length
      const portal = createPortal('<div class="modal">Default Body</div>')

      expect(document.body.children.length).toBe(initialBodyChildren + 1)
      expect(portal.element.className).toBe('modal')
      expect(portal.element.textContent).toBe('Default Body')

      // Cleanup
      portal.unmount()
    })

    test('throws error for empty HTML', () => {
      expect(() => createPortal('', container)).toThrow('createPortal: Invalid HTML provided')
    })

    test('throws error for whitespace-only HTML', () => {
      expect(() => createPortal('   \n\t  ', container)).toThrow('createPortal: Invalid HTML provided')
    })

    test('mounts complex nested HTML', () => {
      const portal = createPortal(`
        <div class="modal-overlay">
          <div class="modal" role="dialog" aria-modal="true">
            <h2>Title</h2>
            <p>Content</p>
            <button>Close</button>
          </div>
        </div>
      `, container)

      expect(portal.element.className).toBe('modal-overlay')
      expect(portal.element.querySelector('.modal')).not.toBeNull()
      expect(portal.element.querySelector('h2')?.textContent).toBe('Title')
      expect(portal.element.querySelector('p')?.textContent).toBe('Content')
      expect(portal.element.querySelector('button')?.textContent).toBe('Close')
    })
  })

  describe('with HTMLElement', () => {
    test('mounts HTMLElement to container', () => {
      const modalEl = document.createElement('div')
      modalEl.className = 'modal'
      modalEl.textContent = 'Hello from element'

      const portal = createPortal(modalEl, container)

      expect(container.children.length).toBe(1)
      expect(container.children[0]).toBe(portal.element)
      expect(portal.element).toBe(modalEl)
      expect(portal.element.className).toBe('modal')
      expect(portal.element.textContent).toBe('Hello from element')
    })

    test('mounts HTMLElement to document.body by default', () => {
      const initialBodyChildren = document.body.children.length
      const modalEl = document.createElement('div')
      modalEl.className = 'modal'

      const portal = createPortal(modalEl)

      expect(document.body.children.length).toBe(initialBodyChildren + 1)
      expect(portal.element).toBe(modalEl)

      // Cleanup
      portal.unmount()
    })

    test('mounts element with children', () => {
      const wrapper = document.createElement('div')
      wrapper.className = 'wrapper'

      const child1 = document.createElement('span')
      child1.textContent = 'Child 1'
      const child2 = document.createElement('span')
      child2.textContent = 'Child 2'

      wrapper.appendChild(child1)
      wrapper.appendChild(child2)

      const portal = createPortal(wrapper, container)

      expect(portal.element.children.length).toBe(2)
      expect(portal.element.children[0].textContent).toBe('Child 1')
      expect(portal.element.children[1].textContent).toBe('Child 2')
    })
  })

  describe('unmount', () => {
    test('removes the element from DOM', () => {
      const portal = createPortal('<div class="modal">To be removed</div>', container)
      expect(container.children.length).toBe(1)

      portal.unmount()
      expect(container.children.length).toBe(0)
    })

    test('is idempotent (safe to call multiple times)', () => {
      const portal = createPortal('<div>Content</div>', container)
      portal.unmount()
      portal.unmount()
      portal.unmount()

      expect(container.children.length).toBe(0)
    })

    test('works with HTMLElement', () => {
      const modalEl = document.createElement('div')
      const portal = createPortal(modalEl, container)

      expect(container.children.length).toBe(1)
      portal.unmount()
      expect(container.children.length).toBe(0)
    })
  })

  describe('multiple portals', () => {
    test('work independently', () => {
      const container1 = document.createElement('div')
      const container2 = document.createElement('div')

      const portal1 = createPortal('<div>Portal 1</div>', container1)
      const portal2 = createPortal('<div>Portal 2</div>', container2)

      expect(container1.children.length).toBe(1)
      expect(container2.children.length).toBe(1)
      expect(portal1.element.textContent).toBe('Portal 1')
      expect(portal2.element.textContent).toBe('Portal 2')

      portal1.unmount()

      expect(container1.children.length).toBe(0)
      expect(container2.children.length).toBe(1)
    })

    test('can mount multiple elements to same container', () => {
      const portal1 = createPortal('<div>First</div>', container)
      const portal2 = createPortal('<div>Second</div>', container)

      expect(container.children.length).toBe(2)
      expect(container.children[0].textContent).toBe('First')
      expect(container.children[1].textContent).toBe('Second')

      portal1.unmount()
      expect(container.children.length).toBe(1)
      expect(container.children[0].textContent).toBe('Second')
    })
  })

  describe('element reference', () => {
    test('provides access to mounted element', () => {
      const portal = createPortal(
        '<div id="my-modal" class="modal active" data-testid="modal" aria-hidden="false"></div>',
        container
      )

      expect(portal.element.id).toBe('my-modal')
      expect(portal.element.className).toBe('modal active')
      expect(portal.element.dataset.testid).toBe('modal')
      expect(portal.element.getAttribute('aria-hidden')).toBe('false')
    })

    test('element can be modified after mount', () => {
      const portal = createPortal('<div class="modal"></div>', container)

      portal.element.classList.add('active')
      portal.element.textContent = 'Updated content'

      expect(container.children[0].classList.contains('active')).toBe(true)
      expect(container.children[0].textContent).toBe('Updated content')
    })
  })

  describe('with Renderable (JSX.Element)', () => {
    test('mounts object with toString() method', () => {
      // Simulates Hono's HtmlEscapedString / JSX.Element
      const jsxElement = {
        toString() {
          return '<div class="modal">From JSX</div>'
        }
      }

      const portal = createPortal(jsxElement, container)

      expect(container.children.length).toBe(1)
      expect(portal.element.className).toBe('modal')
      expect(portal.element.textContent).toBe('From JSX')
    })

    test('mounts complex JSX-like structure', () => {
      const jsxElement = {
        toString() {
          return `
            <div class="dialog" role="dialog">
              <h2>Dialog Title</h2>
              <p>Dialog content</p>
            </div>
          `
        }
      }

      const portal = createPortal(jsxElement, container)

      expect(portal.element.className).toBe('dialog')
      expect(portal.element.getAttribute('role')).toBe('dialog')
      expect(portal.element.querySelector('h2')?.textContent).toBe('Dialog Title')
    })

    test('throws error for Renderable returning empty HTML', () => {
      const emptyJsx = {
        toString() {
          return ''
        }
      }

      expect(() => createPortal(emptyJsx, container)).toThrow('createPortal: Invalid HTML provided')
    })
  })

  describe('with ownerScope option', () => {
    test('sets bf-po when ownerScope has scope ID', () => {
      const ownerScope = document.createElement('div')
      ownerScope.setAttribute('bf-s', 'Dialog_abc123')

      const portal = createPortal('<div class="modal">Content</div>', container, { ownerScope })

      expect(portal.element.getAttribute('bf-po')).toBe('Dialog_abc123')
    })

    test('does not set bf-po when ownerScope is missing scope ID', () => {
      const ownerScope = document.createElement('div')
      // No bf-s attribute

      const portal = createPortal('<div class="modal">Content</div>', container, { ownerScope })

      expect(portal.element.hasAttribute('bf-po')).toBe(false)
    })

    test('does not set bf-po when options not provided', () => {
      const portal = createPortal('<div class="modal">Content</div>', container)

      expect(portal.element.hasAttribute('bf-po')).toBe(false)
    })

    test('does not set bf-po when ownerScope is undefined', () => {
      const portal = createPortal('<div class="modal">Content</div>', container, { ownerScope: undefined })

      expect(portal.element.hasAttribute('bf-po')).toBe(false)
    })

    test('works with HTMLElement children', () => {
      const ownerScope = document.createElement('div')
      ownerScope.setAttribute('bf-s', 'DialogContent_xyz789')

      const modalEl = document.createElement('div')
      modalEl.className = 'dialog-content'

      const portal = createPortal(modalEl, container, { ownerScope })

      expect(portal.element.getAttribute('bf-po')).toBe('DialogContent_xyz789')
      expect(portal.element.className).toBe('dialog-content')
    })
  })

  /**
   * Insertion rule (#2717): with an `ownerScope` that is not yet in the
   * document, the append waits for the owner to connect. This is the CSR
   * construction shape — `materializeComponent` runs `init` (and the
   * `ref` callbacks that portal) before a bare `createComponent()` caller
   * appends the root — and the deferral is what makes it land on the same
   * `document.body` child order as hydration: `[root, …portals]`.
   */
  describe('reordered after the owner scope connects (#2717)', () => {
    /** Wait for the MutationObserver flush (a microtask in browsers; happy-dom schedules its own). */
    async function settle(until: () => boolean): Promise<void> {
      for (let i = 0; i < 50 && !until(); i++) {
        await new Promise(r => setTimeout(r, 1))
      }
    }

    /** A detached component root carrying a portal target, the way a CSR `init` sees it. */
    function detachedComponent(scopeId: string, slot: string) {
      const root = document.createElement('div')
      root.setAttribute('bf-s', scopeId)
      root.className = 'component-root'
      const target = document.createElement('div')
      target.setAttribute('data-slot', slot)
      root.appendChild(target)
      return { root, target }
    }

    test('appends synchronously when the owner is already connected (hydration path)', () => {
      const { root, target } = detachedComponent('Dialog_hyd', 'dialog-content')
      container.appendChild(root)

      createPortal(target, container, { ownerScope: root })

      expect(Array.from(container.children)).toEqual([root, target])
      expect(root.children.length).toBe(0)
    })

    test('appends now, then moves after the root once the owner connects (CSR mount path)', async () => {
      const { root, target } = detachedComponent('Dialog_csr', 'dialog-content')

      const portal = createPortal(target, container, { ownerScope: root })

      // Already in the container — the append is never deferred — but not
      // yet at its final position, since the root is not there yet.
      // bf-po is stamped right away.
      expect(Array.from(container.children)).toEqual([target])
      expect(root.children.length).toBe(0)
      expect(portal.element.getAttribute('bf-po')).toBe('Dialog_csr')

      // The caller connects the root — a bare `createComponent()` result
      // being appended by whoever created it — which lands AFTER the
      // portal until the reorder runs.
      container.appendChild(root)
      expect(Array.from(container.children)).toEqual([target, root])
      await settle(() => container.lastElementChild === target)

      expect(Array.from(container.children)).toEqual([root, target])
      expect(root.children.length).toBe(0)
    })

    test('the element is connected to the document while its reorder is pending (layout reads see a live box)', () => {
      // Regression pin for the review finding on #2717's first cut, which
      // deferred the append itself: the floating-position components
      // (popover, dropdown-menu, context-menu, …) read the portaled
      // element's `offsetWidth`/`offsetHeight` synchronously inside a
      // `createEffect` in the same tick as their `ref` callback, and
      // nothing re-runs that measurement once a late append lands. A
      // pending reorder must therefore never mean "not in the document".
      const { root, target } = detachedComponent('Popover_measure', 'popover-content')
      expect(root.isConnected).toBe(false)

      createPortal(target, container, { ownerScope: root })

      expect(target.isConnected).toBe(true)
      expect(container.contains(target)).toBe(true)
      expect(target.parentNode).toBe(container)
      expect(document.body.contains(target)).toBe(true)
    })

    test('the owner may be the portaled element itself', async () => {
      // A child component's own root carries `bf-s`, so `el.closest('[bf-s]')`
      // resolves to `el` — the shape DialogOverlay/DialogContent hit. The
      // immediate append connects the element (and so the owner) at once,
      // so the reorder waits on the tree it was taken from instead.
      const parent = document.createElement('div')
      const self = document.createElement('div')
      self.setAttribute('bf-s', 'DialogOverlay_self')
      parent.appendChild(self)

      createPortal(self, container, { ownerScope: self })
      expect(Array.from(container.children)).toEqual([self])
      expect(self.isConnected).toBe(true)

      container.appendChild(parent)
      await settle(() => container.lastElementChild === self)

      expect(Array.from(container.children)).toEqual([parent, self])
      expect(parent.children.length).toBe(0)
    })

    test('reorders pending portals in creation order', async () => {
      const { root, target: overlay } = detachedComponent('Dialog_order', 'dialog-overlay')
      const content = document.createElement('div')
      content.setAttribute('data-slot', 'dialog-content')
      root.appendChild(content)

      createPortal(overlay, container, { ownerScope: root })
      createPortal(content, container, { ownerScope: root })
      expect(Array.from(container.children)).toEqual([overlay, content])

      container.appendChild(root)
      await settle(() => container.lastElementChild === content)

      expect(Array.from(container.children)).toEqual([root, overlay, content])
    })

    test('leaves a portal pending while its own owner is still detached', async () => {
      const first = detachedComponent('Dialog_a', 'dialog-content')
      const second = detachedComponent('Dialog_b', 'dialog-content')

      createPortal(first.target, container, { ownerScope: first.root })
      createPortal(second.target, container, { ownerScope: second.root })
      expect(Array.from(container.children)).toEqual([first.target, second.target])

      container.appendChild(first.root)
      await settle(() => container.lastElementChild === first.target)

      // Only the first moved; the second still sits where it was appended.
      expect(Array.from(container.children)).toEqual([second.target, first.root, first.target])

      container.appendChild(second.root)
      await settle(() => container.lastElementChild === second.target)

      expect(Array.from(container.children)).toEqual([first.root, first.target, second.root, second.target])
    })

    test('unmount before the owner connects cancels the pending reorder and removes the element', async () => {
      const { root, target } = detachedComponent('Dialog_cancel', 'dialog-content')

      const portal = createPortal(target, container, { ownerScope: root })
      expect(target.parentNode).toBe(container)
      portal.unmount()
      expect(target.parentNode).toBeNull()

      container.appendChild(root)
      await settle(() => container.children.length > 1)

      expect(Array.from(container.children)).toEqual([root])
    })

    test('an element the caller removed from the container is not re-inserted by the reorder', async () => {
      const { root, target } = detachedComponent('Dialog_gone', 'dialog-content')

      createPortal(target, container, { ownerScope: root })
      // Removed directly, without `unmount()` — the reorder must not
      // resurrect it in the container.
      target.remove()

      container.appendChild(root)
      await settle(() => container.children.length > 1)

      expect(Array.from(container.children)).toEqual([root])
      expect(target.parentNode).toBeNull()
    })

    test('without an owner, an element already in a detached tree waits for that tree', async () => {
      // A fragment-root component carries its scope on a comment, so the
      // documented `el.closest('[bf-s]') ?? undefined` lookup yields no
      // owner — the element's former parent is then the thing that connects.
      const root = document.createElement('div')
      const target = document.createElement('div')
      root.appendChild(target)

      createPortal(target, container)
      expect(Array.from(container.children)).toEqual([target])
      expect(root.children.length).toBe(0)

      container.appendChild(root)
      await settle(() => container.lastElementChild === target)

      expect(Array.from(container.children)).toEqual([root, target])
    })

    test('a bare element with no owner and no parent is appended once, with nothing to wait for', async () => {
      const target = document.createElement('div')
      const later = document.createElement('div')

      createPortal(target, container)
      expect(Array.from(container.children)).toEqual([target])

      // Nothing else connecting later should move it.
      container.appendChild(later)
      await settle(() => false)

      expect(Array.from(container.children)).toEqual([target, later])
    })

    test('an owner without a scope id still reorders (no bf-po, same insertion rule)', async () => {
      const root = document.createElement('div')
      const target = document.createElement('div')
      root.appendChild(target)

      const portal = createPortal(target, container, { ownerScope: root })
      expect(portal.element.hasAttribute('bf-po')).toBe(false)
      expect(Array.from(container.children)).toEqual([target])

      container.appendChild(root)
      await settle(() => container.lastElementChild === target)

      expect(Array.from(container.children)).toEqual([root, target])
    })
  })
})
