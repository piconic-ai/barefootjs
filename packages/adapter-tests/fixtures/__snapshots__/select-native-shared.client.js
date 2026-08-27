import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, mapArrayLazy, qsa, textOrNode } from '@barefootjs/client/runtime'


export function initSelectNative(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [fruits] = createSignal([
    { id: 'apple', label: 'Apple' },
    { id: 'banana', label: 'Banana' },
    { id: 'cherry', label: 'Cherry' },
  ])
  const [picked, setPicked] = createSignal('banana')

  const [_s2] = $(__scope, 's2')

  const __bfw_s3 = lazySlots(__scope, [{ id: 's3', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = picked()
    __bfw_s3('s3', escapeTextOrNode(__val))
  })

  createEffect(() => {
    if (_s2) {
      const __val = String(picked())
      if ('value' in _s2) { if (_s2.value !== __val) _s2.value = __val } else { _s2.setAttribute('value', __val) }
    }
  })

  if (_s2) _s2.addEventListener('change', (e) => { setPicked(e.target.value) })
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<option data-key="" bf="s1"><!--bf:s0--><!--/--></option>`
  const __lzp_l0 = [[0]]
  const __lzs_l0 = [{ id: 's0', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's0', kind: 'text', path: __lzp_l0[0] }]
  mapArrayLazy(() => fruits(), _s2, (f, i) => String(i), {
    createRow: (__e, i) => {
      const f = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [__el, lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        const __x = f().id
        const __val = String(__x)
        if ('value' in __t) { if (__t.value !== __val) __t.value = __val } else { __t.setAttribute('value', __val) }
        __l[0] = __x
      } }
      { const __t = __r[0]
      if (__t) {
        const __x = (picked()) === (f().id)
        __t.selected = !!(__x)
        __l[1] = __x
      } }
      { const __x = f().label
      __r[1]('s0', textOrNode(__x))
      __l[2] = __x }
      return __el
    },
    applyItem: (__e) => {
      const f = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s1"]'))
      if (__t) {
        const __x = f().id
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          const __val = String(__x)
          if ('value' in __t) { if (__t.value !== __val) __t.value = __val } else { __t.setAttribute('value', __val) }
        }
        __l[0] = __x
      } }
      { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s1"]'))
      if (__t) {
        const __x = (picked()) === (f().id)
        if (!(1 in __l) || !Object.is(__l[1], __x)) {
          __t.selected = !!(__x)
        }
        __l[1] = __x
      } }
      const __d = __r[1] ?? (__r[1] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = f().label
      if (!(2 in __l) || !Object.is(__l[2], __x)) __d('s0', textOrNode(__x))
      __l[2] = __x }
    },
    applyOuter: (__es, __seed) => {
      picked()
      for (const __e of __es) {
        const f = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s1"]'))
        if (__t) {
          const __x = (picked()) === (f().id)
          if (__seed ? (__t.selected !== !!(__x)) : (!(1 in __l) || !Object.is(__l[1], __x))) {
            __t.selected = !!(__x)
          }
          __l[1] = __x
        } }
      }
    },
  }, 'l0')

}

hydrate('SelectNative', { init: initSelectNative, template: (_p) => `<div class="select-native-demo"><select class="fruit-select" bf="s2"><!--bf-loop:l0-->${([
    { id: 'apple', label: 'Apple' },
    { id: 'banana', label: 'Banana' },
    { id: 'cherry', label: 'Cherry' },
  ]).map((f, i) => `<option data-key="${escapeAttr(i)}" ${(f.id) != null ? 'value="' + escapeAttr(f.id) + '"' : ''} ${(('banana')) === (f.id) ? 'selected' : ''} bf="s1"><!--bf:s0-->${escapeText(f.label)}<!--/--></option>`).join('')}<!--bf-/loop:l0--></select><p class="picked-value" bf="s4">Picked: <!--bf:s3-->${escapeTextOrMarkup(('banana'))}<!--/--></p></div>` })
export function SelectNative(_p, __bfKey) { return createComponent('SelectNative', _p, __bfKey) }
