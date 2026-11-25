import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var count
var __bf_module_ModuleLetConstReaderCallsModuleFunction = __bf_module_ModuleLetConstReaderCallsModuleFunction ?? (() => {
  const offset = function() {
  return seed + 10
}
  const seed = 1
  count = count ?? seed
  const initial = count + offset()
  return { seed, initial }
})()

export function initModuleLetConstReaderCallsModuleFunction(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const seed = __bf_module_ModuleLetConstReaderCallsModuleFunction.seed
  const initial = __bf_module_ModuleLetConstReaderCallsModuleFunction.initial
  const [shown, setShown] = createSignal('none')

  count = count + 1

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => setShown(initial + ':' + count))
}

hydrate('ModuleLetConstReaderCallsModuleFunction', { init: initModuleLetConstReaderCallsModuleFunction, template: (_p) => `<div><button class="read" bf="s0">read</button><p class="out" bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetConstReaderCallsModuleFunction(_p, __bfKey) { return createComponent('ModuleLetConstReaderCallsModuleFunction', _p, __bfKey) }
