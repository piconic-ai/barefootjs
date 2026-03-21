/**
 * Typography Components
 *
 * A collection of styled text elements for consistent typographic hierarchy.
 * Inspired by shadcn/ui typography with CSS variable theming support.
 *
 * @example Headings
 * ```tsx
 * <TypographyH1>Main Heading</TypographyH1>
 * <TypographyH2>Section Heading</TypographyH2>
 * <TypographyH3>Sub Heading</TypographyH3>
 * <TypographyH4>Minor Heading</TypographyH4>
 * ```
 *
 * @example Paragraph and lead
 * ```tsx
 * <TypographyLead>A larger introductory paragraph.</TypographyLead>
 * <TypographyP>Regular body text paragraph.</TypographyP>
 * ```
 *
 * @example Inline styles
 * ```tsx
 * <TypographyLarge>Large emphasis text</TypographyLarge>
 * <TypographySmall>Small caption text</TypographySmall>
 * <TypographyMuted>Muted secondary text</TypographyMuted>
 * <TypographyInlineCode>code</TypographyInlineCode>
 * ```
 *
 * @example Blockquote and list
 * ```tsx
 * <TypographyBlockquote>A notable quote.</TypographyBlockquote>
 * <TypographyList>
 *   <li>First item</li>
 *   <li>Second item</li>
 * </TypographyList>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

// --- Class definitions ---

const h1Classes = 'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl'
const h2Classes = 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0'
const h3Classes = 'scroll-m-20 text-2xl font-semibold tracking-tight'
const h4Classes = 'scroll-m-20 text-xl font-semibold tracking-tight'
const pClasses = 'leading-7 [&:not(:first-child)]:mt-6'
const blockquoteClasses = 'mt-6 border-l-2 pl-6 italic'
const listClasses = 'my-6 ml-6 list-disc [&>li]:mt-2'
const inlineCodeClasses = 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold'
const leadClasses = 'text-xl text-muted-foreground'
const largeClasses = 'text-lg font-semibold'
const smallClasses = 'text-sm font-medium leading-none'
const mutedClasses = 'text-sm text-muted-foreground'

// --- Props interfaces ---

interface TypographyProps extends HTMLBaseAttributes {
  children?: Child
}

// --- Components ---

function TypographyH1({ children, className = '', ...props }: TypographyProps) {
  return (
    <h1 data-slot="typography-h1" className={`${h1Classes} ${className}`} {...props}>
      {children}
    </h1>
  )
}

function TypographyH2({ children, className = '', ...props }: TypographyProps) {
  return (
    <h2 data-slot="typography-h2" className={`${h2Classes} ${className}`} {...props}>
      {children}
    </h2>
  )
}

function TypographyH3({ children, className = '', ...props }: TypographyProps) {
  return (
    <h3 data-slot="typography-h3" className={`${h3Classes} ${className}`} {...props}>
      {children}
    </h3>
  )
}

function TypographyH4({ children, className = '', ...props }: TypographyProps) {
  return (
    <h4 data-slot="typography-h4" className={`${h4Classes} ${className}`} {...props}>
      {children}
    </h4>
  )
}

function TypographyP({ children, className = '', ...props }: TypographyProps) {
  return (
    <p data-slot="typography-p" className={`${pClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

function TypographyBlockquote({ children, className = '', ...props }: TypographyProps) {
  return (
    <blockquote data-slot="typography-blockquote" className={`${blockquoteClasses} ${className}`} {...props}>
      {children}
    </blockquote>
  )
}

function TypographyList({ children, className = '', ...props }: TypographyProps) {
  return (
    <ul data-slot="typography-list" className={`${listClasses} ${className}`} {...props}>
      {children}
    </ul>
  )
}

function TypographyInlineCode({ children, className = '', ...props }: TypographyProps) {
  return (
    <code data-slot="typography-inline-code" className={`${inlineCodeClasses} ${className}`} {...props}>
      {children}
    </code>
  )
}

function TypographyLead({ children, className = '', ...props }: TypographyProps) {
  return (
    <p data-slot="typography-lead" className={`${leadClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

function TypographyLarge({ children, className = '', ...props }: TypographyProps) {
  return (
    <div data-slot="typography-large" className={`${largeClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function TypographySmall({ children, className = '', ...props }: TypographyProps) {
  return (
    <small data-slot="typography-small" className={`${smallClasses} ${className}`} {...props}>
      {children}
    </small>
  )
}

function TypographyMuted({ children, className = '', ...props }: TypographyProps) {
  return (
    <p data-slot="typography-muted" className={`${mutedClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

export {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLead,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
}
export type { TypographyProps }
