/**
 * Compute the viewport-clamped `{ top, left }` for content positioned
 * relative to a trigger rect. A pure function (no DOM reads/writes) — lives
 * here in `ui/lib/`, not beside `PopoverContent` in
 * `ui/components/ui/popover/`, for two reasons: `popover/index.test.tsx`
 * can import and exercise it directly instead of relying only on the
 * geometry-dependent e2e test that originally surfaced the bug (a trigger
 * near the viewport edge could position content partly or fully off-screen,
 * with a `position: fixed` overlay unreachable by scroll); and
 * `packages/adapter-tests`'s `snapshot-generator.ts` already inlines a
 * `../../../lib/<name>` import into the compiled fixture bundle
 * (`inlineUiLibImports`) the same way it does for `track-position` — a
 * same-directory sibling `.ts` import is NOT inlined the same way, and the
 * `fixture-hydrate`/`oracle` e2e harness serves each fixture's compiled
 * client bundle as a single file with no route for a same-directory sibling
 * module, so that shape 404s loading `./clamp-position` as a real ES module
 * in a real browser (measured on CI, not merely reasoned about).
 *
 * Both axes are bounded to `[gap, viewport - contentSize - gap]`, keeping
 * content anchored as close to the trigger as the viewport allows instead
 * of running off any edge (mirrors `context-menu`'s own floor/ceiling
 * clamp, a distinct computation for a distinct problem — that one
 * repositions from an absolute mouse coordinate, this one from a trigger
 * rect with side/align — so not extracted as one shared function; the two
 * happen to sit in the same directory only because of the constraint above,
 * not because `clampPopoverPosition` is Popover-agnostic).
 */
export function clampPopoverPosition(
  triggerRect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width'>,
  contentSize: { width: number; height: number },
  viewport: { width: number; height: number },
  side: 'top' | 'bottom',
  align: 'start' | 'center' | 'end',
  gap = 4,
): { top: number; left: number } {
  let top: number
  if (side === 'bottom') {
    const maxTop = viewport.height - contentSize.height - gap
    top = Math.max(gap, Math.min(triggerRect.bottom + gap, maxTop))
  } else {
    top = Math.max(gap, triggerRect.top - contentSize.height - gap)
  }

  const maxLeft = viewport.width - contentSize.width - gap
  let left: number
  if (align === 'start') {
    left = Math.max(gap, Math.min(triggerRect.left, maxLeft))
  } else if (align === 'end') {
    left = Math.max(gap, Math.min(triggerRect.right - contentSize.width, maxLeft))
  } else {
    // center
    const centered = triggerRect.left + triggerRect.width / 2 - contentSize.width / 2
    left = Math.max(gap, Math.min(centered, maxLeft))
  }

  return { top, left }
}
