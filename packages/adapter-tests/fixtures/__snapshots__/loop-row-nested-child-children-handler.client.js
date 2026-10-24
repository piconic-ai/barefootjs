import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, mapArray, mountRowRoot, qsa, qsaChildScopes, renderChild, upsertChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__8c71a327', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__8c71a327', _p, __bfKey) }
export function initLoopRowNestedChildChildrenHandler(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const NESTED = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]
  const [rows, setRows] = createSignal([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')

  const [_s2, _s7, _s11] = $(__scope, 's2', 's7', 's11')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', label: 'C' }, ...rows()]))
  // Reactive texts in static array children
  if (_s7) {
    NESTED.forEach((o, __idx) => {
      let __iterEl = _s7.children[__idx]
      if (__iterEl) {
        const __bfw_s3 = lazySlots(__iterEl, [{ id: '^s3', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s3('^s3', String(o.label)) })
      }
    })
  }

  mapArray(() => rows(), _s11, (o) => String(o.id), (o, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<div data-key="${escapeAttr(o().id)}" class="row"><div data-bf-ph="s10"></div></div>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Chip__8c71a327', 's10', { get children() { return `<button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(o().label)}<!--/--></button>` } }, undefined, __scope)
    { const __e = qsa(__el, '[bf="^s9"]'); if (__e) __e.addEventListener('click', () => setPicked(`c-${o().id}`)) }
    const __bfw_s8 = lazySlots(__el, [{ id: '^s8', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s8('^s8', String(o().label)) })
    return __el
  }, 'l1')

  // Initialize static array children (hydrate skips nested instances)
  if (_s7) {
    const __childScopes = qsaChildScopes(_s7, `[bf-h="${__scopeId}"][bf-m="s6"], [bf-s$="_s6"]`)
    __childScopes.forEach((childScope, __idx) => {
      const o = NESTED[__idx]
      initChild('Chip__8c71a327', childScope, {})
      { const __e = qsa(childScope, '[bf="^s4"]'); if (__e) __e.addEventListener('click', () => setPicked(`n-${o.id}`)) }
    })
  }

}

hydrate('LoopRowNestedChildChildrenHandler', { init: initLoopRowNestedChildChildrenHandler, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="nested" bf="s7"><!--bf-loop:l0-->${([
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]).map((o) => `${renderChild('Chip__8c71a327', {children: `${renderChild('Chip__8c71a327', {children: `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o.label)}<!--/--></button>`}, undefined, 's5')}`}, o.id, 's6', true)}`).join('')}<!--bf-/loop:l0--></div><div class="composite" bf="s11"><!--bf-loop:l1-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `<div data-key="${escapeAttr(o.id)}" class="row">${renderChild('Chip__8c71a327', {children: `<button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(o.label)}<!--/--></button>`}, undefined, 's10')}</div>`).join('')}<!--bf-/loop:l1--></div></div>` })
export function LoopRowNestedChildChildrenHandler(_p, __bfKey) { return createComponent('LoopRowNestedChildChildrenHandler', _p, __bfKey) }
