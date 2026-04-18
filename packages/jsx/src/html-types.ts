/**
 * BarefootJS HTML Type Definitions
 *
 * Framework-agnostic HTML element attribute types for JSX components.
 * These types provide proper typing for HTML attributes and event handlers.
 *
 * Note: These types are designed to be compatible with Hono's JSX types.
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Targeted event with properly typed target element
 */
export type TargetedEvent<
  Target extends EventTarget,
  E extends Event = Event
> = Omit<E, 'target'> & {
  readonly target: Target
}

export type TargetedInputEvent<Target extends EventTarget> = TargetedEvent<Target, InputEvent>
export type TargetedFocusEvent<Target extends EventTarget> = TargetedEvent<Target, FocusEvent>
export type TargetedKeyboardEvent<Target extends EventTarget> = TargetedEvent<Target, KeyboardEvent>
export type TargetedMouseEvent<Target extends EventTarget> = TargetedEvent<Target, MouseEvent>

// ============================================================================
// Event Handler Types
// ============================================================================

export type InputEventHandler<T extends EventTarget = HTMLInputElement> =
  (event: TargetedInputEvent<T>) => void
export type FocusEventHandler<T extends EventTarget = HTMLElement> =
  (event: TargetedFocusEvent<T>) => void
export type KeyboardEventHandler<T extends EventTarget = HTMLElement> =
  (event: TargetedKeyboardEvent<T>) => void
export type MouseEventHandler<T extends EventTarget = HTMLElement> =
  (event: TargetedMouseEvent<T>) => void
export type ChangeEventHandler<T extends EventTarget = HTMLElement> =
  (event: TargetedEvent<T>) => void

// ============================================================================
// Base Event Attributes
// ============================================================================

export interface BaseEventAttributes {
  onScroll?: (event: Event) => void
  onWheel?: (event: WheelEvent) => void
  onAnimationStart?: (event: AnimationEvent) => void
  onAnimationEnd?: (event: AnimationEvent) => void
  onAnimationIteration?: (event: AnimationEvent) => void
  onTransitionEnd?: (event: TransitionEvent) => void
  onCopy?: (event: ClipboardEvent) => void
  onCut?: (event: ClipboardEvent) => void
  onPaste?: (event: ClipboardEvent) => void
  onCompositionStart?: (event: CompositionEvent) => void
  onCompositionEnd?: (event: CompositionEvent) => void
  onCompositionUpdate?: (event: CompositionEvent) => void
  onDrag?: (event: DragEvent) => void
  onDragEnd?: (event: DragEvent) => void
  onDragEnter?: (event: DragEvent) => void
  onDragExit?: (event: DragEvent) => void
  onDragLeave?: (event: DragEvent) => void
  onDragOver?: (event: DragEvent) => void
  onDragStart?: (event: DragEvent) => void
  onDrop?: (event: DragEvent) => void
  onSubmit?: (event: SubmitEvent) => void
  onReset?: (event: Event) => void
  onLoad?: (event: Event) => void
  onError?: (event: Event) => void
}

// ============================================================================
// HTML Base Attributes
// ============================================================================

export interface HTMLBaseAttributes extends BaseEventAttributes {
  // Core attributes
  id?: string
  className?: string | Promise<string>
  class?: never
  style?: string | Record<string, string | number>
  title?: string
  tabindex?: number
  hidden?: boolean | null
  draggable?: boolean | null
  contenteditable?: boolean | 'inherit' | 'plaintext-only' | null
  spellcheck?: boolean | null
  accesskey?: string
  dir?: 'ltr' | 'rtl' | 'auto'
  lang?: string
  slot?: string

  // Data attributes
  [key: `data-${string}`]: string | number | boolean | undefined

  // ARIA attributes
  role?: string
  [key: `aria-${string}`]: string | number | boolean | undefined

