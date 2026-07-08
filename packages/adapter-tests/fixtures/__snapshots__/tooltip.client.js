import { $, $c, $t, __bfText, applyRestAttrs, createComponent, createEffect, createSignal, escapeAttr, escapeText, forwardProps, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

export function initTooltip(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const tooltipContainerClasses = 'relative inline-block'
  const tooltipContentOpenClasses = 'opacity-100 scale-100'
  const tooltipContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
  const [open, setOpen] = createSignal(false)
  const getTimer = (el, key) => {
    const val = el.dataset[key]
    return val ? Number(val) : undefined
  }
  const setTimer = (el, key, id) => {
    el.dataset[key] = id !== undefined ? String(id) : ''
  }
  const handleMouseEnter = (e) => {
    const el = (e.currentTarget ?? e.target)
    const closeTimer = getTimer(el, 'closeTimer')
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer)
      setTimer(el, 'closeTimer', undefined)
    }

    if ((_p.delayDuration ?? 0) > 0) {
      const timerId = setTimeout(() => {
        setOpen(true)
        setTimer(el, 'openTimer', undefined)
      }, _p.delayDuration)
      setTimer(el, 'openTimer', timerId)
    } else {
      setOpen(true)
    }
  }
  const handleMouseLeave = (e) => {
    const el = (e.currentTarget ?? e.target)
    const openTimer = getTimer(el, 'openTimer')
    if (openTimer !== undefined) {
      clearTimeout(openTimer)
      setTimer(el, 'openTimer', undefined)
    }

    if ((_p.closeDelay ?? 0) > 0) {
      const timerId = setTimeout(() => {
        setOpen(false)
        setTimer(el, 'closeTimer', undefined)
      }, _p.closeDelay)
      setTimer(el, 'closeTimer', timerId)
    } else {
      setOpen(false)
    }
  }
  const handleFocus = () => setOpen(true)
  const handleBlur = () => setOpen(false)

  const [_s3, _s2, _s1] = $(__scope, 's3', 's2', 's1')
  const [_s0] = $t(__scope, 's0')

  let __anchor_s0 = _s0
  createEffect(() => {
    const __val = _p.content
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })

  createEffect(() => {
    if (_s3) {
      { const __v = _p.id; if (__v != null) _s3.setAttribute('id', String(__v)); else _s3.removeAttribute('id') }
      { const __v = `${tooltipContainerClasses} ${_p.className ?? ''}`; if (__v != null) _s3.setAttribute('class', String(__v)); else _s3.removeAttribute('class') }
      { const __v = _p.id; if (__v != null) _s3.setAttribute('aria-describedby', String(__v)); else _s3.removeAttribute('aria-describedby') }
    }
  })

  createEffect(() => {
    if (_s2) {
      { const __v = `${open() ? 'open' : 'closed'}`; if (__v != null) _s2.setAttribute('data-state', String(__v)); else _s2.removeAttribute('data-state') }
      { const __v = `absolute transition-[opacity,transform] duration-fast ease-out ${({"top": "bottom-full left-1/2 -translate-x-1/2 mb-2", "right": "left-full top-1/2 -translate-y-1/2 ml-2", "bottom": "top-full left-1/2 -translate-x-1/2 mt-2", "left": "right-full top-1/2 -translate-y-1/2 mr-2"})[_p.placement ?? 'top']} z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap ${open() ? tooltipContentOpenClasses : tooltipContentClosedClasses}`; if (__v != null) _s2.setAttribute('class', String(__v)); else _s2.removeAttribute('class') }
      { const __v = _p.id; if (__v != null) _s2.setAttribute('id', String(__v)); else _s2.removeAttribute('id') }
    }
  })

  createEffect(() => {
    if (_s1) {
      { const __v = `absolute w-0 h-0 border-4 ${({"top": "top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent", "right": "right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent", "bottom": "bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent", "left": "left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent"})[_p.placement ?? 'top']}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  if (_s3) _s3.addEventListener('mouseenter', handleMouseEnter)
  if (_s3) _s3.addEventListener('mouseleave', handleMouseLeave)
  if (_s3) _s3.addEventListener('focus', handleFocus)
  if (_s3) _s3.addEventListener('blur', handleBlur)
}

hydrate('Tooltip', { init: initTooltip, template: (_p) => `<span data-slot="tooltip" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('relative inline-block')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative inline-block')} ${_p.className ?? ''}`) + '"' : ''} ${(_p.id) != null ? 'aria-describedby="' + escapeAttr(_p.id) + '"' : ''} bf="s3"><span>${_p.children}</span><div data-slot="tooltip-content" ${(`${(false) ? 'open' : 'closed'}`) != null ? 'data-state="' + escapeAttr(`${(false) ? 'open' : 'closed'}`) + '"' : ''} ${(`absolute transition-[opacity,transform] duration-fast ease-out ${({"top": "bottom-full left-1/2 -translate-x-1/2 mb-2", "right": "left-full top-1/2 -translate-y-1/2 ml-2", "bottom": "top-full left-1/2 -translate-x-1/2 mt-2", "left": "right-full top-1/2 -translate-y-1/2 mr-2"})[_p.placement ?? 'top']} z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap ${(false) ? ('opacity-100 scale-100') : ('opacity-0 scale-95 pointer-events-none')}`) != null ? 'class="' + escapeAttr(`absolute transition-[opacity,transform] duration-fast ease-out ${({"top": "bottom-full left-1/2 -translate-x-1/2 mb-2", "right": "left-full top-1/2 -translate-y-1/2 ml-2", "bottom": "top-full left-1/2 -translate-x-1/2 mt-2", "left": "right-full top-1/2 -translate-y-1/2 mr-2"})[_p.placement ?? 'top']} z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap ${(false) ? ('opacity-100 scale-100') : ('opacity-0 scale-95 pointer-events-none')}`) + '"' : ''} role="tooltip" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} bf="s2"><!--bf:s0-->${escapeText(_p.content)}<!--/--><span ${(`absolute w-0 h-0 border-4 ${({"top": "top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent", "right": "right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent", "bottom": "bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent", "left": "left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent"})[_p.placement ?? 'top']}`) != null ? 'class="' + escapeAttr(`absolute w-0 h-0 border-4 ${({"top": "top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent", "right": "right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent", "bottom": "bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent", "left": "left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent"})[_p.placement ?? 'top']}`) + '"' : ''} aria-hidden="true" bf="s1"></span></div></span>` })
export function Tooltip(_p, __bfKey) { return createComponent('Tooltip', _p, __bfKey) }
var isValidElement = isValidElement ?? function(element) {
  return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
}

export function initSlot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className
  const children = _p.children

  const [_s0] = $c(__scope, 's0')


  // Reactive child component props
  createEffect(() => {
    const [__Tag_s0El] = $c(__scope, 's0')
    if (__Tag_s0El) {
      { const __v = ([className, (((children.props).className) || '')].filter(Boolean).join(' ')); if (__v != null) __Tag_s0El.setAttribute('class', String(__v)); else __Tag_s0El.removeAttribute('class') }
    }
  })

  // Initialize child components with props
  initChild('Tag', _s0, forwardProps(_p, { get className() { return ([className, (((children.props).className) || '')].filter(Boolean).join(' ')) } }, ["className"]))
}

hydrate('Slot', { init: initSlot, template: (_p) => `${_p.children && isValidElement(_p.children) ? `${renderChild('Tag', {className: ([_p.className, (((_p.children.props).className) || '')].filter(Boolean).join(' ')), children: `${(_p.children.props).children}`}, undefined, 's0')}` : `${_p.children}`}` })
export function Slot(_p, __bfKey) { return createComponent('Slot', _p, __bfKey) }
export function initButton(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size ?? 'default'
  const variant = _p.variant ?? 'default'
  const className = _p.className ?? ''
  const asChild = _p.asChild ?? false
  const children = _p.children

  const baseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation'
  const variantClasses = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
  link: 'text-foreground underline-offset-4 hover:underline hover:text-primary',
}
  const sizeClasses = {
  default: 'h-9 px-4 py-2 has-[>svg]:px-3',
  sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
  lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
  icon: 'size-9',
  'icon-sm': 'size-8',
  'icon-lg': 'size-10',
}

  const [_s0] = $(__scope, 's0')
  const [_s1] = $c(__scope, 's1')

  createEffect(() => {
    if (_s0) {
      { const __v = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[(_p.variant ?? 'default')]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[(_p.size ?? 'default')]} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","variant","size","asChild","children","class"])


  // Reactive child component props
  createEffect(() => {
    const [__Slot_s1El] = $c(__scope, 's1')
    if (__Slot_s1El) {
      { const __v = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[size]} ${className}`; if (__v != null) __Slot_s1El.setAttribute('class', String(__v)); else __Slot_s1El.removeAttribute('class') }
    }
  })

  // Initialize child components with props
  initChild('Slot', _s1, forwardProps(_p, { get className() { return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[size]} ${className}` } }, ["className"]))
}

hydrate('Button', { init: initButton, template: (_p) => `${_p.asChild ? `${renderChild('Slot', {className: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[size]} ${className}`, children: `${_p.children}`}, undefined, 's1')}` : `<button ${(`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[_p.variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[_p.size]} ${_p.className}`) != null ? 'class="' + escapeAttr(`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[_p.variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[_p.size]} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</button>`}` })
export function Button(_p, __bfKey) { return createComponent('Button', _p, __bfKey) }
export function initTooltipBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Tooltip', _s0, { content: "This is a tooltip", id: "tooltip-basic" })
}

hydrate('TooltipBasicDemo', { init: initTooltipBasicDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "This is a tooltip", id: "tooltip-basic", children: `<span class="underline decoration-dotted cursor-help"> Hover me </span>`}, undefined, 's0')}</span>` })
export function TooltipBasicDemo(_p, __bfKey) { return createComponent('TooltipBasicDemo', _p, __bfKey) }
export function initTooltipButtonDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Keyboard accessible tooltip", id: "tooltip-button" })
  initChild('Button', _s0, {})
}

hydrate('TooltipButtonDemo', { init: initTooltipButtonDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "Keyboard accessible tooltip", id: "tooltip-button", children: `${renderChild('Button', {children: `Hover or Focus`}, undefined, 's0')}`}, undefined, 's1')}</span>` })
export function TooltipButtonDemo(_p, __bfKey) { return createComponent('TooltipButtonDemo', _p, __bfKey) }
export function initTooltipTopDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Top placement", placement: "top", id: "tooltip-top" })
  initChild('Button', _s0, { variant: "outline" })
}

hydrate('TooltipTopDemo', { init: initTooltipTopDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "Top placement", placement: "top", id: "tooltip-top", children: `${renderChild('Button', {variant: "outline", children: `Top`}, undefined, 's0')}`}, undefined, 's1')}</span>` })
export function TooltipTopDemo(_p, __bfKey) { return createComponent('TooltipTopDemo', _p, __bfKey) }
export function initTooltipRightDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Right placement", placement: "right", id: "tooltip-right" })
  initChild('Button', _s0, { variant: "outline" })
}

hydrate('TooltipRightDemo', { init: initTooltipRightDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "Right placement", placement: "right", id: "tooltip-right", children: `${renderChild('Button', {variant: "outline", children: `Right`}, undefined, 's0')}`}, undefined, 's1')}</span>` })
export function TooltipRightDemo(_p, __bfKey) { return createComponent('TooltipRightDemo', _p, __bfKey) }
export function initTooltipBottomDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Bottom placement", placement: "bottom", id: "tooltip-bottom" })
  initChild('Button', _s0, { variant: "outline" })
}

