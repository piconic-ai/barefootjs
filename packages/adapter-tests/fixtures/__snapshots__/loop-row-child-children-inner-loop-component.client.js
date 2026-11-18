import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, lazySlots, childScopesBySlot, escapeAttr, initChild, mapArray, qsa, renderChild, upsertChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__f3568064', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__f3568064', _p, __bfKey) }
export function initBtn(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', _p.onPick)
}

hydrate('Btn__f3568064', { init: initBtn, template: (_p) => `<button type="button" class="pick" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></button>`, name: 'Btn' })
export function Btn(_p, __bfKey) { return createComponent('Btn__f3568064', _p, __bfKey) }
export function initLoopRowChildChildrenInnerLoopComponent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const ROWS = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]
  const [rows, setRows] = createSignal([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ])
  const [picked, setPicked] = createSignal('none')

  const [_s2, _s6, _s10] = $(__scope, 's2', 's6', 's10')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()]))
  mapArray(() => rows(), _s10, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) {
      initChild('Chip__f3568064', __existing, { get children() { return `<ul bf="^s8"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's7')}</li>`).join('')}<!--bf-/loop:l2--></ul>` } })
      // Reactive inner loop: o.tags
      { const __ic1_0 = qsa(__existing, '[bf="^s8"]')
      if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
        const j = __innerIdx1_0
        let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><div data-bf-ph="s7"></div></li>`; return __t.content.firstElementChild.cloneNode(true) })()
        __innerEl1_0.setAttribute('data-key-1', String(tag()))
        upsertChild(__innerEl1_0, 'Btn__f3568064', 's7', { get label() { return tag() }, onPick: () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`) }, undefined, __scope)
        return __innerEl1_0
      }, 'l2', undefined, "data-key-1") }
      return __existing
    }
    const __csrEl = createComponent('Chip__f3568064', { get children() { return `<ul bf="^s8"><!--bf-loop:l2-->${o().tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's7')}</li>`).join('')}<!--bf-/loop:l2--></ul>` } }, o().id)
    // Reactive inner loop: o.tags
    { const __ic1_0 = qsa(__csrEl, '[bf="^s8"]')
    if (__ic1_0) mapArray(() => o().tags || [], __ic1_0, (tag, j) => String(tag), (tag, __innerIdx1_0, __existing) => {
      const j = __innerIdx1_0
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(tag())}"><div data-bf-ph="s7"></div></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(tag()))
      upsertChild(__innerEl1_0, 'Btn__f3568064', 's7', { get label() { return tag() }, onPick: () => setPicked(`${o().id}-${tag()}@${i()}.${j()}`) }, undefined, __scope)
      return __innerEl1_0
    }, 'l2', undefined, "data-key-1") }
    return __csrEl
  }, 'l3')

  // Initialize static array children (hydrate skips nested instances)
  if (_s6) {
    const __childScopes = childScopesBySlot(_s6, __scopeId, 's5')
    __childScopes.forEach((childScope, __idx) => {
      const o = ROWS[__idx]
      initChild('Chip__f3568064', childScope, {})
    })
  }

  // Initialize component-rooted inner-loop components (depth 1)
  if (_s6) {
    const __compScopes = childScopesBySlot(_s6, __scopeId, 's3')
    let __ci = 0
    ROWS.forEach((o) => {
      o.tags.forEach((tag) => {
        const __compEl = __compScopes[__ci++]
        if (__compEl) initChild('Btn__f3568064', __compEl, { get label() { return tag }, onPick: () => setPicked(`${o.id}-${tag}`) })
      })
    })
  }

}

hydrate('LoopRowChildChildrenInnerLoopComponent', { init: initLoopRowChildChildrenInnerLoopComponent, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="rows" bf="s6"><!--bf-loop:l1-->${([
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]).map((o) => `${renderChild('Chip__f3568064', {children: `<ul bf="^s4"><!--bf-loop:l0-->${o.tags.map((tag) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's3')}</li>`).join('')}<!--bf-/loop:l0--></ul>`}, o.id, 's5', true)}`).join('')}<!--bf-/loop:l1--></div><div class="live" bf="s10"><!--bf-loop:l3-->${([
    { id: 'a', tags: ['x', 'y'] },
    { id: 'b', tags: ['z'] },
  ]).map((o, i) => `${renderChild('Chip__f3568064', {children: `<ul bf="^s8"><!--bf-loop:l2-->${o.tags.map((tag, j) => `<li data-key-1="${escapeAttr(tag)}">${renderChild('Btn__f3568064', {label: tag}, undefined, 's7')}</li>`).join('')}<!--bf-/loop:l2--></ul>`}, o.id, 's9', true)}`).join('')}<!--bf-/loop:l3--></div></div>` })
export function LoopRowChildChildrenInnerLoopComponent(_p, __bfKey) { return createComponent('LoopRowChildChildrenInnerLoopComponent', _p, __bfKey) }
