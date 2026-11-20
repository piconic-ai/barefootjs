import { $, createComponent, createEffect, createSignal, escapeAttr, escapeRawTextContent, hydrate } from '@barefootjs/client/runtime'


export function initRawTextBackslashReactive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [k, setK] = createSignal('<b')

  const [_s2, _s1] = $(__scope, 's2', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = escapeRawTextContent('style', [('[data-k="'), ('\\'), (k()), ('"]{color:red}')])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s2) _s2.addEventListener('click', () => setK('&amp'))
}

hydrate('RawTextBackslashReactive', { init: initRawTextBackslashReactive, template: (_p) => `<div><style class="rule" bf="s1">${escapeRawTextContent('style', [('[data-k="'), ('\\'), (('<b')), ('"]{color:red}')])}</style><i class="lt" ${('<b') != null ? 'data-k="' + escapeAttr('<b') + '"' : ''}>lt</i><i class="amp" ${('&amp') != null ? 'data-k="' + escapeAttr('&amp') + '"' : ''}>amp</i><button class="go" bf="s2">go</button></div>` })
export function RawTextBackslashReactive(_p, __bfKey) { return createComponent('RawTextBackslashReactive', _p, __bfKey) }
