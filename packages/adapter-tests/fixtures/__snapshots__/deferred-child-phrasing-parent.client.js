import { createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, upsertChild } from '@barefootjs/client/runtime'

export function initPhrasingChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('PhrasingChild__6a8a095e', { init: initPhrasingChild, template: (_p) => `<b class="child" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--></b>`, name: 'PhrasingChild' })
export function PhrasingChild(_p, __bfKey) { return createComponent('PhrasingChild__6a8a095e', _p, __bfKey) }
export function initDeferredChildPhrasingParent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [name] = createSignal('a')
  const read = () => name()
  const label = read()

  const [_s0, _s1] = $c(__scope, 's0', 's1')


  // Initialize child components with props
  upsertChild(__scope, 'PhrasingChild__6a8a095e', 's0', { get label() { return read() } })
  upsertChild(__scope, 'PhrasingChild__6a8a095e', 's1', { get label() { return read() } })
}

hydrate('DeferredChildPhrasingParent', { init: initDeferredChildPhrasingParent, template: (_p) => `<div><p class="para"><template data-bf-ph="s0"></template></p><p class="nested"><span><template data-bf-ph="s1"></template></span></p></div>` })
export function DeferredChildPhrasingParent(_p, __bfKey) { return createComponent('DeferredChildPhrasingParent', _p, __bfKey) }
