import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, mapArray, qsa, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__ef8242e5', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__ef8242e5', _p, __bfKey) }
export function initLoopRowChildChildrenRef(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const STATIC_ROWS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]
  const [rows, setRows] = createSignal([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')
  const register = (el, value) => {
    el.addEventListener('click', () => setPicked(value()))
  }

  const [_s2, _s5, _s8, _s12, _s15] = $(__scope, 's2', 's5', 's8', 's12', 's15')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', label: 'C' }, ...rows()]))
  mapArray(() => rows(), _s5, (o) => String(o.id), (o, __idx, __existing) => {
    if (__existing) {
      initChild('Chip__ef8242e5', __existing, { get children() { return `<button type="button" class="pick" bf="^s3">pick</button>` } })
      { const __rf_s3 = qsa(__existing, '[bf="^s3"]')
      if (__rf_s3) ((el) => register(el, () => o().id))?.(__rf_s3) }
      return __existing
    }
    const __csrEl = createComponent('Chip__ef8242e5', { get children() { return `<button type="button" class="pick" bf="^s3">pick</button>` } }, o().id)
    { const __rf_s3 = qsa(__csrEl, '[bf="^s3"]')
    if (__rf_s3) ((el) => register(el, () => o().id))?.(__rf_s3) }
    return __csrEl
  }, 'l0')

  mapArray(() => rows(), _s8, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) {
      initChild('Chip__ef8242e5', __existing, { get children() { return `<button type="button" class="pick" bf="^s6">pick</button>` } })
      { const __rf_s6 = qsa(__existing, '[bf="^s6"]')
      if (__rf_s6) ((el) => register(el, () => `${o().id}@${i()}`))?.(__rf_s6) }
      return __existing
    }
    const __csrEl = createComponent('Chip__ef8242e5', { get children() { return `<button type="button" class="pick" bf="^s6">pick</button>` } }, o().id)
    { const __rf_s6 = qsa(__csrEl, '[bf="^s6"]')
    if (__rf_s6) ((el) => register(el, () => `${o().id}@${i()}`))?.(__rf_s6) }
    return __csrEl
  }, 'l1')

  mapArray(() => rows(), _s12, ({ id, label }, i) => String(id), (__bfItem, i, __existing) => {
    if (__existing) {
      initChild('Chip__ef8242e5', __existing, { get children() { return `<label><!--bf:^s9-->${escapeText(__bfItem().label)}<!--/--><button type="button" class="pick" bf="^s10">pick</button></label>` } })
      const __bfw_s9 = lazySlots(__existing, [{ id: '^s9', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s9('^s9', String(__bfItem().label)) })
      { const __rf_s10 = qsa(__existing, '[bf="^s10"]')
      if (__rf_s10) ((el) => register(el, () => `${__bfItem().id}#${i()}`))?.(__rf_s10) }
      return __existing
    }
    const __csrEl = createComponent('Chip__ef8242e5', { get children() { return `<label><!--bf:^s9-->${escapeText(__bfItem().label)}<!--/--><button type="button" class="pick" bf="^s10">pick</button></label>` } }, __bfItem().id)
    const __bfw_s9 = lazySlots(__csrEl, [{ id: '^s9', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s9('^s9', String(__bfItem().label)) })
    { const __rf_s10 = qsa(__csrEl, '[bf="^s10"]')
    if (__rf_s10) ((el) => register(el, () => `${__bfItem().id}#${i()}`))?.(__rf_s10) }
    return __csrEl
  }, 'l2')

  // Ref callbacks in static array children
  if (_s15) {
    STATIC_ROWS.forEach((o, i) => {
      let __iterEl = _s15.children[i]
      if (__iterEl) {
        { const __rf_s13 = qsa(__iterEl, '[bf="^s13"]')
        if (__rf_s13) ((el) => register(el, () => `s-${o.id}@${i}`))?.(__rf_s13) }
      }
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s15) {
    const __childScopes = qsaChildScopes(_s15, `[bf-h="${__scopeId}"][bf-m="s14"], [bf-s$="_s14"]`)
    __childScopes.forEach((childScope, i) => {
      const o = STATIC_ROWS[i]
      initChild('Chip__ef8242e5', childScope, {})
    })
  }

}

hydrate('LoopRowChildChildrenRef', { init: initLoopRowChildChildrenRef, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="item" bf="s5"><!--bf-loop:l0-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `${renderChild('Chip__ef8242e5', {children: `<button type="button" class="pick" bf="^s3">pick</button>`}, o.id, 's4', true)}`).join('')}<!--bf-/loop:l0--></div><div class="index" bf="s8"><!--bf-loop:l1-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o, i) => `${renderChild('Chip__ef8242e5', {children: `<button type="button" class="pick" bf="^s6">pick</button>`}, o.id, 's7', true)}`).join('')}<!--bf-/loop:l1--></div><div class="destructured" bf="s12"><!--bf-loop:l2-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map(({ id, label }, i) => `${renderChild('Chip__ef8242e5', {children: `<label><!--bf:^s9-->${escapeText(label)}<!--/--><button type="button" class="pick" bf="^s10">pick</button></label>`}, id, 's11', true)}`).join('')}<!--bf-/loop:l2--></div><div class="static" bf="s15"><!--bf-loop:l3-->${([
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]).map((o, i) => `${renderChild('Chip__ef8242e5', {children: `<button type="button" class="pick" bf="^s13">pick</button>`}, o.id, 's14', true)}`).join('')}<!--bf-/loop:l3--></div></div>` })
export function LoopRowChildChildrenRef(_p, __bfKey) { return createComponent('LoopRowChildChildrenRef', _p, __bfKey) }
