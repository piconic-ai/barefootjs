import { $, __bfSlot, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, escapeText, hydrate, insert, lazySlots, mapArray, qsa } from '@barefootjs/client/runtime'


export function initKeyedRowBranchPreamble(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [byItem, setByItem] = createSignal([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  const [byAttr, setByAttr] = createSignal([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])
  const [byNested, setByNested] = createSignal([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])

  const [_s0, _s1, _s2, _s6, _s10, _s16] = $(__scope, 's0', 's1', 's2', 's6', 's10', 's16')

  if (_s0) _s0.addEventListener('click', () => setByItem(byItem().map(r => ({ ...r, on: !r.on, name: `${r.name}z` }))))
  if (_s1) _s1.addEventListener('click', () => setByAttr(byAttr().map(r => ({ ...r, on: !r.on, name: `${r.name}z` }))))
  if (_s2) _s2.addEventListener('click', () => setByNested(byNested().map(r => ({ ...r, on: !r.on, name: `${r.name}z` }))))
  mapArray(() => byItem(), _s6, (row) => String(row.id), (row, __idx, __existing) => {
    const label = '[' + row().name + ']';
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().on ? `<b bf-c="s3"><!--bf:s4-->${escapeText(label)}<!--/--></b>` : `<i bf-c="s3"><!--bf:s5-->${escapeText(label)}<!--/--></i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __bfw_s4 = lazySlots(__el, [{ id: 's4', kind: 'markup', path: [] }, { id: 's5', kind: 'markup', path: [] }])
    createEffect(() => {
      const label = '[' + row().name + ']';
      __bfw_s4('s4', escapeText(label))
      __bfw_s4('s5', escapeText(label))
    })
    insert(__el, 's3', () => row().on, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<b bf-c="s3"><!--bf:s4-->${__bfSlot(label, __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<i bf-c="s3"><!--bf:s5-->${__bfSlot(label, __slots)}<!--/--></i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

  mapArray(() => byAttr(), _s10, (row) => String(row.id), (row, __idx, __existing) => {
    const label = '[' + row().name + ']';
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().on ? `<b bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s8">on</b>` : `<i bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s9">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's7', () => row().on, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<b bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s8">on</b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        { const __ra_s8 = qsa(__branchScope, '[bf="s8"]')
        const __l = []
        if (__ra_s8) {
          __disposers.push(createDisposableEffect(() => {
            const label = '[' + row().name + ']';
            { const __x = label
            if (!(0 in __l) || !Object.is(__l[0], __x)) {
              { const __v = __x; if (__v != null) __ra_s8.setAttribute('title', String(__v)); else __ra_s8.removeAttribute('title') }
            }
            __l[0] = __x }
          }))
        } }
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<i bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s9">off</i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        { const __ra_s9 = qsa(__branchScope, '[bf="s9"]')
        const __l = []
        if (__ra_s9) {
          __disposers.push(createDisposableEffect(() => {
            const label = '[' + row().name + ']';
            { const __x = label
            if (!(0 in __l) || !Object.is(__l[0], __x)) {
              { const __v = __x; if (__v != null) __ra_s9.setAttribute('title', String(__v)); else __ra_s9.removeAttribute('title') }
            }
            __l[0] = __x }
          }))
        } }
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l1')

  mapArray(() => byNested(), _s16, (row) => String(row.id), (row, __idx, __existing) => {
    const label = '[' + row().name + ']';
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().on ? `<!--bf-cond-start:s11-->${row().name.length > 1 ? `<b bf-c="s12"><!--bf:s13-->${escapeText(label)}<!--/--></b>` : `<u bf-c="s12"><!--bf:s14-->${escapeText(label)}<!--/--></u>`}<!--bf-cond-end:s11-->` : `<i bf-c="s11"><!--bf:s15-->${escapeText(label)}<!--/--></i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __bfw_s13 = lazySlots(__el, [{ id: 's13', kind: 'markup', path: [] }, { id: 's14', kind: 'markup', path: [] }, { id: 's15', kind: 'markup', path: [] }])
    createEffect(() => {
      const label = '[' + row().name + ']';
      __bfw_s13('s13', escapeText(label))
      __bfw_s13('s14', escapeText(label))
      __bfw_s13('s15', escapeText(label))
    })
    insert(__el, 's11', () => row().on, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<!--bf-cond-start:s11-->${row().name.length > 1 ? `<b bf-c="s12"><!--bf:s13-->${__bfSlot(label, __slots)}<!--/--></b>` : `<u bf-c="s12"><!--bf:s14-->${__bfSlot(label, __slots)}<!--/--></u>`}<!--bf-cond-end:s11-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        __disposers.push(createDisposableEffect(() => {
          insert(__branchScope, 's12', () => row().name.length > 1, {
            template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<b bf-c="s12"><!--bf:s13-->${__bfSlot(label, __slots)}<!--/--></b>`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          }, {
            template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<u bf-c="s12"><!--bf:s14-->${__bfSlot(label, __slots)}<!--/--></u>`, slots: __slots } },
            bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
            }
          })
        }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const label = '[' + row().name + ']'; const __slots = []; return { html: `<i bf-c="s11"><!--bf:s15-->${__bfSlot(label, __slots)}<!--/--></i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l2')

}

hydrate('KeyedRowBranchPreamble', { init: initKeyedRowBranchPreamble, template: (_p) => `<div><button type="button" class="item" bf="s0">item</button><button type="button" class="attr" bf="s1">attr</button><button type="button" class="nested" bf="s2">nested</button><ul class="item" bf="s6"><!--bf-loop:l0-->${([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ]).map((row) => { const label = '[' + row.name + ']'; return `<li data-key="${escapeAttr(row.id)}">${row.on ? `<b bf-c="s3"><!--bf:s4-->${escapeText(label)}<!--/--></b>` : `<i bf-c="s3"><!--bf:s5-->${escapeText(label)}<!--/--></i>`}</li>` }).join('')}<!--bf-/loop:l0--></ul><ul class="attr" bf="s10"><!--bf-loop:l1-->${([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ]).map((row) => { const label = '[' + row.name + ']'; return `<li data-key="${escapeAttr(row.id)}">${row.on ? `<b bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s8">on</b>` : `<i bf-c="s7" ${(label) != null ? 'title="' + escapeAttr(label) + '"' : ''} bf="s9">off</i>`}</li>` }).join('')}<!--bf-/loop:l1--></ul><ul class="nested" bf="s16"><!--bf-loop:l2-->${([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ]).map((row) => { const label = '[' + row.name + ']'; return `<li data-key="${escapeAttr(row.id)}">${row.on ? `<!--bf-cond-start:s11-->${row.name.length > 1 ? `<b bf-c="s12"><!--bf:s13-->${escapeText(label)}<!--/--></b>` : `<u bf-c="s12"><!--bf:s14-->${escapeText(label)}<!--/--></u>`}<!--bf-cond-end:s11-->` : `<i bf-c="s11"><!--bf:s15-->${escapeText(label)}<!--/--></i>`}</li>` }).join('')}<!--bf-/loop:l2--></ul></div>` })
export function KeyedRowBranchPreamble(_p, __bfKey) { return createComponent('KeyedRowBranchPreamble', _p, __bfKey) }
