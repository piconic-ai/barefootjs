import { $, createComponent, createSignal, hydrate, insertRoot } from '@barefootjs/client/runtime'


export function initLoadGate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [loading, setLoading] = createSignal(true)

  const [_s1] = $(__scope, 's1')

  insertRoot(__scope, 's1', () => loading(), {
    template: () => { const __slots = []; return { html: `<button bf="s0">Loading...</button>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s0] = $(__branchScope, 's0')
      if (_s0) _s0.addEventListener('click', () => { setLoading(false) })
    }
  }, {
    template: () => { const __slots = []; return { html: `<p>Ready</p>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

}

hydrate('LoadGate', { init: initLoadGate, template: (_p) => `${(true) ? `<button bf="s0">Loading...</button>` : `<p>Ready</p>`}` })
export function LoadGate(_p, __bfKey) { return createComponent('LoadGate', _p, __bfKey) }