  // Interactive event handlers
  onClick?: (event: MouseEvent) => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: (event: MouseEvent) => void
  onMouseDown?: (event: MouseEvent) => void
  onMouseUp?: (event: MouseEvent) => void
  onMouseMove?: (event: MouseEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyUp?: (event: KeyboardEvent) => void
  onKeyPress?: (event: KeyboardEvent) => void
  onFocus?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onInput?: InputEventHandler<HTMLElement>
  onChange?: ChangeEventHandler<HTMLElement>
  onTouchStart?: (event: TouchEvent) => void
  onTouchEnd?: (event: TouchEvent) => void
  onTouchMove?: (event: TouchEvent) => void
  onTouchCancel?: (event: TouchEvent) => void
  onPointerDown?: (event: PointerEvent) => void
  onPointerUp?: (event: PointerEvent) => void
  onPointerMove?: (event: PointerEvent) => void
  onPointerEnter?: (event: PointerEvent) => void
  onPointerLeave?: (event: PointerEvent) => void
  onContextMenu?: (event: MouseEvent) => void
  onDoubleClick?: (event: MouseEvent) => void

  // Ref callback
  ref?: (element: HTMLElement) => void

  // JSX special
  dangerouslySetInnerHTML?: { __html: string }
  children?: unknown
  key?: string | number | bigint | null

  // Hydration attributes (used by compiled marked templates)
  bf?: string
  'bf-s'?: string
  'bf-c'?: string
  'bf-p'?: string
}

// ============================================================================
// SVG Presentation Attributes
// ============================================================================

/**
 * SVG presentation attributes (fill, stroke, opacity, and related).
 *
 * Accepts both kebab-case (SVG-native) and camelCase (React-compatible)
 * spellings. The hono/jsx runtime converts camelCase to kebab-case at
 * render time, so both forms resolve to the correct SVG attribute in the
 * rendered DOM.
 */
export interface SVGPresentationAttributes {
  fill?: string
  stroke?: string
  opacity?: number | string

  // stroke — camelCase
  strokeWidth?: number | string
  strokeLinecap?: 'butt' | 'round' | 'square' | string
  strokeLinejoin?: 'miter' | 'round' | 'bevel' | string
  strokeDasharray?: string | number
  strokeDashoffset?: string | number
  strokeMiterlimit?: number | string
  strokeOpacity?: number | string

  // stroke — kebab-case
  'stroke-width'?: number | string
  'stroke-linecap'?: 'butt' | 'round' | 'square' | string
  'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | string
  'stroke-dasharray'?: string | number
  'stroke-dashoffset'?: string | number
  'stroke-miterlimit'?: number | string
  'stroke-opacity'?: number | string

  // fill — camelCase
  fillOpacity?: number | string
  fillRule?: 'nonzero' | 'evenodd' | 'inherit' | string

  // fill — kebab-case
  'fill-opacity'?: number | string
  'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit' | string
}

// ============================================================================
// Form Attribute Helper Types (for Hono compatibility)
// ============================================================================

export type HTMLAttributeFormEnctype =
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain'

export type HTMLAttributeFormMethod = 'get' | 'post' | 'dialog'

export type HTMLAttributeAnchorTarget =
  | '_self'
  | '_blank'
  | '_parent'
  | '_top'
  | string

// ============================================================================
// Button Element Attributes
// ============================================================================

export interface ButtonHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLButtonElement) => void

  autofocus?: boolean | null
  disabled?: boolean | null
  form?: string
  formaction?: string
  formenctype?: HTMLAttributeFormEnctype
  formmethod?: HTMLAttributeFormMethod
  formnovalidate?: boolean | null
  formtarget?: HTMLAttributeAnchorTarget
  name?: string
  type?: 'submit' | 'reset' | 'button'
  value?: string

  // Event handlers - using native DOM event types for Hono JSX compatibility
  // Users can still use typed handlers like MouseEventHandler<HTMLButtonElement>
  // since they're subtypes of these
  onClick?: (event: MouseEvent) => void
  onBlur?: (event: FocusEvent) => void
  onFocus?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyUp?: (event: KeyboardEvent) => void
  // Note: onSubmit inherits SubmitEvent from BaseEventAttributes
  // When spreading props to Hono JSX, use type assertion: {...(props as any)}
}

// ============================================================================
// Input Element Attributes
// ============================================================================

export interface InputHTMLAttributes extends Omit<HTMLBaseAttributes, 'onInput' | 'onChange' | 'ref'> {
  ref?: (element: HTMLInputElement) => void

