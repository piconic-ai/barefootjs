import { $, __bfSlot, adoptRowPortal, claimRowPortals, createComponent, createDisposableEffect, createEffect, createPortal, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, isRowPortalOf, lazySlots, mapArray, qsaItem, relayRowPortalEvents } from '@barefootjs/client/runtime'


export function initRowPortalRefBranch(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(true)
  const [last, setLast] = createSignal('none')
  const mountContent = (el) => {
    if (el.parentNode !== document.body) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s0, _s3] = $(__scope, 's0', 's3')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  insert(__scope, 's3', () => open(), {
    template: () => { const __slots = []; return { html: `<ul bf-c="s3" bf="s6"><!--bf-loop:l0-->${_p.rows.map((r) => `<li data-key="${escapeAttr(r)}"><button type="button" class="row" data-key="${escapeAttr(r)}" bf="s5"><!--bf:s4-->${__bfSlot(r, __slots)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const [__loop_s6] = $(__branchScope, 's6')
      __disposers.push(createDisposableEffect(() => {
        if (__loop_s6) mapArray(() => _p.rows, __loop_s6, (r) => String(r), (r, __idx, __existing) => {
          const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r())}"><button type="button" class="row" data-key="${escapeAttr(r())}" bf="s5"><!--bf:s4-->${escapeText(r())}<!--/--></button></li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
          if (__existing) claimRowPortals(__existing, __scopeId, ["s5"], __loop_s6)
          const __bfw_s4 = lazySlots(__el, [{ id: 's4', kind: 'text', path: [] }])
          createEffect(() => { __bfw_s4('s4', String(r())) })
          { const __rf_s5 = qsaItem(__el, '[bf="s5"]')
          if (__rf_s5) { { (mountContent)(__rf_s5); if (__scopeId) __rf_s5.setAttribute('bf-po', __scopeId) }; adoptRowPortal(__el, __rf_s5, __loop_s6) } }
          return __el
        }, 'l0')
      }))
  if (__loop_s6) {
  const __bfDl = (__bfEvt) => {
    const target = __bfEvt.target
    const s5El = target.closest('[bf="s5"]')
    if (s5El && (__loop_s6.contains(s5El) || isRowPortalOf(s5El, __loop_s6))) {
      const li = s5El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const r = _p.rows.find(item => String(item) === key)
        if (r) {
          ;(() => setLast(r))(__bfEvt)
        }
      }
      return
    }
  }
  __loop_s6.addEventListener('click', __bfDl)
  relayRowPortalEvents(__loop_s6, 'click', __bfDl)
  }

      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('click', () => { setOpen(o => !o) })
}

hydrate('RowPortalRefBranch', { init: initRowPortalRefBranch, template: (_p) => `<div bf="s7"><button type="button" class="toggle" bf="s0">toggle</button><p class="last" bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('none'))}<!--/--></p>${(true) ? `<ul bf-c="s3" bf="s6"><!--bf-loop:l0-->${_p.rows.map((r) => `<li data-key="${escapeAttr(r)}"><button type="button" class="row" data-key="${escapeAttr(r)}" bf="s5"><!--bf:s4-->${escapeText(r)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul>` : `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`}</div>` })
export function RowPortalRefBranch(_p, __bfKey) { return createComponent('RowPortalRefBranch', _p, __bfKey) }
