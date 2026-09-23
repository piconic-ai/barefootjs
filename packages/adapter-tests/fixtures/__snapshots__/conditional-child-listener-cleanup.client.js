import { createComponent, createSignal, hydrate, onCleanup, onMount, $, $c, createEffect, escapeTextOrMarkup, escapeTextOrNode, initChild, insert, lazySlots, renderChild } from '@barefootjs/client/runtime'

export function initPingListener(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const handler = () => _p.onPing()

  onCleanup(() => {
      window.removeEventListener('fixture-ping', handler)
    })

  onMount(() => {
    window.addEventListener('fixture-ping', handler)
  })
}

hydrate('PingListener__85856cd1', { init: initPingListener, template: (_p) => `<span class="listener">listening</span>`, name: 'PingListener' })
export function PingListener(_p, __bfKey) { return createComponent('PingListener__85856cd1', _p, __bfKey) }
export function initConditionalChildListenerCleanup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [mounted, setMounted] = createSignal(true)
  const [count, setCount] = createSignal(0)

  const [_s4, _s5, _s0] = $(__scope, 's4', 's5', 's0')

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  insert(__scope, 's0', () => mounted(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('PingListener__85856cd1', {}, undefined, 's1')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('PingListener__85856cd1', __c0, { onPing: () => setCount(count() + 1) })
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s4) _s4.addEventListener('click', () => { setMounted(false) })
  if (_s5) _s5.addEventListener('click', () => { window.dispatchEvent(new Event('fixture-ping')) })
}

hydrate('ConditionalChildListenerCleanup', { init: initConditionalChildListenerCleanup, template: (_p) => `<div bf="s6">${(true) ? `<!--bf-cond-start:s0-->${renderChild('PingListener__85856cd1', {}, undefined, 's1')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}<p class="count" bf="s3"><!--bf:s2-->${escapeTextOrMarkup((0))}<!--/--> pings</p><button class="unmount" bf="s4">unmount</button><button class="ping" bf="s5">ping</button></div>` })
export function ConditionalChildListenerCleanup(_p, __bfKey) { return createComponent('ConditionalChildListenerCleanup', _p, __bfKey) }
