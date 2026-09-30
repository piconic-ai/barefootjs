import { $, createComponent, createEffect, createPortal, createSignal, hydrate, isSSRPortal, ownScopeId } from '@barefootjs/client/runtime'


export function initPortalFragmentRoot(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = ownScopeId(__scope)

  const [open, setOpen] = createSignal(false)
  const moveToBody = (el) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s0, _s1, _s2] = $(__scope, 's0', 's1', 's2')

  { const __l = []
  createEffect(() => {
    if (_s2) {
      { const __x = !open()
      if (!(0 in __l) || !Object.is(__l[0], __x)) {
        _s2.hidden = !!(__x)
      }
      __l[0] = __x }
    }
  }) }

  if (_s0) _s0.addEventListener('click', () => { setOpen(true) })
  if (_s1) _s1.addEventListener('click', () => { setOpen(false) })
  if (_s2) { (moveToBody)(_s2); if (__scopeId) _s2.setAttribute('bf-po', __scopeId) }
}

hydrate('PortalFragmentRoot', { init: initPortalFragmentRoot, template: (_p) => `<button type="button" class="open" bf="s0">open</button><div class="panel" ${!(false) ? 'hidden' : ''} bf="s2"><button type="button" class="close" bf="s1">close</button></div>`, comment: true, fragmentRoot: true })
export function PortalFragmentRoot(_p, __bfKey) { return createComponent('PortalFragmentRoot', _p, __bfKey) }
