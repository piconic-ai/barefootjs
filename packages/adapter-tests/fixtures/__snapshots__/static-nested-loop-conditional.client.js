import { $, createComponent, createSignal, escapeAttr, hydrate, insert, mapArray, mountRowRoot, qsa } from '@barefootjs/client/runtime'


export function initStaticNestedLoopConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const rows = [
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
  ]
  const [flag, setFlag] = createSignal(true)
  const toggle = () => setFlag(v => !v)

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', toggle)
  mapArray(() => rows, _s4, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}" bf="s3"><!--bf-loop:l0-->${row().children.map((child) => `<span data-key-1="${escapeAttr(child.id)}" class="child" bf="s2">${flag() ? `<b bf-c="s1" class="on">on</b>` : `<i bf-c="s1" class="off">off</i>`}</span>`).join('')}<!--bf-/loop:l0--></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: row.children
    { const __ic1_0 = qsa(__el, '[bf="s3"]')
    if (__ic1_0) mapArray(() => row().children || [], __ic1_0, (child) => String(child.id), (child, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<span data-key-1="${escapeAttr(child().id)}" class="child" bf="s2">${flag() ? `<b bf-c="s1" class="on">on</b>` : `<i bf-c="s1" class="off">off</i>`}</span>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(child().id))
      insert(__innerEl1_0, 's1', () => flag(), {
        template: () => { const __slots = []; return { html: `<b bf-c="s1" class="on">on</b>`, slots: __slots } },
        bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        }
      }, {
        template: () => { const __slots = []; return { html: `<i bf-c="s1" class="off">off</i>`, slots: __slots } },
        bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        }
      })
      return __innerEl1_0
    }, 'l0', undefined, "data-key-1") }
    return __el
  }, 'l1')

}

hydrate('StaticNestedLoopConditional', { init: initStaticNestedLoopConditional, template: (_p) => `<div><button type="button" class="toggle" bf="s0"> Toggle </button><ul bf="s4"><!--bf-loop:l1-->${([
    { id: 1, children: [{ id: 11 }, { id: 12 }] },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}" bf="s3"><!--bf-loop:l0-->${row.children.map((child) => `<span data-key-1="${escapeAttr(child.id)}" class="child" bf="s2">${(true) ? `<b bf-c="s1" class="on">on</b>` : `<i bf-c="s1" class="off">off</i>`}</span>`).join('')}<!--bf-/loop:l0--></li>`).join('')}<!--bf-/loop:l1--></ul></div>` })
export function StaticNestedLoopConditional(_p, __bfKey) { return createComponent('StaticNestedLoopConditional', _p, __bfKey) }
