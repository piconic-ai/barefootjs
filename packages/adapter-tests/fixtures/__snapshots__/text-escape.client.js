import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initTextEscape(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s3] = $(__scope, 's3')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s3) _s3.addEventListener('click', () => { setCount(count() + 1) })
}

hydrate('TextEscape', { init: initTextEscape, template: (_p) => `<div class="text-escape"><p class="label" bf="s1"><!--bf:s0-->${escapeText(_p.label)}<!--/--></p><button type="button" bf="s3"> count: <!--bf:s2-->${escapeText((0))}<!--/--></button></div>` })
export function TextEscape(_p, __bfKey) { return createComponent('TextEscape', _p, __bfKey) }
