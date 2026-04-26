/**
 * Dialog Context
 *
 * Provides scopeId sharing between Dialog components.
 * DialogRoot sets the context, child components (DialogOverlay, DialogContent) read it.
 *
 * Usage:
 * ```tsx
 * import { DialogContext, useDialogContext } from '@barefootjs/hono'
 *
 * // In DialogRoot
 * <DialogContext.Provider value={{ scopeId }}>
 *   {children}
 * </DialogContext.Provider>
 *
 * // In DialogOverlay/DialogContent
 * const ctx = useDialogContext()
 * <Portal scopeId={ctx?.scopeId}>...</Portal>
 * ```
 */

/** @jsxImportSource hono/jsx */

import { createContext, useContext } from 'hono/jsx'

export type DialogContextValue = {
  scopeId: string
}

/**
 * Context for sharing scopeId between Dialog components.
 */
export const DialogContext = createContext<DialogContextValue | null>(null)

/**
 * Hook to access Dialog context.
 * Returns null if not inside a DialogRoot.
 */
export function useDialogContext(): DialogContextValue | null {
  return useContext(DialogContext)
}
