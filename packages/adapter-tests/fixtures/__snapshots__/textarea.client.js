import { $, applyRestAttrs, createComponent, createEffect, hydrate, spreadAttrs } from '@barefootjs/client/runtime'


export function initTextarea(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const onInput = _p.onInput ?? (() => {})
  const onChange = _p.onChange ?? (() => {})
  const onBlur = _p.onBlur ?? (() => {})
  const onFocus = _p.onFocus ?? (() => {})
  const placeholder = _p.placeholder ?? ''
  const disabled = _p.disabled ?? false
  const className = _p.className ?? ''
  const value = _p.value ?? ''
  const readonly = _p.readonly ?? false
  const rows = _p.rows
  const error = _p.error ?? false
  const describedBy = _p.describedBy

  const baseClasses = 'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
  const focusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const errorClasses = 'aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      { const __v = (_p.placeholder ?? ''); if (__v != null) _s0.setAttribute('placeholder', String(__v)); else _s0.removeAttribute('placeholder') }
      const __val = String((_p.value ?? ''))
      if (_s0.value !== __val) _s0.value = __val
      _s0.disabled = !!((_p.disabled ?? false))
      _s0.readonly = !!((_p.readonly ?? false))
      { const __v = _p.rows; if (__v != null) _s0.setAttribute('rows', String(__v)); else _s0.removeAttribute('rows') }
      if ((_p.error ?? false)) _s0.setAttribute('aria-invalid', 'true')
      else _s0.removeAttribute('aria-invalid')
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","placeholder","value","disabled","readonly","error","describedBy","rows","onInput","onChange","onBlur","onFocus","data-slot","class","aria-invalid"])

  if (_s0) _s0.addEventListener('input', onInput)
  if (_s0) _s0.addEventListener('change', onChange)
  if (_s0) _s0.addEventListener('blur', onBlur)
  if (_s0) _s0.addEventListener('focus', onFocus)
}

hydrate('Textarea', { init: initTextarea, template: (_p) => `<textarea ${spreadAttrs({"data-slot": "textarea", "class": `placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive ${_p.className}`, "placeholder": _p.placeholder, "value": _p.value, "disabled": _p.disabled, "readonly": _p.readonly, "rows": _p.rows, "aria-invalid": _p.error, ...((_p.describedBy ? { 'aria-describedby': _p.describedBy } : {}))})} bf="s0"></textarea>` })
export function Textarea(_p, __bfKey) { return createComponent('Textarea', _p, __bfKey) }
