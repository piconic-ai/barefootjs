import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'
import { Separator } from '../separator'
import { bfComment } from '@barefootjs/hono/utils'

type ButtonGroupOrientation = 'horizontal' | 'vertical'

const baseClasses = 'flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10'

const orientationClasses = {
  horizontal: '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:-ml-px [&>*:not(:last-child)]:rounded-r-none',
  vertical: 'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:-mt-px [&>*:not(:last-child)]:rounded-b-none',
}

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

interface ButtonGroupSeparatorProps extends HTMLBaseAttributes {
  /**
   * The separator orientation.
   * @default 'vertical'
   */
  orientation?: 'horizontal' | 'vertical'
}

const textBaseClasses = 'flex items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4'

type ButtonGroupPropsWithHydration = ButtonGroupProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type ButtonGroupTextPropsWithHydration = ButtonGroupTextProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

type ButtonGroupSeparatorPropsWithHydration = ButtonGroupSeparatorProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { ButtonGroupProps, ButtonGroupTextProps, ButtonGroupSeparatorProps, ButtonGroupOrientation }

export function ButtonGroup({ orientation = 'horizontal', className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ButtonGroupPropsWithHydration = {} as ButtonGroupPropsWithHydration) {
  const __scopeId = __instanceId || `ButtonGroup_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof orientation !== 'function' && !(typeof orientation === 'object' && orientation !== null && 'isEscaped' in orientation)) __hydrateProps['orientation'] = orientation
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="button-group" data-orientation={orientation} role="group" className={`flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 ${({"horizontal": "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:-ml-px [&>*:not(:last-child)]:rounded-r-none", "vertical": "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:-mt-px [&>*:not(:last-child)]:rounded-b-none"} as Record<string, string>)[orientation]} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function ButtonGroupText({ className = '', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ButtonGroupTextPropsWithHydration = {} as ButtonGroupTextPropsWithHydration) {
  const __scopeId = __instanceId || `ButtonGroupText_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`flex items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <div className={`flex items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}

export function ButtonGroupSeparator({ orientation = 'vertical', className = '', __instanceId, __bfScope: _bfScope, __bfChild: _bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": _dataKey, ...props }: ButtonGroupSeparatorPropsWithHydration = {} as ButtonGroupSeparatorPropsWithHydration) {
  const __scopeId = __instanceId || `ButtonGroupSeparator_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof orientation !== 'function' && !(typeof orientation === 'object' && orientation !== null && 'isEscaped' in orientation)) __hydrateProps['orientation'] = orientation
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{bfComment(`scope:${__scopeId}${__bfParent ? `|h=${__bfParent}|m=${__bfMount}` : ""}${__bfPropsJson ? `|${__bfPropsJson}` : ""}`)}<Separator data-slot="button-group-separator" orientation={orientation} decorative className={`!m-0 self-stretch bg-input ${orientation === 'vertical' ? 'h-auto' : ''} ${className}`} {...props} __instanceId={`${__scopeId}_s0`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s0'} bf-s={__scopeId} />{bfComment(`/scope:${__scopeId}`)}</>
  )
}