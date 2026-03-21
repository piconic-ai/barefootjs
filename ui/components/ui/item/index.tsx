/**
 * Item Components
 *
 * A generic list/menu item component with composable sub-components.
 * Supports visual variants and sizes for flexible list layouts.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Basic item with content
 * ```tsx
 * <Item>
 *   <ItemContent>
 *     <ItemTitle>Item Title</ItemTitle>
 *     <ItemDescription>Item description here</ItemDescription>
 *   </ItemContent>
 * </Item>
 * ```
 *
 * @example Item group with separator
 * ```tsx
 * <ItemGroup>
 *   <Item>
 *     <ItemContent>
 *       <ItemTitle>First Item</ItemTitle>
 *     </ItemContent>
 *   </Item>
 *   <ItemSeparator />
 *   <Item>
 *     <ItemContent>
 *       <ItemTitle>Second Item</ItemTitle>
 *     </ItemContent>
 *   </Item>
 * </ItemGroup>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Separator } from '../separator'

// --- Variant types ---

type ItemVariant = 'default' | 'outline' | 'muted'
type ItemSize = 'default' | 'sm'
type ItemMediaVariant = 'default' | 'icon' | 'image'

// --- Item classes ---

const itemBaseClasses = 'group/item flex flex-wrap items-center rounded-md border border-transparent text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const itemVariantClasses: Record<ItemVariant, string> = {
  default: 'bg-transparent',
  outline: 'border-border',
  muted: 'bg-muted/50',
}

const itemSizeClasses: Record<ItemSize, string> = {
  default: 'gap-4 p-4',
  sm: 'gap-2.5 px-4 py-3',
}

// --- ItemMedia classes ---

const itemMediaBaseClasses = 'flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none'

const itemMediaVariantClasses: Record<ItemMediaVariant, string> = {
  default: 'bg-transparent',
  icon: 'size-8 rounded-sm border bg-muted [&_svg:not([class*="size-"])]:size-4',
  image: 'size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover',
}

// --- Sub-component classes ---

const itemGroupClasses = 'group/item-group flex flex-col'
const itemContentClasses = 'flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none'
const itemTitleClasses = 'flex w-fit items-center gap-2 text-sm leading-snug font-medium'
const itemDescriptionClasses = 'line-clamp-2 text-sm leading-normal font-normal text-balance text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary'
const itemActionsClasses = 'flex items-center gap-2'
const itemHeaderClasses = 'flex basis-full items-center justify-between gap-2'
const itemFooterClasses = 'flex basis-full items-center justify-between gap-2'

// --- Props ---

interface ItemGroupProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemSeparatorProps extends HTMLBaseAttributes {
  decorative?: boolean
}

interface ItemProps extends HTMLBaseAttributes {
  /** Visual style of the item. */
  variant?: ItemVariant
  /** Size of the item. */
  size?: ItemSize
  children?: Child
}

interface ItemMediaProps extends HTMLBaseAttributes {
  /** Visual style of the media container. */
  variant?: ItemMediaVariant
  children?: Child
}

interface ItemContentProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemTitleProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemDescriptionProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemActionsProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemHeaderProps extends HTMLBaseAttributes {
  children?: Child
}

interface ItemFooterProps extends HTMLBaseAttributes {
  children?: Child
}

// --- Components ---

function ItemGroup({ children, className = '', ...props }: ItemGroupProps) {
  return (
    <div role="list" data-slot="item-group" className={`${itemGroupClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function ItemSeparator({ className = '', decorative = true, ...props }: ItemSeparatorProps) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      decorative={decorative}
      className={`my-0 ${className}`}
      {...props}
    />
  )
}

function Item({ children, className = '', variant = 'default', size = 'default', ...props }: ItemProps) {
  return (
    <div
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={`${itemBaseClasses} ${itemVariantClasses[variant]} ${itemSizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

function ItemMedia({ children, className = '', variant = 'default', ...props }: ItemMediaProps) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={`${itemMediaBaseClasses} ${itemMediaVariantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

function ItemContent({ children, className = '', ...props }: ItemContentProps) {
  return (
    <div data-slot="item-content" className={`${itemContentClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function ItemTitle({ children, className = '', ...props }: ItemTitleProps) {
  return (
    <div data-slot="item-title" className={`${itemTitleClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function ItemDescription({ children, className = '', ...props }: ItemDescriptionProps) {
  return (
    <p data-slot="item-description" className={`${itemDescriptionClasses} ${className}`} {...props}>
      {children}
    </p>
  )
}

function ItemActions({ children, className = '', ...props }: ItemActionsProps) {
  return (
    <div data-slot="item-actions" className={`${itemActionsClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function ItemHeader({ children, className = '', ...props }: ItemHeaderProps) {
  return (
    <div data-slot="item-header" className={`${itemHeaderClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

function ItemFooter({ children, className = '', ...props }: ItemFooterProps) {
  return (
    <div data-slot="item-footer" className={`${itemFooterClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

export { Item, ItemMedia, ItemContent, ItemActions, ItemGroup, ItemSeparator, ItemTitle, ItemDescription, ItemHeader, ItemFooter }
export type { ItemVariant, ItemSize, ItemMediaVariant, ItemProps, ItemMediaProps, ItemContentProps, ItemActionsProps, ItemGroupProps, ItemSeparatorProps, ItemTitleProps, ItemDescriptionProps, ItemHeaderProps, ItemFooterProps }
