import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArray } from '@barefootjs/client/runtime'


export function initPreambleCells(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [todos, setTodos] = createSignal([
    { id: 1, name: 'a & b', done: false },
    { id: 2, name: 'c "d"', done: false },
  ])
  const toggle = (id) =>
    setTodos(todos().map(t => (t.id === id ? { ...t, done: !t.done } : t)))

  const [_s3] = $(__scope, 's3')

  mapArray(() => todos(), _s3, (t) => String(t.id), (t, __idx, __existing) => {
    const stateLabel = t().done ? 'done & dusted' : 'open'; const cells = []; cells.push(`<td class="state">${escapeText(stateLabel)}</td>`);
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<tr data-key="${escapeAttr(t().id)}"><!--bf:s2-->${Array.isArray(cells) ? cells.join('') : (cells ?? '')}<!--/--><td class="name"><!--bf:s0-->${escapeText(t().name)}<!--/--></td><td><button class="toggle" bf="s1">toggle</button></td></tr>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __bfw_s0 = lazySlots(__el, [{ id: 's0', kind: 'text', path: [] }, { id: 's2', kind: 'markup', path: [] }])
    createEffect(() => {
      const stateLabel = t().done ? 'done & dusted' : 'open'; const cells = []; cells.push(`<td class="state">${escapeText(stateLabel)}</td>`);
      __bfw_s0('s0', String(t().name))
      __bfw_s0('s2', Array.isArray(cells) ? cells.join('') : (cells ?? ''))
    })
    return __el
  }, 'l0')

  if (_s3) _s3.addEventListener('click', (__bfEvt) => {
    const target = __bfEvt.target
    const s1El = target.closest('[bf="s1"]')
    if (s1El && _s3.contains(s1El)) {
      const li = s1El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const t = todos().find(item => String(item.id) === key)
        if (t) {
          ;(() => toggle(t.id))(__bfEvt)
        }
      }
      return
    }
  })

}

hydrate('PreambleCells', { init: initPreambleCells, template: (_p) => `<table><tbody bf="s3"><!--bf-loop:l0-->${([
    { id: 1, name: 'a & b', done: false },
    { id: 2, name: 'c "d"', done: false },
  ]).map((t) => { const stateLabel = t.done ? 'done & dusted' : 'open'; const cells = []; cells.push(`<td class="state">${escapeText(stateLabel)}</td>`); return `<tr data-key="${escapeAttr(t.id)}"><!--bf:s2-->${Array.isArray(cells) ? cells.join('') : (cells ?? '')}<!--/--><td class="name"><!--bf:s0-->${escapeText(t.name)}<!--/--></td><td><button class="toggle" bf="s1">toggle</button></td></tr>` }).join('')}<!--bf-/loop:l0--></tbody></table>` })
export function PreambleCells(_p, __bfKey) { return createComponent('PreambleCells', _p, __bfKey) }
