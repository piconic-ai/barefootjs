import { $, createComponent, hydrate } from '@barefootjs/client/runtime'


export function initRefMountAttrRendered(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const handleMount = (el) => {
    el.setAttribute('data-mounted', '1')
  }

  const [_s0] = $(__scope, 's0')

  if (_s0) (handleMount)(_s0)
}

hydrate('RefMountAttrRendered', { init: initRefMountAttrRendered, template: (_p) => `<div data-slot="target" data-mounted="1" bf="s0"> content </div>` })
export function RefMountAttrRendered(_p, __bfKey) { return createComponent('RefMountAttrRendered', _p, __bfKey) }
