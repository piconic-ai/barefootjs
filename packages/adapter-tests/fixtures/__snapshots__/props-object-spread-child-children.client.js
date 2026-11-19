import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, markupOrEmpty, $c, forwardProps, initChild, renderChild, __slot, childScopeBySlot, escapeText, textOrNode } from '@barefootjs/client/runtime'

export function initNote(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [value, setValue] = createSignal(_p.children ?? 'missing')
  createEffect(() => {
    const __val = _p.children
    if (__val !== undefined) setValue(__val)
  })

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = value()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s1) {
      { const __x = _p.tone
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s1.setAttribute('data-tone', String(__v)); else _s1.removeAttribute('data-tone') }
      }
      __l[0] = __x }
    }
  }) }

  if (_s1) _s1.addEventListener('click', () => setValue(`${value()}!`))
}

hydrate('Note__f8482c07', { init: initNote, template: (_p) => `<b ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.children ?? 'missing'))}<!--/--></b>`, name: 'Note' })
export function Note(_p, __bfKey) { return createComponent('Note__f8482c07', _p, __bfKey) }
export function initFrame(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = _p.tone
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('data-tone', String(__v)); else _s0.removeAttribute('data-tone') }
      }
      __l[0] = __x }
    }
  }) }

}

hydrate('Frame__f8482c07', { init: initFrame, template: (_p) => `<i ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s0">${markupOrEmpty(_p.children)}</i>`, name: 'Frame' })
export function Frame(_p, __bfKey) { return createComponent('Frame__f8482c07', _p, __bfKey) }
export function initText(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Note__f8482c07', _s0, forwardProps(_p, { get children() { return "own" } }, []))
}

hydrate('Text__f8482c07', { init: initText, template: (_p) => `<p class="text">${renderChild('Note__f8482c07', {..._p, children: `own`}, undefined, 's0')}</p>`, name: 'Text' })
export function Text(_p, __bfKey) { return createComponent('Text__f8482c07', _p, __bfKey) }
export function initDynamic(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Frame__f8482c07', _s0, forwardProps(_p, { get children() { return [_p.children, "!"] } }, []))
}

hydrate('Dynamic__f8482c07', { init: initDynamic, template: (_p) => `<p class="dynamic">${renderChild('Frame__f8482c07', {..._p, children: `${markupOrEmpty(_p.children)}!`}, undefined, 's0')}</p>`, name: 'Dynamic' })
export function Dynamic(_p, __bfKey) { return createComponent('Dynamic__f8482c07', _p, __bfKey) }
export function initExplicit(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Note__f8482c07', _s0, forwardProps(_p, { tone: "cold", get children() { return "own" } }, ["tone"]))
}

hydrate('Explicit__f8482c07', { init: initExplicit, template: (_p) => `<p class="explicit">${renderChild('Note__f8482c07', {..._p, tone: "cold", children: `own`}, undefined, 's0')}</p>`, name: 'Explicit' })
export function Explicit(_p, __bfKey) { return createComponent('Explicit__f8482c07', _p, __bfKey) }
export function initNested(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1, _s0] = $c(__scope, 's1', 's0')


  // Initialize child components with props
  initChild('Frame__f8482c07', _s1, forwardProps(_p, { get children() { return __slot(() => createComponent('Note__f8482c07', { get children() { return "inner" } }, undefined, { parent: __scopeId, mount: 's0' })) } }, []))
  initChild('Note__f8482c07', _s0, forwardProps(_p, { get children() { return "inner" } }, []))
}

hydrate('Nested__f8482c07', { init: initNested, template: (_p) => `<p class="nested">${renderChild('Frame__f8482c07', {..._p, children: `${renderChild('Note__f8482c07', {..._p, children: `inner`}, undefined, 's0')}`}, undefined, 's1')}</p>`, name: 'Nested' })
export function Nested(_p, __bfKey) { return createComponent('Nested__f8482c07', _p, __bfKey) }
export function initForward(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Frame__f8482c07', _s0, forwardProps(_p, {}, []))
}

