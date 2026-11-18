import { $, createComponent, createSignal, escapeAttr, hydrate, mapArrayLazy, qsa } from '@barefootjs/client/runtime'


export function initStaticLoopConditionalFunctionHelper(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const items = [{ id: 'a' }, { id: 'b' }]
  const [sel, setSel] = createSignal('a')
  const isSelArrow = (id) => sel() === id
  const isSelBlock = (id) => {
    const s = sel()
    return s === id
  }
  const isSelFn = (id) => {
    const s = sel()
    return s === id
  }

  const [_s0, _s1, _s4, _s7, _s9] = $(__scope, 's0', 's1', 's4', 's7', 's9')

  if (_s0) _s0.addEventListener('click', () => setSel('b'))
  if (_s1) _s1.addEventListener('click', () => setSel('a'))
  const __cbt_l0_s2 = document.createElement('template')
  __cbt_l0_s2.innerHTML = `<b bf-c="s2">on</b>`
  const __cbf_l0_s2 = document.createElement('template')
  __cbf_l0_s2.innerHTML = `<i bf-c="s2">off</i>`
  mapArrayLazy(() => items, _s4, (it) => String(it.id), {
    createRow: (__e, __idx) => {
      const it = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(it().id)}" bf="s3">${isSelArrow(it().id) ? `<b bf-c="s2">on</b>` : `<i bf-c="s2">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __l = __e.last = []
      __l[0] = !!(isSelArrow(it().id))
      return __el
    },
    applyItem: (__e) => {
      const it = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s2"]'))
      if (__c) {
        const __x = !!(isSelArrow(it().id))
        const __w = (__x ? __cbt_l0_s2 : __cbf_l0_s2).content.firstElementChild
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          const __n = __w.cloneNode(true)
          __c.replaceWith(__n)
          __r[0] = __n
        }
        __l[0] = __x
      } }
    },
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const it = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s2"]'))
        if (__c) {
          const __x = !!(isSelArrow(it().id))
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

  const __cbt_l1_s5 = document.createElement('template')
  __cbt_l1_s5.innerHTML = `<b bf-c="s5">on</b>`
  const __cbf_l1_s5 = document.createElement('template')
  __cbf_l1_s5.innerHTML = `<i bf-c="s5">off</i>`
  mapArrayLazy(() => items, _s7, (it) => String(it.id), {
    createRow: (__e, __idx) => {
      const it = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(it().id)}" bf="s6">${isSelBlock(it().id) ? `<b bf-c="s5">on</b>` : `<i bf-c="s5">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __l = __e.last = []
      __l[0] = !!(isSelBlock(it().id))
      return __el
    },
    applyItem: (__e) => {
      const it = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s5"]'))
      if (__c) {
        const __x = !!(isSelBlock(it().id))
        const __w = (__x ? __cbt_l1_s5 : __cbf_l1_s5).content.firstElementChild
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          const __n = __w.cloneNode(true)
          __c.replaceWith(__n)
          __r[0] = __n
        }
        __l[0] = __x
      } }
    },
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const it = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s5"]'))
        if (__c) {
          const __x = !!(isSelBlock(it().id))
          const __w = (__x ? __cbt_l1_s5 : __cbf_l1_s5).content.firstElementChild
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

  const __cbt_l2_s8 = document.createElement('template')
  __cbt_l2_s8.innerHTML = `<b bf-c="s8">on</b>`
  const __cbf_l2_s8 = document.createElement('template')
  __cbf_l2_s8.innerHTML = `<i bf-c="s8">off</i>`
  mapArrayLazy(() => items, _s9, (it) => String(it.id), {
    createRow: (__e, __idx) => {
      const it = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(it().id)}">${isSelFn(it().id) ? `<b bf-c="s8">on</b>` : `<i bf-c="s8">off</i>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __l = __e.last = []
      __l[0] = !!(isSelFn(it().id))
      return __el
    },
    applyItem: (__e) => {
      const it = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s8"]'))
      if (__c) {
        const __x = !!(isSelFn(it().id))
        const __w = (__x ? __cbt_l2_s8 : __cbf_l2_s8).content.firstElementChild
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          const __n = __w.cloneNode(true)
          __c.replaceWith(__n)
          __r[0] = __n
        }
        __l[0] = __x
      } }
    },
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const it = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __c = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf-c="s8"]'))
        if (__c) {
          const __x = !!(isSelFn(it().id))
          const __w = (__x ? __cbt_l2_s8 : __cbf_l2_s8).content.firstElementChild
          if (__seed ? (__c.outerHTML !== __w.outerHTML) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            const __n = __w.cloneNode(true)
            __c.replaceWith(__n)
            __r[0] = __n
          }
          __l[0] = __x
        } }
      }
    },
  }, 'l2')

}

hydrate('StaticLoopConditionalFunctionHelper', { init: initStaticLoopConditionalFunctionHelper, template: (_p) => `<div><button type="button" class="pick-b" bf="s0">pick b</button><button type="button" class="pick-a" bf="s1">pick a</button><ul class="arrow" bf="s4"><!--bf-loop:l0-->${([{ id: 'a' }, { id: 'b' }]).map((it) => `<li data-key="${escapeAttr(it.id)}" bf="s3">${undefined ? `<b bf-c="s2">on</b>` : `<i bf-c="s2">off</i>`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="block" bf="s7"><!--bf-loop:l1-->${([{ id: 'a' }, { id: 'b' }]).map((it) => `<li data-key="${escapeAttr(it.id)}" bf="s6">${undefined ? `<b bf-c="s5">on</b>` : `<i bf-c="s5">off</i>`}</li>`).join('')}<!--bf-/loop:l1--></ul><ul class="fn" bf="s9"><!--bf-loop:l2-->${([{ id: 'a' }, { id: 'b' }]).map((it) => `<li data-key="${escapeAttr(it.id)}">${undefined ? `<b bf-c="s8">on</b>` : `<i bf-c="s8">off</i>`}</li>`).join('')}<!--bf-/loop:l2--></ul></div>` })
export function StaticLoopConditionalFunctionHelper(_p, __bfKey) { return createComponent('StaticLoopConditionalFunctionHelper', _p, __bfKey) }
