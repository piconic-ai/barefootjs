'use client'
/**
 * PortalExample - Simple Portal Component
 *
 * Demonstrates Portal usage for SSR.
 * Uses the same pattern as DialogOverlay/DialogContent:
 * - Elements are always rendered (not conditionally)
 * - On mount (via ref callback), elements are moved to document.body
 * - Visibility is controlled via inline style (hidden attribute)
 */

import { createSignal, createPortal, isSSRPortal } from '@barefootjs/client'

export function PortalExample() {
  const [open, setOpen] = createSignal(false)

  const handleOpen = () => setOpen(true)
  const handleClose = () => setOpen(false)

  // Move element to document.body on mount (portal behavior)
  // Skip if element is already in an SSR portal (content already at body)
  const moveToBody = (el: HTMLElement) => {
    if (el && el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }
  }

  return (
    <div className="portal-example">
      <button
        type="button"
        data-testid="open-portal"
        className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2"
        onClick={handleOpen}
      >
        Open Portal
      </button>

      <div
        data-testid="portal-overlay"
        hidden={!open()}
        style="position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, 0.5);"
        onClick={handleClose}
        ref={moveToBody}
      />
      <div
        data-testid="portal-content"
        hidden={!open()}
        style="position: fixed; left: 50%; top: 50%; z-index: 50; width: 100%; max-width: 28rem; transform: translate(-50%, -50%); border-radius: 0.5rem; border: 1px solid #e5e7eb; background: white; padding: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);"
        role="dialog"
        aria-modal="true"
        ref={moveToBody}
      >
        <h2 className="text-lg font-semibold mb-2">Portal Content</h2>
        <p className="text-gray-600 mb-4">
          This content is rendered via Portal at document.body.
        </p>
        <button
          type="button"
          data-testid="close-portal"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 h-10 px-4 py-2"
          onClick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default PortalExample
