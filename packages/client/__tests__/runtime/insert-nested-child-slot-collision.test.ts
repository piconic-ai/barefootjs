/**
 * Runtime integration test for #2316: a conditional branch's `bindEvents`
 * resolves its own slot via `qsa(__branchScope, ...)`, where `__branchScope`
 * is the *whole* component scope (`region.bindScope` in insert.ts), not a
 * subtree scoped to just this branch. When a nested child component,
 * mounted earlier in the same scope, happens to reuse the same local slot
 * number (compiler slot IDs restart from `s0` per component file), `qsa()`
 * must not return the child's element instead of the branch's own.
 *
 * Mirrors the real shape found in piconic-ai/sora: EditorMain's `insert()`-
 * controlled `page-meter-fill` div (`bf="s4"`) collided with WordTable's
 * (a nested child, mounted earlier in DOM order) own "Front" `<th bf="s4">`.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { qsa } from '../../src/runtime/query'
import { createSignal, createDisposableEffect } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('insert() branch bindEvents vs. nested child slot collision (#2316)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('reactive class/style on the parent\'s own slot never lands on the nested child\'s same-numbered slot', () => {
    // SSR shape: a nested child component (its own bf-s scope) rendered
    // before an insert()-controlled ELEMENT conditional (bf-c="s1") whose
    // active branch happens to reuse the child's local slot number (both
    // "s4") — mirrors EditorMain.tsx's real compiled output exactly,
    // where the SSR-rendered branch already matches the client's expected
    // signature, so insert() skips straight to bindEvents() without any
    // DOM swap (the fast path the real bug goes through).
    document.body.innerHTML = `
      <section bf-s="EditorMain_test1">
        <div class="editor-body">
          <div class="word-table-wrap" bf-s="EditorMain_test1_s0">
            <table><thead><tr><th bf="s4">Front</th></tr></thead></table>
          </div>
          <div bf-c="s1" class="page-meter">
            <div class="page-meter-fill" style="width:10%" bf="s4"></div>
          </div>
        </div>
      </section>
    `
    const scope = document.querySelector('[bf-s="EditorMain_test1"]')!
    const childSlot = document.querySelector('[bf-s="EditorMain_test1_s0"] [bf="s4"]')!

    const [isFull, setIsFull] = createSignal(false)
    const [ratio, setRatio] = createSignal(0.1)

    insert(scope, 's1', () => true, {
      template: () => `<div bf-c="s1" class="page-meter"><div class="${isFull() ? 'page-meter-fill is-full' : 'page-meter-fill'}" style="width:${Math.round(ratio() * 100)}%" bf="s4"></div></div>`,
      bindEvents: (__branchScope) => {
        const __disposers: Array<() => void> = []
        const el = qsa(__branchScope, '[bf="s4"]')
        if (el) {
          __disposers.push(createDisposableEffect(() => {
            el.setAttribute('class', isFull() ? 'page-meter-fill is-full' : 'page-meter-fill')
          }))
          __disposers.push(createDisposableEffect(() => {
            el.setAttribute('style', `width:${Math.round(ratio() * 100)}%`)
          }))
        }
        return () => __disposers.forEach((f) => f())
      },
    }, {
      template: () => `<div bf-c="s1" class="hint"></div>`,
      bindEvents: () => {},
    })

    // The nested child's own <th bf="s4"> must be untouched — no class,
    // no inline style, still just the SSR "Front" header cell.
    expect(childSlot.className).toBe('')
    expect(childSlot.getAttribute('style')).toBeNull()

    // The parent's own page-meter-fill div must have received the binding.
    const fillEl = document.querySelector('[class^="page-meter-fill"]')
    expect(fillEl).not.toBeNull()
    expect(fillEl?.getAttribute('style')).toBe('width:10%')

    // Drive the signals — updates must reach the parent's own element,
    // and the nested child's slot must remain untouched throughout.
    setIsFull(true)
    setRatio(0.75)
    expect(fillEl?.className).toBe('page-meter-fill is-full')
    expect(fillEl?.getAttribute('style')).toBe('width:75%')
    expect(childSlot.className).toBe('')
    expect(childSlot.getAttribute('style')).toBeNull()
  })
})
