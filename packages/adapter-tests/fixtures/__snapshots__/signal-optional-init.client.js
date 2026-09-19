import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initSignalOptionalInit(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [label, setLabel] = createSignal('one')

  const [_s2, _s1] = $(__scope, 's2', 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = label()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = label()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('title', String(__v)); else _s1.removeAttribute('title') }
      }
      __l[0] = __x }
    }
  }) }

  if (_s2) _s2.addEventListener('click', () => { setLabel(l => (l === undefined ? 'one' : undefined)) })
}

hydrate('SignalOptionalInit', { init: initSignalOptionalInit, template: (_p) => `<div><span data-slot="target" ${(('one')) != null ? 'title="' + escapeAttr(('one')) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('one'))}<!--/--></span><button bf="s2">toggle</button></div>` })
export function SignalOptionalInit(_p, __bfKey) { return createComponent('SignalOptionalInit', _p, __bfKey) }
