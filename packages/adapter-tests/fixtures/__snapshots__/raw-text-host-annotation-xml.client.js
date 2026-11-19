import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate } from '@barefootjs/client/runtime'


export function initRawTextHostAnnotationXml(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(1)

  const [_s2, _s1] = $(__scope, 's2', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = [escapeText('t' + n())].join('')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s2) _s2.addEventListener('click', () => setN(n() + 1))
}

hydrate('RawTextHostAnnotationXml', { init: initRawTextHostAnnotationXml, template: (_p) => `<div><math><annotation-xml class="plain" ${(_p.encoding) != null ? 'encoding="' + escapeAttr(_p.encoding) + '"' : ''}><title class="plain-title" bf="s1">${escapeText('t' + (1))}</title></annotation-xml></math><button class="go" bf="s2">go</button></div>` })
export function RawTextHostAnnotationXml(_p, __bfKey) { return createComponent('RawTextHostAnnotationXml', _p, __bfKey) }
