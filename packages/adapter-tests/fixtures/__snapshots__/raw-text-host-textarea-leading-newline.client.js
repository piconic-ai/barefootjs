import { $, createComponent, createEffect, createSignal, escapeText, hydrate } from '@barefootjs/client/runtime'


export function initRawTextHostTextareaLeadingNewline(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [text, setText] = createSignal('\nhello')

  const [_s2, _s1] = $(__scope, 's2', 's1')

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = [escapeText(text())].join('').replace(/^\n/, '')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s1.innerHTML = String(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s2) _s2.addEventListener('click', () => setText('\nworld'))
}

hydrate('RawTextHostTextareaLeadingNewline', { init: initRawTextHostTextareaLeadingNewline, template: (_p) => `<div><textarea class="area" bf="s1">${escapeText(('\nhello'))}</textarea><button class="go" bf="s2">go</button></div>` })
export function RawTextHostTextareaLeadingNewline(_p, __bfKey) { return createComponent('RawTextHostTextareaLeadingNewline', _p, __bfKey) }
