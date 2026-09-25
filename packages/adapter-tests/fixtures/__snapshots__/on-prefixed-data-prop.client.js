import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, insert, $c, initChild, mapArray, mountRowRoot, renderChild, upsertChild } from '@barefootjs/client/runtime'

export function initBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1] = $(__scope, 's0', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-label', String(__v)); else _s1.removeAttribute('data-label') }
      }
      __l[0] = __x }
      { const __x = `${_p.once ? 'yes' : 'no'}`
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-flag', String(__v)); else _s1.removeAttribute('data-flag') }
      }
      __l[1] = __x }
    }
  }) }

  insert(__scope, 's0', () => _p.once, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('on', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${__bfSlot('off', __slots)}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

}

hydrate('Badge__cc8941c3', { init: initBadge, template: (_p) => `<em class="badge" ${(_p.label) != null ? 'data-label="' + escapeAttr(_p.label) + '"' : ''} ${(`${_p.once ? 'yes' : 'no'}`) != null ? 'data-flag="' + escapeAttr(`${_p.once ? 'yes' : 'no'}`) + '"' : ''} bf="s1">${_p.once ? `<!--bf-cond-start:s0-->${escapeText('on')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0-->${escapeText('off')}<!--bf-cond-end:s0-->`}</em>`, name: 'Badge' })
export function Badge(_p, __bfKey) { return createComponent('Badge__cc8941c3', _p, __bfKey) }
export function initOnPrefixedDataProp(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [flag, setFlag] = createSignal(true)
  const [opts] = createSignal([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])

  const [_s5, _s2, _s4] = $(__scope, 's5', 's2', 's4')
  const [_s0] = $c(__scope, 's0')

  if (_s5) _s5.addEventListener('click', () => { setFlag(v => !v) })

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s0) {
      if (__m[0] ??= _s0.hasAttribute('once')) { const __v = flag(); if (__v != null) _s0.setAttribute('once', String(__v)); else _s0.removeAttribute('once') }
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Badge_s0El] = $c(__scope, 's0')
    if (__Badge_s0El) {
      { const __x = flag()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Badge_s0El.hasAttribute('once')) { const __v = __x; if (__v != null) __Badge_s0El.setAttribute('once', String(__v)); else __Badge_s0El.removeAttribute('once') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Badge__cc8941c3', _s0, { get once() { return flag() }, label: "top" })
  mapArray(() => opts(), _s2, (o) => String(o.id), (o, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(o().id)}"><div data-bf-ph="s1"></div></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Badge__cc8941c3', 's1', { get once() { return flag() }, get label() { return o().label } }, undefined, __scope)
    return __el
  }, 'l0')

  mapArray(() => opts(), _s4, (o) => String(o.id), (o, __idx, __existing) => {
    if (__existing) { initChild('Badge__cc8941c3', __existing, { get once() { return flag() }, get label() { return o().label } }); return __existing }
    return createComponent('Badge__cc8941c3', { get once() { return flag() }, get label() { return o().label } }, o().id)
  }, 'l1')

}

hydrate('OnPrefixedDataProp', { init: initOnPrefixedDataProp, template: (_p) => `<div><p class="top">${renderChild('Badge__cc8941c3', {once: (true), label: "top"}, undefined, 's0')}</p><ul class="rows" bf="s2"><!--bf-loop:l0-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `<li data-key="${escapeAttr(o.id)}">${renderChild('Badge__cc8941c3', {once: (true), label: o.label}, undefined, 's1')}</li>`).join('')}<!--bf-/loop:l0--></ul><p class="direct" bf="s4"><!--bf-loop:l1-->${([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]).map((o) => `${renderChild('Badge__cc8941c3', {once: (true), label: o.label}, o.id, 's3', true)}`).join('')}<!--bf-/loop:l1--></p><button type="button" class="toggle" bf="s5"> toggle </button></div>` })
export function OnPrefixedDataProp(_p, __bfKey) { return createComponent('OnPrefixedDataProp', _p, __bfKey) }
