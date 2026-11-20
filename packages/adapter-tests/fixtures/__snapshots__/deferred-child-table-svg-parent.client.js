import { createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $, escapeAttr, $c, upsertChild } from '@barefootjs/client/runtime'

export function initTableRow(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('TableRow__057d4305', { init: initTableRow, template: (_p) => `<tr class="row"><td bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></td></tr>`, name: 'TableRow' })
export function TableRow(_p, __bfKey) { return createComponent('TableRow__057d4305', _p, __bfKey) }
export function initTableCell(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('TableCell__057d4305', { init: initTableCell, template: (_p) => `<td class="cell" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></td>`, name: 'TableCell' })
export function TableCell(_p, __bfKey) { return createComponent('TableCell__057d4305', _p, __bfKey) }
export function initSvgDot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-label', String(__v)); else _s0.removeAttribute('data-label') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('SvgDot__057d4305', { init: initSvgDot, template: (_p) => `<circle class="dot" r="2" ${(_p.label) != null ? 'data-label="' + escapeAttr(_p.label) + '"' : ''} bf="s0"></circle>`, name: 'SvgDot' })
export function SvgDot(_p, __bfKey) { return createComponent('SvgDot__057d4305', _p, __bfKey) }
export function initDeferredChildTableSvgParent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [name] = createSignal('a')
  const read = () => name()
  const label = read()

  const [_s0, _s1, _s2] = $c(__scope, 's0', 's1', 's2')


  // Initialize child components with props
  upsertChild(__scope, 'TableRow__057d4305', 's0', { get label() { return read() } })
  upsertChild(__scope, 'TableCell__057d4305', 's1', { get label() { return read() } })
  upsertChild(__scope, 'SvgDot__057d4305', 's2', { get label() { return read() } })
}

hydrate('DeferredChildTableSvgParent', { init: initDeferredChildTableSvgParent, template: (_p) => `<div><table><tbody class="body"><template data-bf-ph="s0"></template><tr class="host-row"><template data-bf-ph="s1"></template></tr></tbody></table><svg class="pic" viewBox="0 0 4 4"><template data-bf-ph="s2"></template></svg></div>` })
export function DeferredChildTableSvgParent(_p, __bfKey) { return createComponent('DeferredChildTableSvgParent', _p, __bfKey) }
