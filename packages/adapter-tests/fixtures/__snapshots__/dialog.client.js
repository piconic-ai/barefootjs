import { $, $c, applyRestAttrs, createComponent, createContext, createEffect, createPortal, createSignal, escapeAttr, hydrate, initChild, isSSRPortal, onCleanup, provideContext, renderChild, useContext } from '@barefootjs/client/runtime'

var DialogContext = DialogContext ?? createContext()

export function initDialog(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')


  // Provide context for child components
  provideContext(DialogContext, {
      open: () => _p.open ?? false,
      onOpenChange: _p.onOpenChange ?? (() => {}),
    })
}

hydrate('Dialog', { init: initDialog, template: (_p) => `<div style="display:contents">${_p.children}</div>` })
export function Dialog(_p, __bfKey) { return createComponent('Dialog', _p, __bfKey) }
var DialogContext = DialogContext ?? createContext()

export function initDialogTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dialogTriggerClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3'
  const warnIfMisusedTrigger = (el, componentName) => {
  const interactiveSelector = 'button, [role="button"], a[href]'
  const hasNestedInteractive = el.querySelector(interactiveSelector) != null
  const isEmpty = Array.from(el.childNodes).every(
    (node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
  )
  const siblingIsInteractive = isEmpty && (el.nextElementSibling?.matches(interactiveSelector) ?? false)

  if (hasNestedInteractive) {
    console.warn(
      `[barefootjs] ${componentName} contains a nested interactive element (<button>, <a href>, or [role="button"]) inside the trigger's own <button> — nested interactive elements don't work reliably. Use <${componentName} asChild> to adopt your element instead.`
    )
  } else if (siblingIsInteractive) {
    console.warn(
      `[barefootjs] ${componentName} rendered an empty trigger followed by an interactive element — this is what the HTML parser produces from a <button>/<Button> nested inside the trigger. Use <${componentName} asChild> to adopt your element instead.`
    )
  }
}
  const handleMount = (el) => {
    const ctx = useContext(DialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!_p.asChild) warnIfMisusedTrigger(el, 'DialogTrigger')
  }

  const [_s1, _s0] = $(__scope, 's1', 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogTriggerClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      _s0.disabled = !!(_p.disabled ?? false)
    }
  })

  if (_s1) (handleMount)(_s1)
  if (_s0) (handleMount)(_s0)
}

hydrate('DialogTrigger', { init: initDialogTrigger, template: (_p) => `${_p.asChild ? `<span data-slot="dialog-trigger" style="display:contents" bf="s1">${_p.children}</span>` : `<button data-slot="dialog-trigger" type="button" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3')} ${_p.className ?? ''}`) + '"' : ''} ${_p.disabled ?? false ? 'disabled' : ''} bf="s0">${_p.children}</button>`}` })
export function DialogTrigger(_p, __bfKey) { return createComponent('DialogTrigger', _p, __bfKey) }
var DialogContext = DialogContext ?? createContext()

export function initDialogOverlay(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dialogOverlayBaseClasses = 'fixed inset-0 z-50 bg-black/80 transition-opacity duration-200'
  const dialogOverlayOpenClasses = 'opacity-100'
  const dialogOverlayClosedClasses = 'opacity-0 pointer-events-none'
  const handleMount = (el) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DialogContext)

    // Reactive show/hide + click-to-close
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${dialogOverlayBaseClasses} ${isOpen ? dialogOverlayOpenClasses : dialogOverlayClosedClasses} ${_p.className ?? ''}`
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogOverlayBaseClasses} ${dialogOverlayClosedClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DialogOverlay', { init: initDialogOverlay, template: (_p) => `<div data-slot="dialog-overlay" data-state="closed" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('fixed inset-0 z-50 bg-black/80 transition-opacity duration-200')} ${('opacity-0 pointer-events-none')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('fixed inset-0 z-50 bg-black/80 transition-opacity duration-200')} ${('opacity-0 pointer-events-none')} ${_p.className ?? ''}`) + '"' : ''} bf="s0"></div>` })
export function DialogOverlay(_p, __bfKey) { return createComponent('DialogOverlay', _p, __bfKey) }
var DialogContext = DialogContext ?? createContext()

