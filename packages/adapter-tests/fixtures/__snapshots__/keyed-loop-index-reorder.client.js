import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArray, qsa } from '@barefootjs/client/runtime'


export function initKeyedLoopIndexReorder(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const INITIAL = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
  { id: 3, label: 'Charlie' },
]
  const [rows, setRows] = createSignal(INITIAL)
  const [selected, setSelected] = createSignal(0)
  const rotate = () => {
    setRows(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', rotate)
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key="" bf="s3"><span class="badge"><!--bf:s1--><!--/--></span><span class="label"><!--bf:s2--><!--/--></span></li>`
  mapArray(() => rows(), _s4, (row, i) => String(row.id), (row, i, __existing) => {
    const __el = __existing ?? __tpl_l0.content.firstElementChild.cloneNode(true)
    const __p = __existing ? null : [__el]
    const __ra_s3 = __p ? __p[0] : qsa(__el, '[bf="s3"]')
    const __bfw_s1 = lazySlots(__el, [{ id: 's1', kind: 'text', path: __existing ? [] : [0, 0] }, { id: 's2', kind: 'text', path: __existing ? [] : [1, 0] }])
    createEffect(() => {
      if (__ra_s3) {
        {
          { const __v = `${selected() === i() ? 'row selected' : 'row'}`; if (__v != null) __ra_s3.setAttribute('class', String(__v)); else __ra_s3.removeAttribute('class') }
        }
      }
      __bfw_s1('s1', String(String(i() + 1)))
      __bfw_s1('s2', String(row().label))
    })
    return __el
  }, 'l0')

}

hydrate('KeyedLoopIndexReorder', { init: initKeyedLoopIndexReorder, template: (_p) => `<div><button type="button" class="rotate" bf="s0"> Rotate </button><ul bf="s4"><!--bf-loop:l0-->${(([
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
  { id: 3, label: 'Charlie' },
])).map((row, i) => `<li data-key="${escapeAttr(row.id)}" ${(`${(0) === i ? 'row selected' : 'row'}`) != null ? 'class="' + escapeAttr(`${(0) === i ? 'row selected' : 'row'}`) + '"' : ''} bf="s3"><span class="badge"><!--bf:s1-->${escapeText(String(i + 1))}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(row.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function KeyedLoopIndexReorder(_p, __bfKey) { return createComponent('KeyedLoopIndexReorder', _p, __bfKey) }
