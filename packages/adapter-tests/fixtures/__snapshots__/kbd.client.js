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
export function initKbd(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const asChild = _p.asChild ?? false
  const children = _p.children

  const kbdBaseClasses = 'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3'

  const [_s0] = $(__scope, 's0')
  const [_s1] = $c(__scope, 's1')

  createEffect(() => {
    if (_s0) {
      { const __v = `pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
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

  const className = _p.className ?? ''
  const asChild = _p.asChild ?? false
  const children = _p.children

  const kbdGroupBaseClasses = 'inline-flex items-center gap-1'

  const [_s0] = $(__scope, 's0')
  const [_s1] = $c(__scope, 's1')

  createEffect(() => {
    if (_s0) {
      { const __v = `inline-flex items-center gap-1 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
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
