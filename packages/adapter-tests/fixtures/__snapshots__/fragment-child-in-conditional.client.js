import { createComponent, hydrate, markupOrEmpty, $, $c, createSignal, initChild, insert, renderChild } from '@barefootjs/client/runtime'

function initPassthrough() {}

hydrate('Passthrough__9ec964fa', { init: initPassthrough, template: (_p) => `${markupOrEmpty(_p.children)}`, transparent: true, name: 'Passthrough' })
export function Passthrough(_p, __bfKey) { return createComponent('Passthrough__9ec964fa', _p, __bfKey) }
export function initFragmentChildInConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [show, setShow] = createSignal(true)

  const [_s2, _s0] = $(__scope, 's2', 's0')

  insert(__scope, 's0', () => show(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('Passthrough__9ec964fa', {children: `<mark class="m">value</mark>`}, undefined, 's1')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('Passthrough__9ec964fa', __c0, {})
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s2) _s2.addEventListener('click', () => { setShow(!show()) })
}

hydrate('FragmentChildInConditional', { init: initFragmentChildInConditional, template: (_p) => `<div bf="s3">${(true) ? `<!--bf-cond-start:s0-->${renderChild('Passthrough__9ec964fa', {children: `<mark class="m">value</mark>`}, undefined, 's1')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}<button class="toggle" bf="s2">toggle</button></div>` })
export function FragmentChildInConditional(_p, __bfKey) { return createComponent('FragmentChildInConditional', _p, __bfKey) }
