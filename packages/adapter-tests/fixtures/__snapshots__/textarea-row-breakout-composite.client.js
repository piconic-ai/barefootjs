import { createComponent, createEffect, createSignal, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots, $, escapeAttr, escapeText, mapArray, mountRowRoot, qsa, renderChild, upsertChild } from '@barefootjs/client/runtime'

export function initTag(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const id = _p.id

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = id
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

}

hydrate('Tag__515bc416', { init: initTag, template: (_p) => `<span class="tag" bf="s1"><!--bf:s0-->${escapeTextOrMarkup(_p.id)}<!--/--></span>`, name: 'Tag' })
export function Tag(_p, __bfKey) { return createComponent('Tag__515bc416', _p, __bfKey) }
export function initTextareaRowBreakoutComposite(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [value, setValue] = createSignal('a</textarea><b class="broke">X</b>')
  const [ids, setIds] = createSignal([1])

  const [_s0, _s3] = $(__scope, 's0', 's3')

  if (_s0) _s0.addEventListener('click', () => { setIds([1, 2]) })
  mapArray(() => ids(), _s3, (id) => String(id), (id, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(id())}"><div data-bf-ph="s1"></div><textarea class="ta" bf="s2">${escapeText(value())}</textarea></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    upsertChild(__el, 'Tag__515bc416', 's1', { get id() { return id() } }, undefined, __scope)
    { const __e = qsa(__el, '[bf="s2"]'); if (__e) __e.addEventListener('input', () => { setValue('a</textarea><b class="broke">X</b>') }) }
    const __ra_s2 = qsa(__el, '[bf="s2"]')
    createEffect(() => {
      if (__ra_s2) {
        {
          const __val = String(value())
          if ('value' in __ra_s2) { if (__ra_s2.value !== __val) __ra_s2.value = __val } else { __ra_s2.setAttribute('value', __val) }
        }
      }
    })
    return __el
  }, 'l0')

}

hydrate('TextareaRowBreakoutComposite', { init: initTextareaRowBreakoutComposite, template: (_p) => `<div><button class="add" bf="s0">add</button><ul bf="s3"><!--bf-loop:l0-->${([1]).map((id) => `<li data-key="${escapeAttr(id)}">${renderChild('Tag__515bc416', {id: id}, undefined, 's1')}<textarea class="ta" bf="s2">${escapeText(('a</textarea><b class="broke">X</b>'))}</textarea></li>`).join('')}<!--bf-/loop:l0--></ul></div>` })
export function TextareaRowBreakoutComposite(_p, __bfKey) { return createComponent('TextareaRowBreakoutComposite', _p, __bfKey) }
