import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, mapArray, mapArrayLazy, mountRowRoot, qsa, textOrNode } from '@barefootjs/client/runtime'


export function initFalsyRowClicks(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const LEVELS = [0, 1]
  const [last, setLast] = createSignal('none')

  const [_s4, _s7, _s10, _s13, _s17] = $(__scope, 's4', 's7', 's10', 's13', 's17')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><button type="button" class="num" bf="s3"><!--bf:s2--><!--/--></button></li>`
  const __lzp_l0 = [[0, 0]]
  const __lzs_l0 = [{ id: 's2', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's2', kind: 'text', path: __lzp_l0[0] }]
  mapArrayLazy(() => _p.nums, _s4, (n) => String(n), {
    createRow: (__e, __idx) => {
      const n = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __x = n()
      __r[0]('s2', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const n = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = n()
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s2', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l0')

  if (_s4) _s4.addEventListener('click', (__bfEvt) => {
    const target = __bfEvt.target
    const s3El = target.closest('[bf="s3"]')
    if (s3El && _s4.contains(s3El)) {
      const li = s3El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const n = _p.nums.find(item => String(item) === key)
        if (n !== undefined) {
          ;(() => setLast(`num:${n}`))(__bfEvt)
        }
      }
      return
    }
  })

  const __tpl_l1 = document.createElement('template')
  __tpl_l1.innerHTML = `<li data-key=""><button type="button" class="word" bf="s6">[<!--bf:s5--><!--/-->]</button></li>`
  const __lzp_l1 = [[0, 1]]
  const __lzs_l1 = [{ id: 's5', kind: 'text', path: [] }]
  const __lzsc_l1 = [{ id: 's5', kind: 'text', path: __lzp_l1[0] }]
  mapArrayLazy(() => _p.words, _s7, (w) => String(w), {
    createRow: (__e, __idx) => {
      const w = () => __e.item
      const __el = __tpl_l1.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l1)]
      const __l = __e.last = []
      { const __x = w()
      __r[0]('s5', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const w = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l1))
      { const __x = w()
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s5', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l1')

  if (_s7) _s7.addEventListener('click', (__bfEvt) => {
    const target = __bfEvt.target
    const s6El = target.closest('[bf="s6"]')
    if (s6El && _s7.contains(s6El)) {
      const li = s6El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const w = _p.words.find(item => String(item) === key)
        if (w !== undefined) {
          ;(() => setLast(`word:[${w}]`))(__bfEvt)
        }
      }
      return
    }
  })

  // Reactive texts in static array children
  if (_s10) {
    LEVELS.forEach((l, __idx) => {
      let __iterEl = _s10.children[__idx]
      if (__iterEl) {
        const __bfw_s8 = lazySlots(__iterEl, [{ id: 's8', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s8('s8', String(l)) })
      }
    })
  }

  if (_s10) _s10.addEventListener('click', (__bfEvt) => {
    const target = __bfEvt.target
    const s9El = target.closest('[bf="s9"]')
    if (s9El && _s10.contains(s9El)) {
      let __el = s9El
      while (__el.parentElement && __el.parentElement !== _s10) __el = __el.parentElement
      if (__el.parentElement === _s10) {
        const __idx = Array.from(_s10.children).indexOf(__el)
        const l = LEVELS[__idx]
        if (l !== undefined) {
          ;(() => setLast(`level:${l}`))(__bfEvt)
        }
      }
      return
    }
  })

  const __tpl_l3 = document.createElement('template')
  __tpl_l3.innerHTML = `<li data-key=""><button type="button" class="flag" bf="s12"><!--bf:s11--><!--/--></button></li>`
  const __lzp_l3 = [[0, 0]]
  const __lzs_l3 = [{ id: 's11', kind: 'text', path: [] }]
  const __lzsc_l3 = [{ id: 's11', kind: 'text', path: __lzp_l3[0] }]
  mapArrayLazy(() => _p.flags, _s13, (f) => String(String(f)), {
    createRow: (__e, __idx) => {
      const f = () => __e.item
      const __el = __tpl_l3.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l3)]
      const __l = __e.last = []
      { const __x = String(f())
      __r[0]('s11', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const f = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l3))
      { const __x = String(f())
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s11', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l3')

  if (_s13) _s13.addEventListener('click', (__bfEvt) => {
    const target = __bfEvt.target
    const s12El = target.closest('[bf="s12"]')
    if (s12El && _s13.contains(s12El)) {
      const li = s12El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const f = _p.flags.find(item => String(String(item)) === key)
        if (f !== undefined) {
          ;(() => setLast(`flag:${f}`))(__bfEvt)
        }
      }
      return
    }
  })

  mapArray(() => _p.groups, _s17, (g, gi) => String(gi), (g, gi, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(gi)}" bf="s16"><!--bf-loop:l4-->${g().map((v) => `<button type="button" data-key-1="${escapeAttr(v)}" class="cell" bf="s15"><!--bf:s14-->${escapeText(v)}<!--/--></button>`).join('')}<!--bf-/loop:l4--></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: g
    { const __ic1_0 = qsa(__el, '[bf="s16"]')
    if (__ic1_0) mapArray(() => g() || [], __ic1_0, (v) => String(v), (v, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<button type="button" data-key-1="${escapeAttr(v())}" class="cell" bf="s15"><!--bf:s14-->${escapeText(v())}<!--/--></button>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(v()))
      { const __e = qsa(__innerEl1_0, '[bf="s15"]'); if (__e) __e.addEventListener('click', () => setLast(`cell:${gi()}:${v()}`)) }
      const __bfw_s14 = lazySlots(__innerEl1_0, [{ id: 's14', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s14('s14', String(v())) })
      return __innerEl1_0
    }, 'l4', undefined, "data-key-1") }
    return __el
  }, 'l5')

}

hydrate('FalsyRowClicks', { init: initFalsyRowClicks, template: (_p) => `<div><p class="last" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(('none'))}<!--/--></p><ul class="nums" bf="s4"><!--bf-loop:l0-->${_p.nums.map((n) => `<li data-key="${escapeAttr(n)}"><button type="button" class="num" bf="s3"><!--bf:s2-->${escapeText(n)}<!--/--></button></li>`).join('')}<!--bf-/loop:l0--></ul><ul class="words" bf="s7"><!--bf-loop:l1-->${_p.words.map((w) => `<li data-key="${escapeAttr(w)}"><button type="button" class="word" bf="s6">[<!--bf:s5-->${escapeText(w)}<!--/-->]</button></li>`).join('')}<!--bf-/loop:l1--></ul><ul class="levels" bf="s10"><!--bf-loop:l2-->${([0, 1]).map((l) => `<li data-key="${escapeAttr(l)}"><button type="button" class="level" bf="s9"><!--bf:s8-->${escapeText(l)}<!--/--></button></li>`).join('')}<!--bf-/loop:l2--></ul><ul class="flags" bf="s13"><!--bf-loop:l3-->${_p.flags.map((f) => `<li data-key="${escapeAttr(String(f))}"><button type="button" class="flag" bf="s12"><!--bf:s11-->${escapeText(String(f))}<!--/--></button></li>`).join('')}<!--bf-/loop:l3--></ul><ul class="groups" bf="s17"><!--bf-loop:l5-->${_p.groups.map((g, gi) => `<li data-key="${escapeAttr(gi)}" bf="s16"><!--bf-loop:l4-->${g.map((v) => `<button type="button" data-key-1="${escapeAttr(v)}" class="cell" bf="s15"><!--bf:s14-->${escapeText(v)}<!--/--></button>`).join('')}<!--bf-/loop:l4--></li>`).join('')}<!--bf-/loop:l5--></ul></div>` })
export function FalsyRowClicks(_p, __bfKey) { return createComponent('FalsyRowClicks', _p, __bfKey) }
