import { $, applyRestAttrs, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, initChild, renderChild } from '@barefootjs/client/runtime'

export function initBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.title
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) applyRestAttrs(_s1, _p, ["title"])

}

hydrate('Badge__29ef6e3c', { init: initBadge, template: (_p) => `<i bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.title)}<!--/--></i>`, name: 'Badge' })
export function Badge(_p, __bfKey) { return createComponent('Badge__29ef6e3c', _p, __bfKey) }
export function initOpenBodyRestSpreadElement(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [tone, setTone] = createSignal('warm')

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  if (_s1) _s1.addEventListener('click', () => setTone('cool'))

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s0) {
      if (__m[0] ??= _s0.hasAttribute('tone')) { const __v = tone(); if (__v != null) _s0.setAttribute('tone', String(__v)); else _s0.removeAttribute('tone') }
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Badge_s0El] = $c(__scope, 's0')
    if (__Badge_s0El) {
      { const __x = tone()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Badge_s0El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Badge_s0El.setAttribute('tone', String(__v)); else __Badge_s0El.removeAttribute('tone') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Badge__29ef6e3c', _s0, { title: "T", get tone() { return tone() }, lang: "en" })
}

hydrate('OpenBodyRestSpreadElement', { init: initOpenBodyRestSpreadElement, template: (_p) => `<div>${renderChild('Badge__29ef6e3c', {title: "T", tone: ('warm'), lang: "en"}, undefined, 's0')}<button bf="s1">next</button></div>` })
export function OpenBodyRestSpreadElement(_p, __bfKey) { return createComponent('OpenBodyRestSpreadElement', _p, __bfKey) }
