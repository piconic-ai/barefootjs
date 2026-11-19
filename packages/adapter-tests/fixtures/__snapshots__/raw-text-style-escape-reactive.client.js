import { $, createComponent, createEffect, createSignal, escapeRawTextContent, hydrate } from '@barefootjs/client/runtime'


export function initRawTextStyleEscapeReactive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [k, setK] = createSignal('a')

  const [_s4, _s1, _s3] = $(__scope, 's4', 's1', 's3')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = [escapeRawTextContent('style', '.w > i[data-k="' + k() + '"]{color:red}')].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s3) {
      { const __x = [escapeRawTextContent('script', '{"k":"' + k() + '</script>"}')].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s3.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s4) _s4.addEventListener('click', () => setK('b'))
}

hydrate('RawTextStyleEscapeReactive', { init: initRawTextStyleEscapeReactive, template: (_p) => `<div><style class="rule" bf="s1">${escapeRawTextContent('style', '.w > i[data-k="' + ('a') + '"]{color:red}')}</style><script class="data" type="application/json" bf="s3">${escapeRawTextContent('script', '{"k":"' + ('a') + '</script>"}')}</script><div class="w"><i class="a" data-k="a">a</i><i class="b" data-k="b">b</i></div><button class="go" bf="s4">go</button></div>` })
export function RawTextStyleEscapeReactive(_p, __bfKey) { return createComponent('RawTextStyleEscapeReactive', _p, __bfKey) }
