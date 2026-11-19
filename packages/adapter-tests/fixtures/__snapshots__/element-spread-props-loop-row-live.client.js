import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArrayLazy, spreadAttrs, textOrNode } from '@barefootjs/client/runtime'


export function initElementSpreadPropsLoopRowLive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([{ k: 'a' }, { k: 'b' }])

  const [_s0, _s3] = $(__scope, 's0', 's3')

  if (_s0) _s0.addEventListener('click', () => setRows([...rows(), { k: 'c' }]))
  const __lzs_l0 = [{ id: 's1', kind: 'text', path: [] }]
  mapArrayLazy(() => rows(), _s3, (r) => String(r.k), {
    createRow: (__e, __idx) => {
      const r = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<span data-key="${escapeAttr(r().k)}" ${spreadAttrs(_p)} bf="s2"><!--bf:s1-->${escapeText(r().k)}<!--/--></span>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __r = __e.refs = [lazySlots(__el, __lzs_l0)]
      const __l = __e.last = []
      { const __x = r().k
      __r[0]('s1', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const r = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = r().k
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s1', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l0')

}

hydrate('ElementSpreadPropsLoopRowLive', { init: initElementSpreadPropsLoopRowLive, template: (_p) => `<div><button class="add" bf="s0">add</button><ul bf="s3"><!--bf-loop:l0-->${([{ k: 'a' }, { k: 'b' }]).map((r) => `<span data-key="${escapeAttr(r.k)}" ${spreadAttrs(_p)} bf="s2"><!--bf:s1-->${escapeText(r.k)}<!--/--></span>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function ElementSpreadPropsLoopRowLive(_p, __bfKey) { return createComponent('ElementSpreadPropsLoopRowLive', _p, __bfKey) }
