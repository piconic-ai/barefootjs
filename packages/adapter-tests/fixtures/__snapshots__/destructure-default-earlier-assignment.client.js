import { createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initDestructureDefaultEarlierAssignment(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  let a = _p.a === undefined ? 1 : _p.a
  let b = _p.b === undefined ? (a = 2) : _p.b
  let c = _p.c === undefined ? a : _p.c

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = c
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('DestructureDefaultEarlierAssignment', { init: initDestructureDefaultEarlierAssignment, template: (_p) => `<p data-slot="value" bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.c ?? _p.a))}<!--/--></p>` })
export function DestructureDefaultEarlierAssignment(_p, __bfKey) { return createComponent('DestructureDefaultEarlierAssignment', _p, __bfKey) }
