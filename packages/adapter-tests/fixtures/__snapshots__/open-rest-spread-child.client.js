import { $, __bfSlot, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, insert, lazySlots, $c, forwardProps, initChild, mapArray, mountRowRoot, renderChild, upsertChild } from '@barefootjs/client/runtime'

export function initChip(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [on, setOn] = createSignal(false)

  const [_s2, _s1] = $(__scope, 's2', 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.title ?? 'none'
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s2) {
      { const __x = _p.tone
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-tone', String(__v)); else _s2.removeAttribute('data-tone') }
      }
      __l[0] = __x }
      { const __x = _p.size
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s2.setAttribute('data-size', String(__v)); else _s2.removeAttribute('data-size') }
      }
      __l[1] = __x }
    }
  }) }

  insert(__scope, 's1', () => on(), {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('!', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1-->${__bfSlot('', __slots)}<!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s2) _s2.addEventListener('click', () => setOn(!on()))
}

hydrate('Chip__70459095', { init: initChip, template: (_p) => `<button ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} ${(_p.size) != null ? 'data-size="' + escapeAttr(_p.size) + '"' : ''} bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.title ?? 'none')}<!--/-->${(false) ? `<!--bf-cond-start:s1-->${escapeText('!')}<!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1-->${escapeText('')}<!--bf-cond-end:s1-->`}</button>`, name: 'Chip' })
export function Chip(_p, __bfKey) { return createComponent('Chip__70459095', _p, __bfKey) }
export function initCard(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s3, _s7, _s8] = $(__scope, 's3', 's7', 's8')
  const [_s0, _s1, _s2] = $c(__scope, 's0', 's1', 's2')

  { const __l = []
  createEffect(() => {
    if (_s8) {
      { const __x = _p.title
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s8.setAttribute('data-own', String(__v)); else _s8.removeAttribute('data-own') }
      }
      __l[0] = __x }
    }
  }) }

  insert(__scope, 's3', () => _p.title, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3-->${renderChild('Chip__70459095', {...forwardProps(_p, {}, ["title","items"])}, undefined, 's4')}<!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [__c0] = $c(__branchScope, 's4')
      if (__c0) initChild('Chip__70459095', __c0, forwardProps(_p, {}, ["title","items"]))
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })


  // Initialize child components with props
  initChild('Chip__70459095', _s0, forwardProps(_p, {}, ["title","items"]))
  initChild('Chip__70459095', _s1, forwardProps(_p, { title: "x", get tone() { return ("tone" in _p ? _p["tone"] : "first") } }, ["title","tone","items"]))
  initChild('Chip__70459095', _s2, forwardProps(_p, { size: "last" }, ["size","title","items"]))
  mapArray(() => (_p.items ?? []), _s7, (it) => String(it), (it, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(it())}"><div data-bf-ph="s6"></div></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Chip__70459095', 's6', forwardProps(_p, { get title() { return it() } }, ["title","items"]), undefined, __scope)
    return __el
  }, 'l0')

}

hydrate('Card__70459095', { init: initCard, template: (_p) => `<section ${(_p.title) != null ? 'data-own="' + escapeAttr(_p.title) + '"' : ''} bf="s8"><p class="plain">${renderChild('Chip__70459095', {...forwardProps(_p, {}, ["title","items"])}, undefined, 's0')}</p><p class="before">${renderChild('Chip__70459095', {title: "x", tone: "first", ...forwardProps(_p, {}, ["title","items"])}, undefined, 's1')}</p><p class="after">${renderChild('Chip__70459095', {...forwardProps(_p, {}, ["title","items"]), size: "last"}, undefined, 's2')}</p><p class="branch" bf="s5">${_p.title ? `<!--bf-cond-start:s3-->${renderChild('Chip__70459095', {...forwardProps(_p, {}, ["title","items"])}, undefined, 's4')}<!--bf-cond-end:s3-->` : `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`}</p><ul bf="s7"><!--bf-loop:l0-->${_p.items.map((it) => `<li data-key="${escapeAttr(it)}">${renderChild('Chip__70459095', {title: it, ...forwardProps(_p, {}, ["title","items"])}, undefined, 's6')}</li>`).join('')}<!--bf-/loop:l0--></ul></section>`, name: 'Card' })
export function Card(_p, __bfKey) { return createComponent('Card__70459095', _p, __bfKey) }
export function initOpenRestSpreadChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [tone, setTone] = createSignal('warm')

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  if (_s1) _s1.addEventListener('click', () => setTone('cool'))

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s0) {
      if (__m[0] ??= _s0.hasAttribute('tone')) { const __v = tone(); if (__v != null) _s0.setAttribute('tone', String(__v)); else _s0.removeAttribute('tone') }
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Card_s0El] = $c(__scope, 's0')
    if (__Card_s0El) {
      { const __x = tone()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Card_s0El.hasAttribute('tone')) { const __v = __x; if (__v != null) __Card_s0El.setAttribute('tone', String(__v)); else __Card_s0El.removeAttribute('tone') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Card__70459095', _s0, { title: "T", get items() { return ['a', 'b'] }, get tone() { return tone() }, size: "l" })
}

hydrate('OpenRestSpreadChild', { init: initOpenRestSpreadChild, template: (_p) => `<div>${renderChild('Card__70459095', {title: "T", items: ['a', 'b'], tone: ('warm'), size: "l"}, undefined, 's0')}<button class="next" bf="s1">next</button></div>` })
export function OpenRestSpreadChild(_p, __bfKey) { return createComponent('OpenRestSpreadChild', _p, __bfKey) }
