import { $, __bfSlot, createComponent, createDisposableEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArray, qsa } from '@barefootjs/client/runtime'


export function initKeyedRowBranchMethodCall(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 1, label: 'ada', done: true },
    { id: 2, label: 'bob', done: false },
    { id: 3, label: 'cy', done: true },
  ])

  const [_s0, _s3, _s6, _s10] = $(__scope, 's0', 's3', 's6', 's10')

  if (_s0) _s0.addEventListener('click', () => setRows(rows().map(r => ({ ...r, label: `${r.label}-x` }))))
  mapArray(() => rows(), _s3, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().done ? `<!--bf-cond-start:s1--><!--bf:s2-->${escapeText(row().label.toUpperCase())}<!--/--><!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('pending')}<!--bf-cond-end:s1-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => row().done, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><!--bf:s2-->${__bfSlot(row().label.toUpperCase(), __slots)}<!--/--><!--bf-cond-end:s1-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s2 = lazySlots(__branchScope, [{ id: 's2', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s2('s2', escapeTextOrNode(row().label.toUpperCase())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('pending', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

  mapArray(() => rows(), _s6, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().done ? `<!--bf-cond-start:s4--><!--bf:s5-->${escapeText(String(row().label))}<!--/--><!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${escapeText('pending')}<!--bf-cond-end:s4-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's4', () => row().done, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4--><!--bf:s5-->${__bfSlot(String(row().label), __slots)}<!--/--><!--bf-cond-end:s4-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s5 = lazySlots(__branchScope, [{ id: 's5', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s5('s5', escapeTextOrNode(String(row().label))) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s4-->${__bfSlot('pending', __slots)}<!--bf-cond-end:s4-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l1')

  mapArray(() => rows(), _s10, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().done ? `<b bf-c="s7" ${(row().label.toUpperCase()) != null ? 'title="' + escapeAttr(row().label.toUpperCase()) + '"' : ''} bf="s9"><!--bf:s8-->${escapeText(row().label.toUpperCase())}<!--/--></b>` : `<!--bf-cond-start:s7--><!--bf-cond-end:s7-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's7', () => row().done, {
      template: () => { const __slots = []; return { html: `<b bf-c="s7" ${(row().label.toUpperCase()) != null ? 'title="' + escapeAttr(row().label.toUpperCase()) + '"' : ''} bf="s9"><!--bf:s8-->${__bfSlot(row().label.toUpperCase(), __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        { const __ra_s9 = qsa(__branchScope, '[bf="s9"]')
        const __l = []
        if (__ra_s9) {
          __disposers.push(createDisposableEffect(() => {
            { const __x = row().label.toUpperCase()
            if (!(0 in __l) || !Object.is(__l[0], __x)) {
              { const __v = __x; if (__v != null) __ra_s9.setAttribute('title', String(__v)); else __ra_s9.removeAttribute('title') }
            }
            __l[0] = __x }
          }))
        } }
        const __bfw_s8 = lazySlots(__branchScope, [{ id: 's8', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s8('s8', escapeTextOrNode(row().label.toUpperCase())) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s7--><!--bf-cond-end:s7-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l2')

}

hydrate('KeyedRowBranchMethodCall', { init: initKeyedRowBranchMethodCall, template: (_p) => `<div><button type="button" class="rename" bf="s0">rename</button><ul class="method" bf="s3"><!--bf-loop:l0-->${([
    { id: 1, label: 'ada', done: true },
    { id: 2, label: 'bob', done: false },
    { id: 3, label: 'cy', done: true },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.done ? `<!--bf-cond-start:s1--><!--bf:s2-->${escapeText(row.label.toUpperCase())}<!--/--><!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('pending')}<!--bf-cond-end:s1-->`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="global" bf="s6"><!--bf-loop:l1-->${([
    { id: 1, label: 'ada', done: true },
    { id: 2, label: 'bob', done: false },
    { id: 3, label: 'cy', done: true },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.done ? `<!--bf-cond-start:s4--><!--bf:s5-->${escapeText(String(row.label))}<!--/--><!--bf-cond-end:s4-->` : `<!--bf-cond-start:s4-->${escapeText('pending')}<!--bf-cond-end:s4-->`}</li>`).join('')}<!--bf-/loop:l1--></ul><ul class="element" bf="s10"><!--bf-loop:l2-->${([
    { id: 1, label: 'ada', done: true },
    { id: 2, label: 'bob', done: false },
    { id: 3, label: 'cy', done: true },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}">${row.done ? `<b bf-c="s7" ${(row.label.toUpperCase()) != null ? 'title="' + escapeAttr(row.label.toUpperCase()) + '"' : ''} bf="s9"><!--bf:s8-->${escapeText(row.label.toUpperCase())}<!--/--></b>` : `<!--bf-cond-start:s7--><!--bf-cond-end:s7-->`}</li>`).join('')}<!--bf-/loop:l2--></ul></div>` })
export function KeyedRowBranchMethodCall(_p, __bfKey) { return createComponent('KeyedRowBranchMethodCall', _p, __bfKey) }
