/**
 * Type-only verification that the pointer events missing before #3273
 * (`onPointerCancel`, `onPointerOver`, `onPointerOut`,
 * `onGotPointerCapture`, `onLostPointerCapture`) and the other bubbling
 * events added alongside them type-check in JSX without a
 * `@ts-expect-error` escape, with the event parameter typed.
 *
 * There are no runtime assertions; the runner is
 * `tsc --noEmit -p packages/jsx/__tests__/tsconfig.json` (via
 * `bun run typecheck:tests`). That each prop also compiles to a real DOM
 * event is checked in `src/__tests__/html-event-handler-names.test.ts`.
 *
 * The trailing `export {}` is load-bearing — see `svg-ref-types.tsx` for why.
 */

const onPointer = (e: PointerEvent) => e.pointerId
const onMouse = (e: { button: number }) => e.button
const onFocus = (e: { relatedTarget: EventTarget | null }) => e.relatedTarget
const onAnimation = (e: AnimationEvent) => e.animationName
const onTransition = (e: TransitionEvent) => e.propertyName

// The drag pattern from #3273: `pointercancel` ends the drag next to `pointerup`.
const _drag = (
  <div
    onPointerDown={onPointer}
    onPointerUp={onPointer}
    onPointerCancel={onPointer}
    onGotPointerCapture={onPointer}
    onLostPointerCapture={onPointer}
  />
)

const _hover = (
  <div onPointerOver={onPointer} onPointerOut={onPointer} onMouseOver={onMouse} onMouseOut={onMouse} />
)

const _focusWithin = <div onFocusIn={onFocus} onFocusOut={onFocus} />

const _input = <div contenteditable onBeforeInput={(e) => e.data} onAuxClick={onMouse} />

const _motion = (
  <div
    onAnimationCancel={onAnimation}
    onTransitionStart={onTransition}
    onTransitionRun={onTransition}
    onTransitionCancel={onTransition}
  />
)

// Inherited by the per-element attribute types, not only the catch-all.
const _button = <button type="button" onPointerCancel={onPointer} />

export { _drag, _hover, _focusWithin, _input, _motion, _button }
