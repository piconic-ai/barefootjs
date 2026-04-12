"use client"

/**
 * Input OTP Components
 *
 * An accessible one-time password input with copy-paste support.
 * Uses a hidden <input> for actual text entry with visual slot display.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * InputOTP manages value/focus state, InputOTPSlot consumes via context.
 *
 * @example Basic 6-digit OTP
 * ```tsx
 * <InputOTP maxLength={6}>
 *   <InputOTPGroup>
 *     <InputOTPSlot index={0} />
 *     <InputOTPSlot index={1} />
 *     <InputOTPSlot index={2} />
 *   </InputOTPGroup>
 *   <InputOTPSeparator />
 *   <InputOTPGroup>
 *     <InputOTPSlot index={3} />
 *     <InputOTPSlot index={4} />
 *     <InputOTPSlot index={5} />
 *   </InputOTPGroup>
 * </InputOTP>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import { createSignal, createMemo, createContext, useContext, createEffect } from '@barefootjs/client-runtime'
import type { Child } from '../../../types'
import { MinusIcon } from '../icon'

// Pattern constants for common input restrictions
export const REGEXP_ONLY_DIGITS = /^\d+$/
export const REGEXP_ONLY_CHARS = /^[a-zA-Z]+$/
export const REGEXP_ONLY_DIGITS_AND_CHARS = /^[a-zA-Z0-9]+$/

// String preset names (serializable for hydration)
type PatternPreset = 'digits' | 'chars' | 'digits-and-chars'
const patternPresets: Record<PatternPreset, RegExp> = {
  'digits': REGEXP_ONLY_DIGITS,
  'chars': REGEXP_ONLY_CHARS,
  'digits-and-chars': REGEXP_ONLY_DIGITS_AND_CHARS,
}

function resolvePattern(pattern: RegExp | PatternPreset | undefined): RegExp {
  if (pattern === undefined) return REGEXP_ONLY_DIGITS
  if (typeof pattern === 'string') return patternPresets[pattern] ?? REGEXP_ONLY_DIGITS
  return pattern
}

// Context for InputOTP → InputOTPSlot state sharing
interface InputOTPContextValue {
  value: () => string
  activeIndex: () => number
  isFocused: () => boolean
  maxLength: number
}

const InputOTPContext = createContext<InputOTPContextValue>()

// Container classes (from shadcn/ui)
const containerClasses = 'flex items-center gap-2 has-[:disabled]:opacity-50'

// Group classes
const groupClasses = 'flex items-center'

// Slot classes (from shadcn/ui)
const slotBaseClasses = 'relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md'
const slotActiveClasses = 'data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50'

// Fake caret classes
const caretContainerClasses = 'pointer-events-none absolute inset-0 flex items-center justify-center'
const caretClasses = 'h-4 w-px animate-caret-blink bg-foreground duration-1000'

/**
 * Props for InputOTP component.
 */
interface InputOTPProps extends HTMLBaseAttributes {
  /** Maximum number of characters */
  maxLength: number
  /** Controlled value */
  value?: string
  /** Default value for uncontrolled mode */
  defaultValue?: string
  /** Callback when value changes */
  onValueChange?: (value: string) => void
  /** Callback when all slots are filled */
  onComplete?: (value: string) => void
  /** Pattern to validate input. Accepts a RegExp or a preset name: 'digits' | 'chars' | 'digits-and-chars'. Default: 'digits'. */
  pattern?: RegExp | PatternPreset
  /** Whether the input is disabled */
  disabled?: boolean
  /** Container className override */
  containerClassName?: string
  /** Slot children */
  children?: Child
}

/**
 * OTP input container.
 * Renders a hidden input and provides context to child slots.
 *
 * @param props.maxLength - Number of OTP characters
 * @param props.value - Controlled value
 * @param props.onValueChange - Callback when value changes
 * @param props.onComplete - Callback when fully filled
 * @param props.pattern - Validation pattern (default: digits only)
 * @param props.disabled - Whether disabled
 */
