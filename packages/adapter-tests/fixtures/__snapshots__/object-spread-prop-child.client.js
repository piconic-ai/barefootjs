import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, lazySlots, $c, initChild, renderChild, spreadChildProps } from '@barefootjs/client/runtime'

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

hydrate('Chip__8c5ffb6b', { init: initChip, template: (_p) => `<button ${(_p.id) != null ? 'data-id="' + escapeAttr(_p.id) + '"' : ''} ${(_p.size) != null ? 'data-size="' + escapeAttr(_p.size) + '"' : ''} ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__8c5ffb6b', _p, __bfKey) }
export function initObjectSpreadPropChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Chip__8c5ffb6b', _s0, spreadChildProps({ label: "ignored", tone: "base" }, () => (_p.row), { id: "fixed" }))
}

hydrate('ObjectSpreadPropChild', { init: initObjectSpreadPropChild, template: (_p) => `<div>${renderChild('Chip__8c5ffb6b', {label: "ignored", tone: "base", ..._p.row, id: "fixed"}, undefined, 's0')}</div>` })
export function ObjectSpreadPropChild(_p, __bfKey) { return createComponent('ObjectSpreadPropChild', _p, __bfKey) }
