import { $, createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $c, initChild, renderChild, escapeAttr, mapArray, mountRowRoot, upsertChild } from '@barefootjs/client/runtime'

export function initSame(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [result, setResult] = createSignal('unchecked')

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = result()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => setResult(_p.token === _p.token ? 'same' : 'different'))
}

hydrate('Same__bb81634c', { init: initSame, template: (_p) => `<span><button bf="s0">check</button><output bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('unchecked'))}<!--/--></output></span>`, name: 'Same' })
export function Same(_p, __bfKey) { return createComponent('Same__bb81634c', _p, __bfKey) }
export function initReads(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [result, setResult] = createSignal('unchecked')

  const [_s0] = $(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = result()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', () => setResult(String(_p.token.n)))
}

hydrate('Reads__bb81634c', { init: initReads, template: (_p) => `<span><button bf="s0">read</button><output bf="s2"><!--bf:s1-->${escapeTextOrMarkup(('unchecked'))}<!--/--></output></span>`, name: 'Reads' })
export function Reads(_p, __bfKey) { return createComponent('Reads__bb81634c', _p, __bfKey) }
export function initForward(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0] = $c(__scope, 's0')


  // Reactive child component props
  { const __l = []; const __m = []
  createEffect(() => {
    const [__Same_s0El] = $c(__scope, 's0')
    if (__Same_s0El) {
      { const __x = _p.token
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        if (__m[0] ??= __Same_s0El.hasAttribute('token')) { const __v = __x; if (__v != null) __Same_s0El.setAttribute('token', String(__v)); else __Same_s0El.removeAttribute('token') }
      }
      __l[0] = __x }
    }
  }) }

  // Initialize child components with props
  initChild('Same__bb81634c', _s0, { get token() { return _p.token } })
}

hydrate('Forward__bb81634c', { init: initForward, template: (_p) => `<i>${renderChild('Same__bb81634c', {token: _p.token}, undefined, 's0')}</i>`, name: 'Forward' })
export function Forward(_p, __bfKey) { return createComponent('Forward__bb81634c', _p, __bfKey) }
export function initConstObjectPropIdentityHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const MODULE_TOKEN = { n: 5 }
  const [rows, setRows] = createSignal([{ id: '1' }, { id: '2' }])
  const obj = { n: 1 }
  const arr = [1, 2]
  const made = new Map()
  const fn = () => obj.n
  const [count, setCount] = createSignal(0)
  const get = count
  const live = { n: get() }

  const [_s7, _s8, _s10] = $(__scope, 's7', 's8', 's10')
  const [_s0, _s1, _s2, _s3, _s4, _s5, _s6] = $c(__scope, 's0', 's1', 's2', 's3', 's4', 's5', 's6')

  if (_s7) _s7.addEventListener('click', () => setCount(count() + 1))
  if (_s8) _s8.addEventListener('click', () => setRows([...rows(), { id: '3' }]))

  // Initialize child components with props
  initChild('Same__bb81634c', _s0, { get token() { return obj } })
  initChild('Same__bb81634c', _s1, { get token() { return arr } })
  initChild('Same__bb81634c', _s2, { get token() { return made } })
  initChild('Same__bb81634c', _s3, { get token() { return MODULE_TOKEN } })
  initChild('Same__bb81634c', _s4, { get token() { return fn } })
  initChild('Forward__bb81634c', _s5, { get token() { return obj } })
  initChild('Reads__bb81634c', _s6, { get token() { return { n: get() } } })
  mapArray(() => rows(), _s10, (r) => String(r.id), (r, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(r().id)}"><div data-bf-ph="s9"></div></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Same__bb81634c', 's9', { get token() { return obj } }, undefined, __scope)
    return __el
  }, 'l0')

}

hydrate('ConstObjectPropIdentityHydrate', { init: initConstObjectPropIdentityHydrate, template: (_p) => `<div class="root"><p class="obj">${renderChild('Same__bb81634c', {token: ({ n: 1 })}, undefined, 's0')}</p><p class="arr">${renderChild('Same__bb81634c', {token: ([1, 2])}, undefined, 's1')}</p><p class="made">${renderChild('Same__bb81634c', {token: (new Map())}, undefined, 's2')}</p><p class="module">${renderChild('Same__bb81634c', {token: ({ n: 5 })}, undefined, 's3')}</p><p class="fn">${renderChild('Same__bb81634c', {token: (() => ({ n: 1 }).n)}, undefined, 's4')}</p><p class="forward">${renderChild('Forward__bb81634c', {token: ({ n: 1 })}, undefined, 's5')}</p><p class="alias">${renderChild('Reads__bb81634c', {token: ({ n: (0) })}, undefined, 's6')}</p><button class="bump" bf="s7">bump</button><button class="add" bf="s8">add</button><ul bf="s10"><!--bf-loop:l0-->${([{ id: '1' }, { id: '2' }]).map((r) => `<li data-key="${escapeAttr(r.id)}">${renderChild('Same__bb81634c', {token: ({ n: 1 })}, undefined, 's9')}</li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function ConstObjectPropIdentityHydrate(_p, __bfKey) { return createComponent('ConstObjectPropIdentityHydrate', _p, __bfKey) }
