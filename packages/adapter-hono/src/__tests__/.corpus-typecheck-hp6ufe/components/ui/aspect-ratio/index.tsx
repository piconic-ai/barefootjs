import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

const aspectRatioClasses = 'relative w-full'
interface AspectRatioProps extends HTMLBaseAttributes {
  /** Width-to-height ratio (e.g. 16/9, 4/3, 1) */
  ratio?: number
  /** Content to display within the aspect ratio container */
  children?: Child
}

type AspectRatioPropsWithHydration = AspectRatioProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { AspectRatioProps }

export function AspectRatio({ ratio = 1, children, className = '', __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: AspectRatioPropsWithHydration = {} as AspectRatioPropsWithHydration) {
  const __scopeId = __instanceId || `AspectRatio_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof ratio !== 'function' && !(typeof ratio === 'object' && ratio !== null && 'isEscaped' in ratio)) __hydrateProps['ratio'] = ratio
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="aspect-ratio" className={`relative w-full ${className}`} style={`position:relative;aspect-ratio:${ratio}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</div>
  )
}