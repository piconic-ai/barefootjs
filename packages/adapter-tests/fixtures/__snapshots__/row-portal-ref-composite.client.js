import { createComponent, createEffect, createPortal, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $, adoptRowPortal, claimRowPortals, escapeAttr, escapeText, mapArray, mountRowRoot, qsaItem, renderChild, upsertChildItem } from '@barefootjs/client/runtime'

export function initRowLabel(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.text
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('RowLabel__f13d1715', { init: initRowLabel, template: (_p) => `<span class="label" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.text)}<!--/--></span>`, name: 'RowLabel' })
export function RowLabel(_p, __bfKey) { return createComponent('RowLabel__f13d1715', _p, __bfKey) }
export function initRowPortalRefComposite(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [last, setLast] = createSignal('none')
  const mountContent = (el) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s5] = $(__scope, 's5')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  mapArray(() => _p.rows, _s5, (r) => String(r), (r, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(r())}"><div data-bf-ph="s2"></div><button type="button" class="row" data-key="${escapeAttr(r())}" bf="s4"><!--bf:s3-->${escapeText(r())}<!--/--></button></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    if (__existing) claimRowPortals(__existing, __scopeId, ["s4"], _s5)
    upsertChildItem(__el, 'RowLabel__f13d1715', 's2', { get text() { return r() } }, undefined, __scope)
    { const __e = qsaItem(__el, '[bf="s4"]'); if (__e) __e.addEventListener('click', () => { setLast(r()) }) }
    const __bfw_s3 = lazySlots(__el, [{ id: 's3', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s3('s3', String(r())) })
    { const __rf_s4 = qsaItem(__el, '[bf="s4"]')
    if (__rf_s4) { { (mountContent)(__rf_s4); if (__scopeId) __rf_s4.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__el, __rf_s4, _s5) } }
    return __el
  }, 'l0')

}

hydrate('RowPortalRefComposite', { init: initRowPortalRefComposite, template: (_p) => `<div><p class="last" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><ul bf="s5"><!--bf-loop:l0-->${_p.rows.map((r) => `<li data-key="${escapeAttr(r)}">${renderChild('RowLabel__f13d1715', {text: r}, undefined, 's2')}<button type="button" class="row" data-key="${escapeAttr(r)}" bf="s4"><!--bf:s3-->${escapeText(r)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function RowPortalRefComposite(_p, __bfKey) { return createComponent('RowPortalRefComposite', _p, __bfKey) }
