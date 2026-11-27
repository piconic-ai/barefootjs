import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray, mountRowRoot, qsa } from '@barefootjs/client/runtime'

var isOn = isOn ?? ((r) => r.kind === 'on')

export function initStaticLoopRowClientConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const rows = [
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]
  const groups = [
  { id: 'g1', sizes: [1, 2] },
  { id: 'g2', sizes: [3] },
]
  const [n, setN] = createSignal(0)

  const [_s0, _s2, _s5, _s9, _s13, _s16] = $(__scope, 's0', 's2', 's5', 's9', 's13', 's16')

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  mapArray(() => rows, _s2, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s1">on</b>` : `<i bf-c="s1">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><b>on</b><!--bf-cond-end:s1-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><i>off</i><!--bf-cond-end:s1-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

  mapArray(() => groups, _s5, (g) => String(g.id), (g, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<p data-key="${escapeAttr(g().id)}" bf="s4"><!--bf-loop:l1-->${g().sizes.map((z) => `<span data-key-1="${escapeAttr(z)}">${z > 1 ? `<b bf-c="s3">big</b>` : `<i bf-c="s3">small</i>`}</span>`).join('')}<!--bf-/loop:l1--></p>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: g.sizes
    { const __ic1_0 = qsa(__el, '[bf="s4"]')
    if (__ic1_0) mapArray(() => g().sizes || [], __ic1_0, (z) => String(z), (z, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<span data-key-1="${escapeAttr(z())}">${z() > 1 ? `<b bf-c="s3">big</b>` : `<i bf-c="s3">small</i>`}</span>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(z()))
      insert(__innerEl1_0, 's3', () => z() > 1, {
        template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><b>big</b><!--bf-cond-end:s3-->`, slots: __slots } },
        bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        }
      }, {
        template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><i>small</i><!--bf-cond-end:s3-->`, slots: __slots } },
        bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        }
      })
      return __innerEl1_0
    }, 'l1', undefined, "data-key-1") }
    return __el
  }, 'l2')

  mapArray(() => rows, _s9, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s6" bf="s8"><!--bf:s7-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s6">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's6', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s6--><b bf="s8"><!--bf:s7-->${__bfSlot('n=' + n(), __slots)}<!--/--></b><!--bf-cond-end:s6-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s7 = lazySlots(__branchScope, [{ id: 's7', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s7('s7', escapeTextOrNode('n=' + n())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s6--><i>off</i><!--bf-cond-end:s6-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l3')

  mapArray(() => rows, _s13, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${isOn(r()) ? `<b bf-c="s10" bf="s12"><!--bf:s11-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s10">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's10', () => isOn(r()), {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s10--><b bf="s12"><!--bf:s11-->${__bfSlot('n=' + n(), __slots)}<!--/--></b><!--bf-cond-end:s10-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s11 = lazySlots(__branchScope, [{ id: 's11', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s11('s11', escapeTextOrNode('n=' + n())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s10--><i>off</i><!--bf-cond-end:s10-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l4')

  mapArray(() => rows, _s16, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}" bf="s15">${n() > 0 && r().kind === 'on' ? `<b bf-c="s14">on</b>` : `<i bf-c="s14">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's14', () => n() > 0 && r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s14--><b>on</b><!--bf-cond-end:s14-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s14--><i>off</i><!--bf-cond-end:s14-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l5')

}

hydrate('StaticLoopRowClientConditional', { init: initStaticLoopRowClientConditional, template: (_p) => `${((__bf_const_rows, __bf_const_groups) => `<div><button type="button" class="inc" bf="s0">inc</button><ul class="literal" bf="s2"><!--bf-loop:l0-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s1--><!--bf-cond-end:s1--></li>`).join('')}<!--bf-/loop:l0--></ul><div class="nested" bf="s5"><!--bf-loop:l2-->${(__bf_const_groups).map((g) => `<p data-key="${escapeAttr(g.id)}" bf="s4"><!--bf-loop:l1-->${g.sizes.map((z) => `<span data-key-1="${escapeAttr(z)}"><!--bf-cond-start:s3--><!--bf-cond-end:s3--></span>`).join('')}<!--bf-/loop:l1--></p>`).join('')}<!--bf-/loop:l2--></div><ul class="inline" bf="s9"><!--bf-loop:l3-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s6--><!--bf-cond-end:s6--></li>`).join('')}<!--bf-/loop:l3--></ul><ul class="helper" bf="s13"><!--bf-loop:l4-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}"><!--bf-cond-start:s10--><!--bf-cond-end:s10--></li>`).join('')}<!--bf-/loop:l4--></ul><ul class="signal" bf="s16"><!--bf-loop:l5-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}" bf="s15"><!--bf-cond-start:s14--><!--bf-cond-end:s14--></li>`).join('')}<!--bf-/loop:l5--></ul></div>`)(([
  { id: 'a', kind: 'on' },
  { id: 'b', kind: 'off' },
]), ([
  { id: 'g1', sizes: [1, 2] },
  { id: 'g2', sizes: [3] },
]))}` })
export function StaticLoopRowClientConditional(_p, __bfKey) { return createComponent('StaticLoopRowClientConditional', _p, __bfKey) }
