import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeAttr, escapeText, initChild, lazySlots, qsaChildScopes, renderChild } from '@barefootjs/client/runtime'

function initChip() {}

hydrate('Chip__4491e96d', { init: initChip, template: (_p) => `<span>${markupOrEmpty(_p.children)}</span>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__4491e96d', _p, __bfKey) }
export function initLoopRowChildChildrenAttrs(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [active, setActive] = createSignal('a')
  const opts = ['a', 'b']

  const [_s3, _s4] = $(__scope, 's3', 's4')

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
    const __childScopes = qsaChildScopes(_s4, `[bf-h="${__scopeId}"][bf-m="s2"], [bf-s$="_s2"]`)
    __childScopes.forEach((childScope, __idx) => {
      const opt = opts[__idx]
      initChild('Chip__4491e96d', childScope, {})
    })
  }

}

hydrate('LoopRowChildChildrenAttrs', { init: initLoopRowChildChildrenAttrs, template: (_p) => `<div bf="s4"><!--bf-loop:l0-->${(['a', 'b']).map((opt) => `${renderChild('Chip__4491e96d', {children: `<a ${(('a') === opt ? '/current' : `/other/${opt}`) != null ? 'href="' + escapeAttr(('a') === opt ? '/current' : `/other/${opt}`) + '"' : ''} ${(`${('a') === opt ? 'true' : 'false'}`) != null ? 'data-current="' + escapeAttr(`${('a') === opt ? 'true' : 'false'}`) + '"' : ''} bf="^s1"><!--bf:^s0-->${escapeText(opt)}<!--/--></a>`}, opt, 's2', true)}`).join('')}<!--bf-/loop:l0--><button type="button" class="toggle" bf="s3"> toggle </button></div>` })
export function LoopRowChildChildrenAttrs(_p, __bfKey) { return createComponent('LoopRowChildChildrenAttrs', _p, __bfKey) }
