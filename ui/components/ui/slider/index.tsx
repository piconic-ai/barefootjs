"use client"

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import { createSignal, createMemo } from '@barefootjs/client'

/**
 * Slider Component
 *
 * An input for selecting a numeric value from a range.
 * Supports both controlled and uncontrolled modes.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Uncontrolled (internal state)
 * ```tsx
 * <Slider />
 * <Slider defaultValue={50} />
 * ```
 *
 * @example Controlled (external state)
 * ```tsx
 * <Slider value={volume()} onValueChange={setVolume} />
 * ```
 *
 * @example Custom range and step
 * ```tsx
 * <Slider min={0} max={10} step={0.5} defaultValue={5} />
 * ```
 */

// Root classes (matching shadcn/ui)
const rootBaseClasses = 'relative flex w-full touch-none items-center select-none'

// Track classes
const trackClasses = 'bg-muted relative grow overflow-hidden rounded-full h-1.5 w-full'

// Range classes (filled portion)
const rangeClasses = 'bg-primary absolute h-full'

// Thumb classes (matching shadcn/ui exactly)
const thumbBaseClasses = 'border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50'

/**
 * Props for the Slider component.
 */
interface SliderProps extends HTMLBaseAttributes {
  /**
   * Default value (for uncontrolled mode).
   * @default 0
   */
  defaultValue?: number
  /**
   * Controlled value. When provided, the component is in controlled mode.
   */
  value?: number
  /**
   * Minimum value.
   * @default 0
   */
  min?: number
  /**
   * Maximum value.
   * @default 100
   */
  max?: number
  /**
   * Step increment.
   * @default 1
   */
  step?: number
  /**
   * Whether the slider is disabled.
   * @default false
   */
  disabled?: boolean
  /**
   * Callback when the value changes.
   */
  onValueChange?: (value: number) => void
}

/**
 * Slider component for selecting a numeric value from a range.
 * Supports both controlled and uncontrolled modes.
 */
function Slider(props: SliderProps) {
  const min = createMemo(() => props.min ?? 0)
  const max = createMemo(() => props.max ?? 100)
  const step = createMemo(() => props.step ?? 1)

  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = createSignal(props.defaultValue ?? min())

  // Controlled state - synced from parent via DOM attribute
  // When parent passes value={signal()}, the compiler generates a sync effect
  // that updates this signal when the parent's value changes
  const [controlledValue, setControlledValue] = createSignal<number | undefined>(props.value)

  // Track if component is in controlled mode
  const isControlled = createMemo(() => props.value !== undefined)

  // Determine current value
  const currentValue = createMemo(() => isControlled() ? controlledValue() : internalValue())

  // Compute percentage for positioning
  const percentage = createMemo(() => {
    if (max() <= min()) return 0
    // `currentValue()` is `number | undefined` in its type (mirrors
    // `controlledValue()`), but it's only ever undefined when NOT
    // controlled — and the uncontrolled branch (`internalValue()`) is
    // always a `number`. TS can't see that across the two calls in
    // `currentValue`'s own ternary, so assert what's runtime-guaranteed.
    return Math.max(0, Math.min(100, ((currentValue()! - min()) / (max() - min())) * 100))
  })

  // Snap a raw value to the nearest step
  const snapToStep = (rawValue: number): number => {
    const stepped = Math.round((rawValue - min()) / step()) * step() + min()
    // Round to avoid floating point issues
    const decimals = (step().toString().split('.')[1] || '').length
    const rounded = parseFloat(stepped.toFixed(decimals))
    return Math.max(min(), Math.min(max(), rounded))
  }

  // Calculate value from pointer position relative to track
  const getValueFromPointer = (clientX: number, trackRect: DOMRect): number => {
    const pct = (clientX - trackRect.left) / trackRect.width
    const rawValue = min() + pct * (max() - min())
    return snapToStep(rawValue)
  }

  // Update DOM elements to reflect current value
  const updateSliderUI = (root: HTMLElement, value: number) => {
    const pct = ((value - min()) / (max() - min())) * 100
    const thumb = root.querySelector('[data-slot="slider-thumb"]') as HTMLElement
    const range = root.querySelector('[data-slot="slider-range"]') as HTMLElement

    if (thumb) {
      thumb.style.left = `${pct}%`
      thumb.setAttribute('aria-valuenow', String(value))
    }
    if (range) {
      range.style.width = `${pct}%`
    }
  }

  // Set value, update UI, and notify parent
  const setValue = (root: HTMLElement, newValue: number) => {
    if (isControlled()) {
      setControlledValue(newValue)
    } else {
      setInternalValue(newValue)
    }
    updateSliderUI(root, newValue)

    // Notify parent if callback provided
    const scope = root.closest('[bf-s]')
    // @ts-ignore - onvalueChange is set by parent during hydration
    const scopeCallback = scope?.onvalueChange
    const handler = props.onValueChange || scopeCallback
    handler?.(newValue)
  }

  // Handle pointer down on root (covers both track and thumb clicks)
  const handlePointerDown = (e: PointerEvent) => {
    if (props.disabled) return
    e.preventDefault()

    const root = e.currentTarget as HTMLElement
    const track = root.querySelector('[data-slot="slider-track"]') as HTMLElement
    const trackRect = track.getBoundingClientRect()

    // Calculate and set value from click position
    const newValue = getValueFromPointer(e.clientX, trackRect)
    setValue(root, newValue)

    // Set pointer capture for smooth dragging
    root.setPointerCapture(e.pointerId)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const moveValue = getValueFromPointer(moveEvent.clientX, trackRect)
      setValue(root, moveValue)
    }

    const handlePointerUp = () => {
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerup', handlePointerUp)
      root.releasePointerCapture(e.pointerId)
    }

    root.addEventListener('pointermove', handlePointerMove)
    root.addEventListener('pointerup', handlePointerUp)
  }

  // Handle keyboard navigation on thumb
  const handleKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return

    const thumb = e.currentTarget as HTMLElement
    const root = thumb.closest('[data-slot="slider"]') as HTMLElement
    const current = parseFloat(thumb.getAttribute('aria-valuenow') || String(currentValue()))

    let newValue: number | null = null

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        newValue = snapToStep(current + step())
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        newValue = snapToStep(current - step())
        break
      case 'Home':
        newValue = min()
        break
      case 'End':
        newValue = max()
        break
      default:
        return
    }

    e.preventDefault()
    setValue(root, newValue)
  }

  const rootClasses = `${rootBaseClasses} data-[disabled]:opacity-50 data-[disabled]:pointer-events-none ${props.className ?? ''}`
  const thumbClasses = `absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${thumbBaseClasses}`

  return (
    <div
      data-slot="slider"
      id={props.id}
      data-disabled={props.disabled || undefined}
      className={rootClasses}
      onPointerDown={handlePointerDown}
    >
      <div
        data-slot="slider-track"
        className={trackClasses}
      >
        <div
          data-slot="slider-range"
          className={rangeClasses}
          style={`width: ${percentage()}%`}
        />
      </div>
      <span
        data-slot="slider-thumb"
        role="slider"
        aria-valuemin={min()}
        aria-valuemax={max()}
        aria-valuenow={currentValue()}
        tabindex={props.disabled ? -1 : 0}
        className={thumbClasses}
        style={`left: ${percentage()}%`}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

export { Slider }
export type { SliderProps }
