import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var describe = describe ?? function(o) {
  return [o.shown].map(label => label + '!').join('')
}

export function initModuleConstMemberReadHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const D = { label: 'm', tag: 't', shown: 's' }
  const [count, setCount] = createSignal(0)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => {
          const o = { tag: D.tag }
          setCount(count() + [o.tag].map(name => name.length).length + (D.label === 'm' ? 1 : 0) + describe(D).length)
        })
}

hydrate('ModuleConstMemberReadHydrate', { init: initModuleConstMemberReadHydrate, template: (_p) => `${((__bf_const_D) => `<div><p data-slot="label">${escapeText((__bf_const_D).label)}</p><p data-slot="shown">${escapeText((__bf_const_D).shown)}</p><button bf="s1"><!--bf:s0-->${escapeTextOrMarkup((0))}<!--/--></button></div>`)(({ label: 'm', tag: 't', shown: 's' }))}` })
export function ModuleConstMemberReadHydrate(_p, __bfKey) { return createComponent('ModuleConstMemberReadHydrate', _p, __bfKey) }
