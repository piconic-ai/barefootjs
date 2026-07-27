import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initConditionalReturn(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s3, _s1] = $(__scope, 's3', 's1')

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }, { id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s2('s2', escapeTextOrNode(__val))
    __bfw_s2('s0', escapeTextOrNode(__val))
  })

  createEffect(() => {
    if (_s3) {
      { const __v = count() > 0; if (__v != null) _s3.setAttribute('data-active', String(__v)); else _s3.removeAttribute('data-active') }
    }
  })

  createEffect(() => {
    if (_s1) {
      { const __v = count() > 0; if (__v != null) _s1.setAttribute('data-active', String(__v)); else _s1.removeAttribute('data-active') }
    }
  })

  if (_s3) _s3.addEventListener('click', (e) => {
          e.preventDefault()
          setCount(n => n + 1)
        })
  if (_s1) _s1.addEventListener('click', () => { setCount(n => n + 1) })
}

hydrate('ConditionalReturn', { init: initConditionalReturn, template: (_p) => `${_p.variant === 'link' ? `<a href="#" class="conditional-link" ${((0) > 0) != null ? 'data-active="' + escapeAttr((0) > 0) + '"' : ''} bf="s3"> link variant: <!--bf:s2-->${escapeText((0))}<!--/--></a>` : `<button class="conditional-button" ${((0) > 0) != null ? 'data-active="' + escapeAttr((0) > 0) + '"' : ''} bf="s1"> button variant: <!--bf:s0-->${escapeText((0))}<!--/--></button>`}` })
export function ConditionalReturn(_p, __bfKey) { return createComponent('ConditionalReturn', _p, __bfKey) }
