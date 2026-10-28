import { $, $c, __bfSlot, bfMarkup, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, initChild, insert, lazyClaimSlots, lazySlots, mapArray, mapArrayLazy, mountRowRoot, qsa, renderChild, textOrNode } from '@barefootjs/client/runtime'

export function initSlotLoopList(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal(['a', 'b'])

  const [_s0, _s12] = $(__scope, 's0', 's12')

  if (_s0) _s0.addEventListener('click', () => setRows(xs => [...xs, 'c']))
  mapArray(() => rows(), _s12, (i) => String(i), (i, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(i())}" bf="s11"><!--bf:s1-->${escapeText(i())}<!--/--><!--bf:s2-->${escapeTextOrMarkup(_p.footer)}<!--/--><span class="label" bf="s4"><!--bf:s3-->${escapeTextOrMarkup(_p.label)}<!--/--></span><span class="tern" bf="s7">${_p.flag ? `<!--bf-cond-start:s5--><!--bf:s6-->${escapeTextOrMarkup(_p.footer)}<!--/--><!--bf-cond-end:s5-->` : `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`}</span><span class="and" bf="s10">${_p.flag ? `<!--bf-cond-start:s8--><!--bf:s9-->${escapeTextOrMarkup(_p.footer)}<!--/--><!--bf-cond-end:s8-->` : `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`}</span></li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __bfw_s1 = lazySlots(__el, [{ id: 's1', kind: 'text', path: [] }, { id: 's2', kind: 'markup', path: [] }, { id: 's3', kind: 'markup', path: [] }])
    createEffect(() => {
      __bfw_s1('s1', String(i()))
      __bfw_s1('s2', escapeTextOrNode(_p.footer))
      __bfw_s1('s3', escapeTextOrNode(_p.label))
    })
    insert(__el, 's5', () => _p.flag, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><!--bf:s6-->${__bfSlot(_p.footer, __slots)}<!--/--><!--bf-cond-end:s5-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s6 = lazySlots(__branchScope, [{ id: 's6', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s6('s6', escapeTextOrNode(_p.footer)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    insert(__el, 's8', () => _p.flag, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s8--><!--bf:s9-->${__bfSlot(_p.footer, __slots)}<!--/--><!--bf-cond-end:s8-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s9 = lazySlots(__branchScope, [{ id: 's9', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s9('s9', escapeTextOrNode(_p.footer)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

}

hydrate('SlotLoopList', { init: initSlotLoopList, template: (_p) => `<div class="obj"><button class="add-obj" bf="s0">add</button><ul bf="s12"><!--bf-loop:l0-->${(['a', 'b']).map((i) => `<li data-key="${escapeAttr(i)}" bf="s11"><!--bf:s1-->${escapeText(i)}<!--/--><!--bf:s2-->${escapeTextOrMarkup(_p.footer)}<!--/--><span class="label" bf="s4"><!--bf:s3-->${escapeTextOrMarkup(_p.label)}<!--/--></span><span class="tern" bf="s7">${_p.flag ? `<!--bf-cond-start:s5--><!--bf:s6-->${escapeTextOrMarkup(_p.footer)}<!--/--><!--bf-cond-end:s5-->` : `<!--bf-cond-start:s5--><!--bf-cond-end:s5-->`}</span><span class="and" bf="s10">${_p.flag ? `<!--bf-cond-start:s8--><!--bf:s9-->${escapeTextOrMarkup(_p.footer)}<!--/--><!--bf-cond-end:s8-->` : `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`}</span></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function SlotLoopList(_p, __bfKey) { return createComponent('SlotLoopList', _p, __bfKey) }
export function initSlotLoopListDestructured(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal(['a', 'b'])
  const alias = _p.footer

  const [_s0, _s9] = $(__scope, 's0', 's9')

  if (_s0) _s0.addEventListener('click', () => setRows(xs => [...xs, 'c']))
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><b bf="s2"><!--bf:s1--><!--/--></b><i bf="s4"><!--bf:s3--><!--/--></i><span class="label" bf="s6"><!--bf:s5--><!--/--></span></li>`
  const __lzp_l0 = [[0, 0], [1, 0], [2, 0]]
  const __lzs_l0 = [{ id: 's1', kind: 'markup', path: [] }, { id: 's3', kind: 'markup', path: [] }, { id: 's5', kind: 'markup', path: [] }]
  const __lzsc_l0 = [{ id: 's1', kind: 'markup', path: __lzp_l0[0] }, { id: 's3', kind: 'markup', path: __lzp_l0[1] }, { id: 's5', kind: 'markup', path: __lzp_l0[2] }]
  mapArrayLazy(() => rows(), _s9, (item) => String(item), {
    createRow: (__e, __idx) => {
      const item = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazyClaimSlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __x = _p.footer
      __r[0].write('s1', escapeTextOrNode(__x))
      __l[0] = __x }
      { const __x = _p.footer
      __r[0].write('s3', escapeTextOrNode(__x))
      __l[1] = __x }
      { const __x = _p.label
      __r[0].write('s5', escapeTextOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: () => {},
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const item = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        const __d = __r[0] ?? (__r[0] = lazyClaimSlots(__e.primaryEl, __lzs_l0))
        { const __x = _p.footer
        if (__seed) {
          const __s = escapeTextOrNode(__x)
          if (__d.read('s1') !== __s) __d.write('s1', __s)
        } else if (!(0 in __l) || !Object.is(__l[0], __x)) __d.write('s1', escapeTextOrNode(__x))
        __l[0] = __x }
        { const __x = _p.footer
        if (__seed) {
          const __s = escapeTextOrNode(__x)
          if (__d.read('s3') !== __s) __d.write('s3', __s)
        } else if (!(1 in __l) || !Object.is(__l[1], __x)) __d.write('s3', escapeTextOrNode(__x))
        __l[1] = __x }
        { const __x = _p.label
        if (__seed) {
          const __s = escapeTextOrNode(__x)
          if (__d.read('s5') !== __s) __d.write('s5', __s)
        } else if (!(2 in __l) || !Object.is(__l[2], __x)) __d.write('s5', escapeTextOrNode(__x))
        __l[2] = __x }
      }
    },
  }, 'l0')

  const __tpl_l1 = document.createElement('template')
  __tpl_l1.innerHTML = `<li data-key="" class="shadow" bf="s8"><!--bf:s7--><!--/--></li>`
  const __lzp_l1 = [[0]]
  const __lzs_l1 = [{ id: 's7', kind: 'text', path: [] }]
  const __lzsc_l1 = [{ id: 's7', kind: 'text', path: __lzp_l1[0] }]
  mapArrayLazy(() => rows(), _s9, (label) => String(label), {
    createRow: (__e, __idx) => {
      const label = () => __e.item
      const __el = __tpl_l1.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l1)]
      const __l = __e.last = []
      { const __x = label()
      __r[0]('s7', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const label = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l1))
      { const __x = label()
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s7', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l1')

}

hydrate('SlotLoopListDestructured', { init: initSlotLoopListDestructured, template: (_p) => `<div class="destructured"><button class="add-destructured" bf="s0">add</button><ol bf="s9"><!--bf-loop:l0-->${(['a', 'b']).map((item) => `<li data-key="${escapeAttr(item)}"><b bf="s2"><!--bf:s1-->${escapeTextOrMarkup(_p.footer)}<!--/--></b><i bf="s4"><!--bf:s3-->${escapeTextOrMarkup((_p.footer))}<!--/--></i><span class="label" bf="s6"><!--bf:s5-->${escapeTextOrMarkup(_p.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--><!--bf-loop:l1-->${(['a', 'b']).map((label) => `<li data-key="${escapeAttr(label)}" class="shadow" bf="s8"><!--bf:s7-->${escapeText(label)}<!--/--></li>`).join('')}<!--bf-/loop:l1--></ol></div>` })
export function SlotLoopListDestructured(_p, __bfKey) { return createComponent('SlotLoopListDestructured', _p, __bfKey) }
export function initSlotLoopNested(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [groups, setGroups] = createSignal([{ id: 'g1', items: ['a'] }])
  const [on, setOn] = createSignal(true)

  const [_s0, _s1, _s13, _s12] = $(__scope, 's0', 's1', 's13', 's12')

  if (_s0) _s0.addEventListener('click', () => setGroups(gs => [...gs, { id: 'g2', items: ['b'] }]))
  if (_s1) _s1.addEventListener('click', () => setOn(v => !v))
  mapArray(() => groups(), _s13, (g) => String(g.id), (g, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<section data-key="${escapeAttr(g().id)}" bf="s8"><!--bf-loop:l0-->${g().items.map((i) => `<p data-key-1="${escapeAttr(i)}" bf="s4"><!--bf:s2-->${escapeText(i)}<!--/--><!--bf:s3-->${escapeTextOrMarkup(_p.footer)}<!--/--></p>`).join('')}<!--bf-/loop:l0-->${on() ? `<em bf-c="s5" bf="s7"><!--bf:s6-->${escapeTextOrMarkup(_p.footer)}<!--/--></em>` : `<u bf-c="s5">off</u>`}</section>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: g.items
    { const __ic1_0 = qsa(__el, '[bf="s8"]')
    if (__ic1_0) mapArray(() => g().items || [], __ic1_0, (i) => String(i), (i, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<p data-key-1="${escapeAttr(i())}" bf="s4"><!--bf:s2-->${escapeText(i())}<!--/--><!--bf:s3-->${escapeTextOrMarkup(_p.footer)}<!--/--></p>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(i()))
      const __bfw_s2 = lazySlots(__innerEl1_0, [{ id: 's2', kind: 'text', path: [] }, { id: 's3', kind: 'markup', path: [] }])
      createEffect(() => { __bfw_s2('s2', String(i())) })
      createEffect(() => { __bfw_s2('s3', escapeTextOrNode(_p.footer)) })
      return __innerEl1_0
    }, 'l0', undefined, "data-key-1") }
    insert(__el, 's5', () => on(), {
      template: () => { const __slots = []; return { html: `<em bf-c="s5" bf="s7"><!--bf:s6-->${__bfSlot(_p.footer, __slots)}<!--/--></em>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s6 = lazySlots(__branchScope, [{ id: 's6', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s6('s6', escapeTextOrNode(_p.footer)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<u bf-c="s5">off</u>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l1')

  // Reactive texts in static array children
  if (_s12) {
    ['x', 'y'].forEach((s, __idx) => {
      let __iterEl = _s12.children[__idx]
      if (__iterEl) {
        const __bfw_s9 = lazySlots(__iterEl, [{ id: 's9', kind: 'text', path: [] }, { id: 's10', kind: 'markup', path: [] }])
        createEffect(() => { __bfw_s9('s9', String(s)) })
        createEffect(() => { __bfw_s9('s10', escapeTextOrNode(_p.footer)) })
      }
    })
  }

}

hydrate('SlotLoopNested', { init: initSlotLoopNested, template: (_p) => `<div class="nested" bf="s13"><button class="add-nested" bf="s0">add</button><button class="toggle-nested" bf="s1">toggle</button><!--bf-loop:l1-->${([{ id: 'g1', items: ['a'] }]).map((g) => `<section data-key="${escapeAttr(g.id)}" bf="s8"><!--bf-loop:l0-->${g.items.map((i) => `<p data-key-1="${escapeAttr(i)}" bf="s4"><!--bf:s2-->${escapeText(i)}<!--/--><!--bf:s3-->${escapeTextOrMarkup(_p.footer)}<!--/--></p>`).join('')}<!--bf-/loop:l0-->${(true) ? `<em bf-c="s5" bf="s7"><!--bf:s6-->${escapeTextOrMarkup(_p.footer)}<!--/--></em>` : `<u bf-c="s5">off</u>`}</section>`).join('')}<!--bf-/loop:l1--><ul class="static" bf="s12"><!--bf-loop:l2-->${['x', 'y'].map((s) => `<li data-key="${escapeAttr(s)}" bf="s11"><!--bf:s9-->${escapeText(s)}<!--/--><!--bf:s10-->${escapeTextOrMarkup(_p.footer)}<!--/--></li>`).join('')}<!--bf-/loop:l2--></ul></div>` })
export function SlotLoopNested(_p, __bfKey) { return createComponent('SlotLoopNested', _p, __bfKey) }
export function initJsxPropLoopRow(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1, _s2] = $c(__scope, 's0', 's1', 's2')


  // Initialize child components with props
  initChild('SlotLoopList', _s0, { get footer() { return bfMarkup(`<b class="f">foot</b>`) }, label: "x < y", get flag() { return true } })
  initChild('SlotLoopListDestructured', _s1, { get footer() { return bfMarkup(`<b class="f">foot</b>`) }, label: "x < y" })
  initChild('SlotLoopNested', _s2, { get footer() { return bfMarkup(`<b class="f">foot</b>`) } })
}

hydrate('JsxPropLoopRow', { init: initJsxPropLoopRow, template: (_p) => `<div>${renderChild('SlotLoopList', {footer: bfMarkup(`<b class="f">foot</b>`), label: "x < y", flag: true}, undefined, 's0')}${renderChild('SlotLoopListDestructured', {footer: bfMarkup(`<b class="f">foot</b>`), label: "x < y"}, undefined, 's1')}${renderChild('SlotLoopNested', {footer: bfMarkup(`<b class="f">foot</b>`)}, undefined, 's2')}</div>` })
export function JsxPropLoopRow(_p, __bfKey) { return createComponent('JsxPropLoopRow', _p, __bfKey) }
