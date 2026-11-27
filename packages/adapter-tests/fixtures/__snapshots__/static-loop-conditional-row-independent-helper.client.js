import { $, createComponent, createSignal, escapeAttr, hydrate, mapArrayLazy, qsa } from '@barefootjs/client/runtime'


export function initStaticLoopConditionalRowIndependentHelper(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const items = [{ id: 'a' }, { id: 'b' }]
  const [n, setN] = createSignal(0)
  const isOnFn = () => {
    return n() > 0
  }
  const isOnArrow = () => n() > 0

  const [_s0, _s1, _s3, _s6] = $(__scope, 's0', 's1', 's3', 's6')

  if (_s0) _s0.addEventListener('click', () => setN(n() + 1))
  if (_s1) _s1.addEventListener('click', () => setN(0))
  const __cbt_l0_s2 = document.createElement('template')
  __cbt_l0_s2.innerHTML = `<b bf-c="s2">on</b>`
  const __cbf_l0_s2 = document.createElement('template')
  __cbf_l0_s2.innerHTML = `<i bf-c="s2">off</i>`
  mapArrayLazy(() => items, _s3, (it) => String(it.id), {
    createRow: (__e, __idx) => {
      const it = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(it().id)}">${isOnFn() ? `<b bf-c="s2">on</b>` : `<i bf-c="s2">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __l = __e.last = []
      __l[0] = !!(isOnFn())
      return __el
    },
    applyItem: () => {},
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const it = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s2"]'))
        if (__c) {
          const __x = !!(isOnFn())
          const __w = (__x ? __cbt_l0_s2 : __cbf_l0_s2).content.firstElementChild
          if (__seed ? (__c.outerHTML !== __w.outerHTML) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            const __n = __w.cloneNode(true)
            __c.replaceWith(__n)
            __r[0] = __n
          }
          __l[0] = __x
        } }
      }
    },
  }, 'l0')

  const __cbt_l1_s4 = document.createElement('template')
  __cbt_l1_s4.innerHTML = `<b bf-c="s4">on</b>`
  const __cbf_l1_s4 = document.createElement('template')
  __cbf_l1_s4.innerHTML = `<i bf-c="s4">off</i>`
  mapArrayLazy(() => items, _s6, (it) => String(it.id), {
    createRow: (__e, __idx) => {
      const it = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(it().id)}" bf="s5">${isOnArrow() ? `<b bf-c="s4">on</b>` : `<i bf-c="s4">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __l = __e.last = []
      __l[0] = !!(isOnArrow())
      return __el
    },
    applyItem: () => {},
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const it = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s4"]'))
        if (__c) {
          const __x = !!(isOnArrow())
          const __w = (__x ? __cbt_l1_s4 : __cbf_l1_s4).content.firstElementChild
          if (__seed ? (__c.outerHTML !== __w.outerHTML) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            const __n = __w.cloneNode(true)
            __c.replaceWith(__n)
            __r[0] = __n
          }
          __l[0] = __x
        } }
      }
    },
  }, 'l1')

}

hydrate('StaticLoopConditionalRowIndependentHelper', { init: initStaticLoopConditionalRowIndependentHelper, template: (_p) => `${((__bf_const_items, __bf_const_isOnArrow) => `<div><button type="button" class="inc" bf="s0">inc</button><button type="button" class="reset" bf="s1">reset</button><ul class="fn" bf="s3"><!--bf-loop:l0-->${(__bf_const_items).map((it) => `<li data-key="${escapeAttr(it.id)}">${undefined ? `<b bf-c="s2">on</b>` : `<i bf-c="s2">off</i>`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="arrow" bf="s6"><!--bf-loop:l1-->${(__bf_const_items).map((it) => `<li data-key="${escapeAttr(it.id)}" bf="s5">${(__bf_const_isOnArrow)() ? `<b bf-c="s4">on</b>` : `<i bf-c="s4">off</i>`}</li>`).join('')}<!--bf-/loop:l1--></ul></div>`)(([{ id: 'a' }, { id: 'b' }]), (() => (0) > 0))}` })
export function StaticLoopConditionalRowIndependentHelper(_p, __bfKey) { return createComponent('StaticLoopConditionalRowIndependentHelper', _p, __bfKey) }