  accept?: string
  alt?: string
  autocomplete?: string
  autofocus?: boolean | null
  capture?: boolean | 'user' | 'environment'
  checked?: boolean | null
  disabled?: boolean | null
  form?: string
  formaction?: string
  formenctype?: HTMLAttributeFormEnctype
  formmethod?: HTMLAttributeFormMethod
  formnovalidate?: boolean | null
  formtarget?: HTMLAttributeAnchorTarget
  height?: number | string
  list?: string
  max?: number | string
  maxlength?: number
  min?: number | string
  minlength?: number
  multiple?: boolean | null
  name?: string
  pattern?: string
  placeholder?: string
  readonly?: boolean | null
  required?: boolean | null
  size?: number
  src?: string
  step?: number | string
  type?: string
  value?: string | ReadonlyArray<string> | number
  width?: number | string

  // Event handlers
  onInput?: InputEventHandler<HTMLInputElement>
  onChange?: ChangeEventHandler<HTMLInputElement>
  onBlur?: (event: FocusEvent) => void
  onFocus?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyUp?: (event: KeyboardEvent) => void
  onKeyPress?: (event: KeyboardEvent) => void
}

// ============================================================================
// Textarea Element Attributes
// ============================================================================

export interface TextareaHTMLAttributes extends Omit<HTMLBaseAttributes, 'onInput' | 'onChange' | 'ref'> {
  ref?: (element: HTMLTextAreaElement) => void

  autocomplete?: string
  autofocus?: boolean | null
  cols?: number
  disabled?: boolean | null
  form?: string
  maxlength?: number
  minlength?: number
  name?: string
  placeholder?: string
  readonly?: boolean | null
  required?: boolean | null
  rows?: number
  value?: string
  wrap?: 'hard' | 'soft' | 'off'

  // Event handlers
  onInput?: InputEventHandler<HTMLTextAreaElement>
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
  onBlur?: (event: FocusEvent) => void
  onFocus?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyUp?: (event: KeyboardEvent) => void
  onKeyPress?: (event: KeyboardEvent) => void
}

// ============================================================================
// Select Element Attributes
// ============================================================================

export interface SelectHTMLAttributes extends Omit<HTMLBaseAttributes, 'onChange' | 'ref'> {
  ref?: (element: HTMLSelectElement) => void

  autocomplete?: string
  autofocus?: boolean | null
  disabled?: boolean | null
  form?: string
  multiple?: boolean | null
  name?: string
  required?: boolean | null
  size?: number
  value?: string | ReadonlyArray<string>

  // Event handlers
  onChange?: ChangeEventHandler<HTMLSelectElement>
  onBlur?: (event: FocusEvent) => void
  onFocus?: (event: FocusEvent) => void
}

// ============================================================================
// Form Element Attributes
// ============================================================================

export interface FormHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLFormElement) => void

  acceptCharset?: string
  action?: string | Function
  autocomplete?: 'on' | 'off'
  encoding?: string
  enctype?: string
  method?: 'get' | 'post' | 'dialog'
  name?: string
  novalidate?: boolean
  target?: string
}

// ============================================================================
// Anchor Element Attributes
// ============================================================================

export interface AnchorHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLAnchorElement) => void

  download?: string | boolean
  href?: string
  hreflang?: string
  media?: string
  ping?: string
  rel?: string
  target?: '_self' | '_blank' | '_parent' | '_top' | string
  type?: string
  referrerpolicy?: string
  // onClick inherited from HTMLBaseAttributes
}

// ============================================================================
// Image Element Attributes
// ============================================================================

export interface ImgHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLImageElement) => void

  alt?: string
  crossorigin?: 'anonymous' | 'use-credentials' | ''
  decoding?: 'async' | 'auto' | 'sync'
  height?: number | string
  loading?: 'eager' | 'lazy'
  referrerpolicy?: string
  sizes?: string
  src?: string
  srcset?: string
  usemap?: string
  width?: number | string
}

// ============================================================================
// Label Element Attributes
// ============================================================================

export interface LabelHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLLabelElement) => void

  for?: string
  form?: string
}

// ============================================================================
// Option Element Attributes
// ============================================================================

export interface OptionHTMLAttributes extends Omit<HTMLBaseAttributes, 'ref'> {
  ref?: (element: HTMLOptionElement) => void

  disabled?: boolean | null
  label?: string
  selected?: boolean | null
  value?: string | ReadonlyArray<string> | number
}
