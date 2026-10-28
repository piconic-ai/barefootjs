import { $c, __slot, bfMarkup, createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, lazySlots, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initSlotPositionsPanel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.title
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('SlotPositionsPanel', { init: initSlotPositionsPanel, template: (_p) => `<aside bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.title)}<!--/--></aside>` })
export function SlotPositionsPanel(_p, __bfKey) { return createComponent('SlotPositionsPanel', _p, __bfKey) }
export function initSlotForwardCard(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__SlotPositionsPanel_s0El] = $c(__scope, 's0')
    if (__SlotPositionsPanel_s0El) {
      { const __x = _p.header
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __SlotPositionsPanel_s0El.hasAttribute('title')) { const __v = __x; if (__v != null) __SlotPositionsPanel_s0El.setAttribute('title', String(__v)); else __SlotPositionsPanel_s0El.removeAttribute('title') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('SlotPositionsPanel', _s0, { get title() { return _p.header } })
}

hydrate('SlotForwardCard', { init: initSlotForwardCard, template: (_p) => `<section>${renderChild('SlotPositionsPanel', {title: _p.header}, undefined, 's0')}</section>` })
export function SlotForwardCard(_p, __bfKey) { return createComponent('SlotForwardCard', _p, __bfKey) }
function initTemplateDelimiterBadge() {}

hydrate('TemplateDelimiterBadge', { init: initTemplateDelimiterBadge, template: (_p) => `<em>badge</em>` })
export function TemplateDelimiterBadge(_p, __bfKey) { return createComponent('TemplateDelimiterBadge', _p, __bfKey) }
export function initJsxPropNestedComponentForwarded(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('SlotForwardCard', __scope, { get header() { return __slot(() => `<span class="h">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`) } })
  initChild('TemplateDelimiterBadge', _s0, {})
}

hydrate('JsxPropNestedComponentForwarded', { init: initJsxPropNestedComponentForwarded, template: (_p) => `${renderChild('SlotForwardCard', {header: bfMarkup(`<span class="h" bf-s="__BF_PARENT_SCOPE__">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`)}, undefined, 's1')}`, comment: true })
export function JsxPropNestedComponentForwarded(_p, __bfKey) { return createComponent('JsxPropNestedComponentForwarded', _p, __bfKey) }
