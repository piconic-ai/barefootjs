/**
 * Multi-component child MODULE (#2132) — a parent renders several
 * components exported from ONE child file, the registry-toast shape
 * (`ui/toast/index.tsx` exporting ToastProvider / Toast / ToastTitle).
 *
 * Every other multi-file fixture's child file exports exactly one
 * component, so this shape had no cross-adapter conformance coverage:
 * `templatesPerComponent` adapters emit one template per exported
 * component and must resolve each `render_child('<snake_case_name>')`
 * to that component's OWN template. The production mojo bug was
 * manifest-side (no per-component registration — every page using
 * Toast/Dialog/Tabs 500'd), but the same mis-pairing can hide in any
 * adapter harness: pairing every sibling template to the module's first
 * component would render ToastProvider's markup for `<Toast>` and still
 * produce *some* HTML.
 *
 * The fixture pins the three tells of a correct pairing:
 *   - each sub-component's own `data-slot` appears exactly once;
 *   - Toast renders its `open` PROP (parent signal, `data-state="open"`),
 *     not its `false` destructure default;
 *   - children pass through two nesting levels of the same module.
 */

import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'multi-component-module',
  description:
    'Parent renders several components exported from one child file (registry-toast shape, #2132)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { ToastProvider, Toast, ToastTitle } from './toast'

export function ToastProbe() {
  const [open, setOpen] = createSignal(true)
  return (
    <ToastProvider>
      <Toast open={open()}>
        <ToastTitle>hi</ToastTitle>
      </Toast>
    </ToastProvider>
  )
}
`,
  components: {
    './toast.tsx': `
interface ToastProviderProps {
  children?: any
}

export function ToastProvider({ children }: ToastProviderProps) {
  return <div data-slot="toast-provider">{children}</div>
}

interface ToastProps {
  open?: boolean
  children?: any
}

export function Toast({ open = false, children }: ToastProps) {
  return (
    <div data-slot="toast" data-state={open ? 'open' : 'closed'}>
      {children}
    </div>
  )
}

export function ToastTitle({ children }: { children?: any }) {
  return <div data-slot="toast-title">{children}</div>
}
`,
  },
  expectedHtml: `
    <div bf-s="test_s2" data-slot="toast-provider"><div bf-s="test_s1" bf="s0" data-slot="toast" data-state="open"><div bf-s="test_s0" data-slot="toast-title">hi</div></div></div>
  `,
})
