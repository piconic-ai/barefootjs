import { $, __bfSlot, createComponent, createDisposableEffect, createMemo, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray, mapArrayLazy, textOrNode } from '@barefootjs/client/runtime'

var fmt = fmt ?? ((ms) => `${ms / 1000}s`)
var fmtDecl = fmtDecl ?? function(ms) {
  return `${ms / 1000}s`
}

export function initKeyedRowBranchCall(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ])
  const [scale, setScale] = createSignal(1)
  const shown = createMemo(() => rows())

  const [_s0, _s1, _s3, _s6, _s9, _s12, _s15, _s18, _s22, _s25, _s28] = $(__scope, 's0', 's1', 's3', 's6', 's9', 's12', 's15', 's18', 's22', 's25', 's28')

  if (_s0) _s0.addEventListener('click', () => setRows(rows().map(r => ({ ...r, wait: r.wait * 3 + 250 }))))
  if (_s1) _s1.addEventListener('click', () => setScale(scale() * 2))
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><!--bf:s2--><!--/--></li>`
  const __lzp_l0 = [[0]]
  const __lzs_l0 = [{ id: 's2', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's2', kind: 'text', path: __lzp_l0[0] }]
  mapArrayLazy(() => rows(), _s3, (row) => String(row.id), {
    createRow: (__e, __idx) => {
      const row = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __x = fmt(row().wait)
      __r[0]('s2', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const row = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = fmt(row().wait)
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s2', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l0')

  mapArray(() => rows(), _s6, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s4-->${escapeText('0s')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4--><!--bf:s5-->${escapeText(fmt(row().wait))}<!--/--><!--bf-cond-end:s4-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's4', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s4-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4--><!--bf:s5-->${__bfSlot(fmt(row().wait), __slots)}<!--/--><!--bf-cond-end:s4-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s5 = lazySlots(__branchScope, [{ id: 's5', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s5('s5', escapeTextOrNode(fmt(row().wait))) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l1')

  mapArray(() => rows(), _s9, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s7-->${escapeText('0s')}<!--bf-cond-end:s7-->` : `<!--bf-cond-start:s7--><!--bf:s8-->${escapeText(`+${row().wait}`)}<!--/--><!--bf-cond-end:s7-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's7', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s7-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s7-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s7--><!--bf:s8-->${__bfSlot(`+${row().wait}`, __slots)}<!--/--><!--bf-cond-end:s7-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s8 = lazySlots(__branchScope, [{ id: 's8', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s8('s8', escapeTextOrNode(`+${row().wait}`)) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l2')

  mapArray(() => rows(), _s12, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s10-->${escapeText('0s')}<!--bf-cond-end:s10-->` : `<!--bf-cond-start:s10--><!--bf:s11-->${escapeText(`+${fmt(row().wait)}`)}<!--/--><!--bf-cond-end:s10-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's10', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s10-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s10-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s10--><!--bf:s11-->${__bfSlot(`+${fmt(row().wait)}`, __slots)}<!--/--><!--bf-cond-end:s10-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s11 = lazySlots(__branchScope, [{ id: 's11', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s11('s11', escapeTextOrNode(`+${fmt(row().wait)}`)) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l3')

  mapArray(() => rows(), _s15, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s13-->${escapeText('0s')}<!--bf-cond-end:s13-->` : `<!--bf-cond-start:s13--><!--bf:s14-->${escapeText(fmtDecl(row().wait))}<!--/--><!--bf-cond-end:s13-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's13', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s13-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s13-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s13--><!--bf:s14-->${__bfSlot(fmtDecl(row().wait), __slots)}<!--/--><!--bf-cond-end:s13-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s14 = lazySlots(__branchScope, [{ id: 's14', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s14('s14', escapeTextOrNode(fmtDecl(row().wait))) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l4')

  mapArray(() => rows(), _s18, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait > 0 ? `<!--bf-cond-start:s16--><!--bf:s17-->${escapeText(fmt(row().wait))}<!--/--><!--bf-cond-end:s16-->` : `<!--bf-cond-start:s16--><!--bf-cond-end:s16-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's16', () => row().wait > 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s16--><!--bf:s17-->${__bfSlot(fmt(row().wait), __slots)}<!--/--><!--bf-cond-end:s16-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s17 = lazySlots(__branchScope, [{ id: 's17', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s17('s17', escapeTextOrNode(fmt(row().wait))) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s16--><!--bf-cond-end:s16-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l5')

  mapArray(() => rows(), _s22, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s19-->${escapeText('0s')}<!--bf-cond-end:s19-->` : `<!--bf-cond-start:s19-->${row().wait > 9000 ? `<!--bf-cond-start:s20-->${escapeText('long')}<!--bf-cond-end:s20-->` : `<!--bf-cond-start:s20--><!--bf:s21-->${escapeText(fmt(row().wait))}<!--/--><!--bf-cond-end:s20-->`}<!--bf-cond-end:s19-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's19', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s19-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s19-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s19-->${row().wait > 9000 ? `<!--bf-cond-start:s20-->${__bfSlot('long', __slots)}<!--bf-cond-end:s20-->` : `<!--bf-cond-start:s20--><!--bf:s21-->${__bfSlot(fmt(row().wait), __slots)}<!--/--><!--bf-cond-end:s20-->`}<!--bf-cond-end:s19-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        __disposers.push(createDisposableEffect(() => {
          insert(__branchScope, 's20', () => row().wait > 9000, {
            template: () => { const __slots = []; return { html: `<!--bf-cond-start:s20-->${__bfSlot('long', __slots)}<!--bf-cond-end:s20-->`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          }, {
            template: () => { const __slots = []; return { html: `<!--bf-cond-start:s20--><!--bf:s21-->${__bfSlot(fmt(row().wait), __slots)}<!--/--><!--bf-cond-end:s20-->`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
              const __disposers = []
              const __bfw_s21 = lazySlots(__branchScope, [{ id: 's21', kind: 'markup', path: [] }])
              __disposers.push(createDisposableEffect(() => { __bfw_s21('s21', escapeTextOrNode(fmt(row().wait))) }))
              return () => __disposers.forEach(d => d())
            }
          })
        }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l6')

  mapArray(() => shown(), _s25, ({ id, wait }, i) => String(id), (__bfItem, i, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(__bfItem().id)}">${__bfItem().wait === 0 ? `<!--bf-cond-start:s23-->${escapeText('0s')}<!--bf-cond-end:s23-->` : `<!--bf-cond-start:s23--><!--bf:s24-->${escapeText(fmt(__bfItem().wait + i()))}<!--/--><!--bf-cond-end:s23-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's23', () => __bfItem().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s23-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s23-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s23--><!--bf:s24-->${__bfSlot(fmt(__bfItem().wait + i()), __slots)}<!--/--><!--bf-cond-end:s23-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s24 = lazySlots(__branchScope, [{ id: 's24', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s24('s24', escapeTextOrNode(fmt(__bfItem().wait + i()))) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l7')

  mapArray(() => rows(), _s28, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().wait === 0 ? `<!--bf-cond-start:s26-->${escapeText('0s')}<!--bf-cond-end:s26-->` : `<!--bf-cond-start:s26--><!--bf:s27-->${escapeText(fmt(row().wait * scale()))}<!--/--><!--bf-cond-end:s26-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's26', () => row().wait === 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s26-->${__bfSlot('0s', __slots)}<!--bf-cond-end:s26-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s26--><!--bf:s27-->${__bfSlot(fmt(row().wait * scale()), __slots)}<!--/--><!--bf-cond-end:s26-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s27 = lazySlots(__branchScope, [{ id: 's27', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s27('s27', escapeTextOrNode(fmt(row().wait * scale()))) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l8')

}

hydrate('KeyedRowBranchCall', { init: initKeyedRowBranchCall, template: (_p) => `<div><button type="button" class="slower" bf="s0">slower</button><button type="button" class="scale" bf="s1">scale</button><ol class="plain" bf="s3"><!--bf-loop:l0-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}"><!--bf:s2-->${escapeText((((((((fmt)))))))(row.wait))}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ol><ol class="tern-call" bf="s6"><!--bf-loop:l1-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s4-->${escapeText('0s')}<!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4--><!--bf:s5-->${escapeText((((((((fmt)))))))(row.wait))}<!--/--><!--bf-cond-end:s4-->`}</li>`).join('')}<!--bf-/loop:l1--></ol><ol class="tern-nocall" bf="s9"><!--bf-loop:l2-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s7-->${escapeText('0s')}<!--bf-cond-end:s7-->` : `<!--bf-cond-start:s7--><!--bf:s8-->${escapeText(`+${row.wait}`)}<!--/--><!--bf-cond-end:s7-->`}</li>`).join('')}<!--bf-/loop:l2--></ol><ol class="tern-template" bf="s12"><!--bf-loop:l3-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s10-->${escapeText('0s')}<!--bf-cond-end:s10-->` : `<!--bf-cond-start:s10--><!--bf:s11-->${escapeText(`+${(((((((fmt)))))))(row.wait)}`)}<!--/--><!--bf-cond-end:s10-->`}</li>`).join('')}<!--bf-/loop:l3--></ol><ol class="tern-declaration" bf="s15"><!--bf-loop:l4-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s13-->${escapeText('0s')}<!--bf-cond-end:s13-->` : `<!--bf-cond-start:s13--><!--bf:s14-->${escapeText(fmtDecl(row.wait))}<!--/--><!--bf-cond-end:s13-->`}</li>`).join('')}<!--bf-/loop:l4--></ol><ol class="logical-and" bf="s18"><!--bf-loop:l5-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait > 0 ? `<!--bf-cond-start:s16--><!--bf:s17-->${escapeText((((((((fmt)))))))(row.wait))}<!--/--><!--bf-cond-end:s16-->` : `<!--bf-cond-start:s16--><!--bf-cond-end:s16-->`}</li>`).join('')}<!--bf-/loop:l5--></ol><ol class="nested" bf="s22"><!--bf-loop:l6-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s19-->${escapeText('0s')}<!--bf-cond-end:s19-->` : `<!--bf-cond-start:s19-->${row.wait > 9000 ? `<!--bf-cond-start:s20-->${escapeText('long')}<!--bf-cond-end:s20-->` : `<!--bf-cond-start:s20--><!--bf:s21-->${escapeText((((((((fmt)))))))(row.wait))}<!--/--><!--bf-cond-end:s20-->`}<!--bf-cond-end:s19-->`}</li>`).join('')}<!--bf-/loop:l6--></ol><ol class="memo-destructured" bf="s25"><!--bf-loop:l7-->${(([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ])).map(({ id, wait }, i) => `<li data-key="${escapeAttr(id)}">${wait === 0 ? `<!--bf-cond-start:s23-->${escapeText('0s')}<!--bf-cond-end:s23-->` : `<!--bf-cond-start:s23--><!--bf:s24-->${escapeText((((((((fmt)))))))(wait + i))}<!--/--><!--bf-cond-end:s23-->`}</li>`).join('')}<!--bf-/loop:l7--></ol><ol class="signal-in-call" bf="s28"><!--bf-loop:l8-->${([
    { id: 1, wait: 0 },
    { id: 2, wait: 500 },
    { id: 3, wait: 2000 },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.wait === 0 ? `<!--bf-cond-start:s26-->${escapeText('0s')}<!--bf-cond-end:s26-->` : `<!--bf-cond-start:s26--><!--bf:s27-->${escapeText((((((((fmt)))))))(row.wait * (1)))}<!--/--><!--bf-cond-end:s26-->`}</li>`).join('')}<!--bf-/loop:l8--></ol></div>` })
export function KeyedRowBranchCall(_p, __bfKey) { return createComponent('KeyedRowBranchCall', _p, __bfKey) }
