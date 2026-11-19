import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var g = g ?? function() {
  return counter
}
var counter
var __bf_module_ModuleLetInitializerHiddenRead = __bf_module_ModuleLetInitializerHiddenRead ?? (() => {
  const base = 'm'
  const alias = base
  counter = counter ?? base + alias.length
  return { alias }
})()

export function initModuleLetInitializerHiddenRead(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const alias = __bf_module_ModuleLetInitializerHiddenRead.alias
  const [shown, setShown] = createSignal('none')

  counter = counter + 'm'

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

hydrate('ModuleLetInitializerHiddenRead', { init: initModuleLetInitializerHiddenRead, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.base)}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetInitializerHiddenRead(_p, __bfKey) { return createComponent('ModuleLetInitializerHiddenRead', _p, __bfKey) }
