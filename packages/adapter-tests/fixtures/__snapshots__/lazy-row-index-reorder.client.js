import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArrayLazy, textOrNode } from '@barefootjs/client/runtime'


export function initLazyRowIndexReorder(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const INITIAL = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
  { id: 3, label: 'Charlie' },
]
  const [rows, setRows] = createSignal(INITIAL)
  const rotate = () => {
    setRows(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  const [_s0, _s3] = $(__scope, 's0', 's3')

  if (_s0) _s0.addEventListener('click', rotate)
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><span class="badge"><!--bf:s1--><!--/--></span><span class="label"><!--bf:s2--><!--/--></span></li>`
  const __lzp_l0 = [[0, 0], [1, 0]]
  const __lzs_l0 = [{ id: 's1', kind: 'text', path: [] }, { id: 's2', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's1', kind: 'text', path: __lzp_l0[0] }, { id: 's2', kind: 'text', path: __lzp_l0[1] }]
  mapArrayLazy(() => rows(), _s3, (row, i) => String(row.id), {
    indexDriven: true,
    createRow: (__e, i) => {
      const row = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __x = String(i + 1)
      __r[0]('s1', textOrNode(__x))
      __l[0] = __x }
      { const __x = row().label
      __r[0]('s2', textOrNode(__x))
      __l[1] = __x }
      return __el
    },
    applyItem: (__e) => {
      const row = () => __e.item
      const i = __e.index
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = String(i + 1)
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s1', textOrNode(__x))
      __l[0] = __x }
      { const __x = row().label
      if (!(1 in __l) || !Object.is(__l[1], __x)) __d('s2', textOrNode(__x))
      __l[1] = __x }
    },
  }, 'l0')

}

hydrate('LazyRowIndexReorder', { init: initLazyRowIndexReorder, template: (_p) => `<div><button type="button" class="rotate" bf="s0"> Rotate </button><ul bf="s3"><!--bf-loop:l0-->${(([
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
  { id: 3, label: 'Charlie' },
])).map((row, i) => `<li data-key="${escapeAttr(row.id)}"><span class="badge"><!--bf:s1-->${escapeText(String(i + 1))}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(row.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function LazyRowIndexReorder(_p, __bfKey) { return createComponent('LazyRowIndexReorder', _p, __bfKey) }
