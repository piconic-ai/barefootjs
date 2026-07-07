import { $, $c, applyRestAttrs, createComponent, createContext, createEffect, createMemo, createPortal, createSignal, escapeAttr, findSiblingSlot, forwardProps, hydrate, initChild, insert, isSSRPortal, provideContext, renderChild, spreadAttrs, useContext } from '@barefootjs/client/runtime'

export function initCheckIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CheckIcon', { init: initCheckIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['check']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['check']) + '"' : ''}></path></svg>` })
export function CheckIcon(_p, __bfKey) { return createComponent('CheckIcon', _p, __bfKey) }
export function initChevronDownIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ChevronDownIcon', { init: initChevronDownIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-down']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-down']) + '"' : ''}></path></svg>` })
export function ChevronDownIcon(_p, __bfKey) { return createComponent('ChevronDownIcon', _p, __bfKey) }
export function initChevronUpIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ChevronUpIcon', { init: initChevronUpIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-up']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-up']) + '"' : ''}></path></svg>` })
export function ChevronUpIcon(_p, __bfKey) { return createComponent('ChevronUpIcon', _p, __bfKey) }
export function initChevronLeftIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ChevronLeftIcon', { init: initChevronLeftIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-left']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-left']) + '"' : ''}></path></svg>` })
export function ChevronLeftIcon(_p, __bfKey) { return createComponent('ChevronLeftIcon', _p, __bfKey) }
export function initChevronRightIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ChevronRightIcon', { init: initChevronRightIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-right']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['chevron-right']) + '"' : ''}></path></svg>` })
export function ChevronRightIcon(_p, __bfKey) { return createComponent('ChevronRightIcon', _p, __bfKey) }
export function initXIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('XIcon', { init: initXIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['x']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['x']) + '"' : ''}></path></svg>` })
export function XIcon(_p, __bfKey) { return createComponent('XIcon', _p, __bfKey) }
export function initPlusIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('PlusIcon', { init: initPlusIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "butt", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['plus']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['plus']) + '"' : ''}></path></svg>` })
export function PlusIcon(_p, __bfKey) { return createComponent('PlusIcon', _p, __bfKey) }
export function initMinusIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('MinusIcon', { init: initMinusIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "butt", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['minus']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['minus']) + '"' : ''}></path></svg>` })
export function MinusIcon(_p, __bfKey) { return createComponent('MinusIcon', _p, __bfKey) }
export function initSunIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('SunIcon', { init: initSunIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['sun']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['sun']) + '"' : ''}></path></svg>` })
export function SunIcon(_p, __bfKey) { return createComponent('SunIcon', _p, __bfKey) }
export function initMoonIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('MoonIcon', { init: initMoonIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['moon']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['moon']) + '"' : ''}></path></svg>` })
export function MoonIcon(_p, __bfKey) { return createComponent('MoonIcon', _p, __bfKey) }
export function initMonitorIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('MonitorIcon', { init: initMonitorIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['monitor']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['monitor']) + '"' : ''}></path></svg>` })
export function MonitorIcon(_p, __bfKey) { return createComponent('MonitorIcon', _p, __bfKey) }
export function initCopyIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CopyIcon', { init: initCopyIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['copy']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['copy']) + '"' : ''}></path></svg>` })
export function CopyIcon(_p, __bfKey) { return createComponent('CopyIcon', _p, __bfKey) }
export function initClipboardIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ClipboardIcon', { init: initClipboardIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['clipboard']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['clipboard']) + '"' : ''}></path></svg>` })
export function ClipboardIcon(_p, __bfKey) { return createComponent('ClipboardIcon', _p, __bfKey) }
export function initClipboardCheckIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ClipboardCheckIcon', { init: initClipboardCheckIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['clipboard-check']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['clipboard-check']) + '"' : ''}></path></svg>` })
export function ClipboardCheckIcon(_p, __bfKey) { return createComponent('ClipboardCheckIcon', _p, __bfKey) }
export function initMenuIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('MenuIcon', { init: initMenuIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['menu']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['menu']) + '"' : ''}></path></svg>` })
export function MenuIcon(_p, __bfKey) { return createComponent('MenuIcon', _p, __bfKey) }
export function initArrowLeftIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ArrowLeftIcon', { init: initArrowLeftIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-left']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-left']) + '"' : ''}></path></svg>` })
export function ArrowLeftIcon(_p, __bfKey) { return createComponent('ArrowLeftIcon', _p, __bfKey) }
export function initArrowRightIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ArrowRightIcon', { init: initArrowRightIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-right']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-right']) + '"' : ''}></path></svg>` })
export function ArrowRightIcon(_p, __bfKey) { return createComponent('ArrowRightIcon', _p, __bfKey) }
export function initArrowUpDownIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('ArrowUpDownIcon', { init: initArrowUpDownIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-up-down']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['arrow-up-down']) + '"' : ''}></path></svg>` })
export function ArrowUpDownIcon(_p, __bfKey) { return createComponent('ArrowUpDownIcon', _p, __bfKey) }
export function initEllipsisIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('EllipsisIcon', { init: initEllipsisIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>` })
export function EllipsisIcon(_p, __bfKey) { return createComponent('EllipsisIcon', _p, __bfKey) }
export function initGitHubIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","aria-hidden"])

}

hydrate('GitHubIcon', { init: initGitHubIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "currentColor", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>` })
export function GitHubIcon(_p, __bfKey) { return createComponent('GitHubIcon', _p, __bfKey) }
export function initSettingsIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('SettingsIcon', { init: initSettingsIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>` })
export function SettingsIcon(_p, __bfKey) { return createComponent('SettingsIcon', _p, __bfKey) }
export function initGlobeIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('GlobeIcon', { init: initGlobeIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>` })
export function GlobeIcon(_p, __bfKey) { return createComponent('GlobeIcon', _p, __bfKey) }
export function initLogOutIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('LogOutIcon', { init: initLogOutIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path></svg>` })
export function LogOutIcon(_p, __bfKey) { return createComponent('LogOutIcon', _p, __bfKey) }
export function initCircleHelpIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CircleHelpIcon', { init: initCircleHelpIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>` })
export function CircleHelpIcon(_p, __bfKey) { return createComponent('CircleHelpIcon', _p, __bfKey) }
export function initSearchIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('SearchIcon', { init: initSearchIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>` })
export function SearchIcon(_p, __bfKey) { return createComponent('SearchIcon', _p, __bfKey) }
export function initCircleCheckIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CircleCheckIcon', { init: initCircleCheckIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>` })
export function CircleCheckIcon(_p, __bfKey) { return createComponent('CircleCheckIcon', _p, __bfKey) }
export function initCircleXIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CircleXIcon', { init: initCircleXIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>` })
export function CircleXIcon(_p, __bfKey) { return createComponent('CircleXIcon', _p, __bfKey) }
export function initTriangleAlertIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('TriangleAlertIcon', { init: initTriangleAlertIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>` })
export function TriangleAlertIcon(_p, __bfKey) { return createComponent('TriangleAlertIcon', _p, __bfKey) }
export function initInfoIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('InfoIcon', { init: initInfoIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>` })
export function InfoIcon(_p, __bfKey) { return createComponent('InfoIcon', _p, __bfKey) }
export function initCalendarIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('CalendarIcon', { init: initCalendarIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>` })
export function CalendarIcon(_p, __bfKey) { return createComponent('CalendarIcon', _p, __bfKey) }
export function initGripVerticalIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('GripVerticalIcon', { init: initGripVerticalIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>` })
export function GripVerticalIcon(_p, __bfKey) { return createComponent('GripVerticalIcon', _p, __bfKey) }
export function initLoaderCircleIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('LoaderCircleIcon', { init: initLoaderCircleIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><path ${(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['loader-circle']) != null ? 'd="' + escapeAttr(({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})['loader-circle']) + '"' : ''}></path></svg>` })
export function LoaderCircleIcon(_p, __bfKey) { return createComponent('LoaderCircleIcon', _p, __bfKey) }
export function initPanelLeftIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["size","className","xmlns","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])

}

hydrate('PanelLeftIcon', { init: initPanelLeftIcon, template: (_p) => `<svg ${spreadAttrs({"xmlns": "http://www.w3.org/2000/svg", ...((_p.size ? { width: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size], height: ({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size] } : {})), "viewBox": "0 0 24 24", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "class": `shrink-0 ${_p.className}`, "aria-hidden": "true"})} bf="s0"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>` })
export function PanelLeftIcon(_p, __bfKey) { return createComponent('PanelLeftIcon', _p, __bfKey) }
export function initIcon(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const size = _p.size ?? 'md'
  const name = _p.name
  const className = _p.className ?? ''

  const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}
  const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
}
  const buttLinecapIcons = ['plus', 'minus']
  const s = sizeMap[size]
  const path = strokePaths[name]
  const linecap = (buttLinecapIcons).includes(name) ? 'butt' : 'round'

  if (!path) {
      return null
    }

  const [_s1, _s0] = $(__scope, 's1', 's0')
  const [_s11, _s10, _s9, _s8, _s7, _s6, _s5, _s4, _s3, _s2] = $c(__scope, 's11', 's10', 's9', 's8', 's7', 's6', 's5', 's4', 's3', 's2')

  createEffect(() => {
    if (_s1) {
      { const __v = sizeMap[(_p.size ?? 'md')]; if (__v != null) _s1.setAttribute('width', String(__v)); else _s1.removeAttribute('width') }
      { const __v = sizeMap[(_p.size ?? 'md')]; if (__v != null) _s1.setAttribute('height', String(__v)); else _s1.removeAttribute('height') }
      { const __v = (buttLinecapIcons).includes(_p.name) ? 'butt' : 'round'; if (__v != null) _s1.setAttribute('stroke-linecap', String(__v)); else _s1.removeAttribute('stroke-linecap') }
      { const __v = `shrink-0 ${(_p.className ?? '')}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  createEffect(() => {
    if (_s0) {
      { const __v = strokePaths[_p.name]; if (__v != null) _s0.setAttribute('d', String(__v)); else _s0.removeAttribute('d') }
    }
  })

  if (_s1) applyRestAttrs(_s1, _p, ["name","size","className","xmlns","width","height","viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","aria-hidden"])


  // Reactive child component props
  createEffect(() => {
    const [__GitHubIcon_s11El] = $c(__scope, 's11')
    if (__GitHubIcon_s11El) {
      { const __v = size; if (__v != null) __GitHubIcon_s11El.setAttribute('size', String(__v)); else __GitHubIcon_s11El.removeAttribute('size') }
      { const __v = className; if (__v != null) __GitHubIcon_s11El.setAttribute('class', String(__v)); else __GitHubIcon_s11El.removeAttribute('class') }
    }
    const [__SearchIcon_s10El] = $c(__scope, 's10')
    if (__SearchIcon_s10El) {
      { const __v = size; if (__v != null) __SearchIcon_s10El.setAttribute('size', String(__v)); else __SearchIcon_s10El.removeAttribute('size') }
      { const __v = className; if (__v != null) __SearchIcon_s10El.setAttribute('class', String(__v)); else __SearchIcon_s10El.removeAttribute('class') }
    }
    const [__SettingsIcon_s9El] = $c(__scope, 's9')
    if (__SettingsIcon_s9El) {
      { const __v = size; if (__v != null) __SettingsIcon_s9El.setAttribute('size', String(__v)); else __SettingsIcon_s9El.removeAttribute('size') }
      { const __v = className; if (__v != null) __SettingsIcon_s9El.setAttribute('class', String(__v)); else __SettingsIcon_s9El.removeAttribute('class') }
    }
    const [__GlobeIcon_s8El] = $c(__scope, 's8')
    if (__GlobeIcon_s8El) {
      { const __v = size; if (__v != null) __GlobeIcon_s8El.setAttribute('size', String(__v)); else __GlobeIcon_s8El.removeAttribute('size') }
      { const __v = className; if (__v != null) __GlobeIcon_s8El.setAttribute('class', String(__v)); else __GlobeIcon_s8El.removeAttribute('class') }
    }
    const [__LogOutIcon_s7El] = $c(__scope, 's7')
    if (__LogOutIcon_s7El) {
      { const __v = size; if (__v != null) __LogOutIcon_s7El.setAttribute('size', String(__v)); else __LogOutIcon_s7El.removeAttribute('size') }
      { const __v = className; if (__v != null) __LogOutIcon_s7El.setAttribute('class', String(__v)); else __LogOutIcon_s7El.removeAttribute('class') }
    }
    const [__CircleHelpIcon_s6El] = $c(__scope, 's6')
    if (__CircleHelpIcon_s6El) {
      { const __v = size; if (__v != null) __CircleHelpIcon_s6El.setAttribute('size', String(__v)); else __CircleHelpIcon_s6El.removeAttribute('size') }
      { const __v = className; if (__v != null) __CircleHelpIcon_s6El.setAttribute('class', String(__v)); else __CircleHelpIcon_s6El.removeAttribute('class') }
    }
    const [__CalendarIcon_s5El] = $c(__scope, 's5')
    if (__CalendarIcon_s5El) {
      { const __v = size; if (__v != null) __CalendarIcon_s5El.setAttribute('size', String(__v)); else __CalendarIcon_s5El.removeAttribute('size') }
      { const __v = className; if (__v != null) __CalendarIcon_s5El.setAttribute('class', String(__v)); else __CalendarIcon_s5El.removeAttribute('class') }
    }
    const [__GripVerticalIcon_s4El] = $c(__scope, 's4')
    if (__GripVerticalIcon_s4El) {
      { const __v = size; if (__v != null) __GripVerticalIcon_s4El.setAttribute('size', String(__v)); else __GripVerticalIcon_s4El.removeAttribute('size') }
      { const __v = className; if (__v != null) __GripVerticalIcon_s4El.setAttribute('class', String(__v)); else __GripVerticalIcon_s4El.removeAttribute('class') }
    }
    const [__LoaderCircleIcon_s3El] = $c(__scope, 's3')
    if (__LoaderCircleIcon_s3El) {
      { const __v = size; if (__v != null) __LoaderCircleIcon_s3El.setAttribute('size', String(__v)); else __LoaderCircleIcon_s3El.removeAttribute('size') }
      { const __v = className; if (__v != null) __LoaderCircleIcon_s3El.setAttribute('class', String(__v)); else __LoaderCircleIcon_s3El.removeAttribute('class') }
    }
    const [__PanelLeftIcon_s2El] = $c(__scope, 's2')
    if (__PanelLeftIcon_s2El) {
      { const __v = size; if (__v != null) __PanelLeftIcon_s2El.setAttribute('size', String(__v)); else __PanelLeftIcon_s2El.removeAttribute('size') }
      { const __v = className; if (__v != null) __PanelLeftIcon_s2El.setAttribute('class', String(__v)); else __PanelLeftIcon_s2El.removeAttribute('class') }
    }
  })

  // Initialize child components with props
  initChild('GitHubIcon', _s11, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('SearchIcon', _s10, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('SettingsIcon', _s9, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('GlobeIcon', _s8, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('LogOutIcon', _s7, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('CircleHelpIcon', _s6, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('CalendarIcon', _s5, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('GripVerticalIcon', _s4, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('LoaderCircleIcon', _s3, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
  initChild('PanelLeftIcon', _s2, forwardProps(_p, { get size() { return size }, get className() { return className } }, ["size","className"]))
}

hydrate('Icon', { init: initIcon, template: (_p) => `${_p.name === 'github' ? `${renderChild('GitHubIcon', {size: _p.size, className: _p.className}, undefined, 's11')}` : `${_p.name === 'search' ? `${renderChild('SearchIcon', {size: _p.size, className: _p.className}, undefined, 's10')}` : `${_p.name === 'settings' ? `${renderChild('SettingsIcon', {size: _p.size, className: _p.className}, undefined, 's9')}` : `${_p.name === 'globe' ? `${renderChild('GlobeIcon', {size: _p.size, className: _p.className}, undefined, 's8')}` : `${_p.name === 'log-out' ? `${renderChild('LogOutIcon', {size: _p.size, className: _p.className}, undefined, 's7')}` : `${_p.name === 'circle-help' ? `${renderChild('CircleHelpIcon', {size: _p.size, className: _p.className}, undefined, 's6')}` : `${_p.name === 'calendar' ? `${renderChild('CalendarIcon', {size: _p.size, className: _p.className}, undefined, 's5')}` : `${_p.name === 'grip-vertical' ? `${renderChild('GripVerticalIcon', {size: _p.size, className: _p.className}, undefined, 's4')}` : `${_p.name === 'loader-circle' ? `${renderChild('LoaderCircleIcon', {size: _p.size, className: _p.className}, undefined, 's3')}` : `${_p.name === 'panel-left' ? `${renderChild('PanelLeftIcon', {size: _p.size, className: _p.className}, undefined, 's2')}` : `<svg xmlns="http://www.w3.org/2000/svg" ${((({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size])) != null ? 'width="' + escapeAttr((({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size])) + '"' : ''} ${((({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size])) != null ? 'height="' + escapeAttr((({
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
})[_p.size])) + '"' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ${(undefined) != null ? 'stroke-linecap="' + escapeAttr(undefined) + '"' : ''} stroke-linejoin="round" ${(`shrink-0 ${_p.className}`) != null ? 'class="' + escapeAttr(`shrink-0 ${_p.className}`) + '"' : ''} aria-hidden="true" bf="s1"><path ${((({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})[_p.name])) != null ? 'd="' + escapeAttr((({
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
})[_p.name])) + '"' : ''} bf="s0"></path></svg>`}`}`}`}`}`}`}`}`}`}` })
export function Icon(_p, __bfKey) { return createComponent('Icon', _p, __bfKey) }
var DropdownMenuContext = DropdownMenuContext ?? createContext()

export function initDropdownMenu(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuClasses = 'relative inline-block'


  // Provide context for child components
  provideContext(DropdownMenuContext, {
      open: () => _p.open ?? false,
      onOpenChange: _p.onOpenChange ?? (() => {}),
    })
}

hydrate('DropdownMenu', { init: initDropdownMenu, template: (_p) => `<div data-slot="dropdown-menu" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`${('relative inline-block')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative inline-block')} ${_p.className ?? ''}`) + '"' : ''}>${_p.children}</div>` })
export function DropdownMenu(_p, __bfKey) { return createComponent('DropdownMenu', _p, __bfKey) }
var DropdownMenuContext = DropdownMenuContext ?? createContext()

export function initDropdownMenuTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuTriggerClasses = 'inline-flex items-center disabled:pointer-events-none disabled:opacity-50'
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
    const ctx = useContext(DropdownMenuContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
    })

    el.addEventListener('click', () => {
      ctx.onOpenChange(!ctx.open())
    })

    if (!_p.asChild) warnIfMisusedTrigger(el, 'DropdownMenuTrigger')
  }

  const [_s1, _s0] = $(__scope, 's1', 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      _s0.disabled = !!(_p.disabled ?? false)
      { const __v = `${dropdownMenuTriggerClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s1) (handleMount)(_s1)
  if (_s0) (handleMount)(_s0)
}

hydrate('DropdownMenuTrigger', { init: initDropdownMenuTrigger, template: (_p) => `${_p.asChild ? `<span data-slot="dropdown-menu-trigger" aria-expanded="false" aria-haspopup="menu" style="display:contents" bf="s1">${_p.children}</span>` : `<button data-slot="dropdown-menu-trigger" type="button" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} aria-expanded="false" aria-haspopup="menu" ${_p.disabled ?? false ? 'disabled' : ''} ${(`${('inline-flex items-center disabled:pointer-events-none disabled:opacity-50')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('inline-flex items-center disabled:pointer-events-none disabled:opacity-50')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</button>`}` })
export function DropdownMenuTrigger(_p, __bfKey) { return createComponent('DropdownMenuTrigger', _p, __bfKey) }
var DropdownMenuContext = DropdownMenuContext ?? createContext()
var contentTriggerMap = contentTriggerMap ?? new WeakMap()

export function initDropdownMenuContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuContentBaseClasses = 'fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const dropdownMenuContentOpenClasses = 'opacity-100 scale-100'
  const dropdownMenuContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
  const handleMount = (el) => {
    // Get trigger ref before portal (while still inside DropdownMenu container)
    const triggerEl = findSiblingSlot(el, '[data-slot="dropdown-menu-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DropdownMenuContext)

    // Position content relative to trigger
    // Resolve through display:contents (asChild wraps in a span with display:contents
    // which returns a zero rect from getBoundingClientRect)
    const positionTarget = triggerEl && getComputedStyle(triggerEl).display === 'contents'
      ? (triggerEl.firstElementChild) ?? triggerEl
      : triggerEl
    const updatePosition = () => {
      if (!positionTarget) return
      const rect = positionTarget.getBoundingClientRect()
      el.style.top = `${rect.bottom + 4}px`
      if (_p.align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        el.style.left = `${rect.left}px`
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
      el.className = `${dropdownMenuContentBaseClasses} ${isOpen ? dropdownMenuContentOpenClasses : dropdownMenuContentClosedClasses} ${_p.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Close on click outside (content or trigger)
        const handleClickOutside = (e) => {
          if (!el.contains(e.target) && !triggerEl?.contains(e.target)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC anywhere in the document
        const handleGlobalKeyDown = (e) => {
          if (e.key === 'Escape') {
            // If a submenu is open, let SubContent handle ESC
            const openSub = el.querySelector('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
            if (openSub) return
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll (capture phase for nested scrollable containers) and resize
        const handleScroll = () => updatePosition()

        // Lock body scroll while menu is open
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleGlobalKeyDown)
        window.addEventListener('scroll', handleScroll, true)
        window.addEventListener('resize', handleScroll)

        cleanupFns.push(
          () => { document.body.style.overflow = originalOverflow },
          () => document.removeEventListener('mousedown', handleClickOutside),
          () => document.removeEventListener('keydown', handleGlobalKeyDown),
          () => window.removeEventListener('scroll', handleScroll, true),
          () => window.removeEventListener('resize', handleScroll),
        )
      }
    })

    // Keyboard navigation within content
    el.addEventListener('keydown', (e) => {
      const items = el.querySelectorAll('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])')
      const currentIndex = Array.from(items).findIndex(item => item === document.activeElement)

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (items.length > 0) {
            const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
            ;(items[nextIndex]).focus()
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (items.length > 0) {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
            ;(items[prevIndex]).focus()
          }
          break
        case 'ArrowRight': {
          const focused = document.activeElement
          if (focused?.dataset.subTrigger === 'true') {
            e.preventDefault()
            focused.click()
            setTimeout(() => {
              const subContent = focused.closest('[data-slot="dropdown-menu-sub"]')?.querySelector('[data-slot="dropdown-menu-sub-content"][data-state="open"]')
              const firstItem = subContent?.querySelector('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])')
              firstItem?.focus()
            }, 50)
          }
          break
        }
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement).dataset.slot === 'dropdown-menu-item') {
            ;(document.activeElement).click()
          }
          break
        case 'Home':
          e.preventDefault()
          if (items.length > 0) {
            ;(items[0]).focus()
          }
          break
        case 'End':
          e.preventDefault()
          if (items.length > 0) {
            ;(items[items.length - 1]).focus()
          }
          break
      }
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dropdownMenuContentBaseClasses} ${dropdownMenuContentClosedClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DropdownMenuContent', { init: initDropdownMenuContent, template: (_p) => `<div data-slot="dropdown-menu-content" data-state="closed" role="menu" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(-1) != null ? 'tabindex="' + escapeAttr(-1) + '"' : ''} ${(`${('fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('fixed z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DropdownMenuContent(_p, __bfKey) { return createComponent('DropdownMenuContent', _p, __bfKey) }
var DropdownMenuContext = DropdownMenuContext ?? createContext()
var contentTriggerMap = contentTriggerMap ?? new WeakMap()

export function initDropdownMenuItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuItemBaseClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuItemDestructiveClasses = 'text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive'
  const handleMount = (el) => {
    const ctx = useContext(DropdownMenuContext)

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      _p.onSelect?.()
      ctx.onOpenChange(false)

      // Focus return: use stored trigger ref
      const content = el.closest('[data-slot="dropdown-menu-content"]')
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })
  }
  const isDisabled = createMemo(() => _p.disabled ?? false)
  const isDestructive = createMemo(() => _p.variant === 'destructive')
  const stateClasses = createMemo(() => isDisabled()
    ? dropdownMenuItemDisabledClasses
    : isDestructive()
      ? dropdownMenuItemDestructiveClasses
      : dropdownMenuItemDefaultClasses)

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      if (isDisabled()) _s0.setAttribute('aria-disabled', 'true')
      else _s0.removeAttribute('aria-disabled')
      { const __v = isDisabled() ? -1 : 0; if (__v != null) _s0.setAttribute('tabindex', String(__v)); else _s0.removeAttribute('tabindex') }
      { const __v = `${dropdownMenuItemBaseClasses} ${stateClasses()} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DropdownMenuItem', { init: initDropdownMenuItem, template: (_p) => `<div data-slot="dropdown-menu-item" role="menuitem" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(_p.disabled ?? false) ? 'aria-disabled' : ''} ${((_p.disabled ?? false) ? -1 : 0) != null ? 'tabindex="' + escapeAttr((_p.disabled ?? false) ? -1 : 0) + '"' : ''} ${(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden')} ${((_p.disabled ?? false)
    ? ('pointer-events-none opacity-50')
    : (_p.variant === 'destructive')
      ? ('text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive')
      : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'))} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden')} ${((_p.disabled ?? false)
    ? ('pointer-events-none opacity-50')
    : (_p.variant === 'destructive')
      ? ('text-destructive hover:bg-accent/50 focus:bg-accent focus:text-destructive')
      : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'))} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DropdownMenuItem(_p, __bfKey) { return createComponent('DropdownMenuItem', _p, __bfKey) }
export function initDropdownMenuCheckboxItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
  const handleMount = (el) => {
    createEffect(() => {
      el.setAttribute('aria-checked', String(_p.checked ?? false))
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      _p.onCheckedChange?.(!(_p.checked ?? false))
    })
  }
  const isDisabled = createMemo(() => _p.disabled ?? false)

  const [_s0, _s3] = $(__scope, 's0', 's3')
  const [_s1] = $c(__scope, 's1')

  createEffect(() => {
    if (_s3) {
      { const __v = _p.id; if (__v != null) _s3.setAttribute('id', String(__v)); else _s3.removeAttribute('id') }
      { const __v = String(_p.checked ?? false); if (__v != null) _s3.setAttribute('aria-checked', String(__v)); else _s3.removeAttribute('aria-checked') }
      if (isDisabled()) _s3.setAttribute('aria-disabled', 'true')
      else _s3.removeAttribute('aria-disabled')
      { const __v = isDisabled() ? -1 : 0; if (__v != null) _s3.setAttribute('tabindex', String(__v)); else _s3.removeAttribute('tabindex') }
      { const __v = `${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${_p.className ?? ''}`; if (__v != null) _s3.setAttribute('class', String(__v)); else _s3.removeAttribute('class') }
    }
  })

  insert(__scope, 's0', () => (_p.checked ?? false), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('CheckIcon', {className: "size-4"}, undefined, 's1')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('CheckIcon', __c0, { className: "size-4" })
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s3) (handleMount)(_s3)

  // Initialize child components with props
  initChild('CheckIcon', _s1, { className: "size-4" })
}

hydrate('DropdownMenuCheckboxItem', { init: initDropdownMenuCheckboxItem, template: (_p) => `<div data-slot="dropdown-menu-item" role="menuitemcheckbox" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(String(_p.checked ?? false)) != null ? 'aria-checked="' + escapeAttr(String(_p.checked ?? false)) + '"' : ''} ${(_p.disabled ?? false) ? 'aria-disabled' : ''} ${((_p.disabled ?? false) ? -1 : 0) != null ? 'tabindex="' + escapeAttr((_p.disabled ?? false) ? -1 : 0) + '"' : ''} ${(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) + '"' : ''} bf="s3"><span ${(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) != null ? 'class="' + escapeAttr(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) + '"' : ''} bf="s2">${(_p.checked ?? false) ? `<!--bf-cond-start:s0-->${renderChild('CheckIcon', {className: "size-4"}, undefined, 's1')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}</span>${_p.children}</div>` })
export function DropdownMenuCheckboxItem(_p, __bfKey) { return createComponent('DropdownMenuCheckboxItem', _p, __bfKey) }
var DropdownMenuRadioGroupContext = DropdownMenuRadioGroupContext ?? createContext()

export function initDropdownMenuRadioGroup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')


  // Provide context for child components
  provideContext(DropdownMenuRadioGroupContext, {
      value: () => _p.value ?? '',
      onValueChange: _p.onValueChange ?? (() => {}),
    })
}

hydrate('DropdownMenuRadioGroup', { init: initDropdownMenuRadioGroup, template: (_p) => `<div data-slot="dropdown-menu-radio-group" role="group" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(_p.className ?? '') != null ? 'class="' + escapeAttr(_p.className ?? '') + '"' : ''}>${_p.children}</div>` })
export function DropdownMenuRadioGroup(_p, __bfKey) { return createComponent('DropdownMenuRadioGroup', _p, __bfKey) }
var DropdownMenuRadioGroupContext = DropdownMenuRadioGroupContext ?? createContext()

export function initDropdownMenuRadioItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuCheckableItemClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
  const handleMount = (el) => {
    const radioCtx = useContext(DropdownMenuRadioGroupContext)

    createEffect(() => {
      el.setAttribute('aria-checked', String(radioCtx.value() === _p.value))
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      radioCtx.onValueChange(_p.value)
    })
  }
  const isDisabled = createMemo(() => _p.disabled ?? false)

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      if (isDisabled()) _s0.setAttribute('aria-disabled', 'true')
      else _s0.removeAttribute('aria-disabled')
      { const __v = isDisabled() ? -1 : 0; if (__v != null) _s0.setAttribute('tabindex', String(__v)); else _s0.removeAttribute('tabindex') }
      { const __v = `${dropdownMenuCheckableItemClasses} ${isDisabled() ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DropdownMenuRadioItem', { init: initDropdownMenuRadioItem, template: (_p) => `<div data-slot="dropdown-menu-item" role="menuitemradio" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} aria-checked="false" ${(_p.disabled ?? false) ? 'aria-disabled' : ''} ${((_p.disabled ?? false) ? -1 : 0) != null ? 'tabindex="' + escapeAttr((_p.disabled ?? false) ? -1 : 0) + '"' : ''} ${(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) + '"' : ''} bf="s0"><span ${(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) != null ? 'class="' + escapeAttr(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) + '"' : ''} data-slot="dropdown-menu-radio-indicator"></span>${_p.children}</div>` })
export function DropdownMenuRadioItem(_p, __bfKey) { return createComponent('DropdownMenuRadioItem', _p, __bfKey) }
var DropdownMenuSubContext = DropdownMenuSubContext ?? createContext()

export function initDropdownMenuSub(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [subOpen, setSubOpen] = createSignal(false)


  // Provide context for child components
  provideContext(DropdownMenuSubContext, {
      subOpen,
      onSubOpenChange: setSubOpen,
    })
}

hydrate('DropdownMenuSub', { init: initDropdownMenuSub, template: (_p) => `<div data-slot="dropdown-menu-sub" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`relative ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`relative ${_p.className ?? ''}`) + '"' : ''}>${_p.children}</div>` })
export function DropdownMenuSub(_p, __bfKey) { return createComponent('DropdownMenuSub', _p, __bfKey) }
var DropdownMenuSubContext = DropdownMenuSubContext ?? createContext()

export function initDropdownMenuSubTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const dropdownMenuItemDisabledClasses = 'pointer-events-none opacity-50'
  const dropdownMenuSubTriggerClasses = 'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden'
  const handleMount = (el) => {
    const subCtx = useContext(DropdownMenuSubContext)
    let hoverTimer = null

    createEffect(() => {
      el.setAttribute('aria-expanded', String(subCtx.subOpen()))
    })

    el.addEventListener('mouseenter', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      hoverTimer = setTimeout(() => subCtx.onSubOpenChange(true), 100)
    })

    el.addEventListener('mouseleave', (e) => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
      // Don't close if moving to subcontent
      const related = e.relatedTarget
      const subContent = el.closest('[data-slot="dropdown-menu-sub"]')?.querySelector('[data-slot="dropdown-menu-sub-content"]')
      if (subContent?.contains(related)) return
      subCtx.onSubOpenChange(false)
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      subCtx.onSubOpenChange(!subCtx.subOpen())
    })
  }
  const isDisabled = _p.disabled ?? false

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  createEffect(() => {
    if (_s1) {
      { const __v = _p.id; if (__v != null) _s1.setAttribute('id', String(__v)); else _s1.removeAttribute('id') }
      { const __v = `${dropdownMenuSubTriggerClasses} ${isDisabled ? dropdownMenuItemDisabledClasses : dropdownMenuItemDefaultClasses} ${_p.className ?? ''}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  if (_s1) (handleMount)(_s1)

  // Initialize child components with props
  initChild('ChevronRightIcon', _s0, { className: "ml-auto size-4" })
}

hydrate('DropdownMenuSubTrigger', { init: initDropdownMenuSubTrigger, template: (_p) => `<div data-slot="dropdown-menu-item" data-sub-trigger="true" role="menuitem" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} aria-haspopup="menu" aria-expanded="false" ${(_p.disabled ?? false) ? 'aria-disabled' : ''} ${((_p.disabled ?? false) ? -1 : 0) != null ? 'tabindex="' + escapeAttr((_p.disabled ?? false) ? -1 : 0) + '"' : ''} ${(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden')} ${(_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground')} ${_p.className ?? ''}`) + '"' : ''} bf="s1">${_p.children}${renderChild('ChevronRightIcon', {className: "ml-auto size-4"}, undefined, 's0')}</div>` })
export function DropdownMenuSubTrigger(_p, __bfKey) { return createComponent('DropdownMenuSubTrigger', _p, __bfKey) }
var DropdownMenuSubContext = DropdownMenuSubContext ?? createContext()

export function initDropdownMenuSubContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const dropdownMenuSubContentBaseClasses = 'absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md'
  const handleMount = (el) => {
    const subCtx = useContext(DropdownMenuSubContext)

    createEffect(() => {
      const isOpen = subCtx.subOpen()
      el.dataset.state = isOpen ? 'open' : 'closed'
      if (isOpen) {
        el.style.display = ''
      } else {
        el.style.display = 'none'
      }
    })

    // Close submenu on mouseleave (if not moving to trigger)
    el.addEventListener('mouseleave', (e) => {
      const related = e.relatedTarget
      const sub = el.closest('[data-slot="dropdown-menu-sub"]')
      const trigger = sub?.querySelector('[data-sub-trigger="true"]')
      if (trigger?.contains(related)) return
      subCtx.onSubOpenChange(false)
    })

    // Keyboard navigation within subcontent
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        subCtx.onSubOpenChange(false)
        // Focus back to sub trigger
        const sub = el.closest('[data-slot="dropdown-menu-sub"]')
        const trigger = sub?.querySelector('[data-sub-trigger="true"]')
        trigger?.focus()
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const items = el.querySelectorAll('[data-slot="dropdown-menu-item"]:not([aria-disabled="true"])')
        const currentIndex = Array.from(items).findIndex(item => item === document.activeElement)
        if (e.key === 'ArrowDown') {
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
          ;(items[nextIndex]).focus()
        } else {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
          ;(items[prevIndex]).focus()
        }
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        if (document.activeElement && (document.activeElement).dataset.slot === 'dropdown-menu-item') {
          ;(document.activeElement).click()
        }
      }
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${dropdownMenuSubContentBaseClasses} left-full top-0 ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('DropdownMenuSubContent', { init: initDropdownMenuSubContent, template: (_p) => `<div data-slot="dropdown-menu-sub-content" data-state="closed" role="menu" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(-1) != null ? 'tabindex="' + escapeAttr(-1) + '"' : ''} style="display:none" ${(`${('absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md')} left-full top-0 ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('absolute z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md')} left-full top-0 ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DropdownMenuSubContent(_p, __bfKey) { return createComponent('DropdownMenuSubContent', _p, __bfKey) }
export function initDropdownMenuLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const dropdownMenuLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${dropdownMenuLabelClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["children","className","data-slot"])

}

hydrate('DropdownMenuLabel', { init: initDropdownMenuLabel, template: (_p) => `<div data-slot="dropdown-menu-label" ${(`${('px-2 py-1.5 text-sm font-semibold text-foreground')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('px-2 py-1.5 text-sm font-semibold text-foreground')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DropdownMenuLabel(_p, __bfKey) { return createComponent('DropdownMenuLabel', _p, __bfKey) }
export function initDropdownMenuSeparator(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''

  const dropdownMenuSeparatorClasses = '-mx-1 my-1 h-px bg-border'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${dropdownMenuSeparatorClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","data-slot","role"])

}

hydrate('DropdownMenuSeparator', { init: initDropdownMenuSeparator, template: (_p) => `<div data-slot="dropdown-menu-separator" role="separator" ${(`${('-mx-1 my-1 h-px bg-border')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('-mx-1 my-1 h-px bg-border')} ${_p.className}`) + '"' : ''} bf="s0"></div>` })
export function DropdownMenuSeparator(_p, __bfKey) { return createComponent('DropdownMenuSeparator', _p, __bfKey) }
export function initDropdownMenuShortcut(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const dropdownMenuShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${dropdownMenuShortcutClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["children","className","data-slot"])

}

hydrate('DropdownMenuShortcut', { init: initDropdownMenuShortcut, template: (_p) => `<span data-slot="dropdown-menu-shortcut" ${(`${('ml-auto text-xs tracking-widest text-muted-foreground')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('ml-auto text-xs tracking-widest text-muted-foreground')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</span>` })
export function DropdownMenuShortcut(_p, __bfKey) { return createComponent('DropdownMenuShortcut', _p, __bfKey) }
export function initDropdownMenuGroup(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = (_p.className ?? ''); if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["children","className","data-slot","role"])

}

hydrate('DropdownMenuGroup', { init: initDropdownMenuGroup, template: (_p) => `<div data-slot="dropdown-menu-group" role="group" ${(_p.className) != null ? 'class="' + escapeAttr(_p.className) + '"' : ''} bf="s0">${_p.children}</div>` })
export function DropdownMenuGroup(_p, __bfKey) { return createComponent('DropdownMenuGroup', _p, __bfKey) }
export function initDropdownMenuBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)

  const [_s8, _s0, _s7, _s1, _s2, _s3, _s4, _s5, _s6] = $c(__scope, 's8', 's0', 's7', 's1', 's2', 's3', 's4', 's5', 's6')


  // Reactive prop bindings
  createEffect(() => {
    if (_s8) {
      _s8.open = !!(open())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__DropdownMenu_s8El] = $c(__scope, 's8')
    if (__DropdownMenu_s8El) {
      __DropdownMenu_s8El.open = !!(open())
    }
  })

  // Initialize child components with props
  initChild('DropdownMenu', _s8, { get open() { return open() }, onOpenChange: setOpen })
  initChild('DropdownMenuTrigger', _s0, {})
  initChild('DropdownMenuContent', _s7, {})
  initChild('DropdownMenuLabel', _s1, {})
  initChild('DropdownMenuSeparator', _s2, {})
  initChild('DropdownMenuItem', _s3, {})
  initChild('DropdownMenuItem', _s4, {})
  initChild('DropdownMenuSeparator', _s5, {})
  initChild('DropdownMenuItem', _s6, { variant: "destructive" })
}

hydrate('DropdownMenuBasicDemo', { init: initDropdownMenuBasicDemo, template: (_p) => `${renderChild('DropdownMenu', {open: (false), children: `${renderChild('DropdownMenuTrigger', {children: `<span class="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"> Open Menu </span>`}, undefined, 's0')}${renderChild('DropdownMenuContent', {children: `${renderChild('DropdownMenuLabel', {children: `Actions`}, undefined, 's1')}${renderChild('DropdownMenuSeparator', {}, undefined, 's2')}${renderChild('DropdownMenuItem', {children: `<span>Copy</span>`}, undefined, 's3')}${renderChild('DropdownMenuItem', {children: `<span>Paste</span>`}, undefined, 's4')}${renderChild('DropdownMenuSeparator', {}, undefined, 's5')}${renderChild('DropdownMenuItem', {variant: "destructive", children: `<span>Delete</span>`}, undefined, 's6')}`}, undefined, 's7')}`}, undefined, 's8')}`, comment: true })
export function DropdownMenuBasicDemo(_p, __bfKey) { return createComponent('DropdownMenuBasicDemo', _p, __bfKey) }
export function initDropdownMenuCheckboxDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const [showStatus, setShowStatus] = createSignal(true)
  const [showActivity, setShowActivity] = createSignal(false)

  const [_s6, _s3, _s4, _s0, _s5, _s1, _s2] = $c(__scope, 's6', 's3', 's4', 's0', 's5', 's1', 's2')


  // Reactive prop bindings
  createEffect(() => {
    if (_s6) {
      _s6.open = !!(open())
    }
    if (_s3) {
      _s3.checked = !!(showStatus())
    }
    if (_s4) {
      _s4.checked = !!(showActivity())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__DropdownMenu_s6El] = $c(__scope, 's6')
    if (__DropdownMenu_s6El) {
      __DropdownMenu_s6El.open = !!(open())
    }
    const [__DropdownMenuCheckboxItem_s3El] = $c(__scope, 's3')
    if (__DropdownMenuCheckboxItem_s3El) {
      __DropdownMenuCheckboxItem_s3El.checked = !!(showStatus())
    }
    const [__DropdownMenuCheckboxItem_s4El] = $c(__scope, 's4')
    if (__DropdownMenuCheckboxItem_s4El) {
      __DropdownMenuCheckboxItem_s4El.checked = !!(showActivity())
    }
  })

  // Initialize child components with props
  initChild('DropdownMenu', _s6, { get open() { return open() }, onOpenChange: setOpen })
  initChild('DropdownMenuTrigger', _s0, {})
  initChild('DropdownMenuContent', _s5, {})
  initChild('DropdownMenuLabel', _s1, {})
  initChild('DropdownMenuSeparator', _s2, {})
  initChild('DropdownMenuCheckboxItem', _s3, { get checked() { return showStatus() }, onCheckedChange: setShowStatus })
  initChild('DropdownMenuCheckboxItem', _s4, { get checked() { return showActivity() }, onCheckedChange: setShowActivity })
}

hydrate('DropdownMenuCheckboxDemo', { init: initDropdownMenuCheckboxDemo, template: (_p) => `${renderChild('DropdownMenu', {open: (false), children: `${renderChild('DropdownMenuTrigger', {children: `<span class="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"> View </span>`}, undefined, 's0')}${renderChild('DropdownMenuContent', {children: `${renderChild('DropdownMenuLabel', {children: `Toggle Panels`}, undefined, 's1')}${renderChild('DropdownMenuSeparator', {}, undefined, 's2')}${renderChild('DropdownMenuCheckboxItem', {checked: (true), children: `<span>Status Bar</span>`}, undefined, 's3')}${renderChild('DropdownMenuCheckboxItem', {checked: (false), children: `<span>Activity Panel</span>`}, undefined, 's4')}`}, undefined, 's5')}`}, undefined, 's6')}`, comment: true })
export function DropdownMenuCheckboxDemo(_p, __bfKey) { return createComponent('DropdownMenuCheckboxDemo', _p, __bfKey) }
export function initDropdownMenuProfileDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const [showBookmarks, setShowBookmarks] = createSignal(true)
  const [showToolbar, setShowToolbar] = createSignal(false)
  const [language, setLanguage] = createSignal('en')

  const [_s25, _s11, _s18, _s19, _s0, _s24, _s1, _s2, _s16, _s5, _s3, _s4, _s13, _s7, _s6, _s12, _s8, _s9, _s10, _s15, _s14, _s17, _s20, _s21, _s23, _s22] = $c(__scope, 's25', 's11', 's18', 's19', 's0', 's24', 's1', 's2', 's16', 's5', 's3', 's4', 's13', 's7', 's6', 's12', 's8', 's9', 's10', 's15', 's14', 's17', 's20', 's21', 's23', 's22')


  // Reactive prop bindings
  createEffect(() => {
    if (_s25) {
      _s25.open = !!(open())
    }
    if (_s11) {
      const __val = String(language())
      if (_s11.value !== __val) _s11.value = __val
    }
    if (_s18) {
      _s18.checked = !!(showBookmarks())
    }
    if (_s19) {
      _s19.checked = !!(showToolbar())
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__DropdownMenu_s25El] = $c(__scope, 's25')
    if (__DropdownMenu_s25El) {
      __DropdownMenu_s25El.open = !!(open())
    }
    const [__DropdownMenuRadioGroup_s11El] = $c(__scope, 's11')
    if (__DropdownMenuRadioGroup_s11El) {
      const __val = String(language())
      if (__DropdownMenuRadioGroup_s11El.value !== __val) __DropdownMenuRadioGroup_s11El.value = __val
    }
    const [__DropdownMenuCheckboxItem_s18El] = $c(__scope, 's18')
    if (__DropdownMenuCheckboxItem_s18El) {
      __DropdownMenuCheckboxItem_s18El.checked = !!(showBookmarks())
    }
    const [__DropdownMenuCheckboxItem_s19El] = $c(__scope, 's19')
    if (__DropdownMenuCheckboxItem_s19El) {
      __DropdownMenuCheckboxItem_s19El.checked = !!(showToolbar())
    }
  })

  // Initialize child components with props
  initChild('DropdownMenu', _s25, { get open() { return open() }, onOpenChange: setOpen })
  initChild('DropdownMenuTrigger', _s0, { className: "rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" })
  initChild('DropdownMenuContent', _s24, { align: "end" })
  initChild('DropdownMenuLabel', _s1, {})
  initChild('DropdownMenuSeparator', _s2, {})
  initChild('DropdownMenuGroup', _s16, {})
  initChild('DropdownMenuItem', _s5, {})
  initChild('SettingsIcon', _s3, { size: "sm" })
  initChild('DropdownMenuShortcut', _s4, {})
  initChild('DropdownMenuSub', _s13, {})
  initChild('DropdownMenuSubTrigger', _s7, {})
  initChild('GlobeIcon', _s6, { size: "sm" })
  initChild('DropdownMenuSubContent', _s12, {})
  initChild('DropdownMenuRadioGroup', _s11, { get value() { return language() }, onValueChange: setLanguage })
  initChild('DropdownMenuRadioItem', _s8, { value: "en" })
  initChild('DropdownMenuRadioItem', _s9, { value: "ja" })
  initChild('DropdownMenuRadioItem', _s10, { value: "fr" })
  initChild('DropdownMenuItem', _s15, {})
  initChild('CircleHelpIcon', _s14, { size: "sm" })
  initChild('DropdownMenuSeparator', _s17, {})
  initChild('DropdownMenuGroup', _s20, {})
  initChild('DropdownMenuCheckboxItem', _s18, { get checked() { return showBookmarks() }, onCheckedChange: setShowBookmarks })
  initChild('DropdownMenuCheckboxItem', _s19, { get checked() { return showToolbar() }, onCheckedChange: setShowToolbar })
  initChild('DropdownMenuSeparator', _s21, {})
  initChild('DropdownMenuItem', _s23, { variant: "destructive" })
  initChild('LogOutIcon', _s22, { size: "sm" })
}

hydrate('DropdownMenuProfileDemo', { init: initDropdownMenuProfileDemo, template: (_p) => `${renderChild('DropdownMenu', {open: (false), children: `${renderChild('DropdownMenuTrigger', {className: "rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", children: `<span class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium" aria-label="Profile menu"> KK </span>`}, undefined, 's0')}${renderChild('DropdownMenuContent', {align: "end", children: `${renderChild('DropdownMenuLabel', {children: `My Account`}, undefined, 's1')}${renderChild('DropdownMenuSeparator', {}, undefined, 's2')}${renderChild('DropdownMenuGroup', {children: `${renderChild('DropdownMenuItem', {children: `${renderChild('SettingsIcon', {size: "sm"}, undefined, 's3')}<span>Settings</span>${renderChild('DropdownMenuShortcut', {children: `⇧⌘,`}, undefined, 's4')}`}, undefined, 's5')}${renderChild('DropdownMenuSub', {children: `${renderChild('DropdownMenuSubTrigger', {children: `${renderChild('GlobeIcon', {size: "sm"}, undefined, 's6')}<span>Language</span>`}, undefined, 's7')}${renderChild('DropdownMenuSubContent', {children: `${renderChild('DropdownMenuRadioGroup', {value: ('en'), children: `${renderChild('DropdownMenuRadioItem', {value: "en", children: `<span>English</span>`}, undefined, 's8')}${renderChild('DropdownMenuRadioItem', {value: "ja", children: `<span>Japanese</span>`}, undefined, 's9')}${renderChild('DropdownMenuRadioItem', {value: "fr", children: `<span>French</span>`}, undefined, 's10')}`}, undefined, 's11')}`}, undefined, 's12')}`}, undefined, 's13')}${renderChild('DropdownMenuItem', {children: `${renderChild('CircleHelpIcon', {size: "sm"}, undefined, 's14')}<span>Help</span>`}, undefined, 's15')}`}, undefined, 's16')}${renderChild('DropdownMenuSeparator', {}, undefined, 's17')}${renderChild('DropdownMenuGroup', {children: `${renderChild('DropdownMenuCheckboxItem', {checked: (true), children: `<span>Show Bookmarks Bar</span>`}, undefined, 's18')}${renderChild('DropdownMenuCheckboxItem', {checked: (false), children: `<span>Show Toolbar</span>`}, undefined, 's19')}`}, undefined, 's20')}${renderChild('DropdownMenuSeparator', {}, undefined, 's21')}${renderChild('DropdownMenuItem', {variant: "destructive", children: `${renderChild('LogOutIcon', {size: "sm"}, undefined, 's22')}<span>Log out</span>`}, undefined, 's23')}`}, undefined, 's24')}`}, undefined, 's25')}`, comment: true })
export function DropdownMenuProfileDemo(_p, __bfKey) { return createComponent('DropdownMenuProfileDemo', _p, __bfKey) }
