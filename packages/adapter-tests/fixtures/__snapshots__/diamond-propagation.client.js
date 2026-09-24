import { $, createComponent, createEffect, createMemo, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initDiamondPropagation(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [a, setA] = createSignal(1)
  const b = createMemo(() => a() * 10)
  const c = createMemo(() => a() * 100)
  const [runs, setRuns] = createSignal(0)
  const [glitches, setGlitches] = createSignal(0)
  let mounted = false

  const [_s10] = $(__scope, 's10')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = a()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = b()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  const __bfw_s4 = lazySlots(__scope, [{ id: 's4', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = c()
    __bfw_s4('s4', escapeTextOrNode(__val))
  })

  const __bfw_s6 = lazySlots(__scope, [{ id: 's6', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = runs()
    __bfw_s6('s6', escapeTextOrNode(__val))
  })

  const __bfw_s8 = lazySlots(__scope, [{ id: 's8', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = glitches()
    __bfw_s8('s8', escapeTextOrNode(__val))
  })

  if (_s10) _s10.addEventListener('click', () => { setA(n => n + 1) })
  createEffect(() => {
    const base = a()
    const consistent = b() === base * 10 && c() === base * 100
    if (!mounted) {
      mounted = true
      return
    }
    setRuns(n => n + 1)
    if (!consistent) setGlitches(n => n + 1)
  })
}

hydrate('DiamondPropagation', { init: initDiamondPropagation, template: (_p) => `<div class="diamond-propagation"><span class="a" bf="s1"><!--bf:s0-->${escapeTextOrMarkup((1))}<!--/--></span><span class="b" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(((1) * 10))}<!--/--></span><span class="c" bf="s5"><!--bf:s4-->${escapeTextOrMarkup(((1) * 100))}<!--/--></span><span class="runs" bf="s7"><!--bf:s6-->${escapeTextOrMarkup((0))}<!--/--></span><span class="glitches" bf="s9"><!--bf:s8-->${escapeTextOrMarkup((0))}<!--/--></span><button class="btn-inc" bf="s10"> +1 </button></div>` })
export function DiamondPropagation(_p, __bfKey) { return createComponent('DiamondPropagation', _p, __bfKey) }
