import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

type Direction = 'ltr' | 'rtl'
interface DirectionProviderProps extends HTMLBaseAttributes {
  /**
   * The text direction for child content.
   * @default 'ltr'
   */
  dir?: Direction
  /**
   * Additional CSS class names.
   */
  className?: string
  /**
   * Content to render within the direction context.
   */
  children?: Child
}

type DirectionProviderPropsWithHydration = DirectionProviderProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { DirectionProviderProps, Direction }

export function DirectionProvider({ dir = 'ltr', className = '', children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: DirectionProviderPropsWithHydration = {} as DirectionProviderPropsWithHydration) {
  const __scopeId = __instanceId || `DirectionProvider_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof dir !== 'function' && !(typeof dir === 'object' && dir !== null && 'isEscaped' in dir)) __hydrateProps['dir'] = dir
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="direction-provider" dir={dir} className={className} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}