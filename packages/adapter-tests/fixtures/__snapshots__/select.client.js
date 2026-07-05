import { $, $c, $t, __bfText, applyRestAttrs, createComponent, createContext, createEffect, createMemo, createPortal, createSignal, escapeAttr, escapeText, findSiblingSlot, forwardProps, hydrate, initChild, isSSRPortal, provideContext, renderChild, spreadAttrs, useContext } from '@barefootjs/client/runtime'

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
})[_p.size])) + '"' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ${(linecap) != null ? 'stroke-linecap="' + escapeAttr(linecap) + '"' : ''} stroke-linejoin="round" ${(`shrink-0 ${_p.className}`) != null ? 'class="' + escapeAttr(`shrink-0 ${_p.className}`) + '"' : ''} aria-hidden="true" bf="s1"><path ${((({
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
var SelectContext = SelectContext ?? createContext()

export function initSelect(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const [internalValue, setInternalValue] = createSignal(_p.value ?? '')
  createEffect(() => {
    const __val = _p.value
    if (__val !== undefined) setInternalValue(__val)
  })
  const isControlled = createMemo(() => _p.value !== undefined)


  // Provide context for child components
  provideContext(SelectContext, {
      open,
      onOpenChange: (v) => { setOpen(v); _p.onOpenChange?.(v) },
      value: () => isControlled() ? (_p.value ?? '') : internalValue(),
      onValueChange: (v) => {
        if (!isControlled()) setInternalValue(v)
        if (_p.onValueChange) _p.onValueChange(v)
      },
      disabled: () => _p.disabled ?? false,
    })
}

hydrate('Select', { init: initSelect, template: (_p) => `<div data-slot="select" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(`relative inline-block ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`relative inline-block ${_p.className ?? ''}`) + '"' : ''}>${_p.children}</div>` })
export function Select(_p, __bfKey) { return createComponent('Select', _p, __bfKey) }
var SelectContext = SelectContext ?? createContext()

export function initSelectTrigger(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const selectTriggerBaseClasses = 'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none'
  const selectTriggerFocusClasses = 'focus:border-ring focus:ring-ring/50 focus:ring-[3px]'
  const selectTriggerDisabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50'
  const selectTriggerDataStateClasses = 'data-[placeholder]:text-muted-foreground'
  const handleMount = (el) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.open()))
      el.dataset.state = ctx.open() ? 'open' : 'closed'
    })

    el.addEventListener('click', () => {
      if (ctx.disabled()) return
      ctx.onOpenChange(!ctx.open())
    })

    // Allow keyboard open/close
    el.addEventListener('keydown', (e) => {
      if (ctx.disabled()) return
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!ctx.open()) {
          ctx.onOpenChange(true)
        }
      }
    })
  }

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  createEffect(() => {
    if (_s1) {
      { const __v = _p.id; if (__v != null) _s1.setAttribute('id', String(__v)); else _s1.removeAttribute('id') }
      { const __v = `flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground ${_p.className ?? ''}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  if (_s1) (handleMount)(_s1)

  // Initialize child components with props
  initChild('ChevronDownIcon', _s0, { className: "size-4 opacity-50" })
}

hydrate('SelectTrigger', { init: initSelectTrigger, template: (_p) => `<button data-slot="select-trigger" type="button" role="combobox" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="none" data-state="closed" ${(`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground ${_p.className ?? ''}`) + '"' : ''} bf="s1">${_p.children}${renderChild('ChevronDownIcon', {className: "size-4 opacity-50"}, undefined, 's0')}</button>` })
export function SelectTrigger(_p, __bfKey) { return createComponent('SelectTrigger', _p, __bfKey) }
var SelectContext = SelectContext ?? createContext()

export function initSelectValue(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const handleMount = (el) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      const val = ctx.value()
      if (val) {
        // Query the portaled content for the matching item's label
        const itemEl = document.querySelector(`[data-slot="select-item"][data-value="${val}"]`)
        const label = itemEl?.textContent ?? val
        el.textContent = label
        // Remove placeholder attribute when value is selected
        const trigger = el.closest('[data-slot="select-trigger"]')
        trigger?.removeAttribute('data-placeholder')
      } else {
        el.textContent = _p.placeholder ?? ''
        // Set placeholder attribute for styling
        const trigger = el.closest('[data-slot="select-trigger"]')
        if (_p.placeholder) {
          trigger?.setAttribute('data-placeholder', '')
        }
      }
    })
  }

  const [_s1] = $(__scope, 's1')
  const [_s0] = $t(__scope, 's0')

  let __anchor_s0 = _s0
  createEffect(() => {
    const __val = _p.placeholder ?? ''
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })

  createEffect(() => {
    if (_s1) {
      { const __v = _p.id; if (__v != null) _s1.setAttribute('id', String(__v)); else _s1.removeAttribute('id') }
    }
  })

  if (_s1) (handleMount)(_s1)
}

hydrate('SelectValue', { init: initSelectValue, template: (_p) => `<span data-slot="select-value" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} class="pointer-events-none truncate" bf="s1"><!--bf:s0-->${escapeText(_p.placeholder ?? '')}<!--/--></span>` })
export function SelectValue(_p, __bfKey) { return createComponent('SelectValue', _p, __bfKey) }
var SelectContext = SelectContext ?? createContext()
var contentTriggerMap = contentTriggerMap ?? new WeakMap()

export function initSelectContent(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const selectContentBaseClasses = 'fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out'
  const selectContentOpenClasses = 'opacity-100 scale-100'
  const selectContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'
  const handleMount = (el) => {
    // Get trigger ref before portal
    const triggerEl = findSiblingSlot(el, '[data-slot="select-trigger"]')
    if (triggerEl) contentTriggerMap.set(el, triggerEl)

    // Portal to body to escape overflow clipping.
    // Deferred via microtask so that sibling initChild calls (e.g., SelectItem)
    // can find their elements via querySelector before they leave the DOM subtree.
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      queueMicrotask(() => createPortal(el, document.body, { ownerScope }))
    }

    const ctx = useContext(SelectContext)

    // Position content relative to trigger, clamped to viewport
    const updatePosition = () => {
      if (!triggerEl) return
      const rect = triggerEl.getBoundingClientRect()
      const gap = 4
      const top = rect.bottom + gap
      const availableHeight = window.innerHeight - top - gap
      el.style.top = `${top}px`
      el.style.setProperty('--radix-select-content-available-height', `${availableHeight}px`)
      // At least as wide as trigger, but can expand for longer items
      el.style.minWidth = `${rect.width}px`
      if (_p.align === 'end') {
        el.style.left = `${rect.right - el.offsetWidth}px`
      } else {
        el.style.left = `${rect.left}px`
      }
    }

    // Type-ahead search state
    let typeAheadQuery = ''
    let typeAheadTimer = null

    // Track cleanup functions for global listeners
    let cleanupFns = []

    // Reactive show/hide + positioning + global listeners
    createEffect(() => {
      // Clean up previous listeners
      for (const fn of cleanupFns) fn()
      cleanupFns = []

      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${selectContentBaseClasses} ${isOpen ? selectContentOpenClasses : selectContentClosedClasses} ${_p.className ?? ''}`

      if (isOpen) {
        updatePosition()

        // Focus the currently selected item or first item
        setTimeout(() => {
          const selectedItem = el.querySelector(`[data-slot="select-item"][data-state="checked"]`)
          const firstItem = el.querySelector('[data-slot="select-item"]:not([aria-disabled="true"])')
          ;(selectedItem ?? firstItem)?.focus()
        }, 0)

        // Close on click outside
        const handleClickOutside = (e) => {
          if (!el.contains(e.target) && !triggerEl?.contains(e.target)) {
            ctx.onOpenChange(false)
          }
        }

        // Close on ESC
        const handleGlobalKeyDown = (e) => {
          if (e.key === 'Escape') {
            ctx.onOpenChange(false)
            triggerEl?.focus()
          }
        }

        // Reposition on scroll and resize
        const handleScroll = () => updatePosition()

        // Lock body scroll while open
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
      const items = el.querySelectorAll('[data-slot="select-item"]:not([aria-disabled="true"])')
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
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (document.activeElement && (document.activeElement).dataset.slot === 'select-item') {
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
        default:
          // Type-ahead search
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            typeAheadQuery += e.key.toLowerCase()
            if (typeAheadTimer) clearTimeout(typeAheadTimer)
            typeAheadTimer = setTimeout(() => { typeAheadQuery = '' }, 500)

            const match = Array.from(items).find(item => {
              const text = (item).textContent?.toLowerCase() ?? ''
              return text.startsWith(typeAheadQuery)
            })
            match?.focus()
          }
          break
      }
    })
  }

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = _p.id; if (__v != null) _s0.setAttribute('id', String(__v)); else _s0.removeAttribute('id') }
      { const __v = `${selectContentBaseClasses} ${selectContentClosedClasses} ${_p.className ?? ''}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) (handleMount)(_s0)
}

hydrate('SelectContent', { init: initSelectContent, template: (_p) => `<div data-slot="select-content" data-state="closed" role="listbox" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(-1) != null ? 'tabindex="' + escapeAttr(-1) + '"' : ''} ${(`${('fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('fixed z-50 max-h-[min(var(--radix-select-content-available-height,384px),384px)] min-w-[8rem] overflow-y-auto rounded-md border bg-popover p-1 shadow-md transform-gpu origin-top transition-[opacity,transform] duration-normal ease-out')} ${('opacity-0 scale-95 pointer-events-none')} ${_p.className ?? ''}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function SelectContent(_p, __bfKey) { return createComponent('SelectContent', _p, __bfKey) }
var SelectContext = SelectContext ?? createContext()
var contentTriggerMap = contentTriggerMap ?? new WeakMap()

export function initSelectItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const selectItemBaseClasses = 'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden'
  const selectItemDefaultClasses = 'text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'
  const selectItemDisabledClasses = 'pointer-events-none opacity-50'
  const handleMount = (el) => {
    const ctx = useContext(SelectContext)

    createEffect(() => {
      const isSelected = ctx.value() === _p.value
      el.setAttribute('aria-selected', String(isSelected))
      el.dataset.state = isSelected ? 'checked' : 'unchecked'

      // Update check indicator visibility
      const indicator = el.querySelector('[data-slot="select-item-indicator"]')
      if (indicator) {
        indicator.style.display = isSelected ? '' : 'none'
      }
    })

    el.addEventListener('click', () => {
      if (el.getAttribute('aria-disabled') === 'true') return
      ctx.onValueChange(_p.value)
      ctx.onOpenChange(false)

      // Focus return to trigger
      const content = el.closest('[data-slot="select-content"]')
      const trigger = content ? contentTriggerMap.get(content) : null
      setTimeout(() => trigger?.focus(), 0)
    })
  }
  const isDisabled = createMemo(() => _p.disabled ?? false)
  const stateClasses = createMemo(() => isDisabled() ? selectItemDisabledClasses : selectItemDefaultClasses)

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  createEffect(() => {
    if (_s1) {
      { const __v = _p.value; if (__v != null) _s1.setAttribute('data-value', String(__v)); else _s1.removeAttribute('data-value') }
      { const __v = _p.id; if (__v != null) _s1.setAttribute('id', String(__v)); else _s1.removeAttribute('id') }
      if (isDisabled()) _s1.setAttribute('aria-disabled', 'true')
      else _s1.removeAttribute('aria-disabled')
      { const __v = isDisabled() ? -1 : 0; if (__v != null) _s1.setAttribute('tabindex', String(__v)); else _s1.removeAttribute('tabindex') }
      { const __v = `${selectItemBaseClasses} ${stateClasses()} ${_p.className ?? ''}`; if (__v != null) _s1.setAttribute('class', String(__v)); else _s1.removeAttribute('class') }
    }
  })

  if (_s1) (handleMount)(_s1)

  // Initialize child components with props
  initChild('CheckIcon', _s0, { className: "size-4" })
}

hydrate('SelectItem', { init: initSelectItem, template: (_p) => `<div data-slot="select-item" ${(_p.value) != null ? 'data-value="' + escapeAttr(_p.value) + '"' : ''} data-state="unchecked" role="option" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} aria-selected="false" ${(_p.disabled ?? false) ? 'aria-disabled' : ''} ${((_p.disabled ?? false) ? -1 : 0) != null ? 'tabindex="' + escapeAttr((_p.disabled ?? false) ? -1 : 0) + '"' : ''} ${(`${('relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${((_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'))} ${_p.className ?? ''}`) != null ? 'class="' + escapeAttr(`${('relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden')} ${((_p.disabled ?? false) ? ('pointer-events-none opacity-50') : ('text-popover-foreground hover:bg-accent/50 focus:bg-accent focus:text-accent-foreground'))} ${_p.className ?? ''}`) + '"' : ''} bf="s1"><span data-slot="select-item-indicator" ${(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) != null ? 'class="' + escapeAttr(`absolute left-2 flex size-3.5 shrink-0 items-center justify-center`) + '"' : ''} style="display:none">${renderChild('CheckIcon', {className: "size-4"}, undefined, 's0')}</span>${_p.children}</div>` })
export function SelectItem(_p, __bfKey) { return createComponent('SelectItem', _p, __bfKey) }
export function initSelectGroup(__scope, _p = {}) {
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

hydrate('SelectGroup', { init: initSelectGroup, template: (_p) => `<div data-slot="select-group" role="group" ${(_p.className) != null ? 'class="' + escapeAttr(_p.className) + '"' : ''} bf="s0">${_p.children}</div>` })
export function SelectGroup(_p, __bfKey) { return createComponent('SelectGroup', _p, __bfKey) }
export function initSelectLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''
  const children = _p.children

  const selectLabelClasses = 'px-2 py-1.5 text-sm font-semibold text-foreground'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${selectLabelClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["children","className","data-slot"])

}

hydrate('SelectLabel', { init: initSelectLabel, template: (_p) => `<div data-slot="select-label" ${(`${('px-2 py-1.5 text-sm font-semibold text-foreground')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('px-2 py-1.5 text-sm font-semibold text-foreground')} ${_p.className}`) + '"' : ''} bf="s0">${_p.children}</div>` })
export function SelectLabel(_p, __bfKey) { return createComponent('SelectLabel', _p, __bfKey) }
export function initSelectSeparator(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const className = _p.className ?? ''

  const selectSeparatorClasses = '-mx-1 my-1 h-px bg-border'

  const [_s0] = $(__scope, 's0')

  createEffect(() => {
    if (_s0) {
      { const __v = `${selectSeparatorClasses} ${(_p.className ?? '')}`; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
    }
  })

  if (_s0) applyRestAttrs(_s0, _p, ["className","data-slot","role"])

}

hydrate('SelectSeparator', { init: initSelectSeparator, template: (_p) => `<div data-slot="select-separator" role="separator" ${(`${('-mx-1 my-1 h-px bg-border')} ${_p.className}`) != null ? 'class="' + escapeAttr(`${('-mx-1 my-1 h-px bg-border')} ${_p.className}`) + '"' : ''} bf="s0"></div>` })
export function SelectSeparator(_p, __bfKey) { return createComponent('SelectSeparator', _p, __bfKey) }
export function initSelectBasicDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [value, setValue] = createSignal('')

  const [_s9] = $t(__scope, 's9')
  const [_s8, _s1, _s0, _s7, _s2, _s3, _s4, _s5, _s6] = $c(__scope, 's8', 's1', 's0', 's7', 's2', 's3', 's4', 's5', 's6')

  let __anchor_s9 = _s9
  createEffect(() => {
    const __val = value() || 'None'
    __anchor_s9 = __bfText(__anchor_s9, __val)
  })


  // Reactive prop bindings
  createEffect(() => {
    if (_s8) {
      const __val = String(value())
      if (_s8.value !== __val) _s8.value = __val
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Select_s8El] = $c(__scope, 's8')
    if (__Select_s8El) {
      const __val = String(value())
      if (__Select_s8El.value !== __val) __Select_s8El.value = __val
    }
  })

  // Initialize child components with props
  initChild('Select', _s8, { get value() { return value() }, onValueChange: setValue })
  initChild('SelectTrigger', _s1, { className: "w-[280px]" })
  initChild('SelectValue', _s0, { placeholder: "Select a fruit..." })
  initChild('SelectContent', _s7, {})
  initChild('SelectItem', _s2, { value: "apple" })
  initChild('SelectItem', _s3, { value: "banana" })
  initChild('SelectItem', _s4, { value: "blueberry", disabled: true })
  initChild('SelectItem', _s5, { value: "grape" })
  initChild('SelectItem', _s6, { value: "pineapple" })
}

hydrate('SelectBasicDemo', { init: initSelectBasicDemo, template: (_p) => `<div class="space-y-3">${renderChild('Select', {value: (''), children: `${renderChild('SelectTrigger', {className: "w-[280px]", children: `${renderChild('SelectValue', {placeholder: "Select a fruit..."}, undefined, 's0')}`}, undefined, 's1')}${renderChild('SelectContent', {children: `${renderChild('SelectItem', {value: "apple", children: `Apple`}, undefined, 's2')}${renderChild('SelectItem', {value: "banana", children: `Banana`}, undefined, 's3')}${renderChild('SelectItem', {value: "blueberry", disabled: true, children: `Blueberry`}, undefined, 's4')}${renderChild('SelectItem', {value: "grape", children: `Grape`}, undefined, 's5')}${renderChild('SelectItem', {value: "pineapple", children: `Pineapple`}, undefined, 's6')}`}, undefined, 's7')}`}, undefined, 's8')}<p class="text-sm text-muted-foreground"> Selected: <span class="selected-value font-medium" bf="s10"><!--bf:s9-->${escapeText(('') || 'None')}<!--/--></span></p></div>` })
export function SelectBasicDemo(_p, __bfKey) { return createComponent('SelectBasicDemo', _p, __bfKey) }
export function initSelectFormDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [framework, setFramework] = createSignal('')
  const [role, setRole] = createSignal('')
  const [experience, setExperience] = createSignal('')
  const summary = createMemo(() => {
    const parts = []
    if (role()) parts.push(role())
    if (framework()) parts.push(`using ${framework()}`)
    if (experience()) parts.push(`with ${experience()} experience`)
    return parts.length > 0 ? parts.join(' ') : 'No selections yet'
  })

  const [_s24] = $t(__scope, 's24')
  const [_s7, _s15, _s23, _s1, _s0, _s6, _s2, _s3, _s4, _s5, _s9, _s8, _s14, _s10, _s11, _s12, _s13, _s17, _s16, _s22, _s18, _s19, _s20, _s21] = $c(__scope, 's7', 's15', 's23', 's1', 's0', 's6', 's2', 's3', 's4', 's5', 's9', 's8', 's14', 's10', 's11', 's12', 's13', 's17', 's16', 's22', 's18', 's19', 's20', 's21')

  let __anchor_s24 = _s24
  createEffect(() => {
    const __val = summary()
    __anchor_s24 = __bfText(__anchor_s24, __val)
  })


  // Reactive prop bindings
  createEffect(() => {
    if (_s7) {
      const __val = String(framework())
      if (_s7.value !== __val) _s7.value = __val
    }
    if (_s15) {
      const __val = String(role())
      if (_s15.value !== __val) _s15.value = __val
    }
    if (_s23) {
      const __val = String(experience())
      if (_s23.value !== __val) _s23.value = __val
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Select_s7El] = $c(__scope, 's7')
    if (__Select_s7El) {
      const __val = String(framework())
      if (__Select_s7El.value !== __val) __Select_s7El.value = __val
    }
    const [__Select_s15El] = $c(__scope, 's15')
    if (__Select_s15El) {
      const __val = String(role())
      if (__Select_s15El.value !== __val) __Select_s15El.value = __val
    }
    const [__Select_s23El] = $c(__scope, 's23')
    if (__Select_s23El) {
      const __val = String(experience())
      if (__Select_s23El.value !== __val) __Select_s23El.value = __val
    }
  })

  // Initialize child components with props
  initChild('Select', _s7, { get value() { return framework() }, onValueChange: setFramework })
  initChild('SelectTrigger', _s1, {})
  initChild('SelectValue', _s0, { placeholder: "Select framework..." })
  initChild('SelectContent', _s6, {})
  initChild('SelectItem', _s2, { value: "Next.js" })
  initChild('SelectItem', _s3, { value: "Remix" })
  initChild('SelectItem', _s4, { value: "Astro" })
  initChild('SelectItem', _s5, { value: "Nuxt" })
  initChild('Select', _s15, { get value() { return role() }, onValueChange: setRole })
  initChild('SelectTrigger', _s9, {})
  initChild('SelectValue', _s8, { placeholder: "Select role..." })
  initChild('SelectContent', _s14, {})
  initChild('SelectItem', _s10, { value: "Frontend Developer" })
  initChild('SelectItem', _s11, { value: "Backend Developer" })
  initChild('SelectItem', _s12, { value: "Full Stack Developer" })
  initChild('SelectItem', _s13, { value: "Designer" })
  initChild('Select', _s23, { get value() { return experience() }, onValueChange: setExperience })
  initChild('SelectTrigger', _s17, {})
  initChild('SelectValue', _s16, { placeholder: "Select experience..." })
  initChild('SelectContent', _s22, {})
  initChild('SelectItem', _s18, { value: "0-1 years" })
  initChild('SelectItem', _s19, { value: "1-3 years" })
  initChild('SelectItem', _s20, { value: "3-5 years" })
  initChild('SelectItem', _s21, { value: "5+ years" })
}

hydrate('SelectFormDemo', { init: initSelectFormDemo, template: (_p) => `<div class="space-y-4 max-w-sm"><h4 class="text-sm font-medium leading-none">Developer Profile</h4><div class="grid gap-3"><div class="space-y-1"><span class="text-sm text-muted-foreground">Framework</span>${renderChild('Select', {value: (''), children: `${renderChild('SelectTrigger', {children: `${renderChild('SelectValue', {placeholder: "Select framework..."}, undefined, 's0')}`}, undefined, 's1')}${renderChild('SelectContent', {children: `${renderChild('SelectItem', {value: "Next.js", children: `Next.js`}, undefined, 's2')}${renderChild('SelectItem', {value: "Remix", children: `Remix`}, undefined, 's3')}${renderChild('SelectItem', {value: "Astro", children: `Astro`}, undefined, 's4')}${renderChild('SelectItem', {value: "Nuxt", children: `Nuxt`}, undefined, 's5')}`}, undefined, 's6')}`}, undefined, 's7')}</div><div class="space-y-1"><span class="text-sm text-muted-foreground">Role</span>${renderChild('Select', {value: (''), children: `${renderChild('SelectTrigger', {children: `${renderChild('SelectValue', {placeholder: "Select role..."}, undefined, 's8')}`}, undefined, 's9')}${renderChild('SelectContent', {children: `${renderChild('SelectItem', {value: "Frontend Developer", children: `Frontend Developer`}, undefined, 's10')}${renderChild('SelectItem', {value: "Backend Developer", children: `Backend Developer`}, undefined, 's11')}${renderChild('SelectItem', {value: "Full Stack Developer", children: `Full Stack Developer`}, undefined, 's12')}${renderChild('SelectItem', {value: "Designer", children: `Designer`}, undefined, 's13')}`}, undefined, 's14')}`}, undefined, 's15')}</div><div class="space-y-1"><span class="text-sm text-muted-foreground">Experience</span>${renderChild('Select', {value: (''), children: `${renderChild('SelectTrigger', {children: `${renderChild('SelectValue', {placeholder: "Select experience..."}, undefined, 's16')}`}, undefined, 's17')}${renderChild('SelectContent', {children: `${renderChild('SelectItem', {value: "0-1 years", children: `0-1 years`}, undefined, 's18')}${renderChild('SelectItem', {value: "1-3 years", children: `1-3 years`}, undefined, 's19')}${renderChild('SelectItem', {value: "3-5 years", children: `3-5 years`}, undefined, 's20')}${renderChild('SelectItem', {value: "5+ years", children: `5+ years`}, undefined, 's21')}`}, undefined, 's22')}`}, undefined, 's23')}</div></div><div class="text-sm text-muted-foreground pt-2 border-t"> Summary: <span class="summary-text font-medium" bf="s25"><!--bf:s24-->${escapeText(((() => {
    const parts = []
    if (('')) parts.push((''))
    if (('')) parts.push(`using ${('')}`)
    if (('')) parts.push(`with ${('')} experience`)
    return parts.length > 0 ? parts.join(' ') : 'No selections yet'
  })()))}<!--/--></span></div></div>` })
export function SelectFormDemo(_p, __bfKey) { return createComponent('SelectFormDemo', _p, __bfKey) }
export function initSelectGroupedDemo(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [timezone, setTimezone] = createSignal('')

  const [_s22] = $t(__scope, 's22')
  const [_s21, _s1, _s0, _s20, _s7, _s2, _s3, _s4, _s5, _s6, _s8, _s13, _s9, _s10, _s11, _s12, _s14, _s19, _s15, _s16, _s17, _s18] = $c(__scope, 's21', 's1', 's0', 's20', 's7', 's2', 's3', 's4', 's5', 's6', 's8', 's13', 's9', 's10', 's11', 's12', 's14', 's19', 's15', 's16', 's17', 's18')

  let __anchor_s22 = _s22
  createEffect(() => {
    const __val = timezone() || 'None'
    __anchor_s22 = __bfText(__anchor_s22, __val)
  })


  // Reactive prop bindings
  createEffect(() => {
    if (_s21) {
      const __val = String(timezone())
      if (_s21.value !== __val) _s21.value = __val
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__Select_s21El] = $c(__scope, 's21')
    if (__Select_s21El) {
      const __val = String(timezone())
      if (__Select_s21El.value !== __val) __Select_s21El.value = __val
    }
  })

  // Initialize child components with props
  initChild('Select', _s21, { get value() { return timezone() }, onValueChange: setTimezone })
  initChild('SelectTrigger', _s1, { className: "w-[280px]" })
  initChild('SelectValue', _s0, { placeholder: "Select timezone..." })
  initChild('SelectContent', _s20, {})
  initChild('SelectGroup', _s7, {})
  initChild('SelectLabel', _s2, {})
  initChild('SelectItem', _s3, { value: "est" })
  initChild('SelectItem', _s4, { value: "cst" })
  initChild('SelectItem', _s5, { value: "mst" })
  initChild('SelectItem', _s6, { value: "pst" })
  initChild('SelectSeparator', _s8, {})
  initChild('SelectGroup', _s13, {})
  initChild('SelectLabel', _s9, {})
  initChild('SelectItem', _s10, { value: "gmt" })
  initChild('SelectItem', _s11, { value: "cet" })
  initChild('SelectItem', _s12, { value: "eet" })
  initChild('SelectSeparator', _s14, {})
  initChild('SelectGroup', _s19, {})
  initChild('SelectLabel', _s15, {})
  initChild('SelectItem', _s16, { value: "ist" })
  initChild('SelectItem', _s17, { value: "cst_china" })
  initChild('SelectItem', _s18, { value: "jst" })
}

hydrate('SelectGroupedDemo', { init: initSelectGroupedDemo, template: (_p) => `<div class="space-y-3">${renderChild('Select', {value: (''), children: `${renderChild('SelectTrigger', {className: "w-[280px]", children: `${renderChild('SelectValue', {placeholder: "Select timezone..."}, undefined, 's0')}`}, undefined, 's1')}${renderChild('SelectContent', {children: `${renderChild('SelectGroup', {children: `${renderChild('SelectLabel', {children: `North America`}, undefined, 's2')}${renderChild('SelectItem', {value: "est", children: `Eastern Standard Time (EST)`}, undefined, 's3')}${renderChild('SelectItem', {value: "cst", children: `Central Standard Time (CST)`}, undefined, 's4')}${renderChild('SelectItem', {value: "mst", children: `Mountain Standard Time (MST)`}, undefined, 's5')}${renderChild('SelectItem', {value: "pst", children: `Pacific Standard Time (PST)`}, undefined, 's6')}`}, undefined, 's7')}${renderChild('SelectSeparator', {}, undefined, 's8')}${renderChild('SelectGroup', {children: `${renderChild('SelectLabel', {children: `Europe`}, undefined, 's9')}${renderChild('SelectItem', {value: "gmt", children: `Greenwich Mean Time (GMT)`}, undefined, 's10')}${renderChild('SelectItem', {value: "cet", children: `Central European Time (CET)`}, undefined, 's11')}${renderChild('SelectItem', {value: "eet", children: `Eastern European Time (EET)`}, undefined, 's12')}`}, undefined, 's13')}${renderChild('SelectSeparator', {}, undefined, 's14')}${renderChild('SelectGroup', {children: `${renderChild('SelectLabel', {children: `Asia`}, undefined, 's15')}${renderChild('SelectItem', {value: "ist", children: `India Standard Time (IST)`}, undefined, 's16')}${renderChild('SelectItem', {value: "cst_china", children: `China Standard Time (CST)`}, undefined, 's17')}${renderChild('SelectItem', {value: "jst", children: `Japan Standard Time (JST)`}, undefined, 's18')}`}, undefined, 's19')}`}, undefined, 's20')}`}, undefined, 's21')}<p class="text-sm text-muted-foreground"> Selected: <span class="selected-timezone font-medium" bf="s23"><!--bf:s22-->${escapeText(('') || 'None')}<!--/--></span></p></div>` })
export function SelectGroupedDemo(_p, __bfKey) { return createComponent('SelectGroupedDemo', _p, __bfKey) }
