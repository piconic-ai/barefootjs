import { $, createComponent, createEffect, createSignal, escapeRawTextContent, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initRawTextHostReactive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [color, setColor] = createSignal('red')
  const [n, setN] = createSignal(1)

  const [_s10, _s1, _s3, _s5, _s7] = $(__scope, 's10', 's1', 's3', 's5', 's7')

  const __bfw_s8 = lazySlots(__scope, [{ id: 's8', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = 'c' + n()
    __bfw_s8('s8', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = escapeRawTextContent('style', [('.t{color:' + color() + '}')])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s3) {
      { const __x = escapeRawTextContent('script', [('window.__n=' + n())])
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s3.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s5) {
      { const __x = [escapeText('v' + n())].join('').replace(/^\n/, '')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s5.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s7) {
      { const __x = [escapeText('t' + n())].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s7.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s10) _s10.addEventListener('click', () => { setColor('blue'); setN(n() + 1) })
}

hydrate('RawTextHostReactive', { init: initRawTextHostReactive, template: (_p) => `<div><style class="rule" bf="s1">${escapeRawTextContent('style', [('.t{color:' + ('red') + '}')])}</style><script class="code" bf="s3">${escapeRawTextContent('script', [('window.__n=' + (1))])}</script><textarea class="area" bf="s5">${escapeText('v' + (1))}</textarea><title class="ttl" bf="s7">${escapeText('t' + (1))}</title><span class="ctl" bf="s9"><!--bf:s8-->${escapeTextOrMarkup('c' + (1))}<!--/--></span><i class="t">x</i><button class="go" bf="s10">go</button></div>` })
export function RawTextHostReactive(_p, __bfKey) { return createComponent('RawTextHostReactive', _p, __bfKey) }
