import { $c, createComponent, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

function initTemplateDelimiterBadge() {}

hydrate('TemplateDelimiterBadge', { init: initTemplateDelimiterBadge, template: (_p) => `<em>badge</em>` })
export function TemplateDelimiterBadge(_p, __bfKey) { return createComponent('TemplateDelimiterBadge', _p, __bfKey) }
export function initStaticChildQuotedKeys(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1, _s2, _s3, _s4, _s5, _s6, _s7, _s8, _s9] = $c(__scope, 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9')


  // Initialize child components with props
  initChild('TemplateDelimiterBadge', _s0, { key: "001" })
  initChild('TemplateDelimiterBadge', _s1, { key: "08" })
  initChild('TemplateDelimiterBadge', _s2, { key: "1e3" })
  initChild('TemplateDelimiterBadge', _s3, { key: "0x10" })
  initChild('TemplateDelimiterBadge', _s4, { key: "-0" })
  initChild('TemplateDelimiterBadge', _s5, { key: " 1" })
  initChild('TemplateDelimiterBadge', _s6, { key: "true" })
  initChild('TemplateDelimiterBadge', _s7, { get key() { return 7 } })
  initChild('TemplateDelimiterBadge', _s8, { get key() { return "x" } })
  initChild('TemplateDelimiterBadge', _s9, { get key() { return `t${1}` } })
}

hydrate('StaticChildQuotedKeys', { init: initStaticChildQuotedKeys, template: (_p) => `<div>${renderChild('TemplateDelimiterBadge', {}, "001", 's0')}${renderChild('TemplateDelimiterBadge', {}, "08", 's1')}${renderChild('TemplateDelimiterBadge', {}, "1e3", 's2')}${renderChild('TemplateDelimiterBadge', {}, "0x10", 's3')}${renderChild('TemplateDelimiterBadge', {}, "-0", 's4')}${renderChild('TemplateDelimiterBadge', {}, " 1", 's5')}${renderChild('TemplateDelimiterBadge', {}, "true", 's6')}${renderChild('TemplateDelimiterBadge', {}, 7, 's7')}${renderChild('TemplateDelimiterBadge', {}, "x", 's8')}${renderChild('TemplateDelimiterBadge', {}, `t${1}`, 's9')}</div>` })
export function StaticChildQuotedKeys(_p, __bfKey) { return createComponent('StaticChildQuotedKeys', _p, __bfKey) }
