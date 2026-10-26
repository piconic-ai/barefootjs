import { $, createComponent, createEffect, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initTemplateLiteralStaticDelimiters(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `literal-\${notCode} ${_p.active ? 'on' : 'off'} ${_p.suffix ?? '}'}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('TemplateLiteralStaticDelimiters', { init: initTemplateLiteralStaticDelimiters, template: (_p) => `<div ${(`literal-\${notCode} ${_p.active ? 'on' : 'off'} ${_p.suffix ?? '}'}`) != null ? 'class="' + escapeAttr(`literal-\${notCode} ${_p.active ? 'on' : 'off'} ${_p.suffix ?? '}'}`) + '"' : ''} bf="s0">ok</div>` })
export function TemplateLiteralStaticDelimiters(_p, __bfKey) { return createComponent('TemplateLiteralStaticDelimiters', _p, __bfKey) }
