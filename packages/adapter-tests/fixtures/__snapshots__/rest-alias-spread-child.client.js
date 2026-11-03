import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, lazySlots, $c, initChild, renderChild } from '@barefootjs/client/runtime'

export function initChip(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [on, setOn] = createSignal(false)

  const [_s2, _s1] = $(__scope, 's2', 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label ?? 'none'
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
      { const __x = _p.size
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-size', String(__v)); else _s2.removeAttribute('data-size') }
      }
      __l[1] = __x }
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

hydrate('Chip__ad9506a0', { init: initChip, template: (_p) => `<button ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} ${(_p.size) != null ? 'data-size="' + escapeAttr(_p.size) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label ?? 'none')}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__ad9506a0', _p, __bfKey) }
export function initRestAliasSpreadChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1] = $c(__scope, 's0', 's1')


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Chip_s0El] = $c(__scope, 's0')
    if (__Chip_s0El) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Chip_s0El.hasAttribute('label')) { const __v = __x; if (__v != null) __Chip_s0El.setAttribute('label', String(__v)); else __Chip_s0El.removeAttribute('label') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Chip__ad9506a0', _s0, { get tone() { return _p.tone }, get size() { return _p.size }, tone: "override", get label() { return _p.label } })
  initChild('Chip__ad9506a0', _s1, { get tone() { return _p.tone }, get size() { return _p.size } })
}

hydrate('RestAliasSpreadChild', { init: initRestAliasSpreadChild, template: (_p) => `<div>${renderChild('Chip__ad9506a0', {tone: _p.tone, size: _p.size, tone: "override", label: _p.label}, undefined, 's0')}${renderChild('Chip__ad9506a0', {tone: _p.tone, size: _p.size}, undefined, 's1')}</div>` })
export function RestAliasSpreadChild(_p, __bfKey) { return createComponent('RestAliasSpreadChild', _p, __bfKey) }
