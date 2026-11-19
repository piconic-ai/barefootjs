import { $, createComponent, createEffect, createSignal, escapeRawTextContent, hydrate } from '@barefootjs/client/runtime'


export function initRawTextHostAnnotationXmlSvg(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(1)

  const [_s2, _s1] = $(__scope, 's2', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = [escapeRawTextContent('style', 'x' + n())].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s2) _s2.addEventListener('click', () => setN(n() + 1))
}

hydrate('RawTextHostAnnotationXmlSvg', { init: initRawTextHostAnnotationXmlSvg, template: (_p) => `<div><math><annotation-xml><svg><title><style class="deep" bf="s1">${escapeRawTextContent('style', 'x' + (1))}</style></title></svg></annotation-xml></math><button class="go" bf="s2">go</button></div>` })
export function RawTextHostAnnotationXmlSvg(_p, __bfKey) { return createComponent('RawTextHostAnnotationXmlSvg', _p, __bfKey) }
