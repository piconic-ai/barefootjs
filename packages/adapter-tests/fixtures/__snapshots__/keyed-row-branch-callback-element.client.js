import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, __bfSlot, createDisposableEffect, escapeAttr, escapeText, insert, mapArray, initChild, ownScopeId, renderChild } from '@barefootjs/client/runtime'

export function initPill(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)

  const [_s2] = $(__scope, 's2')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s2) _s2.addEventListener('click', () => setCount(count() + 1))
}

hydrate('Pill__18f8ff83', { init: initPill, template: (_p) => `<button type="button" class="pill" bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/-->:<!--bf:s1-->${escapeTextOrMarkup((0))}<!--/--></button>`, name: 'Pill' })
export function Pill(_p, __bfKey) { return createComponent('Pill__18f8ff83', _p, __bfKey) }
var shout = shout ?? ((s) => `${s}!`)

export function initCallbackRows(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [items, setItems] = createSignal([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ])
  const draw = (item) => _p.renderItem(item)

  const [_s0, _s5, _s10, _s15, _s18] = $(__scope, 's0', 's5', 's10', 's15', 's18')

  if (_s0) _s0.addEventListener('click', () => setItems(items().map(i => ({ ...i, label: `${i.label}x` }))))
  mapArray(() => items(), _s5, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}" bf="s4">${_p.renderItem ? `<!--bf-cond-start:s1--><!--bf:s2-->${escapeText(_p.renderItem(item()))}<!--/--><!--bf-cond-end:s1-->` : `<span bf-c="s1"><!--bf:s3-->${escapeText(item().label)}<!--/--></span>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's1', () => _p.renderItem, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><!--bf:s2-->${__bfSlot(_p.renderItem(item()), __slots)}<!--/--><!--bf-cond-end:s1-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<span bf-c="s1"><!--bf:s3-->${__bfSlot(item().label, __slots)}<!--/--></span>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s3 = lazySlots(__branchScope, [{ id: 's3', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s3('s3', escapeTextOrNode(item().label)) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l0')

  mapArray(() => items(), _s10, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}" bf="s9">${_p.renderItem ? `<!--bf-cond-start:s6--><!--bf:s7-->${escapeText(_p['renderItem'](item()))}<!--/--><!--bf-cond-end:s6-->` : `<span bf-c="s6"><!--bf:s8-->${escapeText(item().label)}<!--/--></span>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's6', () => _p.renderItem, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s6--><!--bf:s7-->${__bfSlot(_p['renderItem'](item()), __slots)}<!--/--><!--bf-cond-end:s6-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<span bf-c="s6"><!--bf:s8-->${__bfSlot(item().label, __slots)}<!--/--></span>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s8 = lazySlots(__branchScope, [{ id: 's8', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s8('s8', escapeTextOrNode(item().label)) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l1')

  mapArray(() => items(), _s15, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}" bf="s14">${_p.renderItem ? `<!--bf-cond-start:s11--><!--bf:s12-->${escapeText(draw(item()))}<!--/--><!--bf-cond-end:s11-->` : `<span bf-c="s11"><!--bf:s13-->${escapeText(item().label)}<!--/--></span>`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's11', () => _p.renderItem, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s11--><!--bf:s12-->${__bfSlot(draw(item()), __slots)}<!--/--><!--bf-cond-end:s11-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    }, {
      template: () => { const __slots = []; return { html: `<span bf-c="s11"><!--bf:s13-->${__bfSlot(item().label, __slots)}<!--/--></span>`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s13 = lazySlots(__branchScope, [{ id: 's13', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s13('s13', escapeTextOrNode(item().label)) }))
        return () => __disposers.forEach(d => d())
      }
    })
    return __el
  }, 'l2')

  mapArray(() => items(), _s18, (item) => String(item.id), (item, __idx, __existing) => {
    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(item().id)}">${item().id > 0 ? `<!--bf-cond-start:s16--><!--bf:s17-->${escapeText(shout(item().label))}<!--/--><!--bf-cond-end:s16-->` : `<!--bf-cond-start:s16-->${escapeText('none')}<!--bf-cond-end:s16-->`}</li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
    insert(__el, 's16', () => item().id > 0, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s16--><!--bf:s17-->${__bfSlot(shout(item().label), __slots)}<!--/--><!--bf-cond-end:s16-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
        const __disposers = []
        const __bfw_s17 = lazySlots(__branchScope, [{ id: 's17', kind: 'markup', path: [] }])
        __disposers.push(createDisposableEffect(() => { __bfw_s17('s17', escapeTextOrNode(shout(item().label))) }))
        return () => __disposers.forEach(d => d())
      }
    }, {
      template: () => { const __slots = []; return { html: `<!--bf-cond-start:s16-->${__bfSlot('none', __slots)}<!--bf-cond-end:s16-->`, slots: __slots } },
      bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      }
    })
    return __el
  }, 'l3')

}

