import { $, applyRestAttrs, createComponent, createEffect, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const labelClasses = 'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${labelClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","children","data-slot","class"])

}

hydrate('Label', { init: initLabel, template: (_p) => `<label data-slot="label" ${(`${('flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</label>` })
export function Label(_p, __bfKey) { return createComponent('Label', _p, __bfKey) }
