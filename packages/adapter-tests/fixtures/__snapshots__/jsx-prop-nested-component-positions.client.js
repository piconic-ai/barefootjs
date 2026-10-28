import { $, $c, __slot, bfMarkup, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, lazySlots, markupOrEmpty, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initSlotPositionsCard(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.header
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('SlotPositionsCard', { init: initSlotPositionsCard, template: (_p) => `<section><header bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.header)}<!--/--></header><div class="body">${markupOrEmpty(_p.children)}</div></section>` })
export function SlotPositionsCard(_p, __bfKey) { return createComponent('SlotPositionsCard', _p, __bfKey) }
function initTemplateDelimiterBadge() {}

hydrate('TemplateDelimiterBadge', { init: initTemplateDelimiterBadge, template: (_p) => `<em>badge</em>` })
export function TemplateDelimiterBadge(_p, __bfKey) { return createComponent('TemplateDelimiterBadge', _p, __bfKey) }
export function initJsxPropNestedComponentPositions(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [count, setCount] = createSignal(0)

  const [_s2] = $(__scope, '^s2')
  const [_s0] = $c(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: '^s1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s1('^s1', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setCount(n => n + 1))

  // Initialize child components with props
  initChild('SlotPositionsCard', __scope, { get header() { return __slot(() => `<span class="h">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`) } })
  initChild('TemplateDelimiterBadge', _s0, {})
}

hydrate('JsxPropNestedComponentPositions', { init: initJsxPropNestedComponentPositions, template: (_p) => `${renderChild('SlotPositionsCard', {header: bfMarkup(`<span class="h" bf-s="__BF_PARENT_SCOPE__">head${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`), children: `<button bf="^s2"><!--bf:^s1-->${escapeTextOrMarkup((0))}<!--/--></button>`}, undefined, 's3')}`, comment: true })
export function JsxPropNestedComponentPositions(_p, __bfKey) { return createComponent('JsxPropNestedComponentPositions', _p, __bfKey) }
