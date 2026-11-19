import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var counter
var __bf_module_ModuleLetConstReadsSharedHiddenRead = __bf_module_ModuleLetConstReadsSharedHiddenRead ?? (() => {
  const g = function() {
  return base + counter + ':' + seed
}
  const base = 'm'
  counter = counter ?? 1
  const seed = counter
  return { g }
})()

export function initModuleLetConstReadsSharedHiddenRead(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const g = __bf_module_ModuleLetConstReadsSharedHiddenRead.g
  const [shown, setShown] = createSignal('none')

  counter = 2

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.base
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => setShown(g()))
}

hydrate('ModuleLetConstReadsSharedHiddenRead', { init: initModuleLetConstReadsSharedHiddenRead, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.base)}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetConstReadsSharedHiddenRead(_p, __bfKey) { return createComponent('ModuleLetConstReadsSharedHiddenRead', _p, __bfKey) }
