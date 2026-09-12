/**
 * #2960 — end-to-end runtime pin for the compiler-level fix in
 * `addCondAttrToTemplate`/`isSingleRootElement` (jsx package). Exercises
 * `insert()` with exactly the template shape the compiler now emits for
 * `cond ? <div id="welcome">Welcome</div> : (<><div id="before">...</div><div id="after">...</div></>)`
 * — a single-element `bf-c` branch on one side, a comment-marker-wrapped
 * multi-root branch on the other — and asserts a live branch swap keeps
 * every node of the multi-root branch, not just the first.
 *
 * Before the compiler fix, the multi-root branch (two `<div>`s, same tag
 * name) was wrongly classified as a single root and compiled with
 * `bf-c="<id>"` on only the first `<div>` instead of comment markers.
 * That routed the swap through `updateElementConditional`, whose
 * `fragment.firstChild` kept only `#before` and silently dropped
 * `#after`. This test locks in the corrected marker-wrapped shape, which
 * `updateFragmentConditional` already moves node-by-node (no change
 * needed there).
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { createSignal } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('#2960: asymmetric single-element vs. same-tag-name multi-root cond branch', () => {
  test('swapping into the multi-root branch keeps every sibling', () => {
    document.body.innerHTML = `
      <div bf-s="Test_1">
        <div bf-c="s1" id="welcome">Welcome</div>
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [open, setOpen] = createSignal(false)

    insert(
      scope,
      's1',
      () => open() === false,
      { template: () => '<div bf-c="s1" id="welcome">Welcome</div>', bindEvents: () => {} },
      {
        template: () =>
          '<!--bf-cond-start:s1--><div id="before">before</div><div id="after">after</div><!--bf-cond-end:s1-->',
        bindEvents: () => {},
      }
    )

    expect(scope.querySelector('#welcome')).not.toBeNull()

    setOpen(true)

    expect(scope.querySelector('#before')?.textContent).toBe('before')
    expect(scope.querySelector('#after')?.textContent).toBe('after')

    // Swap back: the multi-root branch's nodes are removed cleanly.
    setOpen(false)
    expect(scope.querySelector('#welcome')?.textContent).toBe('Welcome')
    expect(scope.querySelector('#before')).toBeNull()
    expect(scope.querySelector('#after')).toBeNull()
  })
})
