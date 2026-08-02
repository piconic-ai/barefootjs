import { $, $c, __bfSlot, applyRestAttrs, createComponent, createDisposableEffect, createEffect, escapeAttr, forwardProps, hydrate, initChild, insertRoot, qsa, renderChild } from '@barefootjs/client/runtime'

var isValidElement = isValidElement ?? function(element) {
  return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
}

export function initSlot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const children = _p.children ?? {}
  const className = _p.className

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  insertRoot(__scope, 's1', () => children && isValidElement(children), {
    template: () => { const __slots = []; return { html: `${renderChild('Tag', {className: ([className, (((children.props).className) || '')].filter(Boolean).join(' ')), children: `${__bfSlot((children.props).children, __slots)}`}, undefined, 's0')}`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's0')
      if (__c0) initChild('Tag', __c0, forwardProps(_p, { get className() { return ([className, (((children.props).className) || '')].filter(Boolean).join(' ')) } }, ["className"]))
    }
  }, {
    template: () => { const __slots = []; return { html: `${__bfSlot(children, __slots)}`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })


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
export function initKbd(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const asChild = _p.asChild ?? false
  const className = _p.className ?? ''
  const children = _p.children

  const kbdBaseClasses = 'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3'

  const [_s2, _s0] = $(__scope, 's2', 's0')
  const [_s1] = $c(__scope, 's1')

  insertRoot(__scope, 's2', () => asChild, {
    template: () => { const __slots = []; return { html: `${renderChild('Slot', {className: `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`, children: `${__bfSlot(children, __slots)}`}, undefined, 's1')}`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('Slot', __c0, forwardProps(_p, { get className() { return `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}` } }, ["className"]))
    }
  }, {
    template: () => { const __slots = []; return { html: `<kbd data-slot="kbd" ${(`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`) != null ? 'class="' + escapeAttr(`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`) + '"' : ''} bf="s0">${__bfSlot(children, __slots)}</kbd>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s0 = qsa(__branchScope, '[bf="s0"]')
      if (__ra_s0) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${(_p.className ?? '')}`; if (__v != null) __ra_s0.setAttribute('class', String(__v)); else __ra_s0.removeAttribute('class') }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","asChild","children","data-slot","class"])


  // Reactive child component props
  createEffect(() => {
    const [__Slot_s1El] = $c(__scope, 's1')
    if (__Slot_s1El) {
      { const __v = `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`; if (__v != null) __Slot_s1El.setAttribute('class', String(__v)); else __Slot_s1El.removeAttribute('class') }
    }
  })

  // Initialize child components with props
  initChild('Slot', _s1, forwardProps(_p, { get className() { return `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}` } }, ["className"]))
}

hydrate('Kbd', { init: initKbd, template: (_p) => `${_p.asChild ? `${renderChild('Slot', {className: `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${className}`, children: `${_p.children}`}, undefined, 's1')}` : `<kbd data-slot="kbd" ${(`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${_p.className}`) != null ? 'class="' + escapeAttr(`pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</kbd>`}` })
export function Kbd(_p, __bfKey) { return createComponent('Kbd', _p, __bfKey) }
export function initKbdGroup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const asChild = _p.asChild ?? false
  const className = _p.className ?? ''
  const children = _p.children

  const kbdGroupBaseClasses = 'inline-flex items-center gap-1'

  const [_s2, _s0] = $(__scope, 's2', 's0')
  const [_s1] = $c(__scope, 's1')

  insertRoot(__scope, 's2', () => asChild, {
    template: () => { const __slots = []; return { html: `${renderChild('Slot', {className: `inline-flex items-center gap-1 ${className}`, children: `${__bfSlot(children, __slots)}`}, undefined, 's1')}`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('Slot', __c0, forwardProps(_p, { get className() { return `inline-flex items-center gap-1 ${className}` } }, ["className"]))
    }
  }, {
    template: () => { const __slots = []; return { html: `<kbd data-slot="kbd-group" ${(`inline-flex items-center gap-1 ${className}`) != null ? 'class="' + escapeAttr(`inline-flex items-center gap-1 ${className}`) + '"' : ''} bf="s0">${__bfSlot(children, __slots)}</kbd>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      { const __ra_s0 = qsa(__branchScope, '[bf="s0"]')
      if (__ra_s0) {
        __disposers.push(createDisposableEffect(() => {
          { const __v = `inline-flex items-center gap-1 ${(_p.className ?? '')}`; if (__v != null) __ra_s0.setAttribute('class', String(__v)); else __ra_s0.removeAttribute('class') }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","asChild","children","data-slot","class"])


  // Reactive child component props
  createEffect(() => {
    const [__Slot_s1El] = $c(__scope, 's1')
    if (__Slot_s1El) {
      { const __v = `inline-flex items-center gap-1 ${className}`; if (__v != null) __Slot_s1El.setAttribute('class', String(__v)); else __Slot_s1El.removeAttribute('class') }
    }
  })

  // Initialize child components with props
  initChild('Slot', _s1, forwardProps(_p, { get className() { return `inline-flex items-center gap-1 ${className}` } }, ["className"]))
}

hydrate('KbdGroup', { init: initKbdGroup, template: (_p) => `${_p.asChild ? `${renderChild('Slot', {className: `inline-flex items-center gap-1 ${className}`, children: `${_p.children}`}, undefined, 's1')}` : `<kbd data-slot="kbd-group" ${(`inline-flex items-center gap-1 ${_p.className}`) != null ? 'class="' + escapeAttr(`inline-flex items-center gap-1 ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</kbd>`}` })
export function KbdGroup(_p, __bfKey) { return createComponent('KbdGroup', _p, __bfKey) }
