import { $, $t, __bfText, createComponent, createEffect, createMemo, createSignal, hydrate } from '@barefootjs/client/runtime'


export function initCounter(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(_p.initial ?? 0)
  createEffect(() => {
    const __val = _p.initial
    if (__val !== undefined) setCount(__val)
  })
  const doubled = createMemo(() => count() * 2)

  const [_s4, _s5, _s6] = $(__scope, 's4', 's5', 's6')
  const [_s0, _s2] = $t(__scope, 's0', 's2')

  let __anchor_s0 = _s0
  createEffect(() => {
    const __val = count()
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })

  let __anchor_s2 = _s2
  createEffect(() => {
    const __val = doubled()
    __anchor_s2 = __bfText(__anchor_s2, __val)
  })

  if (_s4) _s4.addEventListener('click', () => { setCount(n => n + 1) })
  if (_s5) _s5.addEventListener('click', () => { setCount(n => n - 1) })
  if (_s6) _s6.addEventListener('click', () => { setCount(0) })
}

hydrate('Counter', { init: initCounter, template: (_p) => `<div class="counter-container"><p class="counter-value" bf="s1"><!--bf:s0-->${(_p.initial ?? 0)}<!--/--></p><p class="counter-doubled" bf="s3">doubled: <!--bf:s2-->${((_p.initial ?? 0) * 2)}<!--/--></p><div class="counter-buttons"><button class="btn btn-increment" bf="s4">+1</button><button class="btn btn-decrement" bf="s5">-1</button><button class="btn btn-reset" bf="s6">Reset</button></div></div>` })
export function Counter(_p, __bfKey) { return createComponent('Counter', _p, __bfKey) }
