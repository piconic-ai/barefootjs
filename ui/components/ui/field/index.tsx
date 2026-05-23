"use client"

/**
 * Field Component
 *
 * A form field wrapper that provides structure for labels, descriptions,
 * and error messages. Supports vertical and horizontal orientations.
 * Based on shadcn/ui Field with native HTML + ARIA.
 *
 * @example Basic usage
 * ```tsx
 * <Field>
 *   <FieldLabel>Email</FieldLabel>
 *   <FieldContent>
 *     <Input type="email" />
 *     <FieldDescription>Enter your email address.</FieldDescription>
 *   </FieldContent>
 * </Field>
 * ```
 *
 * @example With error
 * ```tsx
 * <Field data-invalid="true">
 *   <FieldLabel>Username</FieldLabel>
 *   <FieldContent>
 *     <Input aria-invalid />
 *     <FieldError>Username is required.</FieldError>
 *   </FieldContent>
 * </Field>
 * ```
 *
 * @example Horizontal layout
 * ```tsx
 * <Field orientation="horizontal">
 *   <FieldLabel>Newsletter</FieldLabel>
 *   <Checkbox />
 * </Field>
 * ```
 */

import type { HTMLBaseAttributes, LabelHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// --- FieldSet ---

const fieldSetClasses = 'flex flex-col gap-6'

/** Props for the FieldSet component. */
interface FieldSetProps extends HTMLBaseAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the fieldset. */
  children?: Child
}

/**
 * Groups multiple Field components.
 * Renders as a native <fieldset> element.
 */
function FieldSet({ className = '', children, ...props }: FieldSetProps) {
  return (
    <fieldset
      data-slot="field-set"
      className={`${fieldSetClasses} ${className}`}
      {...props}
    >
      {children}
    </fieldset>
  )
}

// --- FieldLegend ---

type FieldLegendVariant = 'legend' | 'label'

const fieldLegendBaseClasses = 'mb-3 font-medium'
const fieldLegendVariantClasses: Record<FieldLegendVariant, string> = {
  legend: 'text-base',
  label: 'text-sm',
}

/** Props for the FieldLegend component. */
interface FieldLegendProps extends HTMLBaseAttributes {
  /** The visual variant of the legend. */
  variant?: FieldLegendVariant
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the legend. */
  children?: Child
}

/**
 * A legend element for a FieldSet.
 * Supports legend and label visual variants.
 */
function FieldLegend({ variant = 'legend', className = '', children, ...props }: FieldLegendProps) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={`${fieldLegendBaseClasses} ${fieldLegendVariantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </legend>
  )
}

// --- FieldGroup ---

const fieldGroupClasses = 'flex w-full flex-col gap-7'

/** Props for the FieldGroup component. */
interface FieldGroupProps extends HTMLBaseAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the group. */
  children?: Child
}

/**
 * Groups multiple fields within a FieldSet.
 */
function FieldGroup({ className = '', children, ...props }: FieldGroupProps) {
  return (
    <div
      data-slot="field-group"
      className={`${fieldGroupClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- Field ---

type FieldOrientation = 'vertical' | 'horizontal'

const fieldBaseClasses = 'group/field flex w-full gap-3 data-[invalid=true]:text-destructive'
const fieldOrientationClasses: Record<FieldOrientation, string> = {
  vertical: 'flex-col [&>*]:w-full',
  horizontal: 'flex-row items-center',
}

/** Props for the Field component. */
interface FieldProps extends HTMLBaseAttributes {
  /** Layout orientation. */
  orientation?: FieldOrientation
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the field. */
  children?: Child
}

/**
 * A form field wrapper providing layout and error state styling.
 * Use data-invalid="true" to apply error styling.
 */
function Field({ orientation = 'vertical', className = '', children, ...props }: FieldProps) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={`${fieldBaseClasses} ${fieldOrientationClasses[orientation]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- FieldContent ---

const fieldContentClasses = 'flex flex-1 flex-col gap-1.5 leading-snug'

/** Props for the FieldContent component. */
interface FieldContentProps extends HTMLBaseAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the field content area. */
  children?: Child
}

/**
 * Wraps the input control, description, and error within a Field.
 */
function FieldContent({ className = '', children, ...props }: FieldContentProps) {
  return (
    <div
      data-slot="field-content"
      className={`${fieldContentClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// --- FieldLabel ---

const fieldLabelClasses = 'flex w-fit gap-2 leading-snug text-sm font-medium select-none group-data-[disabled=true]/field:opacity-50'

/** Props for the FieldLabel component. */
interface FieldLabelProps extends LabelHTMLAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the label. */
  children?: Child
}

/**
 * A label element within a Field.
 * Inherits disabled styling from parent Field.
 */
function FieldLabel({ className = '', children, ...props }: FieldLabelProps) {
  return (
    <label
      data-slot="field-label"
      className={`${fieldLabelClasses} ${className}`}
      {...props}
    >
      {children}
    </label>
  )
}

// --- FieldDescription ---

const fieldDescriptionClasses = 'text-sm leading-normal font-normal text-muted-foreground'

/** Props for the FieldDescription component. */
interface FieldDescriptionProps extends HTMLBaseAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Content displayed inside the description. */
  children?: Child
}

/**
 * Descriptive text within a Field, typically placed below the input.
 */
function FieldDescription({ className = '', children, ...props }: FieldDescriptionProps) {
  return (
    <p
      data-slot="field-description"
      className={`${fieldDescriptionClasses} ${className}`}
      {...props}
    >
      {children}
    </p>
  )
}

// --- FieldError ---

const fieldErrorClasses = 'text-sm font-normal text-destructive'

/** Props for the FieldError component. */
interface FieldErrorProps extends HTMLBaseAttributes {
  /** Additional CSS class names. */
  className?: string
  /** Error message content. */
  children?: Child
}

/**
 * Displays validation error messages within a Field.
 * Uses role="alert" for screen reader announcements.
 */
function FieldError({ className = '', children, ...props }: FieldErrorProps) {
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={`${fieldErrorClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
}

export type {
  FieldProps,
  FieldContentProps,
  FieldDescriptionProps,
  FieldErrorProps,
  FieldGroupProps,
  FieldLabelProps,
  FieldLegendProps,
  FieldSetProps,
  FieldOrientation,
  FieldLegendVariant,
}
