import { $, $c, $t, createComponent, createEffect, createMemo, createSignal, hydrate, initChild, renderChild } from '@barefootjs/client/runtime'

export function initReactiveChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s4] = $(__scope, 's4')
  const [_s0, _s2] = $t(__scope, 's0', 's2')

  createEffect(() => {
    const __val = _p.label
    if (_s0 && !__val?.__isSlot) _s0.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = _p.value
    if (_s2 && !__val?.__isSlot) _s2.nodeValue = String(__val ?? '')
  })

  if (_s4) _s4.addEventListener('click', () => { _p.onIncrement() })
}

hydrate('ReactiveChild__aca6fc98', { init: initReactiveChild, template: (_p) => `<div class="reactive-child"><span class="child-label" bf="s1"><!--bf:s0-->${_p.label}<!--/--></span><span class="child-value" bf="s3"><!--bf:s2-->${_p.value}<!--/--></span><button class="btn-child-increment" bf="s4"> Increment from child </button></div>` })
export function ReactiveChild(_p, __bfKey) { return createComponent('ReactiveChild__aca6fc98', _p, __bfKey) }
export function initReactiveProps(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  const [_s4] = $(__scope, 's4')
  const [_s0, _s2] = $t(__scope, 's0', 's2')
  const [_s5, _s6] = $c(__scope, 's5', 's6')

  createEffect(() => {
    const __val = count()
    if (_s0 && !__val?.__isSlot) _s0.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = doubled()
    if (_s2 && !__val?.__isSlot) _s2.nodeValue = String(__val ?? '')
  })

  if (_s4) _s4.addEventListener('click', () => { setCount(n => n + 1) })

  // Reactive prop bindings
  createEffect(() => {
    if (_s5) {
      const __val = String(count())
      if (_s5.value !== __val) _s5.value = __val
    }
    if (_s6) {
      const __val = String(doubled())
      if (_s6.value !== __val) _s6.value = __val
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__ReactiveChild_s5El] = $c(__scope, 's5')
    if (__ReactiveChild_s5El) {
      const __val = String(count())
      if (__ReactiveChild_s5El.value !== __val) __ReactiveChild_s5El.value = __val
    }
    const [__ReactiveChild_s6El] = $c(__scope, 's6')
    if (__ReactiveChild_s6El) {
      const __val = String(doubled())
      if (__ReactiveChild_s6El.value !== __val) __ReactiveChild_s6El.value = __val
    }
  })

  // Initialize child components with props
  initChild('ReactiveChild__aca6fc98', _s5, { get value() { return count() }, label: "Child A", onIncrement: () => setCount(n => n + 1) })
  initChild('ReactiveChild__aca6fc98', _s6, { get value() { return doubled() }, label: "Child B (doubled)", onIncrement: () => setCount(n => n + 1) })
}

hydrate('ReactiveProps', { init: initReactiveProps, template: (_p) => `<div class="reactive-props-container"><div class="parent-section"><p class="parent-count" bf="s1">Parent count: <!--bf:s0-->${(0)}<!--/--></p><p class="parent-doubled" bf="s3">Doubled: <!--bf:s2-->${((0) * 2)}<!--/--></p><button class="btn-parent-increment" bf="s4"> +1 </button></div>${renderChild('ReactiveChild__aca6fc98', {value: (0), label: "Child A"}, undefined, 's5')}${renderChild('ReactiveChild__aca6fc98', {value: ((0) * 2), label: "Child B (doubled)"}, undefined, 's6')}</div>` })
export function ReactiveProps(_p, __bfKey) { return createComponent('ReactiveProps', _p, __bfKey) }
export function initPropsStyleChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const displayValue = createMemo(() => _p.value * 10)

  const [_s0, _s2, _s4] = $t(__scope, 's0', 's2', 's4')

  createEffect(() => {
    const __val = _p.label
    if (_s0 && !__val?.__isSlot) _s0.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = _p.value
    if (_s2 && !__val?.__isSlot) _s2.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = displayValue()
    if (_s4 && !__val?.__isSlot) _s4.nodeValue = String(__val ?? '')
  })

}

