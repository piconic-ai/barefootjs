import { $, createComponent, createEffect, createSignal, escapeAttr, hydrate, $c, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, renderChild, markupOrEmpty, childScopesBySlot } from '@barefootjs/client/runtime'

export function initDot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

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

}

hydrate('Dot__73d3b413', { init: initDot, template: (_p) => `<i class="dot" ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s0"></i>`, name: 'Dot' })
export function Dot(_p, __bfKey) { return createComponent('Dot__73d3b413', _p, __bfKey) }
export function initBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')
  const [_s2, _s3, _s4] = $c(__scope, 's2', 's3', 's4')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => _p.onPick(_p.label))

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Dot_s2El] = $c(__scope, 's2')
    if (__Dot_s2El) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Dot_s2El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Dot_s2El.setAttribute('tone', String(__v)); else __Dot_s2El.removeAttribute('tone') }
      }
      __l[0] = __x }
    }
    const [__Dot_s3El] = $c(__scope, 's3')
    if (__Dot_s3El) {
      { const __x = _p.label
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        if (__m[1] ??= __Dot_s3El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Dot_s3El.setAttribute('tone', String(__v)); else __Dot_s3El.removeAttribute('tone') }
      }
      __l[1] = __x }
    }
    const [__Dot_s4El] = $c(__scope, 's4')
    if (__Dot_s4El) {
      { const __x = _p.label
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        if (__m[2] ??= __Dot_s4El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Dot_s4El.setAttribute('tone', String(__v)); else __Dot_s4El.removeAttribute('tone') }
      }
      __l[2] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Dot__73d3b413', _s2, { get tone() { return _p.label } })
  initChild('Dot__73d3b413', _s3, { get tone() { return _p.label } })
  initChild('Dot__73d3b413', _s4, { get tone() { return _p.label } })
}

hydrate('Badge__73d3b413', { init: initBadge, template: (_p) => `<em class="badge"><button type="button" class="pick" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></button>${renderChild('Dot__73d3b413', {tone: _p.label}, undefined, 's2')}${renderChild('Dot__73d3b413', {tone: _p.label}, undefined, 's3')}${renderChild('Dot__73d3b413', {tone: _p.label}, undefined, 's4')}</em>`, name: 'Badge' })
export function Badge(_p, __bfKey) { return createComponent('Badge__73d3b413', _p, __bfKey) }
export function initGroup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = _p.name
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-name', String(__v)); else _s0.removeAttribute('data-name') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('Group__73d3b413', { init: initGroup, template: (_p) => `<section class="group" ${(_p.name) != null ? 'data-name="' + escapeAttr(_p.name) + '"' : ''} bf="s0">${markupOrEmpty(_p.children)}</section>`, name: 'Group' })
export function Group(_p, __bfKey) { return createComponent('Group__73d3b413', _p, __bfKey) }
export function initStaticLoopRowChildOwnSlot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const FLAT = ['a', 'b', 'c']
  const GROUPS = [
  { name: 'x', tags: ['a', 'b'] },
  { name: 'y', tags: ['c'] },
]
  const [picked, setPicked] = createSignal('none')

  const [_s3, _s6] = $(__scope, 's3', 's6')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  // Initialize static array children (hydrate skips nested instances)
  if (_s3) {
    const __childScopes = childScopesBySlot(_s3, __scopeId, 's2')
    __childScopes.forEach((childScope, __idx) => {
      const t = FLAT[__idx]
      initChild('Badge__73d3b413', childScope, { get label() { return t }, onPick: (label) => setPicked(`f-${label}`) })
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s6) {
    const __childScopes = childScopesBySlot(_s6, __scopeId, 's5')
    __childScopes.forEach((childScope, __idx) => {
      const g = GROUPS[__idx]
      initChild('Group__73d3b413', childScope, { get name() { return g.name } })
    })
  }

  // Initialize component-rooted inner-loop components (depth 1)
  if (_s6) {
    const __compScopes = childScopesBySlot(_s6, __scopeId, 's4')
    let __ci = 0
    GROUPS.forEach((g) => {
      g.tags.forEach((t) => {
        const __compEl = __compScopes[__ci++]
        if (__compEl) initChild('Badge__73d3b413', __compEl, { get label() { return t }, onPick: (label) => setPicked(`g-${label}`) })
      })
    })
  }

}

hydrate('StaticLoopRowChildOwnSlot', { init: initStaticLoopRowChildOwnSlot, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><div class="flat" bf="s3"><!--bf-loop:l0-->${(['a', 'b', 'c']).map((t) => `${renderChild('Badge__73d3b413', {label: t}, t, 's2', true)}`).join('')}<!--bf-/loop:l0--></div><div class="grouped" bf="s6"><!--bf-loop:l2-->${([
  { name: 'x', tags: ['a', 'b'] },
  { name: 'y', tags: ['c'] },
]).map((g) => `${renderChild('Group__73d3b413', {name: g.name, children: `<!--bf-loop:l1-->${g.tags.map((t) => `${renderChild('Badge__73d3b413', {label: t}, t, 's4', true)}`).join('')}<!--bf-/loop:l1-->`}, g.name, 's5', true)}`).join('')}<!--bf-/loop:l2--></div></div>` })
export function StaticLoopRowChildOwnSlot(_p, __bfKey) { return createComponent('StaticLoopRowChildOwnSlot', _p, __bfKey) }
