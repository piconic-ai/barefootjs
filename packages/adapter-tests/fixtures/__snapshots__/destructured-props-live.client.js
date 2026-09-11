import { $, createComponent, createEffect, createMemo, createSignal, escapeAttr, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, initChild, renderChild } from '@barefootjs/client/runtime'

export function initLiveChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const doubled = createMemo(() => _p.value * 2)
  const [seen, setSeen] = createSignal(0)
  let mounted = false

  const [_s6, _s7] = $(__scope, 's6', 's7')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.value
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = doubled()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  const __bfw_s4 = lazySlots(__scope, [{ id: 's4', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = seen()
    __bfw_s4('s4', escapeTextOrNode(__val))
  })

  { const __l = []
  createEffect(() => {
    if (_s7) {
      { const __x = (_p.label ?? 'none')
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) _s7.setAttribute('data-label', String(__v)); else _s7.removeAttribute('data-label') }
      }
      __l[0] = __x }
    }
  }) }

  if (_s6) _s6.addEventListener('click', () => { _p.onPick(_p.value) })
  createEffect(() => {
    const current = _p.value
    if (!mounted) {
      mounted = true
      return
    }
    setSeen(current)
  })
}

hydrate('LiveChild__ee1733f8', { init: initLiveChild, template: (_p) => `<div class="live-child" ${((_p.label ?? 'none')) != null ? 'data-label="' + escapeAttr((_p.label ?? 'none')) + '"' : ''} bf="s7"><span class="raw" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.value)}<!--/--></span><span class="memo" bf="s3"><!--bf:s2-->${escapeTextOrMarkup((_p.value * 2))}<!--/--></span><span class="effect" bf="s5"><!--bf:s4-->${escapeTextOrMarkup((0))}<!--/--></span><button class="btn-pick" bf="s6"> pick </button></div>`, name: 'LiveChild' })
export function LiveChild(_p, __bfKey) { return createComponent('LiveChild__ee1733f8', _p, __bfKey) }
export function initDestructuredPropsLive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(1)
  const [picked, setPicked] = createSignal(0)
  const [named, setNamed] = createSignal(false)

  const [_s4, _s5] = $(__scope, 's4', 's5')
  const [_s6] = $c(__scope, 's6')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s4) _s4.addEventListener('click', () => { setCount(n => n + 1) })
  if (_s5) _s5.addEventListener('click', () => { setNamed(v => !v) })

  // Reactive prop bindings
  createEffect(() => {
    if (_s6) {
      if ('value' in _s6) { const __val = String(count()); if (_s6.value !== __val) _s6.value = __val }
    }
  })

  // Reactive child component props
  { const __l = []
  createEffect(() => {
    const [__LiveChild_s6El] = $c(__scope, 's6')
    if (__LiveChild_s6El) {
      if ('value' in __LiveChild_s6El) { const __val = String(count()); if (__LiveChild_s6El.value !== __val) __LiveChild_s6El.value = __val }
      { const __x = named() ? 'named' : undefined
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        { const __v = __x; if (__v != null) __LiveChild_s6El.setAttribute('label', String(__v)); else __LiveChild_s6El.removeAttribute('label') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('LiveChild__ee1733f8', _s6, { get value() { return count() }, get label() { return named() ? 'named' : undefined }, onPick: setPicked })
}

hydrate('DestructuredPropsLive', { init: initDestructuredPropsLive, template: (_p) => `<div class="destructured-props-live"><p class="parent-count" bf="s1">Count: <!--bf:s0-->${escapeTextOrMarkup((1))}<!--/--></p><p class="picked" bf="s3">Picked: <!--bf:s2-->${escapeTextOrMarkup((0))}<!--/--></p><button class="btn-increment" bf="s4"> +1 </button><button class="btn-name" bf="s5"> name </button>${renderChild('LiveChild__ee1733f8', {value: (1), label: (false) ? 'named' : undefined}, undefined, 's6')}</div>` })
export function DestructuredPropsLive(_p, __bfKey) { return createComponent('DestructuredPropsLive', _p, __bfKey) }
