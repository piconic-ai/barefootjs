import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var __bf_module_ModuleConstMutatedObjectRead = __bf_module_ModuleConstMutatedObjectRead ?? (() => {
  const g = function() {
  return box.n
}
  const box = { n: 1 }
  return { box, g }
})()

export function initModuleConstMutatedObjectRead(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const box = __bf_module_ModuleConstMutatedObjectRead.box
  const g = __bf_module_ModuleConstMutatedObjectRead.g
  const [shown, setShown] = createSignal('none')

  box.n = 2

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

  if (_s1) _s1.addEventListener('click', () => setShown(String(g())))
}

hydrate('ModuleConstMutatedObjectRead', { init: initModuleConstMutatedObjectRead, template: (_p) => `<div><button class="read" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.base)}<!--/--></button><p class="out" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p></div>` })
export function ModuleConstMutatedObjectRead(_p, __bfKey) { return createComponent('ModuleConstMutatedObjectRead', _p, __bfKey) }
