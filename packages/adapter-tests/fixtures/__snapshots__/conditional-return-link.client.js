import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insertRoot, lazySlots, qsa } from '@barefootjs/client/runtime'


export function initConditionalReturn(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s4] = $(__scope, 's4')

  insertRoot(__scope, 's4', () => _p.variant === 'link', {
    template: () => { const __slots = []; return { html: `<a href="#" class="conditional-link" ${(count() > 0) != null ? 'data-active="' + escapeAttr(count() > 0) + '"' : ''} bf="s3"> link variant: <!--bf:s2-->${__bfSlot(count(), __slots)}<!--/--></a>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s3] = $(__branchScope, 's3')
      if (_s3) _s3.addEventListener('click', (e) => {
          e.preventDefault()
          setCount(n => n + 1)
        })
      const __disposers = []
      { const __ra_s3 = qsa(__branchScope, '[bf="s3"]')
      if (__ra_s3) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = count() > 0; if (__v != null) __ra_s3.setAttribute('data-active', String(__v)); else __ra_s3.removeAttribute('data-active') }
        }))
      } }
      const __bfw_s2 = lazySlots(__branchScope, [{ id: 's2', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s2('s2', escapeTextOrNode(count())) }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<button class="conditional-button" ${(count() > 0) != null ? 'data-active="' + escapeAttr(count() > 0) + '"' : ''} bf="s1"> button variant: <!--bf:s0-->${__bfSlot(count(), __slots)}<!--/--></button>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s1] = $(__branchScope, 's1')
      if (_s1) _s1.addEventListener('click', () => { setCount(n => n + 1) })
      const __disposers = []
      { const __ra_s1 = qsa(__branchScope, '[bf="s1"]')
      if (__ra_s1) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = count() > 0; if (__v != null) __ra_s1.setAttribute('data-active', String(__v)); else __ra_s1.removeAttribute('data-active') }
        }))
      } }
      const __bfw_s0 = lazySlots(__branchScope, [{ id: 's0', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s0('s0', escapeTextOrNode(count())) }))
      return () => __disposers.forEach(d => d())
    }
  })

}

hydrate('ConditionalReturn', { init: initConditionalReturn, template: (_p) => `${_p.variant === 'link' ? `<a href="#" class="conditional-link" ${((0) > 0) != null ? 'data-active="' + escapeAttr((0) > 0) + '"' : ''} bf="s3"> link variant: <!--bf:s2-->${escapeText((0))}<!--/--></a>` : `<button class="conditional-button" ${((0) > 0) != null ? 'data-active="' + escapeAttr((0) > 0) + '"' : ''} bf="s1"> button variant: <!--bf:s0-->${escapeText((0))}<!--/--></button>`}` })
export function ConditionalReturn(_p, __bfKey) { return createComponent('ConditionalReturn', _p, __bfKey) }
