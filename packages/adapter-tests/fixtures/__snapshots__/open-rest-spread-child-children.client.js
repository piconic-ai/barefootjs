import { $, createComponent, createEffect, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, escapeText, forwardProps, initChild, markupOrEmpty, renderChild } from '@barefootjs/client/runtime'

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

hydrate('Note__8173d5d1', { init: initNote, template: (_p) => `<b ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s1"><!--bf:s0-->${escapeTextOrMarkup((_p.children ?? 'missing'))}<!--/--></b>`, name: 'Note' })
export function Note(_p, __bfKey) { return createComponent('Note__8173d5d1', _p, __bfKey) }
export function initTaken(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const children = _p.children

  const [_s0, _s1, _s2, _s3] = $c(__scope, 's0', 's1', 's2', 's3')


  // Initialize child components with props
  initChild('Note__8173d5d1', _s0, forwardProps(_p, { get children() { return children ?? 'fallback' } }, ["children"]))
  initChild('Note__8173d5d1', _s1, forwardProps(_p, { get children() { return children } }, ["children"]))
  initChild('Note__8173d5d1', _s2, forwardProps(_p, { get children() { return "text" } }, ["children"]))
  initChild('Note__8173d5d1', _s3, forwardProps(_p, { get children() { return [children, "!"] } }, ["children"]))
}

hydrate('Taken__8173d5d1', { init: initTaken, template: (_p) => `<section><p class="fallback">${renderChild('Note__8173d5d1', {...forwardProps(_p, {}, ["children"]), children: `${_p.children == null ? escapeText(_p.children ?? 'fallback') : markupOrEmpty(_p.children)}`}, undefined, 's0')}</p><p class="bare">${renderChild('Note__8173d5d1', {...forwardProps(_p, {}, ["children"]), children: `${markupOrEmpty(_p.children)}`}, undefined, 's1')}</p><p class="text">${renderChild('Note__8173d5d1', {...forwardProps(_p, {}, ["children"]), children: `text`}, undefined, 's2')}</p><p class="list">${renderChild('Note__8173d5d1', {...forwardProps(_p, {}, ["children"]), children: `${markupOrEmpty(_p.children)}!`}, undefined, 's3')}</p></section>`, name: 'Taken' })
export function Taken(_p, __bfKey) { return createComponent('Taken__8173d5d1', _p, __bfKey) }
export function initCarried(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

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


  // Initialize child components with props
  initChild('Note__8173d5d1', _s0, forwardProps(_p, { get children() { return "own" } }, ["tone"]))
}

hydrate('Carried__8173d5d1', { init: initCarried, template: (_p) => `<p class="carried" ${(_p.tone) != null ? 'data-tone="' + escapeAttr(_p.tone) + '"' : ''} bf="s1">${renderChild('Note__8173d5d1', {...forwardProps(_p, {}, ["tone"]), children: `own`}, undefined, 's0')}</p>`, name: 'Carried' })
export function Carried(_p, __bfKey) { return createComponent('Carried__8173d5d1', _p, __bfKey) }
export function initOpenRestSpreadChildChildren(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s1] = $c(__scope, 's0', 's1')


  // Initialize child components with props
  initChild('Taken__8173d5d1', _s0, { children: "hello", tone: "warm" })
  initChild('Carried__8173d5d1', _s1, { children: "hello", tone: "warm" })
}

hydrate('OpenRestSpreadChildChildren', { init: initOpenRestSpreadChildChildren, template: (_p) => `<div>${renderChild('Taken__8173d5d1', {children: "hello", tone: "warm"}, undefined, 's0')}${renderChild('Carried__8173d5d1', {children: "hello", tone: "warm"}, undefined, 's1')}</div>` })
export function OpenRestSpreadChildChildren(_p, __bfKey) { return createComponent('OpenRestSpreadChildChildren', _p, __bfKey) }
