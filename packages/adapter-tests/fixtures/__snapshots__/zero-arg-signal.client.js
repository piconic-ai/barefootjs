import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initZeroArgSignal(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [v, setV] = createSignal(undefined)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = v() ?? 'none'
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => { setV('x') })
}

hydrate('ZeroArgSignal', { init: initZeroArgSignal, template: (_p) => `<button bf="s1"><!--bf:s0-->${escapeTextOrMarkup((undefined) ?? 'none')}<!--/--></button>` })
export function ZeroArgSignal(_p, __bfKey) { return createComponent('ZeroArgSignal', _p, __bfKey) }
