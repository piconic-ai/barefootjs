import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initSelectOutOfRange(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [val, setVal] = createSignal(7)

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = val()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = String(val())
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        const __val = String(__x)
        if ('value' in _s0) { if (_s0.value !== __val) _s0.value = __val } else { _s0.setAttribute('value', __val) }
      }
      __l[0] = __x }
    }
  }) }

  if (_s0) _s0.addEventListener('change', e => setVal(Number(e.target.value)))
}

hydrate('SelectOutOfRange', { init: initSelectOutOfRange, template: (_p) => `<div><select bf="s0"><option value="" disabled hidden ${!(((String((7))) === "0") || ((String((7))) === "1")) ? 'selected' : ''}></option><option value="0" ${(String((7))) === "0" ? 'selected' : ''}>Zero</option><option value="1" ${(String((7))) === "1" ? 'selected' : ''}>One</option></select><p class="current" bf="s2"><!--bf:s1-->${escapeTextOrMarkup((7))}<!--/--></p></div>` })
export function SelectOutOfRange(_p, __bfKey) { return createComponent('SelectOutOfRange', _p, __bfKey) }
