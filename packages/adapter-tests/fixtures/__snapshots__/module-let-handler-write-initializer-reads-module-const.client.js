import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initModuleLetHandlerWriteInitializerReadsModuleConst(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const seed = 0
  let count = seed || 5
  const [shown, setShown] = createSignal(-1)

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = shown()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => {
          count = count + 1
          setShown(count)
        })
}

hydrate('ModuleLetHandlerWriteInitializerReadsModuleConst', { init: initModuleLetHandlerWriteInitializerReadsModuleConst, template: (_p) => `<div><span class="seed">${escapeText((0))}</span><button class="read" bf="s0">read</button><p class="out" bf="s2"><!--bf:s1-->${escapeTextOrMarkup((-1))}<!--/--></p></div>` })
export function ModuleLetHandlerWriteInitializerReadsModuleConst(_p, __bfKey) { return createComponent('ModuleLetHandlerWriteInitializerReadsModuleConst', _p, __bfKey) }
