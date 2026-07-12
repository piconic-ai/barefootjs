import { $, $t, __bfSlot, __bfText, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, initChild, insert, mapArray, renderChild, styleToCss } from '@barefootjs/client/runtime'

export function initToggleItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [on, setOn] = createSignal(_p.defaultOn ?? false)

  const [_s3, _s2] = $(__scope, 's3', 's2')
  const [_s0] = $t(__scope, 's0')

  let __anchor_s0 = _s0
  createEffect(() => {
    const __val = _p.label
    __anchor_s0 = __bfText(__anchor_s0, __val)
  })

  createEffect(() => {
    if (_s3) {
      { const __v = styleToCss(`padding: 4px 12px; min-width: 60px; background: ${on() ? '#4caf50' : '#ccc'}; color: ${on() ? 'white' : 'black'}; border: none; border-radius: 4px; cursor: pointer;`); if (__v != null) _s3.setAttribute('style', __v); else _s3.removeAttribute('style') }
    }
  })

  insert(__scope, 's2', () => on(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2-->${__bfSlot('ON', __slots)}<!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2-->${__bfSlot('OFF', __slots)}<!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s3) _s3.addEventListener('click', () => { setOn(!on()) })
}

hydrate('ToggleItem__69f56292', { init: initToggleItem, template: (_p) => `<div class="toggle-item" style="display: flex; align-items: center; gap: 12px; padding: 8px 0;"><span style="min-width: 120px;" bf="s1"><!--bf:s0-->${escapeText(_p.label)}<!--/--></span><button ${((v) => v != null ? 'style="' + escapeAttr(v) + '"' : '')(styleToCss(`padding: 4px 12px; min-width: 60px; background: ${(_p.defaultOn ?? false) ? '#4caf50' : '#ccc'}; color: ${(_p.defaultOn ?? false) ? 'white' : 'black'}; border: none; border-radius: 4px; cursor: pointer;`))} bf="s3">${(_p.defaultOn ?? false) ? `<!--bf-cond-start:s2-->${'ON'}<!--bf-cond-end:s2-->` : `<!--bf-cond-start:s2-->${'OFF'}<!--bf-cond-end:s2-->`}</button></div>` })
export function ToggleItem(_p, __bfKey) { return createComponent('ToggleItem__69f56292', _p, __bfKey) }
export function initToggle(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const toggleItems = _p.toggleItems ?? []

  const [_s1] = $(__scope, 's1')

  mapArray(() => toggleItems, _s1, (item) => String(item.label), (item, __idx, __existing) => {
    if (__existing) { initChild('ToggleItem__69f56292', __existing, { get label() { return item().label }, get defaultOn() { return item().defaultOn } }); return __existing }
    return createComponent('ToggleItem__69f56292', { get label() { return item().label }, get defaultOn() { return item().defaultOn } }, item().label)
  }, 'l0')

}

hydrate('Toggle', { init: initToggle, template: (_p) => `<div class="settings-panel" style="padding: 16px; border: 1px solid #ddd; border-radius: 8px;" bf="s1"><h3 style="margin-top: 0;">Settings</h3><!--bf-loop:l0-->${_p.toggleItems.map((item) => `${renderChild('ToggleItem__69f56292', {label: item.label, defaultOn: item.defaultOn}, item.label)}`).join('')}<!--bf-/loop:l0--></div>` })
export function Toggle(_p, __bfKey) { return createComponent('Toggle', _p, __bfKey) }
