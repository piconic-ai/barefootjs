import { createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $, escapeAttr, mapArray, mountRowRoot, renderChild, upsertChild } from '@barefootjs/client/runtime'

export function initRowText(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.text
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('RowText__6f2e510c', { init: initRowText, template: (_p) => `<em class="text" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.text)}<!--/--></em>`, name: 'RowText' })
export function RowText(_p, __bfKey) { return createComponent('RowText__6f2e510c', _p, __bfKey) }
export function initRowCell(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.text
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('RowCell__6f2e510c', { init: initRowCell, template: (_p) => `<td class="cell" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.text)}<!--/--></td>`, name: 'RowCell' })
export function RowCell(_p, __bfKey) { return createComponent('RowCell__6f2e510c', _p, __bfKey) }
export function initRowDot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = _p.text
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-text', String(__v)); else _s0.removeAttribute('data-text') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('RowDot__6f2e510c', { init: initRowDot, template: (_p) => `<circle class="dot" r="1" ${(_p.text) != null ? 'data-text="' + escapeAttr(_p.text) + '"' : ''} bf="s0"></circle>`, name: 'RowDot' })
export function RowDot(_p, __bfKey) { return createComponent('RowDot__6f2e510c', _p, __bfKey) }
export function initCompositeRowChildRestrictedParent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal(_p.items ?? [])
  createEffect(() => {
    const __val = _p.items
    if (__val !== undefined) setRows(__val)
  })

  const [_s6, _s1, _s3, _s5] = $(__scope, 's6', 's1', 's3', 's5')

  if (_s6) _s6.addEventListener('click', () => setRows(r => [...r, { id: r.length + 1, label: 'n' + (r.length + 1) }]))
  mapArray(() => rows(), _s1, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}"><p><template data-bf-ph="s0"></template></p></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'RowText__6f2e510c', 's0', { get text() { return row().label } }, undefined, __scope)
    return __el
  }, 'l0')

  mapArray(() => rows(), _s3, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<tr data-key="${escapeAttr(row().id)}"><template data-bf-ph="s2"></template></tr>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'RowCell__6f2e510c', 's2', { get text() { return row().label } }, undefined, __scope)
    return __el
  }, 'l1')

  mapArray(() => rows(), _s5, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<svg><g data-key="${escapeAttr(row().id)}"><template data-bf-ph="s4"></template></g></svg>`
      return __tpl.content.firstElementChild.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'RowDot__6f2e510c', 's4', { get text() { return row().label } }, undefined, __scope)
    return __el
  }, 'l2')

}

hydrate('CompositeRowChildRestrictedParent', { init: initCompositeRowChildRestrictedParent, template: (_p) => `<div><ul class="list" bf="s1"><!--bf-loop:l0-->${(_p.items ?? []).map((row) => `<li data-key="${escapeAttr(row.id)}"><p>${renderChild('RowText__6f2e510c', {text: row.label}, undefined, 's0')}</p></li>`).join('')}<!--bf-/loop:l0--></ul><table><tbody class="body" bf="s3"><!--bf-loop:l1-->${(_p.items ?? []).map((row) => `<tr data-key="${escapeAttr(row.id)}">${renderChild('RowCell__6f2e510c', {text: row.label}, undefined, 's2')}</tr>`).join('')}<!--bf-/loop:l1--></tbody></table><svg class="pic" viewBox="0 0 4 4" bf="s5"><!--bf-loop:l2-->${(_p.items ?? []).map((row) => `<g data-key="${escapeAttr(row.id)}">${renderChild('RowDot__6f2e510c', {text: row.label}, undefined, 's4')}</g>`).join('')}<!--bf-/loop:l2--></svg><button type="button" class="add" bf="s6">add</button></div>` })
export function CompositeRowChildRestrictedParent(_p, __bfKey) { return createComponent('CompositeRowChildRestrictedParent', _p, __bfKey) }
