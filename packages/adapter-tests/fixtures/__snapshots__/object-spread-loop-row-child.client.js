import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, lazySlots, initChild, mapArray, renderChild, spreadChildProps } from '@barefootjs/client/runtime'

export function initChip(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [on, setOn] = createSignal(false)

  const [_s2, _s1] = $(__scope, 's2', 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s2) {
      { const __x = _p.id
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-id', String(__v)); else _s2.removeAttribute('data-id') }
      }
      __l[0] = __x }
      { const __x = _p.size
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-size', String(__v)); else _s2.removeAttribute('data-size') }
      }
      __l[1] = __x }
      { const __x = _p.tone
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-tone', String(__v)); else _s2.removeAttribute('data-tone') }
      }
      __l[2] = __x }
    }
  }) }

  insert(__scope, 's1', () => on(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('!', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s2) _s2.addEventListener('click', () => setOn(!on()))
}

hydrate('Chip__82d53e9d', { init: initChip, template: (_p) => `<button ${(_p.id) != null ? 'data-id="' + escapeAttr(_p.id) + '"' : ''} ${(_p.size) != null ? 'data-size="' + escapeAttr(_p.size) + '"' : ''} ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__82d53e9d', _p, __bfKey) }
export function initObjectSpreadLoopRowChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal(_p.rows ?? undefined)
  createEffect(() => {
    const __val = _p.rows
    if (__val !== undefined) setRows(__val)
  })

  const [_s2, _s1] = $(__scope, 's2', 's1')

  if (_s2) _s2.addEventListener('click', () => setRows(rows().map(r => ({ ...r, label: r.label + '+' }))))
  mapArray(() => rows(), _s1, (r) => String(r.id), (r, __idx, __existing) => {
    if (__existing) { initChild('Chip__82d53e9d', __existing, spreadChildProps({ get tone() { return "base" } }, () => (r()))); return __existing }
    return createComponent('Chip__82d53e9d', spreadChildProps({ get tone() { return "base" } }, () => (r())), r().id)
  }, 'l0')

}

hydrate('ObjectSpreadLoopRowChild', { init: initObjectSpreadLoopRowChild, template: (_p) => `<div><section bf="s1"><!--bf-loop:l0-->${(_p.rows ?? undefined).map((r) => `${renderChild('Chip__82d53e9d', {tone: "base", ...r}, r.id, 's0', true)}`).join('')}<!--bf-/loop:l0--></section><a bf="s2">rename</a></div>` })
export function ObjectSpreadLoopRowChild(_p, __bfKey) { return createComponent('ObjectSpreadLoopRowChild', _p, __bfKey) }
