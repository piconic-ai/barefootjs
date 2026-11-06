import { createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initDestructureDefaultSharedArrayRenamed(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  let x = _p.a === undefined ? [] : _p.a
  let b = _p.b === undefined ? x : _p.b
  const n = x.push('x') && b.length

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = n
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('DestructureDefaultSharedArrayRenamed', { init: initDestructureDefaultSharedArrayRenamed, template: (_p) => `<p data-slot="count" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(((_p.a ?? []).push('x') && (_p.b ?? (_p.a ?? [])).length))}<!--/--></p>` })
export function DestructureDefaultSharedArrayRenamed(_p, __bfKey) { return createComponent('DestructureDefaultSharedArrayRenamed', _p, __bfKey) }
