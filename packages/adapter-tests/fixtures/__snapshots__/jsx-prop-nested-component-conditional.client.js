import { $, $c, __bfSlot, __slot, bfMarkup, createComponent, createDisposableEffect, escapeText, escapeTextOrNode, hydrate, initChild, insert, lazySlots, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initSlotConditionalCard(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s3] = $(__scope, 's0', 's3')

  insert(__scope, 's0', () => _p.show, {
    template: () => { const __slots = []; return { html: `<div bf-c="s0" class="and" bf="s2"><!--bf:s1-->${__bfSlot(_p.header, __slots)}<!--/--></div>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const __bfw_s1 = lazySlots(__branchScope, [{ id: 's1', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s1('s1', escapeTextOrNode(_p.header)) }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's3', () => _p.show, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf:s4-->${__bfSlot(_p.footer, __slots)}<!--/--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const __bfw_s4 = lazySlots(__branchScope, [{ id: 's4', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s4('s4', escapeTextOrNode(_p.footer)) }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3-->${__bfSlot('none', __slots)}<!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

}

hydrate('SlotConditionalCard', { init: initSlotConditionalCard, template: (_p) => `<section bf="s6">${_p.show ? `<div bf-c="s0" class="and" bf="s2"><!--bf:s1-->${escapeText(_p.header)}<!--/--></div>` : `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`}<div class="ternary" bf="s5">${_p.show ? `<!--bf-cond-start:s3--><!--bf:s4-->${escapeText(_p.footer)}<!--/--><!--bf-cond-end:s3-->` : `<!--bf-cond-start:s3-->${escapeText('none')}<!--bf-cond-end:s3-->`}</div></section>` })
export function SlotConditionalCard(_p, __bfKey) { return createComponent('SlotConditionalCard', _p, __bfKey) }
function initTemplateDelimiterBadge() {}

hydrate('TemplateDelimiterBadge', { init: initTemplateDelimiterBadge, template: (_p) => `<em>badge</em>` })
export function TemplateDelimiterBadge(_p, __bfKey) { return createComponent('TemplateDelimiterBadge', _p, __bfKey) }
export function initJsxPropNestedComponentConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [_s0, _s1] = $c(__scope, 's0', 's1')


  // Initialize child components with props
  initChild('SlotConditionalCard', __scope, { show: true, get header() { return __slot(() => `<span class="h">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`) }, get footer() { return __slot(() => `<b class="f">foot${renderChild('TemplateDelimiterBadge', {}, undefined, 's1')}</b>`) } })
  initChild('TemplateDelimiterBadge', _s0, {})
  initChild('TemplateDelimiterBadge', _s1, {})
}

hydrate('JsxPropNestedComponentConditional', { init: initJsxPropNestedComponentConditional, template: (_p) => `${renderChild('SlotConditionalCard', {show: true, header: bfMarkup(`<span class="h" bf-s="__BF_PARENT_SCOPE__">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`), footer: bfMarkup(`<b class="f">foot${renderChild('TemplateDelimiterBadge', {}, undefined, 's1')}</b>`)}, undefined, 's2')}`, comment: true })
export function JsxPropNestedComponentConditional(_p, __bfKey) { return createComponent('JsxPropNestedComponentConditional', _p, __bfKey) }
