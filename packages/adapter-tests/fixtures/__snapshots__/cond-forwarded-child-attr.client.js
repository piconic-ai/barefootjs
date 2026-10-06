import { createComponent, hydrate, markupOrEmpty, $, $c, createEffect, createSignal, escapeAttr, initChild, renderChild, createDisposableEffect, insert, qsa } from '@barefootjs/client/runtime'

function initWrapper() {}

hydrate('Wrapper__4d0b2e9a', { init: initWrapper, template: (_p) => `<section class="wrapper">${markupOrEmpty(_p.children)}</section>`, name: 'Wrapper' })
export function Wrapper(_p, __bfKey) { return createComponent('Wrapper__4d0b2e9a', _p, __bfKey) }
export function initOther(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [value] = createSignal('other')

  const [_s0, _s1, _s2] = $(__scope, 's0', 's1', '^s2')
  const [_s3] = $c(__scope, 's3')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = value()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-a', String(__v)); else _s0.removeAttribute('data-a') }
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = value()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-b', String(__v)); else _s1.removeAttribute('data-b') }
      }
      __l[0] = __x }
    }
  }) }

  { const __l = []
  createEffect(() => {
    if (_s2) {
      { const __x = value()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-label', String(__v)); else _s2.removeAttribute('data-label') }
      }
      __l[0] = __x }
    }
  }) }


  // Initialize child components with props
  initChild('Wrapper__4d0b2e9a', _s3, {})
}

hydrate('Other__4d0b2e9a', { init: initOther, template: (_p) => `<article><i ${(('other')) != null ? 'data-a="' + escapeAttr(('other')) + '"' : ''} bf="s0"></i><b ${(('other')) != null ? 'data-b="' + escapeAttr(('other')) + '"' : ''} bf="s1"></b>${renderChild('Wrapper__4d0b2e9a', {children: `<em class="other" ${(('other')) != null ? 'data-label="' + escapeAttr(('other')) + '"' : ''} bf="^s2">other</em>`}, undefined, 's3')}</article>`, name: 'Other' })
export function Other(_p, __bfKey) { return createComponent('Other__4d0b2e9a', _p, __bfKey) }
export function initCondForwardedChildAttr(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [show, setShow] = createSignal(true)
  const [label, setLabel] = createSignal('alpha')

  const [_s4, _s5, _s0] = $(__scope, 's4', 's5', 's0')

  insert(__scope, 's0', () => show(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0-->${renderChild('Other__4d0b2e9a', {}, undefined, 's1')}${renderChild('Wrapper__4d0b2e9a', {children: `<strong class="forwarded" ${(label()) != null ? 'data-label="' + escapeAttr(label()) + '"' : ''} bf="^s2">value</strong>`}, undefined, 's3')}<!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's1')
      if (__c0) initChild('Other__4d0b2e9a', __c0, {})
      const [__c1] = $c(__branchScope, 's3')
      if (__c1) initChild('Wrapper__4d0b2e9a', __c1, {})
      const __disposers = []
      { const __ra_s2 = qsa(__branchScope, '[bf="^s2"]', ["s3"])
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

hydrate('CondForwardedChildAttr', { init: initCondForwardedChildAttr, template: (_p) => `<div bf="s6">${(true) ? `<!--bf-cond-start:s0-->${renderChild('Other__4d0b2e9a', {}, undefined, 's1')}${renderChild('Wrapper__4d0b2e9a', {children: `<strong class="forwarded" ${(('alpha')) != null ? 'data-label="' + escapeAttr(('alpha')) + '"' : ''} bf="^s2">value</strong>`}, undefined, 's3')}<!--bf-cond-end:s0-->` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}<button class="update" bf="s4">update</button><button class="toggle" bf="s5">toggle</button></div>` })
export function CondForwardedChildAttr(_p, __bfKey) { return createComponent('CondForwardedChildAttr', _p, __bfKey) }
