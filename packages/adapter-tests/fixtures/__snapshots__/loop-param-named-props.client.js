import { createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $, escapeAttr, escapeText, mapArray, mountRowRoot, renderChild, upsertChild } from '@barefootjs/client/runtime'

export function initTag(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.label
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = _p.mark
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

}

hydrate('Tag__e7d377f0', { init: initTag, template: (_p) => `<span class="tag" bf="s2"><!--bf:s0-->${escapeTextOrMarkup(_p.label)}<!--/--><!--bf:s1-->${escapeTextOrMarkup(_p.mark)}<!--/--></span>`, name: 'Tag' })
export function Tag(_p, __bfKey) { return createComponent('Tag__e7d377f0', _p, __bfKey) }
export function initLoopParamNamedProps(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [items, setItems] = createSignal(['a', 'b'])
  const [total, setTotal] = createSignal(0)
  const [last, setLast] = createSignal('none')
  const bump = (props) => setTotal(total() + props.by * _p.step)
  const describe = (props) => {
    return props.label + _p.suffix
  }

  const [_s4, _s5, _s6, _s7, _s8, _s13] = $(__scope, 's4', 's5', 's6', 's7', 's8', 's13')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = total()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  const __bfw_s2 = lazySlots(__scope, [{ id: 's2', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = last()
    __bfw_s2('s2', escapeTextOrNode(__val))
  })

  if (_s4) _s4.addEventListener('click', () => setItems([...items(), 'c']))
  if (_s5) _s5.addEventListener('click', () => bump({ by: 2 }))
  if (_s6) _s6.addEventListener('click', () => setItems(items().filter((props) => props !== items()[_p.step - 1])))
  if (_s7) _s7.addEventListener('click', () => setLast(describe({ label: 'x' })))
  if (_s8) _s8.addEventListener('click', () => {
          if (_p.step > 0) {
            var props = { by: 10 }
          }
          setTotal(total() + props.by * _p.step)
        })
  mapArray(() => items(), _s13, (props) => String(props), (props, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(props())}"><span class="label" bf="s11"><!--bf:s9-->${escapeText(props())}<!--/--><!--bf:s10-->${escapeTextOrMarkup(_p.suffix)}<!--/--></span><div data-bf-ph="s12"></div></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Tag__e7d377f0', 's12', { get label() { return props() }, get mark() { return _p.suffix } }, undefined, __scope)
    const __bfw_s9 = lazySlots(__el, [{ id: 's9', kind: 'text', path: [] }, { id: 's10', kind: 'markup', path: [] }])
    createEffect(() => {
      __bfw_s9('s9', String(props()))
      __bfw_s9('s10', escapeTextOrNode(_p.suffix))
    })
    return __el
  }, 'l0')

}

hydrate('LoopParamNamedProps', { init: initLoopParamNamedProps, template: (_p) => `<div><p class="total" bf="s1"><!--bf:s0-->${escapeTextOrMarkup((0))}<!--/--></p><p class="last" bf="s3"><!--bf:s2-->${escapeTextOrMarkup(('none'))}<!--/--></p><button type="button" class="add" bf="s4">add</button><button type="button" class="bump" bf="s5">bump</button><button type="button" class="drop" bf="s6">drop</button><button type="button" class="say" bf="s7">say</button><button type="button" class="hoist" bf="s8">hoist</button><ul class="rows" bf="s13"><!--bf-loop:l0-->${(['a', 'b']).map((props) => `<li data-key="${escapeAttr(props)}"><span class="label" bf="s11"><!--bf:s9-->${escapeText(props)}<!--/--><!--bf:s10-->${escapeTextOrMarkup(_p.suffix)}<!--/--></span>${renderChild('Tag__e7d377f0', {label: props, mark: _p.suffix}, undefined, 's12')}</li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function LoopParamNamedProps(_p, __bfKey) { return createComponent('LoopParamNamedProps', _p, __bfKey) }
