import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initRawTextHostAnnotationXmlEncodings(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(1)

  const [_s6, _s5] = $(__scope, 's6', 's5')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = 'a' + n()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = 'b' + n()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s5) {
      { const __x = [escapeText('c' + n())].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s5.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s6) _s6.addEventListener('click', () => setN(n() + 1))
}

hydrate('RawTextHostAnnotationXmlEncodings', { init: initRawTextHostAnnotationXmlEncodings, template: (_p) => `<div><math><annotation-xml class="none"><title class="none-title" bf="s1"><!--bf:s0-->${escapeTextOrMarkup('a' + (1))}<!--/--></title></annotation-xml></math><math><annotation-xml class="tex" encoding="application/x-tex"><title class="tex-title" bf="s3"><!--bf:s2-->${escapeTextOrMarkup('b' + (1))}<!--/--></title></annotation-xml></math><math><annotation-xml class="html" encoding="text/html"><title class="html-title" bf="s5">${escapeText('c' + (1))}</title></annotation-xml></math><button class="go" bf="s6">go</button></div>` })
export function RawTextHostAnnotationXmlEncodings(_p, __bfKey) { return createComponent('RawTextHostAnnotationXmlEncodings', _p, __bfKey) }
