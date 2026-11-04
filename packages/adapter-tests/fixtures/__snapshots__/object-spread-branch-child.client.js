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
      { const __x = _p.size
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-size', String(__v)); else _s2.removeAttribute('data-size') }
      }
      __l[0] = __x }
      { const __x = _p.tone
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-tone', String(__v)); else _s2.removeAttribute('data-tone') }
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

hydrate('Chip__02d4df80', { init: initChip, template: (_p) => `<button ${(_p.size) != null ? 'data-size="' + escapeAttr(_p.size) + '"' : ''} ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__02d4df80', _p, __bfKey) }
export function initPick(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')
  const [_s1] = $c(__scope, 's1')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = _p.tone
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-tone', String(__v)); else _s0.removeAttribute('data-tone') }
      }
      __l[0] = __x }
    }
  }) }


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Chip_s1El] = $c(__scope, 's1')
    if (__Chip_s1El) {
      { const __x = ((__s) => __s != null && "tone" in Object(__s) ? Object(__s)["tone"] : _p.tone)((_p.item.inner))
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Chip_s1El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Chip_s1El.setAttribute('tone', String(__v)); else __Chip_s1El.removeAttribute('tone') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Chip__02d4df80', _s1, spreadChildProps({ get tone() { return _p.tone } }, () => ((_p.item.inner))))
}

hydrate('Pick__02d4df80', { init: initPick, template: (_p) => `${_p.item ? `<span>${renderChild('Chip__02d4df80', {tone: _p.tone, ...(_p.item.inner)}, undefined, 's1')}</span>` : `<em ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s0">none</em>`}`, name: 'Pick' })
export function Pick(_p, __bfKey) { return createComponent('Pick__02d4df80', _p, __bfKey) }
export function initObjectSpreadBranchChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1] = $c(__scope, 's0', 's1')


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Pick_s1El] = $c(__scope, 's1')
    if (__Pick_s1El) {
      { const __x = _p.item
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Pick_s1El.hasAttribute('item')) { const __v = __x; if (__v != null) __Pick_s1El.setAttribute('item', String(__v)); else __Pick_s1El.removeAttribute('item') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Pick__02d4df80', _s0, { tone: "empty" })
  initChild('Pick__02d4df80', _s1, { tone: "full", get item() { return _p.item } })
}

hydrate('ObjectSpreadBranchChild', { init: initObjectSpreadBranchChild, template: (_p) => `<div>${renderChild('Pick__02d4df80', {tone: "empty"}, undefined, 's0')}${renderChild('Pick__02d4df80', {tone: "full", item: _p.item}, undefined, 's1')}</div>` })
export function ObjectSpreadBranchChild(_p, __bfKey) { return createComponent('ObjectSpreadBranchChild', _p, __bfKey) }
