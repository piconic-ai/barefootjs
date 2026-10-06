import { createComponent, hydrate, markupOrEmpty, $, $c, createDisposableEffect, createSignal, escapeAttr, initChild, insert, qsa, renderChild } from '@barefootjs/client/runtime'

function initWrapper() {}

hydrate('Wrapper__4d0b2e9a', { init: initWrapper, template: (_p) => `<section class="wrapper">${markupOrEmpty(_p.children)}</section>`, name: 'Wrapper' })
export function Wrapper(_p, __bfKey) { return createComponent('Wrapper__4d0b2e9a', _p, __bfKey) }
function initBadge() {}

hydrate('Badge__4d0b2e9a', { init: initBadge, template: (_p) => `<span class="badge" data-label="badge">badge</span>`, name: 'Badge' })
export function Badge(_p, __bfKey) { return createComponent('Badge__4d0b2e9a', _p, __bfKey) }
export function initCondForwardedChildAttr(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [show, setShow] = createSignal(true)
  const [label, setLabel] = createSignal('alpha')

  const [_s4, _s5, _s0] = $(__scope, 's4', 's5', 's0')

  insert(__scope, 's0', () => show(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('Wrapper__4d0b2e9a', {children: `${renderChild('Badge__4d0b2e9a', {}, undefined, 's1')}<strong class="forwarded" ${(label()) != null ? 'data-label="' + escapeAttr(label()) + '"' : ''} bf="^s2">value</strong>`}, undefined, 's3')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's3')
      if (__c0) initChild('Wrapper__4d0b2e9a', __c0, {})
      const [__c1] = $c(__branchScope, 's1')
      if (__c1) initChild('Badge__4d0b2e9a', __c1, {})
      const __disposers = []
      { const __ra_s2 = qsa(__branchScope, '[bf="^s2"]')
      const __l = []
      if (__ra_s2) {
        __disposers.push(createDisposableEffect(() => {
          { const __x = label()
          if (!(0 in __l) || !Object.is(__l[0], __x)) {
            { const __v = __x; if (__v != null) __ra_s2.setAttribute('data-label', String(__v)); else __ra_s2.removeAttribute('data-label') }
          }
          __l[0] = __x }
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s4) _s4.addEventListener('click', () => { setLabel(label() === 'alpha' ? 'beta' : 'alpha') })
  if (_s5) _s5.addEventListener('click', () => { setShow(!show()) })
}

hydrate('CondForwardedChildAttr', { init: initCondForwardedChildAttr, template: (_p) => `<div bf="s6">${(true) ? `<!--bf-cond-start:s0-->${renderChild('Wrapper__4d0b2e9a', {children: `${renderChild('Badge__4d0b2e9a', {}, undefined, 's1')}<strong class="forwarded" ${(('alpha')) != null ? 'data-label="' + escapeAttr(('alpha')) + '"' : ''} bf="^s2">value</strong>`}, undefined, 's3')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}<button class="update" bf="s4">update</button><button class="toggle" bf="s5">toggle</button></div>` })
export function CondForwardedChildAttr(_p, __bfKey) { return createComponent('CondForwardedChildAttr', _p, __bfKey) }
