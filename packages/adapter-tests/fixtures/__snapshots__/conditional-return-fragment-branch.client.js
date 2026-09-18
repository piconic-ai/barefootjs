import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initConditionalReturnFragmentBranch(__scope, _p = {}) {
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

  if (_s3) _s3.addEventListener('click', () => { setCount(count() + 1) })
  if (_s1) _s1.addEventListener('click', () => { setCount(count() + 1) })
}

hydrate('ConditionalReturnFragmentBranch', { init: initConditionalReturnFragmentBranch, template: (_p) => `${_p.asLink ? `<a class="cr-link" href="#" bf="s3"> link: <!--bf:s2-->${escapeTextOrMarkup((0))}<!--/--></a>` : `<button class="cr-button" bf="s1"> button: <!--bf:s0-->${escapeTextOrMarkup((0))}<!--/--></button>`}` })
export function ConditionalReturnFragmentBranch(_p, __bfKey) { return createComponent('ConditionalReturnFragmentBranch', _p, __bfKey) }
