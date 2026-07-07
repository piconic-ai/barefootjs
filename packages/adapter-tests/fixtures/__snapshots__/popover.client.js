import { $, $c, __bfSlot, createComponent, createContext, createEffect, createPortal, createSignal, escapeAttr, findSiblingSlot, hydrate, initChild, insert, isSSRPortal, provideContext, renderChild, useContext } from '@barefootjs/client/runtime'

var PopoverContext = PopoverContext ?? createContext()

export function initPopover(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const popoverClasses = 'relative inline-block'


  // Provide context for child components
  provideContext(PopoverContext, {
      open: () => _p.open ?? false,
      onOpenChange: _p.onOpenChange ?? (() => {}),
    })
}

hydrate('Popover', { init: initPopover, template: (_p) => `<div data-slot="popover" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('relative inline-block')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative inline-block')} ${_p.className ?? ''}`) + '"' : ''}>${_p.children}</div>` })
export function Popover(_p, __bfKey) { return createComponent('Popover', _p, __bfKey) }
var PopoverContext = PopoverContext ?? createContext()

export function initPopoverTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const popoverTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'
  const warnIfMisusedTrigger = (el, componentName) => {
  const interactiveSelector = 'button, [role="button"], a[href]'
  const hasNestedInteractive = el.querySelector(interactiveSelector) != null
  const isEmpty = Array.from(el.childNodes).every(
    (node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
  )
  const siblingIsInteractive = isEmpty && (el.nextElementSibling?.matches(interactiveSelector) ?? false)

  if (hasNestedInteractive || siblingIsInteractive) {
    console.warn(
      `[barefootjs] ${componentName} rendered an empty trigger next to an interactive element — did you nest a <button>/<Button> inside it? Use <${componentName} asChild> to adopt your own element.`
    )
  }
}
  const handleMount = (el) => {
    const ctx = useContext(PopoverContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!_p.asChild) warnIfMisusedTrigger(el, 'PopoverTrigger')
  }

  const [_s1, _s0] = $(__scope, 's1', 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      _s0.disabled = !!(_p.disabled ?? false)
      { const __v = `${popoverTriggerClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s1) (handleMount)(_s1)
  if (_s0) (handleMount)(_s0)
}

