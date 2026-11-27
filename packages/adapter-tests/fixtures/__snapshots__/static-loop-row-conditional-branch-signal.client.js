import { $, __bfSlot, createComponent, createDisposableEffect, createMemo, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray, qsa } from '@barefootjs/client/runtime'


export function initStaticLoopRowConditionalBranchSignal(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const rows = [
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]
  const [n, setN] = createSignal(0)
  const doubled = createMemo(() => n() * 2)

  const [_s0, _s4, _s7, _s11, _s15, _s19, _s22, _s25, _s27] = $(__scope, 's0', 's4', 's7', 's11', 's15', 's19', 's22', 's25', 's27')

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  mapArray(() => rows, _s4, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s1" bf="s3"><!--bf:s2-->${escapeText('n=' + n())}<!--/--></b>` : `<i bf-c="s1">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<b bf-c="s1" bf="s3"><!--bf:s2-->${__bfSlot('n=' + n(), __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s2 = lazySlots(__branchScope, [{ id: 's2', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s2('s2', escapeTextOrNode('n=' + n())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s1">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

  mapArray(() => rows, _s7, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s5" ${('n=' + n()) != null ? 'title="' + escapeAttr('n=' + n()) + '"' : ''} bf="s6">attr</b>` : `<i bf-c="s5">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's5', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<b bf-c="s5" ${('n=' + n()) != null ? 'title="' + escapeAttr('n=' + n()) + '"' : ''} bf="s6">attr</b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        { const __ra_s6 = qsa(__branchScope, '[bf="s6"]')
        const __l = []
        if (__ra_s6) {
          __disposers.push(createDisposableEffect(() => {
            { const __x = 'n=' + n()
            if (!(0 in __l) || !Object.is(__l[0], __x)) {
              { const __v = __x; if (__v != null) __ra_s6.setAttribute('title', String(__v)); else __ra_s6.removeAttribute('title') }
            }
            __l[0] = __x }
          }))
        } }
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s5">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l1')

  mapArray(() => rows, _s11, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s8">on</b>` : `<i bf-c="s8" bf="s10"><!--bf:s9-->${escapeText('off ' + n())}<!--/--></i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's8', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<b bf-c="s8">on</b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s8" bf="s10"><!--bf:s9-->${__bfSlot('off ' + n(), __slots)}<!--/--></i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s9 = lazySlots(__branchScope, [{ id: 's9', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s9('s9', escapeTextOrNode('off ' + n())) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l2')

  mapArray(() => rows, _s15, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s12" bf="s14"><!--bf:s13-->${escapeText('d=' + doubled())}<!--/--></b>` : `<i bf-c="s12">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's12', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<b bf-c="s12" bf="s14"><!--bf:s13-->${__bfSlot('d=' + doubled(), __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s13 = lazySlots(__branchScope, [{ id: 's13', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s13('s13', escapeTextOrNode('d=' + doubled())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s12">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l3')

  mapArray(() => rows, _s19, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<b bf-c="s16" bf="s18"><!--bf:s17-->${escapeText(_p.label ?? 'none')}<!--/--></b>` : `<i bf-c="s16">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's16', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<b bf-c="s16" bf="s18"><!--bf:s17-->${__bfSlot(_p.label ?? 'none', __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s17 = lazySlots(__branchScope, [{ id: 's17', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s17('s17', escapeTextOrNode(_p.label ?? 'none')) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s16">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l4')

  mapArray(() => rows, _s22, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<!--bf-cond-start:s20-->${n() > 0 ? `<b bf-c="s21">some</b>` : `<em bf-c="s21">zero</em>`}<!--bf-cond-end:s20-->` : `<i bf-c="s20">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's20', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s20-->${n() > 0 ? `<b bf-c="s21">some</b>` : `<em bf-c="s21">zero</em>`}<!--bf-cond-end:s20-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        __disposers.push(createDisposableEffect(() => {
          insert(__branchScope, 's21', () => n() > 0, {
            template: () => { const __slots = []; return { html: `<b bf-c="s21">some</b>`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          }, {
            template: () => { const __slots = []; return { html: `<em bf-c="s21">zero</em>`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          })
        }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s20">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l5')

  mapArray(() => rows, _s25, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}">${r().kind === 'on' ? `<button bf-c="s23" type="button" class="add" bf="s24">add</button>` : `<i bf-c="s23">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's23', () => r().kind === 'on', {
      template: () => { const __slots = []; return { html: `<button bf-c="s23" type="button" class="add" bf="s24">add</button>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        { const _s24 = qsa(__branchScope, '[bf="s24"]')
          if (_s24) _s24.addEventListener('click', () => setN(n() + 10))
        }
      }
    }, {
      template: () => { const __slots = []; return { html: `<i bf-c="s23">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l6')

}

hydrate('StaticLoopRowConditionalBranchSignal', { init: initStaticLoopRowConditionalBranchSignal, template: (_p) => `${((__bf_const_rows) => `<div><button type="button" class="inc" bf="s0">inc</button><ul class="text" bf="s4"><!--bf-loop:l0-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s1" bf="s3"><!--bf:s2-->${escapeText('n=' + (0))}<!--/--></b>` : `<i bf-c="s1">off</i>`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="attr" bf="s7"><!--bf-loop:l1-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s5" ${('n=' + (0)) != null ? 'title="' + escapeAttr('n=' + (0)) + '"' : ''} bf="s6">attr</b>` : `<i bf-c="s5">off</i>`}</li>`).join('')}<!--bf-/loop:l1--></ul><ul class="else" bf="s11"><!--bf-loop:l2-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s8">on</b>` : `<i bf-c="s8" bf="s10"><!--bf:s9-->${escapeText('off ' + (0))}<!--/--></i>`}</li>`).join('')}<!--bf-/loop:l2--></ul><ul class="memo" bf="s15"><!--bf-loop:l3-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s12" bf="s14"><!--bf:s13-->${escapeText('d=' + ((0) * 2))}<!--/--></b>` : `<i bf-c="s12">off</i>`}</li>`).join('')}<!--bf-/loop:l3--></ul><ul class="prop" bf="s19"><!--bf-loop:l4-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s16" bf="s18"><!--bf:s17-->${escapeText(_p.label ?? 'none')}<!--/--></b>` : `<i bf-c="s16">off</i>`}</li>`).join('')}<!--bf-/loop:l4--></ul><ul class="nested" bf="s22"><!--bf-loop:l5-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<!--bf-cond-start:s20-->${(0) > 0 ? `<b bf-c="s21">some</b>` : `<em bf-c="s21">zero</em>`}<!--bf-cond-end:s20-->` : `<i bf-c="s20">off</i>`}</li>`).join('')}<!--bf-/loop:l5--></ul><ul class="event" bf="s25"><!--bf-loop:l6-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<button bf-c="s23" type="button" class="add" bf="s24">add</button>` : `<i bf-c="s23">off</i>`}</li>`).join('')}<!--bf-/loop:l6--></ul><ul class="static" bf="s27"><!--bf-loop:l7-->${(__bf_const_rows).map((r) => `<li data-key="${escapeAttr(r.id)}">${r.kind === 'on' ? `<b bf-c="s26">on</b>` : `<i bf-c="s26">off</i>`}</li>`).join('')}<!--bf-/loop:l7--></ul></div>`)(([
    { id: 'a', kind: 'on' },
    { id: 'b', kind: 'off' },
  ]))}` })
export function StaticLoopRowConditionalBranchSignal(_p, __bfKey) { return createComponent('StaticLoopRowConditionalBranchSignal', _p, __bfKey) }
