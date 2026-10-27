import { createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initTemplateLiteralTextEscape(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = `p ${`q-"<r>" & ${_p.tag}`}`
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('TemplateLiteralTextEscape', { init: initTemplateLiteralTextEscape, template: (_p) => `<div bf="s1"><!--bf:s0-->${escapeTextOrMarkup(`p ${`q-"<r>" & ${_p.tag}`}`)}<!--/--></div>` })
export function TemplateLiteralTextEscape(_p, __bfKey) { return createComponent('TemplateLiteralTextEscape', _p, __bfKey) }
