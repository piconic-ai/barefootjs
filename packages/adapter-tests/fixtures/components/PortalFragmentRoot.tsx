'use client'

// Test fixture: the `ref`-callback portal pattern the overlay primitives use
// (`createPortal(el, document.body, { ownerScope })`, recognized at SSR as
// `ssrPortalOwnerScope`) inside a component whose root is a FRAGMENT. SSR
// places the panel at the portal outlet stamped with this component's scope
// id (`bf-po`); a fragment root has no element carrying that id, so the
// callback's own `el.closest('[bf-s]')` finds no owner on a CSR mount. The
// compiled init stamps the same owner after the callback runs, so a CSR
// mount renders exactly what SSR + hydration do.

import { createSignal, createPortal, isSSRPortal } from '@barefootjs/client'

export function PortalFragmentRoot() {
  const [open, setOpen] = createSignal(false)
  const moveToBody = (el: HTMLElement) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }
  return (
    <>
      <button type="button" className="open" onClick={() => setOpen(true)}>
        open
      </button>
      <div className="panel" hidden={!open()} ref={moveToBody}>
        <button type="button" className="close" onClick={() => setOpen(false)}>
          close
        </button>
      </div>
    </>
  )
}