hydrate('CallbackRows__18f8ff83', { init: initCallbackRows, template: (_p) => `${((__bf_const_shout) => `<div><button type="button" class="relabel" bf="s0">relabel</button><ul class="direct" bf="s5"><!--bf-loop:l0-->${([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ]).map((item) => `<li data-key="${escapeAttr(item.id)}" bf="s4">${_p.renderItem ? `<!--bf-cond-start:s1--><!--bf:s2-->${escapeText(_p.renderItem(item))}<!--/--><!--bf-cond-end:s1-->` : `<span bf-c="s1"><!--bf:s3-->${escapeText(item.label)}<!--/--></span>`}</li>`).join('')}<!--bf-/loop:l0--></ul><ul class="bracket" bf="s10"><!--bf-loop:l1-->${([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ]).map((item) => `<li data-key="${escapeAttr(item.id)}" bf="s9">${_p.renderItem ? `<!--bf-cond-start:s6--><!--bf:s7-->${escapeText(_p['renderItem'](item))}<!--/--><!--bf-cond-end:s6-->` : `<span bf-c="s6"><!--bf:s8-->${escapeText(item.label)}<!--/--></span>`}</li>`).join('')}<!--bf-/loop:l1--></ul><ul class="wrapper" bf="s15"><!--bf-loop:l2-->${([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ]).map((item) => `<li data-key="${escapeAttr(item.id)}" bf="s14">${_p.renderItem ? `<!--bf-cond-start:s11--><!--bf:s12-->${''}<!--/--><!--bf-cond-end:s11-->` : `<span bf-c="s11"><!--bf:s13-->${escapeText(item.label)}<!--/--></span>`}</li>`).join('')}<!--bf-/loop:l2--></ul><ul class="scalar" bf="s18"><!--bf-loop:l3-->${([
    { id: 1, label: 'a' },
    { id: 2, label: 'b' },
  ]).map((item) => `<li data-key="${escapeAttr(item.id)}">${item.id > 0 ? `<!--bf-cond-start:s16--><!--bf:s17-->${escapeText((__bf_const_shout)(item.label))}<!--/--><!--bf-cond-end:s16-->` : `<!--bf-cond-start:s16-->${escapeText('none')}<!--bf-cond-end:s16-->`}</li>`).join('')}<!--bf-/loop:l3--></ul></div>`)(((((shout)))))}`, name: 'CallbackRows' })
export function CallbackRows(_p, __bfKey) { return createComponent('CallbackRows__18f8ff83', _p, __bfKey) }
export function initKeyedRowBranchCallbackElement(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)


  // Initialize child components with props
  initChild('CallbackRows__18f8ff83', __scope, { get renderItem() { return BFInlineJsxCallback1 } })
}

hydrate('KeyedRowBranchCallbackElement', { init: initKeyedRowBranchCallbackElement, template: (_p, __bfKey) => `${renderChild('CallbackRows__18f8ff83', {renderItem: BFInlineJsxCallback1}, undefined, 's0')}`, comment: true, keyRelay: true })
export function KeyedRowBranchCallbackElement(_p, __bfKey) { return createComponent('KeyedRowBranchCallbackElement', _p, __bfKey) }
export function initBFInlineJsxCallback1(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    if (__scope) {
      { const __x = _p.label
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __scope.hasAttribute('label')) { const __v = __x; if (__v != null) __scope.setAttribute('label', String(__v)); else __scope.removeAttribute('label') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Pill__18f8ff83', __scope, { get label() { return _p.label } })
}

hydrate('BFInlineJsxCallback1__18f8ff83', { init: initBFInlineJsxCallback1, template: (_p, __bfKey) => `${renderChild('Pill__18f8ff83', {label: _p.label}, undefined, 's0')}`, comment: true, keyRelay: true, name: 'BFInlineJsxCallback1' })
export function BFInlineJsxCallback1(_p, __bfKey) { return createComponent('BFInlineJsxCallback1__18f8ff83', _p, __bfKey) }
