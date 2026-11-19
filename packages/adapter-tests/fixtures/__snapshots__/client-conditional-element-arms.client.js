import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray } from '@barefootjs/client/runtime'


export function initClientConditionalElementArms(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(0)
  const [rows] = createSignal([
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ])

  const [_s0, _s8] = $(__scope, 's0', 's8')

  // @client conditional: s1
  insert(__scope, 's1', () => n() > 0, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><b bf="s3"><!--bf:s2-->${__bfSlot('n=' + n(), __slots)}<!--/--></b><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const __bfw_s2 = lazySlots(__branchScope, [{ id: 's2', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s2('s2', escapeTextOrNode('n=' + n())) }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><i>off</i><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  mapArray(() => rows(), _s8, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s5" bf="s7"><!--bf:s6-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s5">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's5', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><b bf="s7"><!--bf:s6-->${__bfSlot('n=' + n(), __slots)}<!--/--></b><!--bf-cond-end:s5-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s6 = lazySlots(__branchScope, [{ id: 's6', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s6('s6', escapeTextOrNode('n=' + n())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><i>off</i><!--bf-cond-end:s5-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

}

hydrate('ClientConditionalElementArms', { init: initClientConditionalElementArms, template: (_p) => `<div><button type="button" class="inc" bf="s0">inc</button><p class="top" bf="s4"><!--bf-cond-start:s1--><!--bf-cond-end:s1--></p><ul class="rows" bf="s8"><!--bf-loop:l0-->${([
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s5--><!--bf-cond-end:s5--></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function ClientConditionalElementArms(_p, __bfKey) { return createComponent('ClientConditionalElementArms', _p, __bfKey) }
