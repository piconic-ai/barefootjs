import { $, __bfSlot, createComponent, createEffect, createSignal, hydrate, insert } from '@barefootjs/client/runtime'


export function initCheckboxNative(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [subscribed, setSubscribed] = createSignal(false)

  const [_s0, _s1] = $(__scope, 's0', 's1')

  createEffect(() => {
    if (_s0) {
      _s0.checked = !!(subscribed())
    }
  })

  insert(__scope, 's1', () => subscribed(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('Subscribed', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('Not subscribed', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('change', (e) => { setSubscribed(e.target.checked) })
}

hydrate('CheckboxNative', { init: initCheckboxNative, template: (_p) => `<label class="subscribe-row"><input type="checkbox" class="subscribe-checkbox" ${(false) ? 'checked' : ''} bf="s0" /><span class="subscribe-label" bf="s2">${(false) ? `<!--bf-cond-start:s1-->${'Subscribed'}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${'Not subscribed'}<!--bf-cond-end:s1-->`}</span></label>` })
export function CheckboxNative(_p, __bfKey) { return createComponent('CheckboxNative', _p, __bfKey) }
