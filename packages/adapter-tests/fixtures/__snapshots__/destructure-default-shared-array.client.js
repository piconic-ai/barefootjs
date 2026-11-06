import { createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initDestructureDefaultSharedArray(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  let a = _p.a === undefined ? [] : _p.a
  let b = _p.b === undefined ? a : _p.b
  const n = a.push('x') && b.length

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = n
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('DestructureDefaultSharedArray', { init: initDestructureDefaultSharedArray, template: (_p) => `<p data-slot="count" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(((_p.a ?? []).push('x') && (_p.b ?? (_p.a ?? [])).length))}<!--/--></p>` })
export function DestructureDefaultSharedArray(_p, __bfKey) { return createComponent('DestructureDefaultSharedArray', _p, __bfKey) }
