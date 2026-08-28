import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initMultiRootFragment(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => { setCount(count() + 1) })
}

hydrate('MultiRootFragment', { init: initMultiRootFragment, template: (_p) => `<h1>title</h1><p bf="s1"><!--bf:s0-->${escapeTextOrMarkup((0))}<!--/--></p>`, comment: true, fragmentRoot: true })
export function MultiRootFragment(_p, __bfKey) { return createComponent('MultiRootFragment', _p, __bfKey) }