hydrate('Forward__f8482c07', { init: initForward, template: (_p) => `<p class="forward">${renderChild('Frame__f8482c07', {..._p}, undefined, 's0')}</p>`, name: 'Forward' })
export function Forward(_p, __bfKey) { return createComponent('Forward__f8482c07', _p, __bfKey) }
export function initRequired(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Initialize child components with props
  initChild('Frame__f8482c07', _s0, forwardProps(_p, { get children() { return "own" } }, []))
}

hydrate('Required__f8482c07', { init: initRequired, template: (_p) => `<p class="required">${renderChild('Frame__f8482c07', {..._p, children: `own`}, undefined, 's0')}</p>`, name: 'Required' })
export function Required(_p, __bfKey) { return createComponent('Required__f8482c07', _p, __bfKey) }
export function initRows(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s2] = $(__scope, 's2')

  // Reactive texts in static array children
  if (_s2) {
    ['a', 'b'].forEach((x, __idx) => {
      let __iterEl = _s2.children[__idx]
      if (__iterEl) {
        const __bfw_s0 = lazySlots(__iterEl, [{ id: '^s0', kind: 'text', path: [] }])
        createEffect(() => { __bfw_s0('^s0', textOrNode(x)) })
      }
    })
  }

  // Initialize nested Frame in static array
  if (_s2) {
    ['a', 'b'].forEach((x, __idx) => {
      const __iterEl = _s2.children[__idx]
      if (__iterEl) {
        const __compEl = childScopeBySlot(__iterEl, __scopeId, 's1')
        if (__compEl) initChild('Frame__f8482c07', __compEl, forwardProps(_p, {}, []))
      }
    })
  }

}

hydrate('Rows__f8482c07', { init: initRows, template: (_p) => `<ul class="rows" bf="s2"><!--bf-loop:l0-->${['a', 'b'].map((x) => `<li data-key="${escapeAttr(x)}">${renderChild('Frame__f8482c07', {..._p, children: `<!--bf:^s0-->${escapeText(x)}<!--/-->`}, undefined, 's1')}</li>`).join('')}<!--bf-/loop:l0--></ul>`, name: 'Rows' })
export function Rows(_p, __bfKey) { return createComponent('Rows__f8482c07', _p, __bfKey) }
export function initPropsObjectSpreadChildChildren(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1, _s2, _s3, _s4, _s5, _s6] = $c(__scope, 's0', 's1', 's2', 's3', 's4', 's5', 's6')


  // Initialize child components with props
  initChild('Text__f8482c07', _s0, { children: "hello", tone: "warm" })
  initChild('Dynamic__f8482c07', _s1, { children: "hello", tone: "warm" })
  initChild('Explicit__f8482c07', _s2, { children: "hello", tone: "warm" })
  initChild('Nested__f8482c07', _s3, { children: "hello", tone: "warm" })
  initChild('Forward__f8482c07', _s4, { children: "hello", tone: "warm" })
  initChild('Required__f8482c07', _s5, { children: "hello", tone: "warm" })
  initChild('Rows__f8482c07', _s6, { children: "hello", tone: "warm" })
}

hydrate('PropsObjectSpreadChildChildren', { init: initPropsObjectSpreadChildChildren, template: (_p) => `<div>${renderChild('Text__f8482c07', {children: "hello", tone: "warm"}, undefined, 's0')}${renderChild('Dynamic__f8482c07', {children: "hello", tone: "warm"}, undefined, 's1')}${renderChild('Explicit__f8482c07', {children: "hello", tone: "warm"}, undefined, 's2')}${renderChild('Nested__f8482c07', {children: "hello", tone: "warm"}, undefined, 's3')}${renderChild('Forward__f8482c07', {children: "hello", tone: "warm"}, undefined, 's4')}${renderChild('Required__f8482c07', {children: "hello", tone: "warm"}, undefined, 's5')}${renderChild('Rows__f8482c07', {children: "hello", tone: "warm"}, undefined, 's6')}</div>` })
export function PropsObjectSpreadChildChildren(_p, __bfKey) { return createComponent('PropsObjectSpreadChildChildren', _p, __bfKey) }
