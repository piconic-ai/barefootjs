import { $, createComponent, createEffect, createSignal, escapeRawTextContent, hydrate } from '@barefootjs/client/runtime'


export function initRawTextSplitBoundaryReactive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [tail, setTail] = createSignal('/style><i class="pwn">a')
  const [name, setName] = createSignal('ipt><i class="pwn">a')

  const [_s6, _s1, _s3, _s5] = $(__scope, 's6', 's1', 's3', 's5')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = escapeRawTextContent('style', [('<'), (tail())])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s3) {
      { const __x = escapeRawTextContent('script', [('</scr'), (name())])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s3.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s5) {
      { const __x = escapeRawTextContent('script', [('<!--<scr'), (name())])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s5.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s6) _s6.addEventListener('click', () => { setTail('/STYLE><i class="pwn">b'); setName('IPT><i class="pwn">b') })
}

hydrate('RawTextSplitBoundaryReactive', { init: initRawTextSplitBoundaryReactive, template: (_p) => `<div><style class="css" bf="s1">${escapeRawTextContent('style', [('<'), (('/style><i class="pwn">a'))])}</style><script class="js" type="text/plain" bf="s3">${escapeRawTextContent('script', [('</scr'), (('ipt><i class="pwn">a'))])}</script><script class="esc" type="text/plain" bf="s5">${escapeRawTextContent('script', [('<!--<scr'), (('ipt><i class="pwn">a'))])}</script><b class="after">after</b><button class="go" bf="s6">go</button></div>` })
export function RawTextSplitBoundaryReactive(_p, __bfKey) { return createComponent('RawTextSplitBoundaryReactive', _p, __bfKey) }
