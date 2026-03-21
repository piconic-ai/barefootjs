/**
 * ButtonGroup Component
 *
 * A container that groups related buttons together with consistent styling.
 * Removes inner border-radius and merges borders between adjacent children.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Basic usage
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="outline">Left</Button>
 *   <Button variant="outline">Center</Button>
 *   <Button variant="outline">Right</Button>
 * </ButtonGroup>
 * ```
 *
 * @example Vertical orientation
 * ```tsx
 * <ButtonGroup orientation="vertical">
 *   <Button variant="outline">Top</Button>
 *   <Button variant="outline">Middle</Button>
 *   <Button variant="outline">Bottom</Button>
 * </ButtonGroup>
 * ```
 *
 * @example With separator
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="outline">Save</Button>
 *   <ButtonGroupSeparator />
 *   <Button variant="outline" size="icon">▼</Button>
 * </ButtonGroup>
 * ```
 *
 * @example With text
 * ```tsx
 * <ButtonGroup>
 *   <ButtonGroupText>Label</ButtonGroupText>
 *   <Button variant="outline">Action</Button>
 * </ButtonGroup>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'
import { Separator } from '../separator'

// Orientation type
type ButtonGroupOrientation = 'horizontal' | 'vertical'

// Base classes for the group container
const baseClasses = 'flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10'

// Orientation-specific classes
const orientationClasses: Record<ButtonGroupOrientation, string> = {
  horizontal: '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
  vertical: 'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
}

/**
 * Props for the ButtonGroup component.
 */
interface ButtonGroupProps extends HTMLBaseAttributes {
  /**
   * The orientation of the button group.
   * @default 'horizontal'
   */
  orientation?: ButtonGroupOrientation
  /**
   * Children to render inside the button group.
   */
  children?: Child
}

/**
 * ButtonGroup component.
 * Groups related buttons with merged borders and rounded corners.
 *
 * @param props.orientation - Layout direction: 'horizontal' or 'vertical'
 */
function ButtonGroup({
  orientation = 'horizontal',
  className = '',
  children,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      data-slot="button-group"
      data-orientation={orientation}
      role="group"
      className={`${baseClasses} ${orientationClasses[orientation]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// Base classes for ButtonGroupText
const textBaseClasses = 'flex items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4'

/**
 * Props for the ButtonGroupText component.
 */
interface ButtonGroupTextProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element instead of `<div>`.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the text container.
   */
  children?: Child
}

/**
 * ButtonGroupText component.
 * Displays text content within a button group.
 *
 * @param props.asChild - Render child element instead of div
 */
function ButtonGroupText({
  className = '',
  asChild = false,
  children,
  ...props
}: ButtonGroupTextProps) {
  const classes = `${textBaseClasses} ${className}`

  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <div className={classes} {...props}>{children}</div>
}

/**
 * Props for the ButtonGroupSeparator component.
 */
interface ButtonGroupSeparatorProps extends HTMLBaseAttributes {
  /**
   * The separator orientation.
   * @default 'vertical'
   */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * ButtonGroupSeparator component.
 * A visual divider between buttons in a group.
 *
 * @param props.orientation - Separator direction
 */
function ButtonGroupSeparator({
  orientation = 'vertical',
  className = '',
  ...props
}: ButtonGroupSeparatorProps) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      decorative
      className={`!m-0 self-stretch bg-input ${orientation === 'vertical' ? 'h-auto' : ''} ${className}`}
      {...props}
    />
  )
}

export { ButtonGroup, ButtonGroupText, ButtonGroupSeparator }
export type { ButtonGroupProps, ButtonGroupTextProps, ButtonGroupSeparatorProps, ButtonGroupOrientation }