function InputOTP(props: InputOTPProps) {
  const [internalValue, setInternalValue] = createSignal(props.defaultValue ?? '')
  const [activeIndex, setActiveIndex] = createSignal(-1)
  const [isFocused, setIsFocused] = createSignal(false)

  const getValue = () => props.value !== undefined ? (props.value ?? '') : internalValue()
  const pattern = createMemo(() => resolvePattern(props.pattern))

  const updateValue = (newValue: string) => {
    const truncated = newValue.slice(0, props.maxLength)
    if (props.value === undefined) {
      setInternalValue(truncated)
    }
    props.onValueChange?.(truncated)
    if (truncated.length === props.maxLength) {
      props.onComplete?.(truncated)
    }
  }

  const handleMount = (el: HTMLElement) => {
    const input = el.querySelector('input[data-otp-input]') as HTMLInputElement | null
    if (!input) return

    // Set inputmode attribute (not in JSX type definitions)
    input.setAttribute('inputmode', 'numeric')

    input.addEventListener('focus', () => {
      setIsFocused(true)
      const pos = input.selectionStart ?? getValue().length
      setActiveIndex(Math.min(pos, props.maxLength - 1))
    })

    input.addEventListener('blur', () => {
      setIsFocused(false)
      setActiveIndex(-1)
    })

    input.addEventListener('input', () => {
      const raw = input.value
      // Filter by pattern character-by-character
      let filtered = ''
      for (const ch of raw) {
        if (pattern().test(ch)) {
          filtered += ch
        }
      }
      const truncated = filtered.slice(0, props.maxLength)
      input.value = truncated
      updateValue(truncated)
      const pos = input.selectionStart ?? truncated.length
      setActiveIndex(Math.min(pos, props.maxLength - 1))
    })

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const pos = (input.selectionStart ?? 1) - 1
        const newPos = Math.max(0, pos)
        input.setSelectionRange(newPos, newPos)
        setActiveIndex(newPos)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const pos = (input.selectionStart ?? 0) + 1
        const val = getValue()
        const newPos = Math.min(pos, val.length)
        input.setSelectionRange(newPos, newPos)
        setActiveIndex(Math.min(newPos, props.maxLength - 1))
      } else if (e.key === 'Backspace') {
        // Let native input handle it, the input event will fire
      }
    })

    input.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault()
      const pasted = e.clipboardData?.getData('text') ?? ''
      let filtered = ''
      for (const ch of pasted) {
        if (pattern().test(ch)) {
          filtered += ch
        }
      }
      const currentVal = getValue()
      const pos = input.selectionStart ?? currentVal.length
      const before = currentVal.slice(0, pos)
      const after = currentVal.slice(pos)
      const newValue = (before + filtered + after).slice(0, props.maxLength)
      input.value = newValue
      updateValue(newValue)
      const newPos = Math.min(pos + filtered.length, newValue.length)
      input.setSelectionRange(newPos, newPos)
      setActiveIndex(Math.min(newPos, props.maxLength - 1))
    })

    // Click on container focuses the hidden input
    el.addEventListener('click', () => {
      if (!props.disabled) {
        input.focus()
        const val = getValue()
        const pos = val.length
        input.setSelectionRange(pos, pos)
        setActiveIndex(Math.min(pos, props.maxLength - 1))
      }
    })

    // Sync controlled value to input
    createEffect(() => {
      const val = getValue()
      if (input.value !== val) {
        input.value = val
      }
    })
  }

  return (
    <InputOTPContext.Provider value={{
      value: getValue,
      activeIndex: () => activeIndex(),
      isFocused: () => isFocused(),
      maxLength: props.maxLength,
    }}>
      <div
        data-slot="input-otp"
        className={`${containerClasses} ${props.containerClassName ?? ''}`}
        ref={handleMount}
      >
        <input
          data-otp-input
          type="text"
          autocomplete="one-time-code"
          maxlength={props.maxLength}
          value={getValue()}
          disabled={props.disabled ?? false}
          className={`absolute inset-0 opacity-0 pointer-events-none disabled:cursor-not-allowed ${props.className ?? ''}`}
          aria-label="OTP input"
        />
        {props.children}
      </div>
    </InputOTPContext.Provider>
  )
}

/**
 * Props for InputOTPGroup component.
 */
interface InputOTPGroupProps extends HTMLBaseAttributes {
  /** InputOTPSlot children */
  children?: Child
}

/**
 * Visual grouping wrapper for OTP slots.
 * Stateless component.
 */
function InputOTPGroup({ children, className = '', ...props }: InputOTPGroupProps) {
  return (
    <div data-slot="input-otp-group" className={`${groupClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for InputOTPSlot component.
 */
interface InputOTPSlotProps extends HTMLBaseAttributes {
  /** Zero-based index of this slot */
  index: number
}

/**
 * Individual OTP character slot.
 * Reads value, activeIndex, isFocused from InputOTPContext.
 * Uses ref={handleMount} + createEffect for reactive DOM updates.
 *
 * @param props.index - Slot position (0-based)
 */
function InputOTPSlot(props: InputOTPSlotProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(InputOTPContext)

    createEffect(() => {
      const val = ctx.value()
      const char = val[props.index] ?? ''
      const isActive = ctx.isFocused() && ctx.activeIndex() === props.index
      const hasFakeCaret = isActive && props.index >= val.length

      // Update character display
      const charSpan = el.querySelector('[data-otp-char]') as HTMLElement
      if (charSpan) {
        charSpan.textContent = char
      }

      // Update active state
      el.setAttribute('data-active', String(isActive))

      // Update fake caret visibility
      const caretEl = el.querySelector('[data-otp-caret]') as HTMLElement
      if (caretEl) {
        caretEl.style.display = hasFakeCaret ? 'flex' : 'none'
      }
    })
  }

  const className = createMemo(() => props.className ?? '')

  return (
    <div
      data-slot="input-otp-slot"
      data-active="false"
      className={`${slotBaseClasses} ${slotActiveClasses} ${className()}`}
      ref={handleMount}
    >
      <span data-otp-char></span>
      <div data-otp-caret className={caretContainerClasses} style="display:none">
        <div className={caretClasses} />
      </div>
    </div>
  )
}

/**
 * Props for InputOTPSeparator component.
 */
interface InputOTPSeparatorProps extends HTMLBaseAttributes {
  /** Custom separator content */
  children?: Child
}

/**
 * Visual separator between OTP groups.
 * Renders children or a minus icon by default.
 */
function InputOTPSeparator({ children, ...props }: InputOTPSeparatorProps) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      {children ?? <MinusIcon />}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
export type { InputOTPProps, InputOTPGroupProps, InputOTPSlotProps, InputOTPSeparatorProps }
