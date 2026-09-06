import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArrayLazy, qsa, textOrNode } from '@barefootjs/client/runtime'


export function initKeyedLoopIndexReorder(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
  ])
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
  const __lzp_l0 = [[0, 0], [1, 0]]
  const __lzs_l0 = [{ id: 's1', kind: 'text', path: [] }, { id: 's2', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's1', kind: 'text', path: __lzp_l0[0] }, { id: 's2', kind: 'text', path: __lzp_l0[1] }]
  mapArrayLazy(() => rows(), _s4, (row, i) => String(row.id), {
    indexDriven: true,
    createRow: (__e, i) => {
      const row = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [__el, lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        const __x = `${selected() === i ? 'row selected' : 'row'}`
        { const __v = __x; if (__v != null) __t.setAttribute('class', String(__v)); else __t.removeAttribute('class') }
        __l[0] = __x
      } }
      { const __x = String(i + 1)
      __r[1]('s1', textOrNode(__x))
      __l[1] = __x }
      { const __x = row().label
      __r[1]('s2', textOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: (__e) => {
      const row = () => __e.item
      const i = __e.index
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s3"]'))
      if (__t) {
        const __x = `${selected() === i ? 'row selected' : 'row'}`
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          { const __v = __x; if (__v != null) __t.setAttribute('class', String(__v)); else __t.removeAttribute('class') }
        }
        __l[0] = __x
      } }
      const __d = __r[1] ?? (__r[1] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = String(i + 1)
      if (!(1 in __l) || !Object.is(__l[1], __x)) __d('s1', textOrNode(__x))
      __l[1] = __x }
      { const __x = row().label
      if (!(2 in __l) || !Object.is(__l[2], __x)) __d('s2', textOrNode(__x))
      __l[2] = __x }
    },
    applyOuter: (__es, __seed) => {
      selected()
      for (const __e of __es) {
        const row = () => __e.item
        const i = __e.index
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s3"]'))
        if (__t) {
          const __x = `${selected() === i ? 'row selected' : 'row'}`
          if (__seed ? (__t.getAttribute('class') !== (__x != null ? String(__x) : null)) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            { const __v = __x; if (__v != null) __t.setAttribute('class', String(__v)); else __t.removeAttribute('class') }
          }
          __l[0] = __x
        } }
      }
    },
  }, 'l0')

}

hydrate('KeyedLoopIndexReorder', { init: initKeyedLoopIndexReorder, template: (_p) => `<div><button type="button" class="rotate" bf="s0"> Rotate </button><ul bf="s4"><!--bf-loop:l0-->${([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
  ]).map((row, i) => `<li data-key="${escapeAttr(row.id)}" ${(`${(0) === i ? 'row selected' : 'row'}`) != null ? 'class="' + escapeAttr(`${(0) === i ? 'row selected' : 'row'}`) + '"' : ''} bf="s3"><span class="badge"><!--bf:s1-->${escapeText(String(i + 1))}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(row.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function KeyedLoopIndexReorder(_p, __bfKey) { return createComponent('KeyedLoopIndexReorder', _p, __bfKey) }