export function initDialogContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dialogContentBaseClasses = 'fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg'
  const dialogContentOpenClasses = 'opacity-100 scale-100'
  const dialogContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
  const handleMount = (el) => {
    // Portal to body
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DialogContext)

    // Track cleanup functions for global listeners
    let cleanupFns = []

    // Reactive show/hide + scroll lock + focus trap + ESC key
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${dialogContentBaseClasses} ${isOpen ? dialogContentOpenClasses : dialogContentClosedClasses} ${_p.className ?? ''}`

      if (isOpen) {
        // Scroll lock
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        // Focus first focusable element
        const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        setTimeout(() => {
          const focusableElements = el.querySelectorAll(focusableSelector)
          const firstElement = focusableElements[0]
          firstElement?.focus()
        }, 0)

        // ESC key to close
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            return
          }

          // Focus trap
          if (e.key === 'Tab') {
            const focusableElements = el.querySelectorAll(focusableSelector)
            const firstElement = focusableElements[0]
            const lastElement = focusableElements[focusableElements.length - 1]

            if (e.shiftKey) {
              if (document.activeElement === firstElement || document.activeElement === el) {
                e.preventDefault()
                lastElement?.focus()
              }
            } else {
              if (document.activeElement === lastElement) {
                e.preventDefault()
                firstElement?.focus()
              }
            }
          }
        }

        document.addEventListener('keydown', handleKeyDown)

        cleanupFns.push(
          () => { document.body.style.overflow = originalOverflow },
          () => document.removeEventListener('keydown', handleKeyDown),
        )
      }
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.ariaLabelledby; if (__v != null) _s0.setAttribute('aria-labelledby', String(__v)); else _s0.removeAttribute('aria-labelledby') }
      { const __v = _p.ariaDescribedby; if (__v != null) _s0.setAttribute('aria-describedby', String(__v)); else _s0.removeAttribute('aria-describedby') }
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogContentBaseClasses} ${dialogContentClosedClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DialogContent', { init: initDialogContent, template: (_p) => `<div data-slot="dialog-content" data-state="closed" role="dialog" aria-modal="true" ${(_p.ariaLabelledby) != null ? 'aria-labelledby="' + escapeAttr(_p.ariaLabelledby) + '"' : ''} ${(_p.ariaDescribedby) != null ? 'aria-describedby="' + escapeAttr(_p.ariaDescribedby) + '"' : ''} ${(-1) != null ? 'tabindex="' + escapeAttr(-1) + '"' : ''} ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('fixed left-[50%] top-[50%] z-50 flex flex-col w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DialogContent(_p, __bfKey) { return createComponent('DialogContent', _p, __bfKey) }
export function initDialogHeader(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const dialogHeaderClasses = 'flex flex-col gap-2 text-center sm:text-left'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${dialogHeaderClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","children","data-slot","class"])

}

hydrate('DialogHeader', { init: initDialogHeader, template: (_p) => `<div data-slot="dialog-header" ${(`${('flex flex-col gap-2 text-center sm:text-left')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('flex flex-col gap-2 text-center sm:text-left')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DialogHeader(_p, __bfKey) { return createComponent('DialogHeader', _p, __bfKey) }
export function initDialogTitle(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const id = _p.id
  const className = _p.className ?? ''
  const children = _p.children

  const dialogTitleClasses = 'text-lg leading-none font-semibold'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogTitleClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","id","children","data-slot","class"])

}

hydrate('DialogTitle', { init: initDialogTitle, template: (_p) => `<h2 data-slot="dialog-title" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('text-lg leading-none font-semibold')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('text-lg leading-none font-semibold')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</h2>` })
export function DialogTitle(_p, __bfKey) { return createComponent('DialogTitle', _p, __bfKey) }
export function initDialogDescription(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const id = _p.id
  const className = _p.className ?? ''
  const children = _p.children

  const dialogDescriptionClasses = 'text-muted-foreground text-sm'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogDescriptionClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","id","children","data-slot","class"])

}

hydrate('DialogDescription', { init: initDialogDescription, template: (_p) => `<p data-slot="dialog-description" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('text-muted-foreground text-sm')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('text-muted-foreground text-sm')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</p>` })
export function DialogDescription(_p, __bfKey) { return createComponent('DialogDescription', _p, __bfKey) }
export function initDialogFooter(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const dialogFooterClasses = 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${dialogFooterClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","children","data-slot","class"])

}

hydrate('DialogFooter', { init: initDialogFooter, template: (_p) => `<div data-slot="dialog-footer" ${(`${('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DialogFooter(_p, __bfKey) { return createComponent('DialogFooter', _p, __bfKey) }
var DialogContext = DialogContext ?? createContext()

export function initDialogClose(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dialogCloseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3'
  const handleMount = (el) => {
    const ctx = useContext(DialogContext)

    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dialogCloseClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DialogClose', { init: initDialogClose, template: (_p) => `<button data-slot="dialog-close" type="button" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 has-[>svg]:px-3')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</button>` })
export function DialogClose(_p, __bfKey) { return createComponent('DialogClose', _p, __bfKey) }
export function initDialogBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s9, _s0, _s1, _s8, _s4, _s2, _s3, _s7, _s5, _s6] = $c(__scope, 's9', 's0', 's1', 's8', 's4', 's2', 's3', 's7', 's5', 's6')


  // Reactive prop bindings
  createEffect(() => {
    if (_s9) {
      _s9.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Dialog_s9El] = $c(__scope, 's9')
    if (__Dialog_s9El) {
      __Dialog_s9El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('Dialog', _s9, { get open() { return open() }, onOpenChange: setOpen })
  initChild('DialogTrigger', _s0, {})
  initChild('DialogOverlay', _s1, {})
  initChild('DialogContent', _s8, { ariaLabelledby: "dialog-title", ariaDescribedby: "dialog-description" })
  initChild('DialogHeader', _s4, {})
  initChild('DialogTitle', _s2, { id: "dialog-title" })
  initChild('DialogDescription', _s3, { id: "dialog-description" })
  initChild('DialogFooter', _s7, {})
  initChild('DialogClose', _s5, {})
  initChild('DialogClose', _s6, {})
}

hydrate('DialogBasicDemo', { init: initDialogBasicDemo, template: (_p) => `<div>${renderChild('Dialog', {open: (false), children: `${renderChild('DialogTrigger', {children: ` Create Task `}, undefined, 's0')}${renderChild('DialogOverlay', {}, undefined, 's1')}${renderChild('DialogContent', {ariaLabelledby: "dialog-title", ariaDescribedby: "dialog-description", children: `${renderChild('DialogHeader', {children: `${renderChild('DialogTitle', {id: "dialog-title", children: `Create New Task`}, undefined, 's2')}${renderChild('DialogDescription', {id: "dialog-description", children: ` Add a new task to your list. `}, undefined, 's3')}`}, undefined, 's4')}<div class="grid gap-4 py-4"><div class="grid gap-2"><label for="task-title" class="text-sm font-medium"> Title </label><input id="task-title" type="text" placeholder="Enter task title" class="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" /></div><div class="grid gap-2"><label for="task-description" class="text-sm font-medium"> Description </label><textarea id="task-description" placeholder="Enter task description (optional)" ${(3) != null ? 'rows="' + escapeAttr(3) + '"' : ''} class="flex w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"></textarea></div></div>${renderChild('DialogFooter', {children: `${renderChild('DialogClose', {children: `Cancel`}, undefined, 's5')}${renderChild('DialogClose', {children: `Create`}, undefined, 's6')}`}, undefined, 's7')}`}, undefined, 's8')}`}, undefined, 's9')}</div>` })
export function DialogBasicDemo(_p, __bfKey) { return createComponent('DialogBasicDemo', _p, __bfKey) }
export function initDialogFormDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const [confirmText, setConfirmText] = createSignal('')
  const projectName = 'my-project'
  const isConfirmed = () => confirmText() === projectName
  const handleDelete = () => {
    if (isConfirmed()) {
      setOpen(false)
      setConfirmText('')
    }
  }
  const handleOpenChange = (isOpen) => {
    setOpen(isOpen)
    if (!isOpen) setConfirmText('')
  }

  const [_s5, _s7] = $(__scope, '^s5', '^s7')
  const [_s10, _s0, _s1, _s9, _s4, _s2, _s3, _s8, _s6] = $c(__scope, 's10', 's0', 's1', 's9', 's4', 's2', 's3', 's8', 's6')

  createEffect(() => {
    if (_s5) {
      const __val = String(confirmText())
      if (_s5.value !== __val) _s5.value = __val
    }
  })

  createEffect(() => {
    if (_s7) {
      _s7.disabled = !!(!isConfirmed())
    }
  })

  if (_s5) _s5.addEventListener('input', (e) => { setConfirmText((e.target).value) })
  if (_s7) _s7.addEventListener('click', handleDelete)

  // Reactive prop bindings
  createEffect(() => {
    if (_s10) {
      _s10.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Dialog_s10El] = $c(__scope, 's10')
    if (__Dialog_s10El) {
      __Dialog_s10El.open = !!(open())
    }
  })
  createEffect(() => {
    if (!open()) return

    // Wait for next frame to ensure Portal has mounted
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById('confirm-project-name')
      const btn = document.getElementById('delete-project-button')
      if (!input || !btn) return

      // Reset input on open
      input.value = ''
      setConfirmText('')

      // Set up input handler
      const handleInput = () => setConfirmText(input.value)
      input.addEventListener('input', handleInput)

      // Set up button click handler (needed because Portal moves element after hydration)
      btn.onclick = handleDelete

      // Set up reactive disabled effect
      createEffect(() => {
        btn.disabled = !isConfirmed()
      })

      onCleanup(() => {
        input.removeEventListener('input', handleInput)
      })
    })

    onCleanup(() => cancelAnimationFrame(frame))
  })

  // Initialize child components with props
  initChild('Dialog', _s10, { get open() { return open() }, onOpenChange: handleOpenChange })
  initChild('DialogTrigger', _s0, { asChild: true })
  initChild('DialogOverlay', _s1, {})
  initChild('DialogContent', _s9, { ariaLabelledby: "delete-dialog-title", ariaDescribedby: "delete-dialog-description" })
  initChild('DialogHeader', _s4, {})
  initChild('DialogTitle', _s2, { id: "delete-dialog-title" })
  initChild('DialogDescription', _s3, { id: "delete-dialog-description" })
  initChild('DialogFooter', _s8, {})
  initChild('DialogClose', _s6, {})
}

hydrate('DialogFormDemo', { init: initDialogFormDemo, template: (_p) => `<div>${renderChild('Dialog', {open: (false), children: `${renderChild('DialogTrigger', {asChild: true, children: `<button type="button" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"> Delete Project </button>`}, undefined, 's0')}${renderChild('DialogOverlay', {}, undefined, 's1')}${renderChild('DialogContent', {ariaLabelledby: "delete-dialog-title", ariaDescribedby: "delete-dialog-description", children: `${renderChild('DialogHeader', {children: `${renderChild('DialogTitle', {id: "delete-dialog-title", children: `Delete Project`}, undefined, 's2')}${renderChild('DialogDescription', {id: "delete-dialog-description", children: ` This action cannot be undone. This will permanently delete the <strong class="text-foreground">${('my-project')}</strong> project. `}, undefined, 's3')}`}, undefined, 's4')}<div class="py-4"><label for="confirm-project-name" class="text-sm text-muted-foreground"> Please type <strong class="text-foreground">${('my-project')}</strong> to confirm. </label><input id="confirm-project-name" type="text" ${(`my-project`) != null ? 'placeholder="' + escapeAttr(`my-project`) + '"' : ''} ${(('')) != null ? 'value="' + escapeAttr(('')) + '"' : ''} class="mt-2 flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" bf="^s5" /></div>${renderChild('DialogFooter', {children: `${renderChild('DialogClose', {children: `Cancel`}, undefined, 's6')}<button type="button" id="delete-project-button" ${undefined ? 'disabled' : ''} class="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50" bf="^s7"> Delete Project </button>`}, undefined, 's8')}`}, undefined, 's9')}`}, undefined, 's10')}</div>` })
export function DialogFormDemo(_p, __bfKey) { return createComponent('DialogFormDemo', _p, __bfKey) }
export function initDialogLongContentDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s9, _s0, _s1, _s8, _s4, _s2, _s3, _s7, _s5, _s6] = $c(__scope, 's9', 's0', 's1', 's8', 's4', 's2', 's3', 's7', 's5', 's6')


  // Reactive prop bindings
  createEffect(() => {
    if (_s9) {
      _s9.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Dialog_s9El] = $c(__scope, 's9')
    if (__Dialog_s9El) {
      __Dialog_s9El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('Dialog', _s9, { get open() { return open() }, onOpenChange: setOpen })
  initChild('DialogTrigger', _s0, {})
  initChild('DialogOverlay', _s1, {})
  initChild('DialogContent', _s8, { ariaLabelledby: "long-dialog-title", ariaDescribedby: "long-dialog-description", className: "max-h-[66vh]" })
  initChild('DialogHeader', _s4, { className: "flex-shrink-0" })
  initChild('DialogTitle', _s2, { id: "long-dialog-title" })
  initChild('DialogDescription', _s3, { id: "long-dialog-description" })
  initChild('DialogFooter', _s7, { className: "flex-shrink-0" })
  initChild('DialogClose', _s5, {})
  initChild('DialogClose', _s6, {})
}

hydrate('DialogLongContentDemo', { init: initDialogLongContentDemo, template: (_p) => `<div>${renderChild('Dialog', {open: (false), children: `${renderChild('DialogTrigger', {children: ` Open Long Content Dialog `}, undefined, 's0')}${renderChild('DialogOverlay', {}, undefined, 's1')}${renderChild('DialogContent', {ariaLabelledby: "long-dialog-title", ariaDescribedby: "long-dialog-description", className: "max-h-[66vh]", children: `${renderChild('DialogHeader', {className: "flex-shrink-0", children: `${renderChild('DialogTitle', {id: "long-dialog-title", children: `Terms of Service`}, undefined, 's2')}${renderChild('DialogDescription', {id: "long-dialog-description", children: ` Please read the following terms carefully. `}, undefined, 's3')}`}, undefined, 's4')}<div class="text-sm text-muted-foreground space-y-4 overflow-y-auto flex-1 min-h-0"><p> Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. </p><p> Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. </p><p> Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. </p><p> Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. </p><p> Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. </p><p> Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? </p><p> Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur? </p><p> At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident. </p></div>${renderChild('DialogFooter', {className: "flex-shrink-0", children: `${renderChild('DialogClose', {children: `Decline`}, undefined, 's5')}${renderChild('DialogClose', {children: `Accept`}, undefined, 's6')}`}, undefined, 's7')}`}, undefined, 's8')}`}, undefined, 's9')}</div>` })
export function DialogLongContentDemo(_p, __bfKey) { return createComponent('DialogLongContentDemo', _p, __bfKey) }
