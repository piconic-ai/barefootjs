import { $, applyRestAttrs, createComponent, createEffect, escapeText, hydrate, spreadAttrs } from '@barefootjs/client/runtime'


export function initTextarea(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const onInput = _p.onInput ?? (() => {})
  const onChange = _p.onChange ?? (() => {})
  const onBlur = _p.onBlur ?? (() => {})
  const onFocus = _p.onFocus ?? (() => {})

  const baseClasses = 'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
  const focusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
  const errorClasses = 'aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive'

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive ${(_p.className ?? '')}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[0] = __x }
      { const __x = (_p.placeholder ?? '')
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('placeholder', String(__v)); else _s0.removeAttribute('placeholder') }
      }
      __l[1] = __x }
      { const __x = (_p.value ?? '')
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        const __val = String(__x)
        if ('value' in _s0) { if (_s0.value !== __val) _s0.value = __val } else { _s0.setAttribute('value', __val) }
      }
      __l[2] = __x }
      { const __x = (_p.disabled ?? false)
      if (!(3 in __l) || !Object.is(__l[3], __x)) {
        _s0.disabled = !!(__x)
      }
      __l[3] = __x }
      { const __x = (_p.readonly ?? false)
      if (!(4 in __l) || !Object.is(__l[4], __x)) {
        _s0.readonly = !!(__x)
      }
      __l[4] = __x }
      { const __x = _p.rows
      if (!(5 in __l) || !Object.is(__l[5], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('rows', String(__v)); else _s0.removeAttribute('rows') }
      }
      __l[5] = __x }
      { const __x = (_p.error ?? false)
      if (!(6 in __l) || !Object.is(__l[6], __x)) {
        if (__x) _s0.setAttribute('aria-invalid', 'true')
        else _s0.removeAttribute('aria-invalid')
      }
      __l[6] = __x }
    }
  }) }

  if (_s0) applyRestAttrs(_s0, _p, ["className","placeholder","value","disabled","readonly","error","describedBy","rows","onInput","onChange","onBlur","onFocus","data-slot","class","aria-invalid"])

  if (_s0) _s0.addEventListener('input', onInput)
  if (_s0) _s0.addEventListener('change', onChange)
  if (_s0) _s0.addEventListener('blur', onBlur)
  if (_s0) _s0.addEventListener('focus', onFocus)
}

hydrate('Textarea', { init: initTextarea, template: (_p) => `<textarea ${spreadAttrs({"data-slot": "textarea", "class": `placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive ${_p.className}`, "placeholder": _p.placeholder, "disabled": _p.disabled, "readonly": _p.readonly, "rows": _p.rows, "aria-invalid": _p.error, ...((_p.describedBy ? { 'aria-describedby': _p.describedBy } : {}))})} bf="s0">${escapeText(_p.value)}</textarea>` })
export function Textarea(_p, __bfKey) { return createComponent('Textarea', _p, __bfKey) }