hydrate('TooltipBottomDemo', { init: initTooltipBottomDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "Bottom placement", placement: "bottom", id: "tooltip-bottom", children: `${renderChild('Button', {variant: "outline", children: `Bottom`}, undefined, 's0')}`}, undefined, 's1')}</span>` })
export function TooltipBottomDemo(_p, __bfKey) { return createComponent('TooltipBottomDemo', _p, __bfKey) }
export function initTooltipLeftDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Left placement", placement: "left", id: "tooltip-left" })
  initChild('Button', _s0, { variant: "outline" })
}

hydrate('TooltipLeftDemo', { init: initTooltipLeftDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "Left placement", placement: "left", id: "tooltip-left", children: `${renderChild('Button', {variant: "outline", children: `Left`}, undefined, 's0')}`}, undefined, 's1')}</span>` })
export function TooltipLeftDemo(_p, __bfKey) { return createComponent('TooltipLeftDemo', _p, __bfKey) }
export function initTooltipDelayDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Tooltip', _s0, { content: "This tooltip has a 700ms delay", get delayDuration() { return 700 }, id: "tooltip-delay" })
}

hydrate('TooltipDelayDemo', { init: initTooltipDelayDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "This tooltip has a 700ms delay", delayDuration: 700, id: "tooltip-delay", children: `<span class="underline decoration-dotted cursor-help"> Hover me (700ms delay) </span>`}, undefined, 's0')}</span>` })
export function TooltipDelayDemo(_p, __bfKey) { return createComponent('TooltipDelayDemo', _p, __bfKey) }
export function initTooltipNoDelayDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Tooltip', _s0, { content: "This tooltip appears immediately", get delayDuration() { return 0 }, id: "tooltip-no-delay" })
}

hydrate('TooltipNoDelayDemo', { init: initTooltipNoDelayDemo, template: (_p) => `<span>${renderChild('Tooltip', {content: "This tooltip appears immediately", delayDuration: 0, id: "tooltip-no-delay", children: `<span class="underline decoration-dotted cursor-help"> Hover me (no delay) </span>`}, undefined, 's0')}</span>` })
export function TooltipNoDelayDemo(_p, __bfKey) { return createComponent('TooltipNoDelayDemo', _p, __bfKey) }
export function initTooltipIconDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0, _s3, _s2, _s5, _s4] = $c(__scope, 's1', 's0', 's3', 's2', 's5', 's4')


  // Initialize child components with props
  initChild('Tooltip', _s1, { content: "Bold", id: "tooltip-icon-bold" })
  initChild('Button', _s0, { variant: "outline", size: "icon" })
  initChild('Tooltip', _s3, { content: "Italic", id: "tooltip-icon-italic" })
  initChild('Button', _s2, { variant: "outline", size: "icon" })
  initChild('Tooltip', _s5, { content: "Underline", id: "tooltip-icon-underline" })
  initChild('Button', _s4, { variant: "outline", size: "icon" })
}

hydrate('TooltipIconDemo', { init: initTooltipIconDemo, template: (_p) => `<div class="flex items-center gap-2">${renderChild('Tooltip', {content: "Bold", id: "tooltip-icon-bold", children: `${renderChild('Button', {variant: "outline", size: "icon", children: `<span class="font-bold">B</span>`}, undefined, 's0')}`}, undefined, 's1')}${renderChild('Tooltip', {content: "Italic", id: "tooltip-icon-italic", children: `${renderChild('Button', {variant: "outline", size: "icon", children: `<span class="italic">I</span>`}, undefined, 's2')}`}, undefined, 's3')}${renderChild('Tooltip', {content: "Underline", id: "tooltip-icon-underline", children: `${renderChild('Button', {variant: "outline", size: "icon", children: `<span class="underline">U</span>`}, undefined, 's4')}`}, undefined, 's5')}</div>` })
export function TooltipIconDemo(_p, __bfKey) { return createComponent('TooltipIconDemo', _p, __bfKey) }
