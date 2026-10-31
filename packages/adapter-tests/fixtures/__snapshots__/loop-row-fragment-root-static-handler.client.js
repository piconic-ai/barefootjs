import { createComponent, hydrate, markupOrEmpty, $, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, lazySlots, ownScopeId, childScopesBySlot, escapeText, initChild, qsa, renderChild, textOrNode } from '@barefootjs/client/runtime'

function initPill() {}

hydrate('Pill__c7171aa3', { init: initPill, template: (_p) => `<span class="pill">${markupOrEmpty(_p.children)}</span>`, comment: true, fragmentRoot: true, name: 'Pill' })
export function Pill(_p, __bfKey) { return createComponent('Pill__c7171aa3', _p, __bfKey) }
export function initPickPill(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.id
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => _p.onPick(_p.id))
}

hydrate('PickPill__c7171aa3', { init: initPickPill, template: (_p) => `<button type="button" class="own" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.id)}<!--/--></button>`, comment: true, fragmentRoot: true, name: 'PickPill' })
export function PickPill(_p, __bfKey) { return createComponent('PickPill__c7171aa3', _p, __bfKey) }
export function initPickPillProps(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.id
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => _p.onPick(_p.id))
}

hydrate('PickPillProps__c7171aa3', { init: initPickPillProps, template: (_p) => `<button type="button" class="own" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.id)}<!--/--></button>`, comment: true, fragmentRoot: true, name: 'PickPillProps' })
export function PickPillProps(_p, __bfKey) { return createComponent('PickPillProps__c7171aa3', _p, __bfKey) }
export function initLoopRowFragmentRootStaticHandler(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const ITEMS = [{ id: 'a' }, { id: 'b' }]
  const [picked, setPicked] = createSignal('none')

  const [_s5, _s7, _s9] = $(__scope, 's5', 's7', 's9')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  // Reactive texts in static array children
  if (_s5) {
    ITEMS.forEach((o, __idx) => {
      let __iterEl = _s5.children[__idx]
      if (__iterEl) {
        const __bfw_s2 = lazySlots(__iterEl, [{ id: '^s2', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s2('^s2', textOrNode(o.id)) })
      }
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s5) {
    const __childScopes = childScopesBySlot(_s5, __scopeId, 's4')
    __childScopes.forEach((childScope, __idx) => {
      const o = ITEMS[__idx]
      initChild('Pill__c7171aa3', childScope, {})
      { const __e = qsa(childScope, '[bf="^s3"]'); if (__e) __e.addEventListener('click', () => setPicked(`f-${o.id}`)) }
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s7) {
    const __childScopes = childScopesBySlot(_s7, __scopeId, 's6')
    __childScopes.forEach((childScope, __idx) => {
      const o = ITEMS[__idx]
      initChild('PickPill__c7171aa3', childScope, { get id() { return o.id }, onPick: (id) => setPicked(`o-${id}`) })
    })
  }

  // Initialize static array children (hydrate skips nested instances)
  if (_s9) {
    const __childScopes = childScopesBySlot(_s9, __scopeId, 's8')
    __childScopes.forEach((childScope, __idx) => {
      const o = ITEMS[__idx]
      initChild('PickPillProps__c7171aa3', childScope, { get id() { return o.id }, onPick: (id) => setPicked(`p-${id}`) })
    })
  }

}

hydrate('LoopRowFragmentRootStaticHandler', { init: initLoopRowFragmentRootStaticHandler, template: (_p) => `<div><p class="picked" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><div class="forwarded" bf="s5"><!--bf-loop:l0-->${([{ id: 'a' }, { id: 'b' }]).map((o) => `${renderChild('Pill__c7171aa3', {children: `<button type="button" class="pick" bf="^s3"><!--bf:^s2-->${escapeText(o.id)}<!--/--></button>`}, o.id, 's4', true)}`).join('')}<!--bf-/loop:l0--></div><div class="own" bf="s7"><!--bf-loop:l1-->${([{ id: 'a' }, { id: 'b' }]).map((o) => `${renderChild('PickPill__c7171aa3', {id: o.id}, o.id, 's6', true)}`).join('')}<!--bf-/loop:l1--></div><div class="own-props" bf="s9"><!--bf-loop:l2-->${([{ id: 'a' }, { id: 'b' }]).map((o) => `${renderChild('PickPillProps__c7171aa3', {id: o.id}, o.id, 's8', true)}`).join('')}<!--bf-/loop:l2--></div></div>` })
export function LoopRowFragmentRootStaticHandler(_p, __bfKey) { return createComponent('LoopRowFragmentRootStaticHandler', _p, __bfKey) }
