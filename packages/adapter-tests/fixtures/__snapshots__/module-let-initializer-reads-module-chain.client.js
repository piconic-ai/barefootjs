import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var counter
var __bf_module_ModuleLetInitializerReadsModuleChain = __bf_module_ModuleLetInitializerReadsModuleChain ?? (() => {
  const suffix = function() {
  return 'q'
}
  const head = 'p'
  const start = head + suffix()
  counter = counter ?? start
  return { start }
})()

export function initModuleLetInitializerReadsModuleChain(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const start = __bf_module_ModuleLetInitializerReadsModuleChain.start
  const [shown, setShown] = createSignal('none')

  counter = counter + '!'

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => setShown(counter))
}

hydrate('ModuleLetInitializerReadsModuleChain', { init: initModuleLetInitializerReadsModuleChain, template: (_p) => `<div><button class="read" bf="s0">read</button><p class="out" bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetInitializerReadsModuleChain(_p, __bfKey) { return createComponent('ModuleLetInitializerReadsModuleChain', _p, __bfKey) }
