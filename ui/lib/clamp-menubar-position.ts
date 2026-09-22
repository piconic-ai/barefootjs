/**
 * Compute the viewport-clamped `{ top, left }` for `MenubarContent`
 * positioned relative to its trigger rect. A pure function (no DOM
 * reads/writes) — lives here in `ui/lib/`, not beside `MenubarContent` in
 * `ui/components/ui/menubar/`, so `menubar/index.test.tsx` can import and
 * exercise it directly without any DOM, and so `packages/adapter-tests`'s
 * `snapshot-generator.ts` inlines it into the compiled fixture bundle via
 * its `../../../lib/<name>` convention (`inlineUiLibImports`) instead of
 * leaving a same-directory sibling import that 404s in the
 * `fixture-hydrate`/`oracle` e2e harness — the same failure mode
 * Popover's own viewport-clamp fix hit and moved out of a
 * same-directory sibling to avoid (#3100).
 *
 * Same `'start' | 'end'`-only alignment shape as `DropdownMenuContent`
 * (no `side`, no `'center'`) but with an 8px gap (Menubar's pre-fix
 * `updatePosition` used `rect.bottom + 8`, not DropdownMenu's 4) — kept
 * as its own function per #3117 rather than sharing
 * `clampDropdownMenuPosition`, since the two components' default gap is
 * a real difference in the decision, not an accident of today's code.
 *
 * Both axes are bounded to `[gap, viewport - contentSize - gap]`, keeping
 * content anchored as close to the trigger as the viewport allows instead
 * of running off any edge.
 */
export function clampMenubarPosition(
  triggerRect: Pick<DOMRect, 'bottom' | 'left' | 'right'>,
  contentSize: { width: number; height: number },
  viewport: { width: number; height: number },
  align: 'start' | 'end' | undefined,
  gap = 8,
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
