import { $, childScopeBySlot, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, lazySlots, renderChild } from '@barefootjs/client/runtime'

export function initSignalPropBadge(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = 'n=' + _p.n
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('SignalPropBadge', { init: initSignalPropBadge, template: (_p) => `<b class="badge" bf="s1"><!--bf:s0-->${escapeTextOrMarkup('n=' + _p.n)}<!--/--></b>` })
export function SignalPropBadge(_p, __bfKey) { return createComponent('SignalPropBadge', _p, __bfKey) }
export function initStaticLoopRowChildSignalProp(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const rows = [
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]
  const [n, setN] = createSignal(0)

  const [_s0, _s2, _s5, _s8] = $(__scope, 's0', 's2', 's5', 's8')

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  // Initialize nested SignalPropBadge in static array
  if (_s2) {
    rows.forEach((r, __idx) => {
      const __iterEl = _s2.children[__idx]
      if (__iterEl) {
        const __compEl = childScopeBySlot(__iterEl, __scopeId, 's1')
        if (__compEl) initChild('SignalPropBadge', __compEl, { get n() { return n() } })
      }
    })
  }

  // Initialize nested SignalPropBadge in static array
  if (_s5) {
    rows.forEach((r, __idx) => {
      const __iterEl = _s5.children[__idx]
      if (__iterEl) {
        const __compEl = childScopeBySlot(__iterEl, __scopeId, 's4')
        if (__compEl) initChild('SignalPropBadge', __compEl, { get n() { return n() } })
      }
    })
  }

  // Initialize nested SignalPropBadge in static array
  if (_s8) {
    rows.forEach((r, __idx) => {
      const __iterEl = _s8.children[__idx]
      if (__iterEl) {
        const __compEl = childScopeBySlot(__iterEl, __scopeId, 's7')
        if (__compEl) initChild('SignalPropBadge', __compEl, { get n() { return n() } })
      }
    })
  }

}

hydrate('StaticLoopRowChildSignalProp', { init: initStaticLoopRowChildSignalProp, template: (_p) => `${((__bf_const_rows) => `<div><button type="button" class="inc" bf="s0">inc</button><ul class="plain" bf="s2"><!--bf-loop:l0-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${renderChild('SignalPropBadge', {n: (0)}, undefined, 's1')}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="branch" bf="s5"><!--bf-loop:l1-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<!--bf-cond-start:s3-->${renderChild('SignalPropBadge', {n: (0)}, undefined, 's4')}<!--bf-cond-end:s3-->` : `<i bf-c="s3">off</i>`}</li>`).join('')}<!--bf-/loop:l1--></ul><ul class="else" bf="s8"><!--bf-loop:l2-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<i bf-c="s6">on</i>` : `<!--bf-cond-start:s6-->${renderChild('SignalPropBadge', {n: (0)}, undefined, 's7')}<!--bf-cond-end:s6-->`}</li>`).join('')}<!--bf-/loop:l2--></ul></div>`)(([
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]))}` })
export function StaticLoopRowChildSignalProp(_p, __bfKey) { return createComponent('StaticLoopRowChildSignalProp', _p, __bfKey) }
