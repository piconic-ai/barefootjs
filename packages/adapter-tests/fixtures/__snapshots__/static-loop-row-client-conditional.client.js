import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray } from '@barefootjs/client/runtime'

var isOn = isOn ?? ((r) => r.kind === 'on')

export function initStaticLoopRowClientConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const rows = [
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]
  const [n, setN] = createSignal(0)

  const [_s0, _s4, _s8, _s11] = $(__scope, 's0', 's4', 's8', 's11')

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  mapArray(() => rows, _s4, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s1" bf="s3"><!--bf:s2-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s1">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => r().kind === 'on', {
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
    return __el
  }, 'l0')

  mapArray(() => rows, _s8, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${isOn(r()) ? `<b bf-c="s5" bf="s7"><!--bf:s6-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s5">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's5', () => isOn(r()), {
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
  }, 'l1')

  mapArray(() => rows, _s11, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}" bf="s10">${n() > 0 && r().kind === 'on' ? `<b bf-c="s9">on</b>` : `<i bf-c="s9">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's9', () => n() > 0 && r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s9--><b>on</b><!--bf-cond-end:s9-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s9--><i>off</i><!--bf-cond-end:s9-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l2')

}

hydrate('StaticLoopRowClientConditional', { init: initStaticLoopRowClientConditional, template: (_p) => `<div><button type="button" class="inc" bf="s0">inc</button><ul class="inline" bf="s4"><!--bf-loop:l0-->${([
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s1--><!--bf-cond-end:s1--></li>`).join('')}<!--bf-/loop:l0--></ul><ul class="helper" bf="s8"><!--bf-loop:l1-->${([
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s5--><!--bf-cond-end:s5--></li>`).join('')}<!--bf-/loop:l1--></ul><ul class="signal" bf="s11"><!--bf-loop:l2-->${([
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]).map((r) => `<li data-key="${escapeAttr(r.id)}" bf="s10"><!--bf-cond-start:s9--><!--bf-cond-end:s9--></li>`).join('')}<!--bf-/loop:l2--></ul></div>` })
export function StaticLoopRowClientConditional(_p, __bfKey) { return createComponent('StaticLoopRowClientConditional', _p, __bfKey) }
