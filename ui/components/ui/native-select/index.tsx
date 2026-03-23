/**
 * NativeSelect Component
 *
 * A styled native HTML select element following shadcn/ui design.
 * Wraps the native <select> in a container with a custom chevron icon.
 *
 * @example Basic usage
 * ```tsx
 * <NativeSelect>
 *   <NativeSelectOption value="1">Option 1</NativeSelectOption>
 *   <NativeSelectOption value="2">Option 2</NativeSelectOption>
 * </NativeSelect>
 * ```
 *
 * @example With size
 * ```tsx
 * <NativeSelect size="sm">
 *   <NativeSelectOption value="a">Small</NativeSelectOption>
 * </NativeSelect>
 * ```
 */

import type { SelectHTMLAttributes, HTMLBaseAttributes, OptionHTMLAttributes } from '@barefootjs/jsx'
import { ChevronDownIcon } from '../icon'

interface OptGroupHTMLAttributes extends HTMLBaseAttributes {
  disabled?: boolean
  label?: string
}

// Size variants
type NativeSelectSize = 'sm' | 'default'

const sizeClasses: Record<NativeSelectSize, string> = {
  default: 'h-9 py-2',
  sm: 'h-8 py-1',
}

// Base classes for the select element (aligned with shadcn/ui)
const baseClasses = 'w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50'

// Focus state classes
const focusClasses = 'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Error state classes
const errorClasses = 'aria-[invalid]:border-destructive aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40'

/**
 * Props for NativeSelect.
 * Omits the native `size` attribute (number) and replaces with a string variant.
 */
interface NativeSelectProps extends Omit<SelectHTMLAttributes, 'size'> {
  /** Size variant of the select. */
  size?: NativeSelectSize
}

/**
 * NativeSelect — styled native HTML select element.
 */
function NativeSelect({ className = '', size = 'default', ...props }: NativeSelectProps) {
  return (
    <div
      className="group/native-select relative w-fit has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        className={`${baseClasses} ${sizeClasses[size]} ${focusClasses} ${errorClasses} ${className}`}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
        data-slot="native-select-icon"
      />
    </div>
  )
}

/**
 * NativeSelectOption — an option within a NativeSelect.
 */
function NativeSelectOption({ ...props }: OptionHTMLAttributes) {
  return <option data-slot="native-select-option" {...props} />
}

/**
 * NativeSelectOptGroup — a group of options within a NativeSelect.
 */
function NativeSelectOptGroup({ className = '', ...props }: OptGroupHTMLAttributes) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={className}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup }
export type { NativeSelectProps }
