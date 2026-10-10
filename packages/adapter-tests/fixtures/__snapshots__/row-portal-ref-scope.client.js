import { $, adoptRowPortal, claimRowPortals, createComponent, createEffect, createPortal, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, isRowPortalOf, lazySlots, mapArray, qsaItem, relayRowPortalEvents } from '@barefootjs/client/runtime'


export function initRowPortalRefScope(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [last, setLast] = createSignal('none')
  const mountContent = (el) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s5, _s8] = $(__scope, 's5', 's8')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><button type="button" class="row" data-key="" bf="s4"><!--bf:s2--><!--/-->:<!--bf:s3--><!--/--></button></li>`
  mapArray(() => _p.rows, _s5, (r, i) => String(r.id), (r, i, __existing) => {
    const __el = __existing ?? __tpl_l0.content.firstElementChild.cloneNode(true)
    if (__existing) claimRowPortals(__existing, __scopeId, ["s4"], _s5)
    const __p = __existing ? null : [__el.firstChild]
    const __ra_s4 = __p ? __p[0] : qsaItem(__el, '[bf="s4"]')
    const __l = []
    const __bfw_s2 = lazySlots(__el, [{ id: 's2', kind: 'text', path: __existing ? [] : [0, 0] }, { id: 's3', kind: 'text', path: __existing ? [] : [0, 3] }])
    createEffect(() => {
      if (__ra_s4) {
        { const __x = i()
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          { const __v = __x; if (__v != null) __ra_s4.setAttribute('data-index', String(__v)); else __ra_s4.removeAttribute('data-index') }
        }
        __l[0] = __x }
        { const __x = _p.prefix
        if (!(1 in __l) || !Object.is(__l[1], __x)) {
          { const __v = __x; if (__v != null) __ra_s4.setAttribute('title', String(__v)); else __ra_s4.removeAttribute('title') }
        }
        __l[1] = __x }
      }
      __bfw_s2('s2', String(i()))
      __bfw_s2('s3', String(r().label))
    })
    { const __rf_s4 = __p ? __p[0] : qsaItem(__el, '[bf="s4"]')
    if (__rf_s4) { { (mountContent)(__rf_s4); if (__scopeId) __rf_s4.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__el, __rf_s4, _s5) } }
    return __el
  }, 'l0')

  if (_s5) {
  const __bfDl = (__bfEvt) => {
    const target = __bfEvt.target
    const s4El = target.closest('[bf="s4"]')
    if (s4El && (_s5.contains(s4El) || isRowPortalOf(s4El, _s5))) {
      const li = s4El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const r = _p.rows.find(item => String(item.id) === key)
        if (r) {
          ;(() => setLast(r.label))(__bfEvt)
        }
      }
      return
    }
  }
  _s5.addEventListener('click', __bfDl)
  relayRowPortalEvents(_s5, 'click', __bfDl)
  }

  const __tpl_l1 = document.createElement('template')
  __tpl_l1.innerHTML = `<li data-key=""><button type="button" class="num" data-key="" bf="s7"><!--bf:s6--><!--/--></button></li>`
  mapArray(() => _p.nums, _s8, (n) => String(n), (n, __idx, __existing) => {
    const __el = __existing ?? __tpl_l1.content.firstElementChild.cloneNode(true)
    if (__existing) claimRowPortals(__existing, __scopeId, ["s7"], _s8)
    const __p = __existing ? null : [__el.firstChild]
    const __bfw_s6 = lazySlots(__el, [{ id: 's6', kind: 'text', path: __existing ? [] : [0, 0] }])
    createEffect(() => { __bfw_s6('s6', String(n())) })
    { const __rf_s7 = __p ? __p[0] : qsaItem(__el, '[bf="s7"]')
    if (__rf_s7) { { (mountContent)(__rf_s7); if (__scopeId) __rf_s7.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__el, __rf_s7, _s8) } }
    return __el
  }, 'l1')

  if (_s8) {
  const __bfDl = (__bfEvt) => {
    const target = __bfEvt.target
    const s7El = target.closest('[bf="s7"]')
    if (s7El && (_s8.contains(s7El) || isRowPortalOf(s7El, _s8))) {
      const li = s7El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const n = _p.nums.find(item => String(item) === key)
        if (n) {
          ;(() => setLast(String(n)))(__bfEvt)
        }
      }
      return
    }
  }
  _s8.addEventListener('click', __bfDl)
  relayRowPortalEvents(_s8, 'click', __bfDl)
  }

}

hydrate('RowPortalRefScope', { init: initRowPortalRefScope, template: (_p) => `<div><p class="last" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><ul bf="s5"><!--bf-loop:l0-->${_p.rows.map((r, i) => `<li data-key="${escapeAttr(r.id)}"><button type="button" class="row" ${(i) != null ? 'data-index="' + escapeAttr(i) + '"' : ''} ${(_p.prefix) != null ? 'title="' + escapeAttr(_p.prefix) + '"' : ''} data-key="${escapeAttr(r.id)}" bf="s4"><!--bf:s2-->${escapeText(i)}<!--/-->:<!--bf:s3-->${escapeText(r.label)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul><ol bf="s8"><!--bf-loop:l1-->${_p.nums.map((n) => `<li data-key="${escapeAttr(n)}"><button type="button" class="num" data-key="${escapeAttr(n)}" bf="s7"><!--bf:s6-->${escapeText(n)}<!--/--></button></li>`).join('')}<!--bf-/loop:l1--></ol></div>` })
export function RowPortalRefScope(_p, __bfKey) { return createComponent('RowPortalRefScope', _p, __bfKey) }
