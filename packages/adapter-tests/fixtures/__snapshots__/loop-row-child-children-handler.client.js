import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, mapArray, qsa, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__81af11ff', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__81af11ff', _p, __bfKey) }
export function initLoopRowChildChildrenHandler(__scope, _p = {}) {
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

  const [_s2, _s6, _s10, _s14, _s18] = $(__scope, 's2', 's6', 's10', 's14', 's18')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', label: 'C' }, ...rows()]))
  mapArray(() => rows(), _s6, (o) => String(o.id), (o, __idx, __existing) => {
    if (__existing) {
      initChild('Chip__81af11ff', __existing, { get children() { return `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o().label)}<!--/--></button>` } })
      { const __e = qsa(__existing, '[bf="^s4"]'); if (__e) __e.addEventListener('click', () => setPicked(o().id)) }
      const __bfw_s3 = lazySlots(__existing, [{ id: '^s3', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s3('^s3', String(o().label)) })
      return __existing
    }
    const __csrEl = createComponent('Chip__81af11ff', { get children() { return `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o().label)}<!--/--></button>` } }, o().id)
    { const __e = qsa(__csrEl, '[bf="^s4"]'); if (__e) __e.addEventListener('click', () => setPicked(o().id)) }
    const __bfw_s3 = lazySlots(__csrEl, [{ id: '^s3', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s3('^s3', String(o().label)) })
    return __csrEl
  }, 'l0')

  mapArray(() => rows(), _s10, (o, i) => String(o.id), (o, i, __existing) => {
    if (__existing) {
      initChild('Chip__81af11ff', __existing, { get children() { return `<button type="button" class="pick" bf="^s8"><!--bf:^s7-->${escapeText(o().label)}<!--/--></button>` } })
      { const __e = qsa(__existing, '[bf="^s8"]'); if (__e) __e.addEventListener('click', () => setPicked(`${o().id}@${i()}`)) }
      const __bfw_s7 = lazySlots(__existing, [{ id: '^s7', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s7('^s7', String(o().label)) })
      return __existing
    }
    const __csrEl = createComponent('Chip__81af11ff', { get children() { return `<button type="button" class="pick" bf="^s8"><!--bf:^s7-->${escapeText(o().label)}<!--/--></button>` } }, o().id)
    { const __e = qsa(__csrEl, '[bf="^s8"]'); if (__e) __e.addEventListener('click', () => setPicked(`${o().id}@${i()}`)) }
    const __bfw_s7 = lazySlots(__csrEl, [{ id: '^s7', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s7('^s7', String(o().label)) })
    return __csrEl
  }, 'l1')

  mapArray(() => rows(), _s14, ({ id, label }, i) => String(id), (__bfItem, i, __existing) => {
    if (__existing) {
      initChild('Chip__81af11ff', __existing, { get children() { return `<button type="button" class="pick" bf="^s12"><!--bf:^s11-->${escapeText(__bfItem().label)}<!--/--></button>` } })
      { const __e = qsa(__existing, '[bf="^s12"]'); if (__e) __e.addEventListener('click', () => setPicked(`${__bfItem().id}#${i()}`)) }
      const __bfw_s11 = lazySlots(__existing, [{ id: '^s11', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s11('^s11', String(__bfItem().label)) })
      return __existing
    }
    const __csrEl = createComponent('Chip__81af11ff', { get children() { return `<button type="button" class="pick" bf="^s12"><!--bf:^s11-->${escapeText(__bfItem().label)}<!--/--></button>` } }, __bfItem().id)
    { const __e = qsa(__csrEl, '[bf="^s12"]'); if (__e) __e.addEventListener('click', () => setPicked(`${__bfItem().id}#${i()}`)) }
    const __bfw_s11 = lazySlots(__csrEl, [{ id: '^s11', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s11('^s11', String(__bfItem().label)) })
    return __csrEl
  }, 'l2')

  // Reactive texts in static array children
  if (_s18) {
    STATIC_ROWS.forEach((o, i) => {
      let __iterEl = _s18.children[i]
      if (__iterEl) {
        const __bfw_s15 = lazySlots(__iterEl, [{ id: '^s15', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s15('^s15', String(o.label)) })
      }
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s18) {
    const __childScopes = qsaChildScopes(_s18, `[bf-h="${__scopeId}"][bf-m="s17"], [bf-s$="_s17"]`)
    __childScopes.forEach((childScope, i) => {
      const o = STATIC_ROWS[i]
      initChild('Chip__81af11ff', childScope, {})
      { const __e = qsa(childScope, '[bf="^s16"]'); if (__e) __e.addEventListener('click', () => setPicked(`s-${o.id}@${i}`)) }
    })
  }

}

hydrate('LoopRowChildChildrenHandler', { init: initLoopRowChildChildrenHandler, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="item" bf="s6"><!--bf-loop:l0-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `${renderChild('Chip__81af11ff', {children: `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o.label)}<!--/--></button>`}, o.id, 's5', true)}`).join('')}<!--bf-/loop:l0--></div><div class="index" bf="s10"><!--bf-loop:l1-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o, i) => `${renderChild('Chip__81af11ff', {children: `<button type="button" class="pick" bf="^s8"><!--bf:^s7-->${escapeText(o.label)}<!--/--></button>`}, o.id, 's9', true)}`).join('')}<!--bf-/loop:l1--></div><div class="destructured" bf="s14"><!--bf-loop:l2-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map(({ id, label }, i) => `${renderChild('Chip__81af11ff', {children: `<button type="button" class="pick" bf="^s12"><!--bf:^s11-->${escapeText(label)}<!--/--></button>`}, id, 's13', true)}`).join('')}<!--bf-/loop:l2--></div><div class="static" bf="s18"><!--bf-loop:l3-->${([
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]).map((o, i) => `${renderChild('Chip__81af11ff', {children: `<button type="button" class="pick" bf="^s16"><!--bf:^s15-->${escapeText(o.label)}<!--/--></button>`}, o.id, 's17', true)}`).join('')}<!--bf-/loop:l3--></div></div>` })
export function LoopRowChildChildrenHandler(_p, __bfKey) { return createComponent('LoopRowChildChildrenHandler', _p, __bfKey) }
