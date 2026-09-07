import { $, createComponent, createEffect, createMemo, createSignal, escapeAttr, hydrate, markupOrEmpty } from '@barefootjs/client/runtime'


export function initToggle(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const baseClasses = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:text-accent-foreground hover:bg-muted hover:text-muted-foreground'
  const variantClasses = {
  default: 'bg-transparent',
  outline: 'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
}
  const sizeClasses = {
  default: 'h-9 px-2 min-w-9',
  sm: 'h-8 px-1.5 min-w-8',
  lg: 'h-10 px-2.5 min-w-10',
}
  const [internalPressed, setInternalPressed] = createSignal(_p.defaultPressed ?? false)
  const [controlledPressed, setControlledPressed] = createSignal(_p.pressed ?? undefined)
  createEffect(() => {
    const __val = _p.pressed
    if (__val !== undefined) setControlledPressed(__val)
  })
  const isControlled = createMemo(() => _p.pressed !== undefined)
  const isPressed = createMemo(() => isControlled() ? controlledPressed() : internalPressed())
  const classes = createMemo(() => {
    const variant = _p.variant ?? 'default'
    const size = _p.size ?? 'default'
    return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${_p.className ?? ''}`
  })
  const handleClick = (e) => {
    const target = e.currentTarget
    const currentPressed = target.getAttribute('aria-pressed') === 'true'
    const newValue = !currentPressed

    // Update state based on mode
    if (isControlled()) {
      setControlledPressed(newValue)
    } else {
      setInternalPressed(newValue)
    }

    // Update the UI visually
    target.setAttribute('aria-pressed', String(newValue))
    target.setAttribute('data-state', newValue ? 'on' : 'off')

    // Notify parent if callback provided
    const scope = target.closest('[bf-s]')
    // @ts-ignore - onpressedChange is set by parent during hydration
    const scopeCallback = scope?.onpressedChange
    const handler = _p.onPressedChange || scopeCallback
    handler?.(newValue)
  }

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `${isPressed() ? 'on' : 'off'}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-state', String(__v)); else _s0.removeAttribute('data-state') }
      }
      __l[0] = __x }
      { const __x = _p.id
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      }
      __l[1] = __x }
      { const __x = isPressed()
      if (!(2 in __l) || !Object.is(__l[2], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('aria-pressed', String(__v)); else _s0.removeAttribute('aria-pressed') }
      }
      __l[2] = __x }
      { const __x = _p.disabled ?? false
      if (!(3 in __l) || !Object.is(__l[3], __x)) {
        _s0.disabled = !!(__x)
      }
      __l[3] = __x }
      { const __x = classes()
      if (!(4 in __l) || !Object.is(__l[4], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[4] = __x }
    }
  }) }

  if (_s0) _s0.addEventListener('click', handleClick)
}

hydrate('Toggle', { init: initToggle, template: (_p) => `<button data-slot="toggle" ${(`${((_p.pressed !== undefined) ? (_p.pressed ?? undefined) : (_p.defaultPressed ?? false)) ? 'on' : 'off'}`) != null ? 'data-state="' + escapeAttr(`${((_p.pressed !== undefined) ? (_p.pressed ?? undefined) : (_p.defaultPressed ?? false)) ? 'on' : 'off'}`) + '"' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(((_p.pressed !== undefined) ? (_p.pressed ?? undefined) : (_p.defaultPressed ?? false))) != null ? 'aria-pressed="' + escapeAttr(((_p.pressed !== undefined) ? (_p.pressed ?? undefined) : (_p.defaultPressed ?? false))) + '"' : ''} ${_p.disabled ?? false ? 'disabled' : ''} ${(((() => {
    const variant = _p.variant ?? 'default'
    const size = _p.size ?? 'default'
    return `${('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:text-accent-foreground hover:bg-muted hover:text-muted-foreground')} ${({
  default: 'bg-transparent',
  outline: 'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
})[variant]} ${({
  default: 'h-9 px-2 min-w-9',
  sm: 'h-8 px-1.5 min-w-8',
  lg: 'h-10 px-2.5 min-w-10',
})[size]} ${_p.className ?? ''}`
  })())) != null ? 'class="' + escapeAttr(((() => {
    const variant = _p.variant ?? 'default'
    const size = _p.size ?? 'default'
    return `${('inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:text-accent-foreground hover:bg-muted hover:text-muted-foreground')} ${({
  default: 'bg-transparent',
  outline: 'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
})[variant]} ${({
  default: 'h-9 px-2 min-w-9',
  sm: 'h-8 px-1.5 min-w-8',
  lg: 'h-10 px-2.5 min-w-10',
})[size]} ${_p.className ?? ''}`
  })())) + '"' : ''} bf="s0">${markupOrEmpty(_p.children)}</button>` })
export function Toggle(_p, __bfKey) { return createComponent('Toggle', _p, __bfKey) }