hydrate('PopoverTrigger', { init: initPopoverTrigger, template: (_p) => `${_p.asChild ? `<span data-slot="popover-trigger" aria-expanded="false" style="display:contents" bf="s1">${_p.children}</span>` : `<button data-slot="popover-trigger" type="button" aria-expanded="false" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${_p.disabled ?? false ? 'disabled' : ''} ${(`${('inline-flex items-center disabled:pointer-events-none disabled:opacity-50')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('inline-flex items-center disabled:pointer-events-none disabled:opacity-50')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</button>`}` })
export function PopoverTrigger(_p, __bfKey) { return createComponent('PopoverTrigger', _p, __bfKey) }
var PopoverContext = PopoverContext ?? createContext()
var contentTriggerMap = contentTriggerMap ?? new WeakMap()

export function initPopoverContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const popoverContentBaseClasses = 'fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const popoverContentOpenClasses = 'opacity-100 scale-100'
  const popoverContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
  const handleMount = (el) => {
    // Get trigger ref before portal (while still inside Popover container)
    const triggerEl = findSiblingSlot(el, '[data-slot="popover-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(PopoverContext)

    // Position content relative to trigger
    const updatePosition = () => {
      if (!triggerEl) return
      // display:contents elements have no box model; use first element child for positioning
      const positionEl = (triggerEl.style.display === 'contents' && triggerEl.firstElementChild
        ? triggerEl.firstElementChild
        : triggerEl)
      const rect = positionEl.getBoundingClientRect()
      const align = _p.align ?? 'center'
      const side = _p.side ?? 'bottom'

      if (side === 'bottom') {
        el.style.top = `${rect.bottom + 4}px`
      } else {
        el.style.top = `${rect.top - el.offsetHeight - 4}px`
      }

      if (align === 'start') {
        el.style.left = `${rect.left}px`
      } else if (align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        // center
        el.style.left = `${rect.left + rect.width / 2 - el.offsetWidth / 2}px`
      }
    }

    // Track cleanup functions for global listeners
    let cleanupFns = []

    // Reactive show/hide + positioning + global listeners
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${popoverContentBaseClasses} ${isOpen ? popoverContentOpenClasses : popoverContentClosedClasses} ${_p.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on click outside (content or trigger)
        const handleClickOutside = (e) => {
          if (!el.contains(e.target) && !triggerEl?.contains(e.target)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll and resize
        const handleScroll = () => updatePosition()

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleKeyDown),
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${popoverContentBaseClasses} ${popoverContentClosedClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('PopoverContent', { init: initPopoverContent, template: (_p) => `<div data-slot="popover-content" data-state="closed" ${(-1) != null ? 'tabindex="' + escapeAttr(-1) + '"' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function PopoverContent(_p, __bfKey) { return createComponent('PopoverContent', _p, __bfKey) }
var PopoverContext = PopoverContext ?? createContext()

export function initPopoverClose(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const handleMount = (el) => {
    const ctx = useContext(PopoverContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = _p.className ?? ''; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('PopoverClose', { init: initPopoverClose, template: (_p) => `<button data-slot="popover-close" type="button" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(_p.className ?? '') != null ? 'class="' + escapeAttr(_p.className ?? '') + '"' : ''} bf="s0">${_p.children}</button>` })
export function PopoverClose(_p, __bfKey) { return createComponent('PopoverClose', _p, __bfKey) }
export function initPopoverPreviewDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s2, _s0, _s1] = $c(__scope, 's2', 's0', 's1')


  // Reactive prop bindings
  createEffect(() => {
    if (_s2) {
      _s2.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Popover_s2El] = $c(__scope, 's2')
    if (__Popover_s2El) {
      __Popover_s2El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('Popover', _s2, { get open() { return open() }, onOpenChange: setOpen })
  initChild('PopoverTrigger', _s0, {})
  initChild('PopoverContent', _s1, { className: "w-80" })
}

hydrate('PopoverPreviewDemo', { init: initPopoverPreviewDemo, template: (_p) => `${renderChild('Popover', {open: (false), children: `${renderChild('PopoverTrigger', {children: `<span class="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"> Open popover </span>`}, undefined, 's0')}${renderChild('PopoverContent', {className: "w-80", children: `<div class="grid gap-4"><div class="space-y-2"><h4 class="font-medium leading-none">Dimensions</h4><p class="text-sm text-muted-foreground"> Set the dimensions for the layer. </p></div><div class="grid gap-2"><div class="grid grid-cols-3 items-center gap-4"><span class="text-sm">Width</span><input class="col-span-2 h-8 rounded-md border bg-background px-3 text-sm" value="100%" /></div><div class="grid grid-cols-3 items-center gap-4"><span class="text-sm">Max. width</span><input class="col-span-2 h-8 rounded-md border bg-background px-3 text-sm" value="300px" /></div><div class="grid grid-cols-3 items-center gap-4"><span class="text-sm">Height</span><input class="col-span-2 h-8 rounded-md border bg-background px-3 text-sm" value="25px" /></div><div class="grid grid-cols-3 items-center gap-4"><span class="text-sm">Max. height</span><input class="col-span-2 h-8 rounded-md border bg-background px-3 text-sm" value="none" /></div></div></div>`}, undefined, 's1')}`}, undefined, 's2')}`, comment: true })
export function PopoverPreviewDemo(_p, __bfKey) { return createComponent('PopoverPreviewDemo', _p, __bfKey) }
export function initPopoverBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s2, _s0, _s1] = $c(__scope, 's2', 's0', 's1')


  // Reactive prop bindings
  createEffect(() => {
    if (_s2) {
      _s2.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Popover_s2El] = $c(__scope, 's2')
    if (__Popover_s2El) {
      __Popover_s2El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('Popover', _s2, { get open() { return open() }, onOpenChange: setOpen })
  initChild('PopoverTrigger', _s0, {})
  initChild('PopoverContent', _s1, {})
}

hydrate('PopoverBasicDemo', { init: initPopoverBasicDemo, template: (_p) => `${renderChild('Popover', {open: (false), children: `${renderChild('PopoverTrigger', {children: `<span class="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"> Click me </span>`}, undefined, 's0')}${renderChild('PopoverContent', {children: `<div class="space-y-2"><h4 class="font-medium leading-none">About</h4><p class="text-sm text-muted-foreground"> This is a basic popover with simple text content. It opens on click and closes when you click outside or press ESC. </p></div>`}, undefined, 's1')}`}, undefined, 's2')}`, comment: true })
export function PopoverBasicDemo(_p, __bfKey) { return createComponent('PopoverBasicDemo', _p, __bfKey) }
export function initPopoverFormDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const [saved, setSaved] = createSignal(false)
  const handleSave = () => {
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setOpen(false)
    }, 1500)
  }

  const [_s3, _s2] = $(__scope, '^s3', '^s2')
  const [_s5, _s0, _s4, _s1] = $c(__scope, 's5', 's0', 's4', 's1')

  insert(__scope, '^s2', () => saved(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:^s2-->${__bfSlot('Saved!', __slots)}<!--bf-cond-end:^s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:^s2-->${__bfSlot('Save', __slots)}<!--bf-cond-end:^s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s3) _s3.addEventListener('click', handleSave)

  // Reactive prop bindings
  createEffect(() => {
    if (_s5) {
      _s5.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Popover_s5El] = $c(__scope, 's5')
    if (__Popover_s5El) {
      __Popover_s5El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('Popover', _s5, { get open() { return open() }, onOpenChange: setOpen })
  initChild('PopoverTrigger', _s0, {})
  initChild('PopoverContent', _s4, { align: "start", className: "w-80" })
  initChild('PopoverClose', _s1, { className: "inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent" })
}

hydrate('PopoverFormDemo', { init: initPopoverFormDemo, template: (_p) => `${renderChild('Popover', {open: (false), children: `${renderChild('PopoverTrigger', {children: `<span class="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"><svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Settings</span></span>`}, undefined, 's0')}${renderChild('PopoverContent', {align: "start", className: "w-80", children: `<div class="grid gap-4"><div class="space-y-2"><h4 class="font-medium leading-none">Notifications</h4><p class="text-sm text-muted-foreground"> Configure how you receive notifications. </p></div><div class="grid gap-3"><div class="flex items-center justify-between"><label class="text-sm" for="popover-email">Email</label><input id="popover-email" type="email" placeholder="you@example.com" class="h-8 w-48 rounded-md border bg-background px-3 text-sm" /></div><div class="flex items-center justify-between"><label class="text-sm" for="popover-frequency">Frequency</label><select id="popover-frequency" class="h-8 w-48 rounded-md border bg-background px-3 text-sm"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div></div><div class="flex justify-between">${renderChild('PopoverClose', {className: "inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent", children: `<span>Cancel</span>`}, undefined, 's1')}<button type="button" class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90" bf="^s3">${(false) ? `<!--bf-cond-start:^s2-->${'Saved!'}<!--bf-cond-end:^s2-->` : `<!--bf-cond-start:^s2-->${'Save'}<!--bf-cond-end:^s2-->`}</button></div></div>`}, undefined, 's4')}`}, undefined, 's5')}`, comment: true })
export function PopoverFormDemo(_p, __bfKey) { return createComponent('PopoverFormDemo', _p, __bfKey) }
