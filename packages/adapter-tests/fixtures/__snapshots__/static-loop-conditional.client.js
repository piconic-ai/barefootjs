import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArrayLazy, qsa, textOrNode } from '@barefootjs/client/runtime'


export function initStaticLoopConditional(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const items = [
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
  ]
  const [flag, setFlag] = createSignal(true)
  const toggle = () => setFlag(v => !v)

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', toggle)
  const __lzs_l0 = [{ id: 's1', kind: 'text', path: [] }]
  const __cbt_l0_s2 = document.createElement('template')
  __cbt_l0_s2.innerHTML = `<b bf-c="s2" class="on">on</b>`
  const __cbf_l0_s2 = document.createElement('template')
  __cbf_l0_s2.innerHTML = `<i bf-c="s2" class="off">off</i>`
  mapArrayLazy(() => items, _s4, (item) => String(item.id), {
    createRow: (__e, __idx) => {
      const item = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}" bf="s3"><span class="label"><!--bf:s1-->${escapeText(item().label)}<!--/--></span>${flag() ? `<b bf-c="s2" class="on">on</b>` : `<i bf-c="s2" class="off">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __r = __e.refs = [lazySlots(__el, __lzs_l0)]
      const __l = __e.last = []
      { const __x = item().label
      __r[0]('s1', textOrNode(__x))
      __l[0] = __x }
      __l[1] = !!(flag())
      return __el
    },
    applyItem: (__e) => {
      const item = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = item().label
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s1', textOrNode(__x))
      __l[0] = __x }
    },
    applyOuter: (__es, __seed) => {
      flag()
      for (const __e of __es) {
        const item = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 1 in __r ? __r[1] : (__r[1] = qsa(__e.primaryEl, '[bf-c="s2"]'))
        if (__c) {
          const __x = !!(flag())
          const __w = (__x ? __cbt_l0_s2 : __cbf_l0_s2).content.firstElementChild
          if (__seed ? (__c.outerHTML !== __w.outerHTML) : (!(1 in __l) || !Object.is(__l[1], __x))) {
            const __n = __w.cloneNode(true)
            __c.replaceWith(__n)
            __r[1] = __n
          }
          __l[1] = __x
        } }
      }
    },
  }, 'l0')

}

hydrate('StaticLoopConditional', { init: initStaticLoopConditional, template: (_p) => `<div><button type="button" class="toggle" bf="s0"> Toggle </button><ul bf="s4"><!--bf-loop:l0-->${([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
  ]).map((item) => `<li data-key="${escapeAttr(item.id)}" bf="s3"><span class="label"><!--bf:s1-->${escapeText(item.label)}<!--/--></span>${(true) ? `<b bf-c="s2" class="on">on</b>` : `<i bf-c="s2" class="off">off</i>`}</li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function StaticLoopConditional(_p, __bfKey) { return createComponent('StaticLoopConditional', _p, __bfKey) }
