import { $c, __slot, bfMarkup, createComponent, createEffect, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, lazySlots, markupOrEmpty, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initTemplateDelimiterCard(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.header
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('TemplateDelimiterCard', { init: initTemplateDelimiterCard, template: (_p) => `<section><header bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.header)}<!--/--></header><div>${markupOrEmpty(_p.children)}</div></section>` })
export function TemplateDelimiterCard(_p, __bfKey) { return createComponent('TemplateDelimiterCard', _p, __bfKey) }
function initTemplateDelimiterBadge() {}

hydrate('TemplateDelimiterBadge', { init: initTemplateDelimiterBadge, template: (_p) => `<em>badge</em>` })
export function TemplateDelimiterBadge(_p, __bfKey) { return createComponent('TemplateDelimiterBadge', _p, __bfKey) }
export function initJsxPropTemplateDelimiters(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('TemplateDelimiterCard', __scope, { get header() { return __slot(() => `<span title="\` \\ \${notCode}">\` \\ \${notCode}${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`) } })
  initChild('TemplateDelimiterBadge', _s0, {})
}

hydrate('JsxPropTemplateDelimiters', { init: initJsxPropTemplateDelimiters, template: (_p) => `${renderChild('TemplateDelimiterCard', {header: bfMarkup(`<span title="\` \\ \${notCode}" bf-s="__BF_PARENT_SCOPE__">\` \\ \${notCode}${renderChild('TemplateDelimiterBadge', {}, undefined, 's0')}</span>`), children: `<p title="\` \\ \${notCode}">\` \\ \${notCode}</p>`}, undefined, 's1')}`, comment: true })
export function JsxPropTemplateDelimiters(_p, __bfKey) { return createComponent('JsxPropTemplateDelimiters', _p, __bfKey) }
