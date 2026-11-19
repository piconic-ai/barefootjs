import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var counter
var __bf_module_ModuleLetHandlerWriteHiddenRead = __bf_module_ModuleLetHandlerWriteHiddenRead ?? (() => {
  const g = function() {
  return base + counter
}
  const base = 'm'
  counter = counter ?? 0
  return { g }
})()

export function initModuleLetHandlerWriteHiddenRead(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const g = __bf_module_ModuleLetHandlerWriteHiddenRead.g
  const [base] = createSignal('prop')
  const [shown, setShown] = createSignal('none')

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = base()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => { counter = 2; setShown(g()) })
}

hydrate('ModuleLetHandlerWriteHiddenRead', { init: initModuleLetHandlerWriteHiddenRead, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('prop'))}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetHandlerWriteHiddenRead(_p, __bfKey) { return createComponent('ModuleLetHandlerWriteHiddenRead', _p, __bfKey) }
