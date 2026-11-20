import { createComponent, createSignal, hydrate, markupOrEmpty, $, createEffect, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, lazySlots, mapArray, mountRowRoot, qsa, renderChild, textOrNode, upsertChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__ab90f7f1', { init: initChip, template: (_p) => `<em class="chip">${markupOrEmpty(_p.children)}</em>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__ab90f7f1', _p, __bfKey) }
export function initLoopElementRowNestedChildrenClick(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [fixedRows] = createSignal([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const [picked, setPicked] = createSignal('none')

  const [_s2, _s7, _s12] = $(__scope, 's2', 's7', 's12')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setRows([{ id: 'c', label: 'C' }, ...rows()]))
  mapArray(() => fixedRows(), _s7, (o) => String(o.id), (o, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<section data-key="${escapeAttr(o().id)}"><template data-bf-ph="s6"></template></section>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Chip__ab90f7f1', 's6', { get children() { return createComponent('Chip__ab90f7f1', { get children() { return `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o().label)}<!--/--></button>` } }, undefined, { parent: __scopeId, mount: 's5' }) } }, undefined, __scope)
    upsertChild(__el, 'Chip__ab90f7f1', 's5', { get children() { return `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o().label)}<!--/--></button>` } }, undefined, __scope)
    { const __e = qsa(__el, '[bf="^s4"]', ["s6","s5"], __scopeId); if (__e) __e.addEventListener('click', () => setPicked(`fx-${o().id}`)) }
    const __bfw_s3 = lazySlots(__el, [{ id: '^s3', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s3('^s3', textOrNode(o().label)) })
    return __el
  }, 'l0')

  mapArray(() => rows(), _s12, (o) => String(o.id), (o, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<section data-key="${escapeAttr(o().id)}"><template data-bf-ph="s11"></template></section>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Chip__ab90f7f1', 's11', { get children() { return createComponent('Chip__ab90f7f1', { get children() { return `<button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(o().label)}<!--/--></button>` } }, undefined, { parent: __scopeId, mount: 's10' }) } }, undefined, __scope)
    upsertChild(__el, 'Chip__ab90f7f1', 's10', { get children() { return `<button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(o().label)}<!--/--></button>` } }, undefined, __scope)
    { const __e = qsa(__el, '[bf="^s9"]', ["s11","s10"], __scopeId); if (__e) __e.addEventListener('click', () => setPicked(`sg-${o().id}`)) }
    const __bfw_s8 = lazySlots(__el, [{ id: '^s8', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s8('^s8', textOrNode(o().label)) })
    return __el
  }, 'l1')

}

hydrate('LoopElementRowNestedChildrenClick', { init: initLoopElementRowNestedChildrenClick, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s2">add</button><div class="fixed" bf="s7"><!--bf-loop:l0-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `<section data-key="${escapeAttr(o.id)}">${renderChild('Chip__ab90f7f1', {children: `${renderChild('Chip__ab90f7f1', {children: `<button type="button" class="pick" bf="^s4"><!--bf:^s3-->${escapeText(o.label)}<!--/--></button>`}, undefined, 's5')}`}, undefined, 's6')}</section>`).join('')}<!--bf-/loop:l0--></div><div class="signal" bf="s12"><!--bf-loop:l1-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `<section data-key="${escapeAttr(o.id)}">${renderChild('Chip__ab90f7f1', {children: `${renderChild('Chip__ab90f7f1', {children: `<button type="button" class="pick" bf="^s9"><!--bf:^s8-->${escapeText(o.label)}<!--/--></button>`}, undefined, 's10')}`}, undefined, 's11')}</section>`).join('')}<!--bf-/loop:l1--></div></div>` })
export function LoopElementRowNestedChildrenClick(_p, __bfKey) { return createComponent('LoopElementRowNestedChildrenClick', _p, __bfKey) }
