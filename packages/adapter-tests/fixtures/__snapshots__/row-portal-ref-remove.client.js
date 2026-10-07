import { $, adoptRowPortal, claimRowPortals, createComponent, createEffect, createPortal, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, isRowPortalOf, lazySlots, mapArray, qsaItem, relayRowPortalEvents } from '@barefootjs/client/runtime'


export function initRowPortalRefRemove(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal(_p.rows ?? undefined)
  createEffect(() => {
    const __val = _p.rows
    if (__val !== undefined) setRows(__val)
  })
  const mountContent = (el) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s4] = $(__scope, 's4')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = rows().length
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><button type="button" class="row" data-key="" bf="s3"><!--bf:s2--><!--/--></button></li>`
  mapArray(() => rows(), _s4, (r) => String(r), (r, __idx, __existing) => {
    const __el = __existing ?? __tpl_l0.content.firstElementChild.cloneNode(true)
    if (__existing) claimRowPortals(__existing, __scopeId, ["s3"], _s4)
    const __p = __existing ? null : [__el.firstChild]
    const __bfw_s2 = lazySlots(__el, [{ id: 's2', kind: 'text', path: __existing ? [] : [0, 0] }])
    createEffect(() => { __bfw_s2('s2', String(r())) })
    { const __rf_s3 = __p ? __p[0] : qsaItem(__el, '[bf="s3"]')
    if (__rf_s3) { { (mountContent)(__rf_s3); if (__scopeId) __rf_s3.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__el, __rf_s3, _s4) } }
    return __el
  }, 'l0')

  if (_s4) {
  const __bfDl = (__bfEvt) => {
    const target = __bfEvt.target
    const s3El = target.closest('[bf="s3"]')
    if (s3El && (_s4.contains(s3El) || isRowPortalOf(s3El, _s4))) {
      const li = s3El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const r = rows().find(item => String(item) === key)
        if (r) {
          ;(() => setRows(rs => rs.filter(x => x !== r)))(__bfEvt)
        }
      }
      return
    }
  }
  _s4.addEventListener('click', __bfDl)
  relayRowPortalEvents(_s4, 'click', __bfDl)
  }

}

hydrate('RowPortalRefRemove', { init: initRowPortalRefRemove, template: (_p) => `<div><p class="count" bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.rows ?? undefined).length)}<!--/--></p><ul bf="s4"><!--bf-loop:l0-->${(_p.rows ?? undefined).map((r) => `<li data-key="${escapeAttr(r)}"><button type="button" class="row" data-key="${escapeAttr(r)}" bf="s3"><!--bf:s2-->${escapeText(r)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function RowPortalRefRemove(_p, __bfKey) { return createComponent('RowPortalRefRemove', _p, __bfKey) }
