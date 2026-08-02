import { $, $c, createComponent, createEffect, createSignal, escapeText, escapeTextOrNode, hydrate, initChild, insertRoot, lazySlots, renderChild } from '@barefootjs/client/runtime'

export function initBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const label = _p.label

  const [clicks, setClicks] = createSignal(0)

  const [_s2] = $(__scope, 's2')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = clicks()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => { setClicks(n => n + 1) })
}

hydrate('Badge', { init: initBadge, template: (_p) => `<span class="badge" bf="s2"><!--bf:s0-->${escapeText(_p.label)}<!--/-->:<!--bf:s1-->${escapeText((0))}<!--/--></span>` })
export function Badge(_p, __bfKey) { return createComponent('Badge', _p, __bfKey) }
export function initIfStatementChildSwap(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [showBadge, setShowBadge] = createSignal(true)

  const [_s3] = $(__scope, 's3')
  const [_s1] = $c(__scope, 's1')

  insertRoot(__scope, 's3', () => showBadge(), {
    template: () => { const __slots = []; return { html: `<div>${renderChild('Badge', {label: "on"}, undefined, 's1')}<button bf="s2">toggle</button></div>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s2] = $(__branchScope, 's2')
      if (_s2) _s2.addEventListener('click', () => { setShowBadge(false) })
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('Badge', __c0, { label: "on" })
    }
  }, {
    template: () => { const __slots = []; return { html: `<div><span>off</span><button bf="s0">toggle</button></div>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s0] = $(__branchScope, 's0')
      if (_s0) _s0.addEventListener('click', () => { setShowBadge(true) })
    }
  })


  // Initialize child components with props
  initChild('Badge', _s1, { label: "on" })
}

hydrate('IfStatementChildSwap', { init: initIfStatementChildSwap, template: (_p) => `${(true) ? `<div>${renderChild('Badge', {label: "on"}, undefined, 's1')}<button bf="s2">toggle</button></div>` : `<div><span>off</span><button bf="s0">toggle</button></div>`}` })
export function IfStatementChildSwap(_p, __bfKey) { return createComponent('IfStatementChildSwap', _p, __bfKey) }
