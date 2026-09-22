/**
 * Compute the viewport-clamped `{ top, left }` for `DropdownMenuContent`
 * positioned relative to its trigger rect. A pure function (no DOM
 * reads/writes) — lives here in `ui/lib/`, not beside
 * `DropdownMenuContent` in `ui/components/ui/dropdown-menu/`, so
 * `dropdown-menu/index.test.tsx` can import and exercise it directly
 * without any DOM, and so `packages/adapter-tests`'s
 * `snapshot-generator.ts` inlines it into the compiled fixture bundle via
 * its `../../../lib/<name>` convention (`inlineUiLibImports`) instead of
 * leaving a same-directory sibling import that 404s in the
 * `fixture-hydrate`/`oracle` e2e harness (the failure mode
 * `ui/lib/clamp-position.ts`'s own header comment documents, measured on
 * Popover's #3100).
 *
 * Unlike Popover/HoverCard, DropdownMenuContent only ever opens below its
 * trigger (no `side` prop) and only supports `'start' | 'end'` alignment
 * (no `'center'`), so this is its own smaller floor/ceiling instance per
 * #3117 rather than a reuse of `clampPopoverPosition` — a different
 * decision (fewer axes to choose from), not the same one duplicated.
 *
 * Both axes are bounded to `[gap, viewport - contentSize - gap]`, keeping
 * content anchored as close to the trigger as the viewport allows instead
 * of running off any edge.
 */
export function clampDropdownMenuPosition(
  triggerRect: Pick<DOMRect, 'bottom' | 'left' | 'right'>,
  contentSize: { width: number; height: number },
  viewport: { width: number; height: number },
  align: 'start' | 'end' | undefined,
  gap = 4,
): { top: number; left: number } {
  const maxTop = viewport.height - contentSize.height - gap
  const top = Math.max(gap, Math.min(triggerRect.bottom + gap, maxTop))

  const maxLeft = viewport.width - contentSize.width - gap
  const left =
    align === 'end'
      ? Math.max(gap, Math.min(triggerRect.right - contentSize.width, maxLeft))
      : Math.max(gap, Math.min(triggerRect.left, maxLeft))

  return { top, left }
}
