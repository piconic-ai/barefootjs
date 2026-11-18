import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, insert, lazySlots, mapArray } from '@barefootjs/client/runtime'


export function initKeyedRowBranchPreambleIndex(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ])

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', () => setRows(rows().map(r => ({ ...r, on: !r.on })).reverse()))
  mapArray(() => rows(), _s4, (row, i) => String(row.id), (row, i, __existing) => {
    const label = row().name + '@' + i();
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}">${row().on ? `<b bf-c="s1"><!--bf:s2-->${escapeText(label)}<!--/--></b>` : `<i bf-c="s1"><!--bf:s3-->${escapeText(label)}<!--/--></i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __bfw_s2 = lazySlots(__el, [{ id: 's2', kind: 'markup', path: [] }, { id: 's3', kind: 'markup', path: [] }])
    createEffect(() => {
      const label = row().name + '@' + i();
      __bfw_s2('s2', escapeText(label))
      __bfw_s2('s3', escapeText(label))
    })
    insert(__el, 's1', () => row().on, {
      template: () => { const label = row().name + '@' + i(); const __slots = []; return { html: `<b bf-c="s1"><!--bf:s2-->${__bfSlot(label, __slots)}<!--/--></b>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const label = row().name + '@' + i(); const __slots = []; return { html: `<i bf-c="s1"><!--bf:s3-->${__bfSlot(label, __slots)}<!--/--></i>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

}

hydrate('KeyedRowBranchPreambleIndex', { init: initKeyedRowBranchPreambleIndex, template: (_p) => `<div><button type="button" class="reverse" bf="s0">reverse</button><ul bf="s4"><!--bf-loop:l0-->${([
    { id: 'a', name: 'x', on: true },
    { id: 'b', name: 'y', on: false },
  ]).map((row, i) => { const label = row.name + '@' + i; return `<li data-key="${escapeAttr(row.id)}">${row.on ? `<b bf-c="s1"><!--bf:s2-->${escapeText(label)}<!--/--></b>` : `<i bf-c="s1"><!--bf:s3-->${escapeText(label)}<!--/--></i>`}</li>` }).join('')}<!--bf-/loop:l0--></ul></div>` })
export function KeyedRowBranchPreambleIndex(_p, __bfKey) { return createComponent('KeyedRowBranchPreambleIndex', _p, __bfKey) }
