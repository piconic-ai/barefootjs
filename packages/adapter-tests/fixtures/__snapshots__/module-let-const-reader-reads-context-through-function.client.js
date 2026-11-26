import { $, createComponent, createContext, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var ctx = ctx ?? createContext(0)
var offset = offset ?? function() {
  return ctx ? 10 : 20
}
var count
var __bf_module_ModuleLetConstReaderReadsContextThroughFunction = __bf_module_ModuleLetConstReaderReadsContextThroughFunction ?? (() => {
  const g = function() {
  return base + count
}
  const base = 'm'
  count = count ?? 1
  const initial = count + offset()
  return { initial, g }
})()

export function initModuleLetConstReaderReadsContextThroughFunction(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const initial = __bf_module_ModuleLetConstReaderReadsContextThroughFunction.initial
  const g = __bf_module_ModuleLetConstReaderReadsContextThroughFunction.g
  const [shown, setShown] = createSignal('none')

  count = count + 1

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

  if (_s1) _s1.addEventListener('click', () => setShown(initial + ':' + g()))
}

hydrate('ModuleLetConstReaderReadsContextThroughFunction', { init: initModuleLetConstReaderReadsContextThroughFunction, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.base)}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleLetConstReaderReadsContextThroughFunction(_p, __bfKey) { return createComponent('ModuleLetConstReaderReadsContextThroughFunction', _p, __bfKey) }
