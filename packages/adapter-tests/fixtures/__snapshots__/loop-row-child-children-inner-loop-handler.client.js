import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__0da3ade1', { init: initChip, template: (_p) => `<span class="chip">${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__0da3ade1', _p, __bfKey) }
export function initLoopRowChildChildrenInnerLoopHandler(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const ROWS = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]
  const [picked, setPicked] = createSignal('none')

  const [_s6] = $(__scope, 's6')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  // Initialize static array children (hydrate skips nested instances)
  if (_s6) {
    const __childScopes = qsaChildScopes(_s6, `[bf-h="${__scopeId}"][bf-m="s5"], [bf-s$="_s5"]`)
    __childScopes.forEach((childScope, __idx) => {
      const o = ROWS[__idx]
      initChild('Chip__0da3ade1', childScope, {})
    })
  }

}

hydrate('LoopRowChildChildrenInnerLoopHandler', { init: initLoopRowChildChildrenInnerLoopHandler, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><div class="rows" bf="s6"><!--bf-loop:l1-->${([
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['z'] },
]).map((o) => `${renderChild('Chip__0da3ade1', {children: `<ul bf="^s4"><!--bf-loop:l0-->${o.tags.map((tag) => `<li data-key-1="${escapeAttr(tag)}"><button type="button" class="pick" bf="^s3"><!--bf:^s2-->${escapeText(tag)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul>`}, o.id, 's5', true)}`).join('')}<!--bf-/loop:l1--></div></div>` })
export function LoopRowChildChildrenInnerLoopHandler(_p, __bfKey) { return createComponent('LoopRowChildChildrenInnerLoopHandler', _p, __bfKey) }
