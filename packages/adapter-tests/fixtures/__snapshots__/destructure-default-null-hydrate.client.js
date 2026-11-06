import { $, $c, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, lazySlots, renderChild } from '@barefootjs/client/runtime'

export function initDefaultedLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = (_p.label === undefined ? 'D' : _p.label)
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = (_p.label === undefined ? 'D' : _p.label)
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('title', String(__v)); else _s1.removeAttribute('title') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('DefaultedLabel', { init: initDefaultedLabel, template: (_p) => `<p data-slot="label" ${((_p.label === undefined ? 'D' : _p.label)) != null ? 'title="' + escapeAttr((_p.label === undefined ? 'D' : _p.label)) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.label === undefined ? 'D' : _p.label))}<!--/--></p>` })
export function DefaultedLabel(_p, __bfKey) { return createComponent('DefaultedLabel', _p, __bfKey) }
export function initDestructureDefaultNullHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [label, setLabel] = createSignal(null)

  const [_s3] = $(__scope, 's3')
  const [_s0, _s1, _s2] = $c(__scope, 's0', 's1', 's2')

  if (_s3) _s3.addEventListener('click', () => setLabel(v => (v === null ? 'X' : null)))

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s0) {
      if (__m[0] ??= _s0.hasAttribute('label')) { const __v = label(); if (__v != null) _s0.setAttribute('label', String(__v)); else _s0.removeAttribute('label') }
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__DefaultedLabel_s0El] = $c(__scope, 's0')
    if (__DefaultedLabel_s0El) {
      { const __x = label()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __DefaultedLabel_s0El.hasAttribute('label')) { const __v = __x; if (__v != null) __DefaultedLabel_s0El.setAttribute('label', String(__v)); else __DefaultedLabel_s0El.removeAttribute('label') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('DefaultedLabel', _s0, { get label() { return label() } })
  initChild('DefaultedLabel', _s1, { get label() { return undefined } })
  initChild('DefaultedLabel', _s2, {})
}

hydrate('DestructureDefaultNullHydrate', { init: initDestructureDefaultNullHydrate, template: (_p) => `<div><section data-case="null">${renderChild('DefaultedLabel', {label: (null)}, undefined, 's0')}</section><section data-case="undefined">${renderChild('DefaultedLabel', {label: undefined}, undefined, 's1')}</section><section data-case="omitted">${renderChild('DefaultedLabel', {}, undefined, 's2')}</section><button bf="s3">cycle</button></div>` })
export function DestructureDefaultNullHydrate(_p, __bfKey) { return createComponent('DestructureDefaultNullHydrate', _p, __bfKey) }
