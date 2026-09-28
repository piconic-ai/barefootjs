import { $, $c, createComponent, createEffect, createSignal, escapeAttr, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

export function initRestForwardTag(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const variantClasses = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[(_p.variant ?? 'a')]

  const [_s0] = $(__scope, 's0')

  { const __l = []
  createEffect(() => {
    if (_s0) {
      { const __x = `${({"a": "cls-a", "b": "cls-b"})[(_p.variant ?? 'a')]}`
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('class', String(__v)); else _s0.removeAttribute('class') }
      }
      __l[0] = __x }
      { const __x = _p.tag
      if (!(1 in __l) || !Object.is(__l[1], __x)) {
        { const __v = __x; if (__v != null) _s0.setAttribute('tag', String(__v)); else _s0.removeAttribute('tag') }
      }
      __l[1] = __x }
    }
  }) }

}

hydrate('RestForwardTag', { init: initRestForwardTag, template: (_p) => `<span data-slot="rest-tag" ${(`${({"a": "cls-a", "b": "cls-b"})[(_p.variant ?? 'a')]}`) != null ? 'class="' + escapeAttr(`${({"a": "cls-a", "b": "cls-b"})[(_p.variant ?? 'a')]}`) + '"' : ''} ${(_p.tag) != null ? 'tag="' + escapeAttr(_p.tag) + '"' : ''} bf="s0">content</span>` })
export function RestForwardTag(_p, __bfKey) { return createComponent('RestForwardTag', _p, __bfKey) }
export function initChildPropRestForwardUndefinedStart(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [tag, setTag] = createSignal(undefined)

  const [_s1] = $(__scope, 's1')
  const [_s0] = $c(__scope, 's0')

  if (_s1) _s1.addEventListener('click', () => { setTag(t => (t === undefined ? 'x' : undefined)) })

  // Reactive prop bindings
  { const __m = []
  createEffect(() => {
    if (_s0) {
      if (__m[0] ??= _s0.hasAttribute('tag')) { const __v = tag(); if (__v != null) _s0.setAttribute('tag', String(__v)); else _s0.removeAttribute('tag') }
    }
  }) }

  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__RestForwardTag_s0El] = $c(__scope, 's0')
    if (__RestForwardTag_s0El) {
      { const __x = tag()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __RestForwardTag_s0El.hasAttribute('tag')) { const __v = __x; if (__v != null) __RestForwardTag_s0El.setAttribute('tag', String(__v)); else __RestForwardTag_s0El.removeAttribute('tag') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('RestForwardTag', _s0, { get tag() { return tag() } })
}

hydrate('ChildPropRestForwardUndefinedStart', { init: initChildPropRestForwardUndefinedStart, template: (_p) => `<div>${renderChild('RestForwardTag', {tag: (undefined)}, undefined, 's0')}<button bf="s1">toggle</button></div>` })
export function ChildPropRestForwardUndefinedStart(_p, __bfKey) { return createComponent('ChildPropRestForwardUndefinedStart', _p, __bfKey) }
