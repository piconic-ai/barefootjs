import { $, createComponent, createEffect, createSignal, hydrate, insert, styleToCss } from '@barefootjs/client/runtime'


export function initForm(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [accepted, setAccepted] = createSignal(false)

  const [_s1, _s0, _s2] = $(__scope, 's1', 's0', 's2')

  createEffect(() => {
    if (_s1) {
      { const __v = `${accepted() ? 'checked' : 'unchecked'}`; if (__v != null) _s1.setAttribute('data-state', String(__v)); else _s1.removeAttribute('data-state') }
      { const __v = styleToCss(`width: 24px; height: 24px; border: 2px solid ${accepted() ? '#4caf50' : '#ccc'}; border-radius: 4px; background: ${accepted() ? '#4caf50' : 'white'}; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;`); if (__v != null) _s1.setAttribute('style', __v); else _s1.removeAttribute('style') }
      { const __v = accepted(); if (__v != null) _s1.setAttribute('aria-checked', String(__v)); else _s1.removeAttribute('aria-checked') }
    }
  })

  createEffect(() => {
    if (_s2) {
      _s2.disabled = !!(!accepted())
      { const __v = styleToCss(`width: 100%; padding: 12px 24px; font-size: 16px; border: none; border-radius: 6px; cursor: ${accepted() ? 'pointer' : 'not-allowed'}; background: ${accepted() ? '#4caf50' : '#e0e0e0'}; color: ${accepted() ? 'white' : '#999'};`); if (__v != null) _s2.setAttribute('style', __v); else _s2.removeAttribute('style') }
    }
  })

  insert(__scope, 's0', () => accepted(), {
    template: () => { const __slots = []; return { html: `<svg bf-c="s0" class="checkmark" width="16" height="16" viewBox="0 0 16 16" fill="none" style="display: block;"><path d="M3 8L6.5 11.5L13 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s1) _s1.addEventListener('click', () => { setAccepted(!accepted()) })
}

hydrate('Form', { init: initForm, template: (_p) => `<div class="form-container" style="padding: 24px; max-width: 400px; margin: 0 auto;"><h2 style="margin-top: 0;">Terms and Conditions</h2><p style="color: #666; font-size: 14px;"> Please read and accept the terms before continuing. </p><div class="checkbox-row" style="display: flex; align-items: center; gap: 12px; margin: 20px 0;"><button class="checkbox" ${(`${(false) ? 'checked' : 'unchecked'}`) != null ? 'data-state="' + (`${(false) ? 'checked' : 'unchecked'}`) + '"' : ''} ${((v) => v != null ? 'style="' + v + '"' : '')(styleToCss(`width: 24px; height: 24px; border: 2px solid ${(false) ? '#4caf50' : '#ccc'}; border-radius: 4px; background: ${(false) ? '#4caf50' : 'white'}; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;`))} ${((false)) != null ? 'aria-checked="' + ((false)) + '"' : ''} role="checkbox" bf="s1">${(false) ? `<svg bf-c="s0" class="checkmark" width="16" height="16" viewBox="0 0 16 16" fill="none" style="display: block;"><path d="M3 8L6.5 11.5L13 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}</button><label class="checkbox-label" style="cursor: pointer; user-select: none;"> I agree to the terms and conditions </label></div><button class="submit-btn" ${!(false) ? 'disabled' : ''} ${((v) => v != null ? 'style="' + v + '"' : '')(styleToCss(`width: 100%; padding: 12px 24px; font-size: 16px; border: none; border-radius: 6px; cursor: ${(false) ? 'pointer' : 'not-allowed'}; background: ${(false) ? '#4caf50' : '#e0e0e0'}; color: ${(false) ? 'white' : '#999'};`))} bf="s2"> Continue </button></div>` })
export function Form(_p, __bfKey) { return createComponent('Form', _p, __bfKey) }
