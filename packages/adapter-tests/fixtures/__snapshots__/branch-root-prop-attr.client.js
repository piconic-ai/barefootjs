import { $, $c, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, hydrate, initChild, insertRoot, qsa, renderChild } from '@barefootjs/client/runtime'

export function initVariantTag(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const variant = _p.variant ?? 'a'
  const asChild = _p.asChild ?? false

  const variantClasses = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[variant]

  const [_s2] = $(__scope, 's2')

  insertRoot(__scope, 's2', () => asChild, {
    template: () => { const __slots = []; return { html: `<em data-slot="alt" ${(cls) != null ? 'class="' + escapeAttr(cls) + '"' : ''} bf="s1">alt</em>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s1 = qsa(__branchScope, '[bf="s1"]')
      if (__ra_s1) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = variantClasses[(_p.variant ?? 'a')]; if (__v != null) __ra_s1.setAttribute('class', String(__v)); else __ra_s1.removeAttribute('class') }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<span data-slot="tag" ${(cls) != null ? 'class="' + escapeAttr(cls) + '"' : ''} bf="s0">tag</span>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s0 = qsa(__branchScope, '[bf="s0"]')
      if (__ra_s0) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = variantClasses[(_p.variant ?? 'a')]; if (__v != null) __ra_s0.setAttribute('class', String(__v)); else __ra_s0.removeAttribute('class') }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  })

}

hydrate('VariantTag', { init: initVariantTag, template: (_p) => `${_p.asChild ? `<em data-slot="alt" ${((({ a: 'cls-a', b: 'cls-b' })[_p.variant])) != null ? 'class="' + escapeAttr((({ a: 'cls-a', b: 'cls-b' })[_p.variant])) + '"' : ''} bf="s1">alt</em>` : `<span data-slot="tag" ${((({ a: 'cls-a', b: 'cls-b' })[_p.variant])) != null ? 'class="' + escapeAttr((({ a: 'cls-a', b: 'cls-b' })[_p.variant])) + '"' : ''} bf="s0">tag</span>`}` })
export function VariantTag(_p, __bfKey) { return createComponent('VariantTag', _p, __bfKey) }
export function initBranchRootPropAttr(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [variant, setVariant] = createSignal('a')

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  if (_s1) _s1.addEventListener('click', () => { setVariant(v => (v === 'a' ? 'b' : 'a')) })

  // Reactive prop bindings
  createEffect(() => {
    if (_s0) {
      _s0.setAttribute('variant', String(variant()))
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__VariantTag_s0El] = $c(__scope, 's0')
    if (__VariantTag_s0El) {
      { const __v = variant(); if (__v != null) __VariantTag_s0El.setAttribute('variant', String(__v)); else __VariantTag_s0El.removeAttribute('variant') }
    }
  })

  // Initialize child components with props
  initChild('VariantTag', _s0, { get variant() { return variant() } })
}

hydrate('BranchRootPropAttr', { init: initBranchRootPropAttr, template: (_p) => `<div>${renderChild('VariantTag', {variant: ('a')}, undefined, 's0')}<button bf="s1">cycle</button></div>` })
export function BranchRootPropAttr(_p, __bfKey) { return createComponent('BranchRootPropAttr', _p, __bfKey) }
