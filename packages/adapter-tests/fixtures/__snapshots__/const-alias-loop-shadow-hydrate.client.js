import { $, createComponent, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazyClaimSlots, mapArrayLazy, qsa, textOrNode, $c, __bfSlot, createDisposableEffect, createEffect, initChild, insert, lazySlots, mapArray, renderChild } from '@barefootjs/client/runtime'

export function initPropsForm(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }])
  const c = _p.label

  const [_s0, _s1, _s5] = $(__scope, 's0', 's1', 's5')

  if (_s0) _s0.addEventListener('click', () => setRows([...rows(), { id: '3', name: 'r3' }]))
  if (_s1) _s1.addEventListener('click', () => setRows(rows().map(r => (r.id === '1' ? { id: '1', name: 'x1' } : r))))
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key="" bf="s4"><!--bf:s2--><!--/-->/<!--bf:s3--><!--/--></li>`
  const __lzp_l0 = [[0], [3]]
  const __lzs_l0 = [{ id: 's2', kind: 'markup', path: [] }, { id: 's3', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's2', kind: 'markup', path: __lzp_l0[0] }, { id: 's3', kind: 'text', path: __lzp_l0[1] }]
  mapArrayLazy(() => rows(), _s5, (text) => String(text.id), {
    createRow: (__e, __idx) => {
      const text = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [__el, lazyClaimSlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        { const __x = c
        { const __v = __x; if (__v != null) __t.setAttribute('title', String(__v)); else __t.removeAttribute('title') }
        __l[0] = __x }
      } }
      { const __x = c
      __r[1].write('s2', escapeTextOrNode(__x))
      __l[1] = __x }
      { const __x = text().name
      __r[1].write('s3', textOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: (__e) => {
      const text = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[1] ?? (__r[1] = lazyClaimSlots(__e.primaryEl, __lzs_l0))
      { const __x = c
      if (!(1 in __l) || !Object.is(__l[1], __x)) __d.write('s2', escapeTextOrNode(__x))
      __l[1] = __x }
      { const __x = text().name
      if (!(2 in __l) || !Object.is(__l[2], __x)) __d.write('s3', textOrNode(__x))
      __l[2] = __x }
    },
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const text = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s4"]'))
        if (__t) {
          { const __x = c
          if (__seed ? (__t.getAttribute('title') !== (__x != null ? String(__x) : null)) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            { const __v = __x; if (__v != null) __t.setAttribute('title', String(__v)); else __t.removeAttribute('title') }
          }
          __l[0] = __x }
        } }
        const __d = __r[1] ?? (__r[1] = lazyClaimSlots(__e.primaryEl, __lzs_l0))
        { const __x = c
        if (__seed) {
          const __s = escapeTextOrNode(__x)
          if (__d.read('s2') !== __s) __d.write('s2', __s)
        } else if (!(1 in __l) || !Object.is(__l[1], __x)) __d.write('s2', escapeTextOrNode(__x))
        __l[1] = __x }
      }
    },
  }, 'l0')

}

hydrate('PropsForm__3eae41bd', { init: initPropsForm, template: (_p) => `<div class="props-form"><button class="add" bf="s0">add</button><button class="rename" bf="s1">rename</button><ul bf="s5"><!--bf-loop:l0-->${([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }]).map((text) => `<li data-key="${escapeAttr(text.id)}" ${(((_p.label))) != null ? 'title="' + escapeAttr(((_p.label))) + '"' : ''} bf="s4"><!--bf:s2-->${escapeTextOrMarkup(((_p.label)))}<!--/-->/<!--bf:s3-->${escapeText(text.name)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul></div>`, name: 'PropsForm' })
export function PropsForm(_p, __bfKey) { return createComponent('PropsForm__3eae41bd', _p, __bfKey) }
export function initConstAliasLoopShadowHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }])
  const a = _p.label
  const b = a
  const c = _p.label

  const [_s0, _s1, _s12, _s16] = $(__scope, 's0', 's1', 's12', 's16')
  const [_s17] = $c(__scope, 's17')

  if (_s0) _s0.addEventListener('click', () => setRows([...rows(), { id: '3', name: 'r3' }]))
  if (_s1) _s1.addEventListener('click', () => setRows(rows().map(r => (r.id === '1' ? { id: '1', name: 'x1' } : r))))

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__PropsForm_s17El] = $c(__scope, 's17')
    if (__PropsForm_s17El) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __PropsForm_s17El.hasAttribute('label')) { const __v = __x; if (__v != null) __PropsForm_s17El.setAttribute('label', String(__v)); else __PropsForm_s17El.removeAttribute('label') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('PropsForm__3eae41bd', _s17, { get label() { return _p.label } })
  mapArray(() => rows(), _s12, (a) => String(a.id), (a, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(a().id)}" ${(b) != null ? 'title="' + escapeAttr(b) + '"' : ''} ${(`${a().name === b ? 'y' : 'n'}`) != null ? 'data-same="' + escapeAttr(`${a().name === b ? 'y' : 'n'}`) + '"' : ''} bf="s11"><span class="b" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(b)}<!--/--></span>|<span class="row" bf="s5"><!--bf:s4-->${escapeText(a().name)}<!--/--></span>|<span class="cond" bf="s7">${b ? `<!--bf-cond-start:s6-->${escapeText('on')}<!--bf-cond-end:s6-->` : `<!--bf-cond-start:s6-->${escapeText('off')}<!--bf-cond-end:s6-->`}</span>${b ? `<em bf-c="s8" bf="s10"><!--bf:s9-->${escapeTextOrMarkup(b)}<!--/--></em>` : `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    const __ra_s11 = qsa(__el, '[bf="s11"]')
    const __l = []
    const __bfw_s2 = lazySlots(__el, [{ id: 's2', kind: 'markup', path: [] }, { id: 's4', kind: 'text', path: [] }])
    createEffect(() => {
      if (__ra_s11) {
        { const __x = b
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          { const __v = __x; if (__v != null) __ra_s11.setAttribute('title', String(__v)); else __ra_s11.removeAttribute('title') }
        }
        __l[0] = __x }
        { const __x = `${a().name === b ? 'y' : 'n'}`
        if (!(1 in __l) || !Object.is(__l[1], __x)) {
          { const __v = __x; if (__v != null) __ra_s11.setAttribute('data-same', String(__v)); else __ra_s11.removeAttribute('data-same') }
        }
        __l[1] = __x }
      }
      __bfw_s2('s2', escapeTextOrNode(b))
      __bfw_s2('s4', String(a().name))
    })
    insert(__el, 's6', () => b, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s6-->${__bfSlot('on', __slots)}<!--bf-cond-end:s6-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s6-->${__bfSlot('off', __slots)}<!--bf-cond-end:s6-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    insert(__el, 's8', () => b, {
      template: () => { const __slots = []; return { html: `<em bf-c="s8" bf="s10"><!--bf:s9-->${__bfSlot(b, __slots)}<!--/--></em>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s9 = lazySlots(__branchScope, [{ id: 's9', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s9('s9', escapeTextOrNode(b)) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l0')

  const __tpl_l1 = document.createElement('template')
  __tpl_l1.innerHTML = `<li data-key="" bf="s15"><!--bf:s13--><!--/-->/<!--bf:s14--><!--/--></li>`
  const __lzp_l1 = [[0], [3]]
  const __lzs_l1 = [{ id: 's13', kind: 'markup', path: [] }, { id: 's14', kind: 'text', path: [] }]
  const __lzsc_l1 = [{ id: 's13', kind: 'markup', path: __lzp_l1[0] }, { id: 's14', kind: 'text', path: __lzp_l1[1] }]
  mapArrayLazy(() => rows(), _s16, (label) => String(label.id), {
    createRow: (__e, __idx) => {
      const label = () => __e.item
      const __el = __tpl_l1.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [__el, lazyClaimSlots(__el, __lzsc_l1)]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        { const __x = c
        { const __v = __x; if (__v != null) __t.setAttribute('title', String(__v)); else __t.removeAttribute('title') }
        __l[0] = __x }
      } }
      { const __x = c
      __r[1].write('s13', escapeTextOrNode(__x))
      __l[1] = __x }
      { const __x = label().name
      __r[1].write('s14', textOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: (__e) => {
      const label = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[1] ?? (__r[1] = lazyClaimSlots(__e.primaryEl, __lzs_l1))
      { const __x = c
      if (!(1 in __l) || !Object.is(__l[1], __x)) __d.write('s13', escapeTextOrNode(__x))
      __l[1] = __x }
      { const __x = label().name
      if (!(2 in __l) || !Object.is(__l[2], __x)) __d.write('s14', textOrNode(__x))
      __l[2] = __x }
    },
    applyOuter: (__es, __seed) => {
      for (const __e of __es) {
        const label = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s15"]'))
        if (__t) {
          { const __x = c
          if (__seed ? (__t.getAttribute('title') !== (__x != null ? String(__x) : null)) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            { const __v = __x; if (__v != null) __t.setAttribute('title', String(__v)); else __t.removeAttribute('title') }
          }
          __l[0] = __x }
        } }
        const __d = __r[1] ?? (__r[1] = lazyClaimSlots(__e.primaryEl, __lzs_l1))
        { const __x = c
        if (__seed) {
          const __s = escapeTextOrNode(__x)
          if (__d.read('s13') !== __s) __d.write('s13', __s)
        } else if (!(1 in __l) || !Object.is(__l[1], __x)) __d.write('s13', escapeTextOrNode(__x))
        __l[1] = __x }
      }
    },
  }, 'l1')

}

hydrate('ConstAliasLoopShadowHydrate', { init: initConstAliasLoopShadowHydrate, template: (_p) => `<div><div class="root"><button class="add" bf="s0">add</button><button class="rename" bf="s1">rename</button></div><ul class="hop" bf="s12"><!--bf-loop:l0-->${([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }]).map((a) => `<li data-key="${escapeAttr(a.id)}" ${(((_p.label))) != null ? 'title="' + escapeAttr(((_p.label))) + '"' : ''} ${(`${a.name === ((_p.label)) ? 'y' : 'n'}`) != null ? 'data-same="' + escapeAttr(`${a.name === ((_p.label)) ? 'y' : 'n'}`) + '"' : ''} bf="s11"><span class="b" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(((_p.label)))}<!--/--></span>|<span class="row" bf="s5"><!--bf:s4-->${escapeText(a.name)}<!--/--></span>|<span class="cond" bf="s7">${((_p.label)) ? `<!--bf-cond-start:s6-->${escapeText('on')}<!--bf-cond-end:s6-->` : `<!--bf-cond-start:s6-->${escapeText('off')}<!--bf-cond-end:s6-->`}</span>${((_p.label)) ? `<em bf-c="s8" bf="s10"><!--bf:s9-->${escapeTextOrMarkup(((_p.label)))}<!--/--></em>` : `<!--bf-cond-start:s8--><!--bf-cond-end:s8-->`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="own" bf="s16"><!--bf-loop:l1-->${([{ id: '1', name: 'r1' }, { id: '2', name: 'r2' }]).map((label) => `<li data-key="${escapeAttr(label.id)}" ${((_p.label)) != null ? 'title="' + escapeAttr((_p.label)) + '"' : ''} bf="s15"><!--bf:s13-->${escapeTextOrMarkup((_p.label))}<!--/-->/<!--bf:s14-->${escapeText(label.name)}<!--/--></li>`).join('')}<!--bf-/loop:l1--></ul>${renderChild('PropsForm__3eae41bd', {label: _p.label}, undefined, 's17')}</div>` })
export function ConstAliasLoopShadowHydrate(_p, __bfKey) { return createComponent('ConstAliasLoopShadowHydrate', _p, __bfKey) }
