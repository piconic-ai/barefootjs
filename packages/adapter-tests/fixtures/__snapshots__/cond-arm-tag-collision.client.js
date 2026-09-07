import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray, qsa } from '@barefootjs/client/runtime'


export function initCondArmTagCollision(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [items] = createSignal([{ id: 'x' }, { id: 'y' }])
  const [on, setOn] = createSignal(true)
  const toggle = () => setOn(v => !v)

  const [_s0, _s5, _s9] = $(__scope, 's0', 's5', 's9')

  if (_s0) _s0.addEventListener('click', toggle)
  mapArray(() => items(), _s5, (b, i) => String(b.id), (b, i, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(b().id)}" bf="s4">${on() ? `<b bf-c="s1" class="on">even <!--bf:s2-->${escapeText(i())}<!--/--></b>` : `<i bf-c="s1" class="off">odd <!--bf:s3-->${escapeText(i())}<!--/--></i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => on(), {
      template: () => { const __slots = []; return { html: `<b bf-c="s1" class="on">even <!--bf:s2-->${__bfSlot(i(), __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s1" class="off">odd <!--bf:s3-->${__bfSlot(i(), __slots)}<!--/--></i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    { const __rf_s4 = qsa(__el, '[bf="s4"]')
    if (__rf_s4) ((el) => {})?.(__rf_s4) }
    return __el
  }, 'l0')

  mapArray(() => items(), _s9, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}" bf="s8">${on() ? `<span bf-c="s6" class="t"><!--bf:s7-->${escapeText(item().id)}<!--/--></span>` : `<span bf-c="s6" class="t">none</span>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's6', () => on(), {
      template: () => { const __slots = []; return { html: `<span bf-c="s6" class="t"><!--bf:s7-->${__bfSlot(item().id, __slots)}<!--/--></span>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s7 = lazySlots(__branchScope, [{ id: 's7', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s7('s7', escapeTextOrNode(item().id)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<span bf-c="s6" class="t">none</span>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l1')

}

hydrate('CondArmTagCollision', { init: initCondArmTagCollision, template: (_p) => `<div><button type="button" class="toggle" bf="s0"> Toggle </button><ul class="eager" bf="s5"><!--bf-loop:l0-->${([{ id: 'x' }, { id: 'y' }]).map((b, i) => `<li data-key="${escapeAttr(b.id)}" bf="s4">${(true) ? `<b bf-c="s1" class="on">even <!--bf:s2-->${escapeText(i)}<!--/--></b>` : `<i bf-c="s1" class="off">odd <!--bf:s3-->${escapeText(i)}<!--/--></i>`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="lazy" bf="s9"><!--bf-loop:l1-->${([{ id: 'x' }, { id: 'y' }]).map((item) => `<li data-key="${escapeAttr(item.id)}" bf="s8">${(true) ? `<span bf-c="s6" class="t"><!--bf:s7-->${escapeText(item.id)}<!--/--></span>` : `<span bf-c="s6" class="t">none</span>`}</li>`).join('')}<!--bf-/loop:l1--></ul></div>` })
export function CondArmTagCollision(_p, __bfKey) { return createComponent('CondArmTagCollision', _p, __bfKey) }
