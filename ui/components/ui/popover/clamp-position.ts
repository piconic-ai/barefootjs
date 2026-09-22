/**
 * Compute the viewport-clamped `{ top, left }` for content positioned
 * relative to a trigger rect. A pure function (no DOM reads/writes) —
 * plain `.ts`, not `.tsx`, so `index.test.tsx` can import and exercise it
 * directly instead of relying only on the geometry-dependent e2e test that
 * originally surfaced the bug (a trigger near the viewport edge could
 * position content partly or fully off-screen, with a `position: fixed`
 * overlay unreachable by scroll). Both axes are bounded to
 * `[gap, viewport - contentSize - gap]`, keeping content anchored as close
 * to the trigger as the viewport allows instead of running off any edge
 * (mirrors `context-menu`'s own floor/ceiling clamp, a distinct computation
 * for a distinct problem — that one repositions from an absolute mouse
 * coordinate, this one from a trigger rect with side/align — so not
 * extracted as one shared function).
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
