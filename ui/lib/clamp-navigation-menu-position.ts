/**
 * Compute the viewport-clamped `{ top, left }` for `NavigationMenuContent`
 * positioned relative to its trigger rect. A pure function (no DOM
 * reads/writes) — lives here in `ui/lib/`, not beside
 * `NavigationMenuContent` in `ui/components/ui/navigation-menu/`, so
 * `navigation-menu/index.test.tsx` can import and exercise it directly
 * without any DOM, and so `packages/adapter-tests`'s
 * `snapshot-generator.ts` inlines it into the compiled fixture bundle via
 * its `../../../lib/<name>` convention (`inlineUiLibImports`) instead of
 * leaving a same-directory sibling import that 404s in the
 * `fixture-hydrate`/`oracle` e2e harness — the same failure mode
 * Popover's own viewport-clamp fix hit and moved out of a
 * same-directory sibling to avoid (#3100).
 *
 * NavigationMenuContent has no `align`/`side` props at all — it always
 * opens below the trigger, left-aligned to it — so this is the smallest
 * of the four #3117 instances: only the left edge ever needs an
 * alternative to `triggerRect.left`, never a right/center choice. Its own
 * function rather than a reuse of `clampDropdownMenuPosition`/
 * `clampMenubarPosition`, both of which take an `align` this component
 * doesn't have.
 *
 * Both axes are bounded to `[gap, viewport - contentSize - gap]`, keeping
 * content anchored as close to the trigger as the viewport allows instead
 * of running off any edge.
 */
export function clampNavigationMenuPosition(
  triggerRect: Pick<DOMRect, 'bottom' | 'left'>,
  contentSize: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
): { top: number; left: number } {
  const maxTop = viewport.height - contentSize.height - gap
  const top = Math.max(gap, Math.min(triggerRect.bottom + gap, maxTop))

  const maxLeft = viewport.width - contentSize.width - gap
  const left = Math.max(gap, Math.min(triggerRect.left, maxLeft))

  return { top, left }
}
