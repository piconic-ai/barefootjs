import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, __bfSlot, escapeText, initChild, insert, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initActionButton(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.name
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = _p.name
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-name', String(__v)); else _s1.removeAttribute('data-name') }
      }
      __l[0] = __x }
      { const __x = _p.disabled
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        _s1.disabled = !!(__x)
      }
      __l[1] = __x }
      { const __x = _p.hidden
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        _s1.hidden = !!(__x)
      }
      __l[2] = __x }
    }
  }) }

}

hydrate('ActionButton__08b83f2a', { init: initActionButton, template: (_p) => `<button class="child-action" ${(_p.name) != null ? 'data-name="' + escapeAttr(_p.name) + '"' : ''} ${_p.disabled ? 'disabled' : ''} ${_p.hidden ? 'hidden' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.name)}<!--/--></button>`, name: 'ActionButton' })
export function ActionButton(_p, __bfKey) { return createComponent('ActionButton__08b83f2a', _p, __bfKey) }
export function initFragmentRootCondChildBoolProps(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [shown] = createSignal(true)
  const [late, setLate] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const [_s1, _s4, _s0, _s2, _s5] = $(__scope, 's1', 's4', 's0', 's2', 's5')
  const [_s3, _s6] = $c(__scope, 's3', 's6')

  insert(__scope, 's0', () => busy(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('busy', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('idle', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's2', () => shown(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2-->${renderChild('ActionButton__08b83f2a', {name: "first", disabled: busy(), hidden: busy()}, undefined, 's3')}<!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's3')
      if (__c0) initChild('ActionButton__08b83f2a', __c0, { name: "first", get disabled() { return busy() }, get hidden() { return busy() } })
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's5', () => late(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5-->${renderChild('ActionButton__08b83f2a', {name: "late", disabled: busy(), hidden: busy()}, undefined, 's6')}<!--bf-cond-end:s5-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's6')
      if (__c0) initChild('ActionButton__08b83f2a', __c0, { name: "late", get disabled() { return busy() }, get hidden() { return busy() } })
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s1) _s1.addEventListener('click', () => setBusy(!busy()))
  if (_s4) _s4.addEventListener('click', () => setLate(!late()))

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s3) {
      if (__m[0] ??= _s3.hasAttribute('disabled')) _s3.disabled = !!(busy())
      if (__m[1] ??= _s3.hasAttribute('hidden')) _s3.hidden = !!(busy())
    }
    if (_s6) {
      if (__m[2] ??= _s6.hasAttribute('disabled')) _s6.disabled = !!(busy())
      if (__m[3] ??= _s6.hasAttribute('hidden')) _s6.hidden = !!(busy())
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__ActionButton_s3El] = $c(__scope, 's3')
    if (__ActionButton_s3El) {
      { const __x = busy()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __ActionButton_s3El.hasAttribute('disabled')) __ActionButton_s3El.disabled = !!(__x)
      }
      __l[0] = __x }
      { const __x = busy()
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        if (__m[1] ??= __ActionButton_s3El.hasAttribute('hidden')) __ActionButton_s3El.hidden = !!(__x)
      }
      __l[1] = __x }
    }
    const [__ActionButton_s6El] = $c(__scope, 's6')
    if (__ActionButton_s6El) {
      { const __x = busy()
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        if (__m[2] ??= __ActionButton_s6El.hasAttribute('disabled')) __ActionButton_s6El.disabled = !!(__x)
      }
      __l[2] = __x }
      { const __x = busy()
      if (!(3 in __l) || !Object.is(__l[3], __x)) {
        if (__m[3] ??= __ActionButton_s6El.hasAttribute('hidden')) __ActionButton_s6El.hidden = !!(__x)
      }
      __l[3] = __x }
    }
  }) }
}

hydrate('FragmentRootCondChildBoolProps', { init: initFragmentRootCondChildBoolProps, template: (_p) => `<button class="toggle" bf="s1">${(false) ? `<!--bf-cond-start:s0-->${escapeText('busy')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('idle')}<!--bf-cond-end:s0-->`}</button>${(true) ? `<!--bf-cond-start:s2-->${renderChild('ActionButton__08b83f2a', {name: "first", disabled: (false), hidden: (false)}, undefined, 's3')}<!--bf-cond-end:s2-->` : `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`}<button class="enter" bf="s4">enter</button>${(false) ? `<!--bf-cond-start:s5-->${renderChild('ActionButton__08b83f2a', {name: "late", disabled: (false), hidden: (false)}, undefined, 's6')}<!--bf-cond-end:s5-->` : `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`}`, comment: true, fragmentRoot: true })
export function FragmentRootCondChildBoolProps(_p, __bfKey) { return createComponent('FragmentRootCondChildBoolProps', _p, __bfKey) }
