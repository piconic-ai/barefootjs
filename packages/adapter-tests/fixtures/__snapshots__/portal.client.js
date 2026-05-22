import { $, createComponent, createEffect, createPortal, createSignal, hydrate, isSSRPortal } from '@barefootjs/client/runtime'


export function initPortalExample(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [open, setOpen] = createSignal(false)
  const handleOpen = () => setOpen(true)
  const handleClose = () => setOpen(false)
  const moveToBody = (el) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  const [_s0, _s1, _s2, _s3] = $(__scope, 's0', 's1', 's2', 's3')

  createEffect(() => {
    if (_s1) {
      _s1.hidden = !!(!open())
    }
  })

  createEffect(() => {
    if (_s3) {
      _s3.hidden = !!(!open())
    }
  })

  if (_s0) _s0.addEventListener('click', handleOpen)
  if (_s1) _s1.addEventListener('click', handleClose)
  if (_s2) _s2.addEventListener('click', handleClose)
  if (_s1) (moveToBody)(_s1)
  if (_s3) (moveToBody)(_s3)
}

hydrate('PortalExample', { init: initPortalExample, template: (_p) => `<div class="portal-example"><button type="button" data-testid="open-portal" class="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2" bf="s0"> Open Portal </button><div data-testid="portal-overlay" ${!(false) ? 'hidden' : ''} style="position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.5);" bf="s1"></div><div data-testid="portal-content" ${!(false) ? 'hidden' : ''} style="position: fixed; left: 50%; top: 50%; z-index: 50; width: 100%; max-width: 28rem; transform: translate(-50%, -50%); border-radius: 0.5rem; border: 1px solid #e5e7eb; background: white; padding: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);" role="dialog" aria-modal="true" bf="s3"><h2 class="text-lg font-semibold mb-2">Portal Content</h2><p class="text-gray-600 mb-4"> This content is rendered via Portal at document.body. </p><button type="button" data-testid="close-portal" class="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 h-10 px-4 py-2" bf="s2"> Close </button></div></div>` })
export function PortalExample(_p, __bfKey) { return createComponent('PortalExample', _p, __bfKey) }
