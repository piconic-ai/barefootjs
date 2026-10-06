import { $, adoptRowPortal, claimRowPortals, createComponent, createEffect, createPortal, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, isRowPortalOf, lazySlots, qsaItem, relayRowPortalEvents } from '@barefootjs/client/runtime'


export function initRowPortalRefStatic(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const ROWS = ['a', 'b']
  const [last, setLast] = createSignal('none')
  const mountContent = (el) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s4] = $(__scope, 's4')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  // Reactive texts / ref callbacks in static array children
  if (_s4) {
    ROWS.forEach((r, __idx) => {
      let __iterEl = _s4.children[__idx]
      if (__iterEl) {
        claimRowPortals(__iterEl, __scopeId, ["s3"], _s4)
        const __bfw_s2 = lazySlots(__iterEl, [{ id: 's2', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s2('s2', String(r)) })
        { const __rf_s3 = qsaItem(__iterEl, '[bf="s3"]')
        if (__rf_s3) { { (mountContent)(__rf_s3); if (__scopeId) __rf_s3.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__iterEl, __rf_s3, _s4) } }
      }
    })
  }

  if (_s4) {
  const __bfDl = (__bfEvt) => {
    const target = __bfEvt.target
    const s3El = target.closest('[bf="s3"]')
    if (s3El && (_s4.contains(s3El) || isRowPortalOf(s3El, _s4))) {
      const li = s3El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const r = ROWS.find(item => String(item) === key)
        if (r) {
          ;(() => setLast(r))(__bfEvt)
        }
      }
      return
    }
  }
  _s4.addEventListener('click', __bfDl)
  relayRowPortalEvents(_s4, 'click', __bfDl)
  }

}

hydrate('RowPortalRefStatic', { init: initRowPortalRefStatic, template: (_p) => `<div><p class="last" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><ul bf="s4"><!--bf-loop:l0-->${(['a', 'b']).map((r) => `<li data-key="${escapeAttr(r)}"><button type="button" class="row" data-key="${escapeAttr(r)}" bf="s3"><!--bf:s2-->${escapeText(r)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function RowPortalRefStatic(_p, __bfKey) { return createComponent('RowPortalRefStatic', _p, __bfKey) }
