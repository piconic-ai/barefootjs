import { $, createComponent, hydrate } from '@barefootjs/client/runtime'


export function initRefMountAttr(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const handleMount = (el) => {
    el.setAttribute('data-mounted', '1')
  }

  const [_s0] = $(__scope, 's0')

  if (_s0) (handleMount)(_s0)
}

hydrate('RefMountAttr', { init: initRefMountAttr, template: (_p) => `<div data-slot="target" bf="s0"> content </div>` })
export function RefMountAttr(_p, __bfKey) { return createComponent('RefMountAttr', _p, __bfKey) }
