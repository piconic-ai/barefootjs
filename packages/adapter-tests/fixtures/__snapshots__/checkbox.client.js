import { $, $c, applyRestAttrs, createComponent, createEffect, createMemo, createSignal, escapeAttr, forwardProps, hydrate, initChild, insert, renderChild, spreadAttrs } from '@barefootjs/client/runtime'

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
export function initCheckbox(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const baseClasses = 'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50'
  const focusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50'
  const errorClasses = 'aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive'
  const stateClasses = [
  // Unchecked state
  '[&[data-state=unchecked]]:border-input',
  'dark:[&[data-state=unchecked]]:bg-input/30',
  '[&[data-state=unchecked]]:bg-background',
  // Checked state
  '[&[data-state=checked]]:bg-primary',
  '[&[data-state=checked]]:text-primary-foreground',
  '[&[data-state=checked]]:border-primary',
].join(' ')
  const [internalChecked, setInternalChecked] = createSignal(_p.defaultChecked ?? false)
  const [controlledChecked, setControlledChecked] = createSignal(_p.checked ?? undefined)
  createEffect(() => {
    const __val = _p.checked
    if (__val !== undefined) setControlledChecked(__val)
  })
  const isControlled = createMemo(() => _p.checked !== undefined)
  const isChecked = createMemo(() => isControlled() ? controlledChecked() : internalChecked())
  const classes = createMemo(() =>
    `${baseClasses} ${focusClasses} ${errorClasses} ${stateClasses} ${_p.className ?? ''} grid place-content-center`)
  const handleClick = () => {
    const newValue = !isChecked()

    if (isControlled()) {
      setControlledChecked(newValue)
    } else {
      setInternalChecked(newValue)
    }

    _p.onCheckedChange?.(newValue)
  }

  const [_s2, _s0] = $(__scope, 's2', 's0')
  const [_s1] = $c(__scope, 's1')

  createEffect(() => {
    if (_s2) {
      { const __v = `${isChecked() ? 'checked' : 'unchecked'}`; if (__v != null) _s2.setAttribute('data-state', String(__v)); else _s2.removeAttribute('data-state') }
      { const __v = _p.id; if (__v != null) _s2.setAttribute('id', String(__v)); else _s2.removeAttribute('id') }
      { const __v = isChecked(); if (__v != null) _s2.setAttribute('aria-checked', String(__v)); else _s2.removeAttribute('aria-checked') }
      if (_p.error) _s2.setAttribute('aria-invalid', 'true')
      else _s2.removeAttribute('aria-invalid')
      _s2.disabled = !!(_p.disabled ?? false)
      { const __v = classes(); if (__v != null) _s2.setAttribute('class', String(__v)); else _s2.removeAttribute('class') }
    }
  })

  insert(__scope, 's0', () => isChecked(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('CheckIcon', {"data-slot": "checkbox-indicator", className: "size-3.5 text-current"}, undefined, 's1')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('CheckIcon', __c0, { "data-slot": "checkbox-indicator", className: "size-3.5 text-current" })
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s2) _s2.addEventListener('click', handleClick)

  // Initialize child components with props
  initChild('CheckIcon', _s1, { "data-slot": "checkbox-indicator", className: "size-3.5 text-current" })
}

hydrate('Checkbox', { init: initCheckbox, template: (_p) => `<button data-slot="checkbox" ${(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) != null ? 'data-state="' + escapeAttr(`${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? 'checked' : 'unchecked'}`) + '"' : ''} role="checkbox" ${(_p.id) != null ? 'id="' + escapeAttr(_p.id) + '"' : ''} ${(((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false))) != null ? 'aria-checked="' + escapeAttr(((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false))) + '"' : ''} ${_p.error ? 'aria-invalid' : ''} ${_p.disabled ?? false ? 'disabled' : ''} ${((`${('peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50')} ${('focus-visible:border-ring focus-visible:ring-ring/50')} ${('aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive')} ${([
  // Unchecked state
  '[&[data-state=unchecked]]:border-input',
  'dark:[&[data-state=unchecked]]:bg-input/30',
  '[&[data-state=unchecked]]:bg-background',
  // Checked state
  '[&[data-state=checked]]:bg-primary',
  '[&[data-state=checked]]:text-primary-foreground',
  '[&[data-state=checked]]:border-primary',
].join(' '))} ${_p.className ?? ''} grid place-content-center`)) != null ? 'class="' + escapeAttr((`${('peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50')} ${('focus-visible:border-ring focus-visible:ring-ring/50')} ${('aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive')} ${([
  // Unchecked state
  '[&[data-state=unchecked]]:border-input',
  'dark:[&[data-state=unchecked]]:bg-input/30',
  '[&[data-state=unchecked]]:bg-background',
  // Checked state
  '[&[data-state=checked]]:bg-primary',
  '[&[data-state=checked]]:text-primary-foreground',
  '[&[data-state=checked]]:border-primary',
].join(' '))} ${_p.className ?? ''} grid place-content-center`)) + '"' : ''} bf="s2">${((_p.checked !== undefined) ? (_p.checked ?? undefined) : (_p.defaultChecked ?? false)) ? `<!--bf-cond-start:s0-->${renderChild('CheckIcon', {"data-slot": "checkbox-indicator", className: "size-3.5 text-current"}, undefined, 's1')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}</button>` })
export function Checkbox(_p, __bfKey) { return createComponent('Checkbox', _p, __bfKey) }
