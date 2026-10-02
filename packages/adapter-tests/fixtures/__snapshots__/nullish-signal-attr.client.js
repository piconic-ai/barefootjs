import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initNullishSignalAttr(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(undefined)
  const [s, setS] = createSignal(undefined)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = n() ?? 'none'
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = s()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('title', String(__v)); else _s1.removeAttribute('title') }
      }
      __l[0] = __x }
      { const __x = n()
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-n', String(__v)); else _s1.removeAttribute('data-n') }
      }
      __l[1] = __x }
    }
  }) }

  if (_s1) _s1.addEventListener('click', () => {
        setN(1)
        setS('x')
      })
}

hydrate('NullishSignalAttr', { init: initNullishSignalAttr, template: (_p) => `<button ${((undefined)) != null ? 'title="' + escapeAttr((undefined)) + '"' : ''} ${((undefined)) != null ? 'data-n="' + escapeAttr((undefined)) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup((undefined) ?? 'none')}<!--/--></button>` })
export function NullishSignalAttr(_p, __bfKey) { return createComponent('NullishSignalAttr', _p, __bfKey) }
