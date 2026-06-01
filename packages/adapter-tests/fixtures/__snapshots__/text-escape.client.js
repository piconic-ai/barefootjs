import { $, $t, __bfText, createComponent, createEffect, createSignal, escapeText, hydrate } from '@barefootjs/client/runtime'


export function initTextEscape(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s3] = $(__scope, 's3')
  const [_s0, _s2] = $t(__scope, 's0', 's2')

  let __anchor_s0 = _s0
  createEffect(() => {
    const __val = _p.label
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })

  let __anchor_s2 = _s2
  createEffect(() => {
    const __val = count()
    __anchor_s2 = __bfText(__anchor_s2, __val)
  })

  if (_s3) _s3.addEventListener('click', () => { setCount(count() + 1) })
}

hydrate('TextEscape', { init: initTextEscape, template: (_p) => `<div class="text-escape"><p class="label" bf="s1"><!--bf:s0-->${escapeText(_p.label)}<!--/--></p><button type="button" bf="s3"> count: <!--bf:s2-->${escapeText((0))}<!--/--></button></div>` })
export function TextEscape(_p, __bfKey) { return createComponent('TextEscape', _p, __bfKey) }
