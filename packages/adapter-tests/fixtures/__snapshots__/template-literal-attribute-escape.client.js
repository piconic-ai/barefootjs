import { $, createComponent, createEffect, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initTemplateLiteralAttributeEscape(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `content-["x"] [&>svg]:a ${_p.tag} z`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[0] = __x }
      { const __x = `t-["q"] ${`n-<"y"> ${_p.tag}`}`
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('title', String(__v)); else _s0.removeAttribute('title') }
      }
      __l[1] = __x }
    }
  }) }

}

hydrate('TemplateLiteralAttributeEscape', { init: initTemplateLiteralAttributeEscape, template: (_p) => `<div ${(`content-["x"] [&>svg]:a ${_p.tag} z`) != null ? 'class="' + escapeAttr(`content-["x"] [&>svg]:a ${_p.tag} z`) + '"' : ''} ${(`t-["q"] ${`n-<"y"> ${_p.tag}`}`) != null ? 'title="' + escapeAttr(`t-["q"] ${`n-<"y"> ${_p.tag}`}`) + '"' : ''} bf="s0">ok</div>` })
export function TemplateLiteralAttributeEscape(_p, __bfKey) { return createComponent('TemplateLiteralAttributeEscape', _p, __bfKey) }
