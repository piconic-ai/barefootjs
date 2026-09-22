/**
 * Compute the viewport-clamped `{ top, left }` for `HoverCardContent`
 * positioned relative to its trigger rect. A pure function (no DOM
 * reads/writes) — lives here in `ui/lib/`, not beside `HoverCardContent`
 * in `ui/components/ui/hover-card/`, so `hover-card/index.test.tsx` can
 * import and exercise it directly without any DOM, and so
 * `packages/adapter-tests`'s `snapshot-generator.ts` inlines it into the
 * compiled fixture bundle via its `../../../lib/<name>` convention
 * (`inlineUiLibImports`) instead of leaving a same-directory sibling
 * import that 404s in the `fixture-hydrate`/`oracle` e2e harness — the
 * same failure mode Popover's own viewport-clamp fix hit and moved out
 * of a same-directory sibling to avoid (#3100).
 *
 * Same shape as Popover's own `clampPopoverPosition` (`side`: `'top' |
 * 'bottom'`, `align`: `'start' | 'center' | 'end'`, default `gap` of 4 —
 * HoverCard's pre-fix `updatePosition` used the same `rect.bottom + 4` /
 * `rect.top - height - 4` geometry) but kept as its own function per
 * #3117: HoverCard's positioning is a distinct decision from Popover's
 * (its own props, its own trigger-resolution path through
 * `display:contents`) that only happens to compute the same formula
 * today.
 *
 * Both axes are bounded to `[gap, viewport - contentSize - gap]`, keeping
 * content anchored as close to the trigger as the viewport allows instead
 * of running off any edge.
 */
export function clampHoverCardPosition(
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
