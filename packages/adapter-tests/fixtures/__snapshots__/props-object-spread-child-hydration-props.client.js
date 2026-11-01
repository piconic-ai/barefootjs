import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, lazySlots, $c, forwardProps, initChild, renderChild } from '@barefootjs/client/runtime'

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
      { const __x = _p.tone
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-tone', String(__v)); else _s2.removeAttribute('data-tone') }
      }
      __l[0] = __x }
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

hydrate('Chip__1cfa3057', { init: initChip, template: (_p) => `<button ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__1cfa3057', _p, __bfKey) }
export function initPropsObjectSpreadChildHydrationProps(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Chip__1cfa3057', _s0, forwardProps(_p, {}, []))
}

hydrate('PropsObjectSpreadChildHydrationProps', { init: initPropsObjectSpreadChildHydrationProps, template: (_p) => `<div>${renderChild('Chip__1cfa3057', {..._p}, undefined, 's0')}</div>` })
export function PropsObjectSpreadChildHydrationProps(_p, __bfKey) { return createComponent('PropsObjectSpreadChildHydrationProps', _p, __bfKey) }
