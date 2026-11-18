import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'

var NAMES = NAMES ?? (['n'].map(name => name.toUpperCase()))
var TEXTS = TEXTS ?? (['t'].map(function (text) { return text + '!' }))

export function initModuleConstMemberKeyHydrate(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const base = 'b'
  const key = 'run'
  const OPS = { [key](key) { return key + 1 } }
  const D = { label: 'm', tag: base, shown: 's' }
  const LABEL = D.label
  const [count, setCount] = createSignal(0)

  const [_s1] = $(__scope, 's1')

  const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = count()
    __bfw_s0('s0', escapeTextOrNode(__val))
  })

  if (_s1) _s1.addEventListener('click', () => setCount(count() + NAMES.length * TEXTS.length * OPS.run(0)))
}

hydrate('ModuleConstMemberKeyHydrate', { init: initModuleConstMemberKeyHydrate, template: (_p) => `<div><p data-slot="label">${escapeText((({ label: 'm', tag: ('b'), shown: 's' }).label))}</p><p data-slot="tag">${escapeText(({ label: 'm', tag: ('b'), shown: 's' }).shown)}</p><button bf="s1"><!--bf:s0-->${escapeTextOrMarkup((0))}<!--/--></button></div>` })
export function ModuleConstMemberKeyHydrate(_p, __bfKey) { return createComponent('ModuleConstMemberKeyHydrate', _p, __bfKey) }
