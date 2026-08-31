import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, mapArrayLazy, qsa } from '@barefootjs/client/runtime'


export function initTextareaRowBreakout(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [value, setValue] = createSignal('a</textarea><b class="broke">X</b>')
  const [ids, setIds] = createSignal([1])

  const [_s0, _s2] = $(__scope, 's0', 's2')

  if (_s0) _s0.addEventListener('click', () => { setIds([1, 2]) })
  mapArrayLazy(() => ids(), _s2, (id) => String(id), {
    createRow: (__e, __idx) => {
      const id = () => __e.item
      const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(id())}"><textarea class="ta" bf="s1">${escapeText(value())}</textarea></li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
      const __r = __e.refs = [qsa(__el, '[bf="s1"]')]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        const __x = value()
        const __val = String(__x)
        if ('value' in __t) { if (__t.value !== __val) __t.value = __val } else { __t.setAttribute('value', __val) }
        __l[0] = __x
      } }
      return __el
    },
    applyItem: () => {},
    applyOuter: (__es, __seed) => {
      value()
      for (const __e of __es) {
        const id = () => __e.item
        const __r = __e.refs ?? (__e.refs = [])
        const __l = __e.last ?? (__e.last = [])
        { const __t = 0 in __r ? __r[0] : (__r[0] = qsa(__e.primaryEl, '[bf="s1"]'))
        if (__t) {
          const __x = value()
          if (__seed ? (('value' in __t ? __t.value !== String(__x) : __t.getAttribute('value') !== String(__x))) : (!(0 in __l) || !Object.is(__l[0], __x))) {
            const __val = String(__x)
            if ('value' in __t) { if (__t.value !== __val) __t.value = __val } else { __t.setAttribute('value', __val) }
          }
          __l[0] = __x
        } }
      }
    },
  }, 'l0')

  if (_s2) _s2.addEventListener('input', (__bfEvt) => {
    const target = __bfEvt.target
    const s1El = target.closest('[bf="s1"]')
    if (s1El && _s2.contains(s1El)) {
      const li = s1El.closest('[data-key]')
      if (li) {
        const key = li.getAttribute('data-key')
        const id = ids().find(item => String(item) === key)
        if (id) {
          ;(() => setValue('a</textarea><b class="broke">X</b>'))(__bfEvt)
        }
      }
      return
    }
  })

}

hydrate('TextareaRowBreakout', { init: initTextareaRowBreakout, template: (_p) => `<div><button class="add" bf="s0">add</button><ul bf="s2"><!--bf-loop:l0-->${([1]).map((id) => `<li data-key="${escapeAttr(id)}"><textarea class="ta" bf="s1">${escapeText(('a</textarea><b class="broke">X</b>'))}</textarea></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function TextareaRowBreakout(_p, __bfKey) { return createComponent('TextareaRowBreakout', _p, __bfKey) }
