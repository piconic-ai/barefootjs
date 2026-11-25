import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var count
var __bf_module_ModuleLetInitializerReadsComponentConst = __bf_module_ModuleLetInitializerReadsComponentConst ?? (() => {
  const seed = 0
  count = count ?? (seed || 5)
  return { seed }
})()

export function initModuleLetInitializerReadsComponentConst(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const seed = __bf_module_ModuleLetInitializerReadsComponentConst.seed
  const [shown, setShown] = createSignal(-1)

  count = count + 1

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => setShown(count))
}

hydrate('ModuleLetInitializerReadsComponentConst', { init: initModuleLetInitializerReadsComponentConst, template: (_p) => `<div><span class="seed">${escapeText((__bf_module_ModuleLetInitializerReadsComponentConst.seed))}</span><button class="read" bf="s0">read</button><p class="out" bf="s2"><!--bf:s1-->${escapeTextOrMarkup((-1))}<!--/--></p></div>` })
export function ModuleLetInitializerReadsComponentConst(_p, __bfKey) { return createComponent('ModuleLetInitializerReadsComponentConst', _p, __bfKey) }
