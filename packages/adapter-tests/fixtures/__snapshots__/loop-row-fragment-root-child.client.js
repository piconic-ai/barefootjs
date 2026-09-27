import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initTag() {}

hydrate('Tag__a3cb3a83', { init: initTag, template: (_p) => `<span class="tag">${markupOrEmpty(_p.children)}</span>`, comment: true, fragmentRoot: true, name: 'Tag' })
export function Tag(_p, __bfKey) { return createComponent('Tag__a3cb3a83', _p, __bfKey) }
export function initLoopRowFragmentRootChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [active, setActive] = createSignal('a')
  const opts = ['a', 'b']

  const [_s3, _s4] = $(__scope, 's3', 's4')

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = active()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s3) _s3.addEventListener('click', () => { setActive('b') })
  // Reactive texts in static array children
  if (_s4) {
    opts.forEach((opt, __idx) => {
      let __iterEl = _s4.children[__idx]
      if (__iterEl) {
        const __bfw_s0 = lazySlots(__iterEl, [{ id: '^s0', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s0('^s0', String(opt)) })
      }
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s4) {
    const __childScopes = qsaChildScopes(_s4, `[bf-h="${__scopeId}"][bf-m="s1"], [bf-s$="_s1"]`)
    __childScopes.forEach((childScope, __idx) => {
      const opt = opts[__idx]
      initChild('Tag__a3cb3a83', childScope, {})
    })
  }

}

hydrate('LoopRowFragmentRootChild', { init: initLoopRowFragmentRootChild, template: (_p) => `<div bf="s4"><!--bf-loop:l0-->${(['a', 'b']).map((opt) => `${renderChild('Tag__a3cb3a83', {children: `<b><!--bf:^s0-->${escapeText(opt)}<!--/--></b>`}, opt, 's1', true)}`).join('')}<!--bf-/loop:l0--><button type="button" class="toggle" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('a'))}<!--/--></button></div>` })
export function LoopRowFragmentRootChild(_p, __bfKey) { return createComponent('LoopRowFragmentRootChild', _p, __bfKey) }
