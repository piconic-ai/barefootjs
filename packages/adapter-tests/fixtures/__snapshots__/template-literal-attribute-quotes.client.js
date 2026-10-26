import { $, createComponent, createEffect, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initTemplateLiteralAttributeQuotes(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `content-["x"] ${`a-["y"] ${_p.tag}`} z`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('TemplateLiteralAttributeQuotes', { init: initTemplateLiteralAttributeQuotes, template: (_p) => `<div ${(`content-["x"] ${`a-["y"] ${_p.tag}`} z`) != null ? 'class="' + escapeAttr(`content-["x"] ${`a-["y"] ${_p.tag}`} z`) + '"' : ''} bf="s0">ok</div>` })
export function TemplateLiteralAttributeQuotes(_p, __bfKey) { return createComponent('TemplateLiteralAttributeQuotes', _p, __bfKey) }
