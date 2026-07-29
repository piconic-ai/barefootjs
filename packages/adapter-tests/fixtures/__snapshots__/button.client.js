import { $, $c, applyRestAttrs, createComponent, createEffect, escapeAttr, forwardProps, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

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
