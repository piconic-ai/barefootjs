import { $, createComponent, createSignal, hydrate, insert } from '@barefootjs/client/runtime'


export function initConditionalSiblingRoots(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [shown, setShown] = createSignal(true)

  const [_s0, _s1] = $(__scope, 's0', 's1')

  insert(__scope, 's1', () => shown(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><span>A</span><span>B</span><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<span bf-c="s1">C</span>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('click', () => setShown(!shown()))
}

hydrate('ConditionalSiblingRoots', { init: initConditionalSiblingRoots, template: (_p) => `<div><button bf="s0">Toggle</button><section bf="s2">${(true) ? `<!--bf-cond-start:s1--><span>A</span><span>B</span><!--bf-cond-end:s1-->` : `<span bf-c="s1">C</span>`}</section></div>` })
export function ConditionalSiblingRoots(_p, __bfKey) { return createComponent('ConditionalSiblingRoots', _p, __bfKey) }
