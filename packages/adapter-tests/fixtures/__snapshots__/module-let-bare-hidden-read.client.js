import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var __bf_module_ModuleLetBareHiddenRead = __bf_module_ModuleLetBareHiddenRead ?? (() => {
  const g = function() {
  return base + last
}
  const base = 'm'
  return { g, last: undefined }
})()
var last = last ?? __bf_module_ModuleLetBareHiddenRead.last

export function initModuleLetBareHiddenRead(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const g = __bf_module_ModuleLetBareHiddenRead.g
  const base = _p.label ?? 'prop'
  const [shown, setShown] = createSignal('none')

  last = 'x'

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = base
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => setShown(g()))
}

hydrate('ModuleLetBareHiddenRead', { init: initModuleLetBareHiddenRead, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.label ?? 'prop'))}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetBareHiddenRead(_p, __bfKey) { return createComponent('ModuleLetBareHiddenRead', _p, __bfKey) }