hydrate('PropsStyleChild__aca6fc98', { init: initPropsStyleChild, template: (_p) => `<div class="props-style-child"><span class="child-label" bf="s1"><!--bf:s0-->${_p.label}<!--/--></span><span class="child-raw-value" bf="s3"><!--bf:s2-->${_p.value}<!--/--></span><span class="child-computed-value" bf="s5"><!--bf:s4-->${(_p.value * 10)}<!--/--></span></div>` })
export function PropsStyleChild(_p, __bfKey) { return createComponent('PropsStyleChild__aca6fc98', _p, __bfKey) }
export function initDestructuredStyleChild(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const label = _p.label
  const value = _p.value

  const displayValue = createMemo(() => value * 10)

  const [_s0, _s2, _s4] = $t(__scope, 's0', 's2', 's4')

  createEffect(() => {
    const __val = label
    if (_s0 && !__val?.__isSlot) _s0.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = value
    if (_s2 && !__val?.__isSlot) _s2.nodeValue = String(__val ?? '')
  })

  createEffect(() => {
    const __val = displayValue()
    if (_s4 && !__val?.__isSlot) _s4.nodeValue = String(__val ?? '')
  })

}

hydrate('DestructuredStyleChild__aca6fc98', { init: initDestructuredStyleChild, template: (_p) => `<div class="destructured-style-child"><span class="child-label" bf="s1"><!--bf:s0-->${_p.label}<!--/--></span><span class="child-raw-value" bf="s3"><!--bf:s2-->${_p.value}<!--/--></span><span class="child-computed-value" bf="s5"><!--bf:s4-->${(value * 10)}<!--/--></span></div>` })
export function DestructuredStyleChild(_p, __bfKey) { return createComponent('DestructuredStyleChild__aca6fc98', _p, __bfKey) }
export function initPropsReactivityComparison(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [count, setCount] = createSignal(1)

  const [_s2] = $(__scope, 's2')
  const [_s0] = $t(__scope, 's0')
  const [_s3, _s4] = $c(__scope, 's3', 's4')

  createEffect(() => {
    const __val = count()
    if (_s0 && !__val?.__isSlot) _s0.nodeValue = String(__val ?? '')
  })

  if (_s2) _s2.addEventListener('click', () => { setCount(n => n + 1) })

  // Reactive prop bindings
  createEffect(() => {
    if (_s3) {
      const __val = String(count())
      if (_s3.value !== __val) _s3.value = __val
    }
    if (_s4) {
      const __val = String(count())
      if (_s4.value !== __val) _s4.value = __val
    }
  })

  // Reactive child component props
  createEffect(() => {
    const [__PropsStyleChild_s3El] = $c(__scope, 's3')
    if (__PropsStyleChild_s3El) {
      const __val = String(count())
      if (__PropsStyleChild_s3El.value !== __val) __PropsStyleChild_s3El.value = __val
    }
    const [__DestructuredStyleChild_s4El] = $c(__scope, 's4')
    if (__DestructuredStyleChild_s4El) {
      const __val = String(count())
      if (__DestructuredStyleChild_s4El.value !== __val) __DestructuredStyleChild_s4El.value = __val
    }
  })

  // Initialize child components with props
  initChild('PropsStyleChild__aca6fc98', _s3, { get value() { return count() }, label: "Props Style" })
  initChild('DestructuredStyleChild__aca6fc98', _s4, { get value() { return count() }, label: "Destructured" })
}

hydrate('PropsReactivityComparison', { init: initPropsReactivityComparison, template: (_p) => `<div class="props-reactivity-comparison"><div class="parent-section"><p class="parent-count" bf="s1">Count: <!--bf:s0-->${(1)}<!--/--></p><button class="btn-increment" bf="s2"> Increment </button></div><div class="children-section"><h3>Props Style (Reactive)</h3>${renderChild('PropsStyleChild__aca6fc98', {value: (1), label: "Props Style"}, undefined, 's3')}<h3>Destructured Style (Not Reactive)</h3>${renderChild('DestructuredStyleChild__aca6fc98', {value: (1), label: "Destructured"}, undefined, 's4')}</div></div>` })
export function PropsReactivityComparison(_p, __bfKey) { return createComponent('PropsReactivityComparison', _p, __bfKey) }
