import { $, applyRestAttrs, createComponent, createEffect, escapeAttr, hydrate } from '@barefootjs/client/runtime'


export function initInput(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const type = _p.type
  const className = _p.className ?? ''

  const baseClasses = 'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
  const focusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const errorClasses = 'aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.type; if (__v != null) _s0.setAttribute('type', String(__v)); else _s0.removeAttribute('type') }
      { const __v = `${baseClasses} ${focusClasses} ${errorClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","type","data-slot","class"])

}

hydrate('Input', { init: initInput, template: (_p) => `<input ${(_p.type) != null ? 'type="' + escapeAttr(_p.type) + '"' : ''} data-slot="input" ${(`${('file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm')} ${('focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]')} ${('aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm')} ${('focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]')} ${('aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive')} ${_p.className}`) + '"' : ''} bf="s0" />` })
export function Input(_p, __bfKey) { return createComponent('Input', _p, __bfKey) }
