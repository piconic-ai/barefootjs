import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initModuleConstDefaultHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const DEFAULT_LABEL = 'm'
  const START = 2
  const TONES = { 'note': 'n' }
  const [count, setCount] = createSignal(_p.start ?? START)
  createEffect(() => {
    const __val = (_p.start ?? START)
    if (__val !== undefined) setCount(__val)
  })

  const [_s5, _s1] = $(__scope, 's5', 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = (_p.label ?? DEFAULT_LABEL)
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = (_p.tone ?? TONES.note)
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  const __bfw_s4 = lazySlots(__scope, [{ id: 's4', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s4('s4', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = (_p.label ?? DEFAULT_LABEL)
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('title', String(__v)); else _s1.removeAttribute('title') }
      }
      __l[0] = __x }
    }
  }) }

  if (_s5) _s5.addEventListener('click', () => setCount(count() + 1))
}

hydrate('ModuleConstDefaultHydrate', { init: initModuleConstDefaultHydrate, template: (_p) => `<div><p data-slot="label" ${((_p.label ?? ('m'))) != null ? 'title="' + escapeAttr((_p.label ?? ('m'))) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.label ?? ('m')))}<!--/--></p><p data-slot="tone" bf="s3"><!--bf:s2-->${escapeTextOrMarkup((_p.tone ?? ({ 'note': 'n' }).note))}<!--/--></p><button bf="s5"><!--bf:s4-->${escapeTextOrMarkup(((_p.start ?? (2))))}<!--/--></button></div>` })
export function ModuleConstDefaultHydrate(_p, __bfKey) { return createComponent('ModuleConstDefaultHydrate', _p, __bfKey) }
