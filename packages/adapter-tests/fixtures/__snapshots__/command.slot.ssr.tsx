/** @jsxImportSource hono/jsx */
import { serializeHydrationProps } from '@barefootjs/hono/utils'
import type { Child } from '../../../types'

interface SlotProps {
  /** Child element to merge props with */
  children?: Child
  /** CSS class to merge with child's class */
  className?: string
  /** Additional props to merge with child element */
  [key: string]: unknown
}
function isValidElement(element: unknown): element is { tag: unknown; props: Record<string, unknown> } {
  return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
}

type SlotPropsWithHydration = SlotProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { SlotProps }

export function Slot({ children, className, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": _dataKey, ...props }: SlotPropsWithHydration = {} as SlotPropsWithHydration) {
  const __scopeId = __instanceId || `Slot_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration — ROOT MOUNTS ONLY (Move C, Prop
  // Boundary Contract). A child mount's __bfPropsJson is never read (bf-p is
  // only emitted when !__bfChild, see hydrationAttrs below) — children receive
  // props live via initChild(), so serialization is skipped entirely for a
  // child mount rather than computed and discarded. This also means a child
  // carrying an otherwise-unserializable prop (a Map, a live function) never
  // spuriously fails SSR: unreachable-ness is a RUNTIME fact (__bfChild), not
  // decidable at codegen time.
  let __bfPropsJson = __bfParentProps
  if (!__bfChild) {
    const __hydrateProps: Record<string, unknown> = {}
    if (!(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
    if (!(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
    __bfPropsJson = __bfParentProps || serializeHydrationProps(__hydrateProps, 'Slot', {})
  }

  if (children && isValidElement(children)) {
    const Tag = children.tag as any
    const childProps = children.props
    const childClass = (childProps.className as string) || ''
    const childChildren = childProps.children
    const mergedClass = [className, childClass].filter(Boolean).join(' ')
    return (
      <Tag {...(children.props)} {...props} className={([className, (((children.props).className) || '')].filter(Boolean).join(' '))} __instanceId={`${__scopeId}_s0`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s0'} bf-s={__scopeId}>{(children.props).children}</Tag>
    )
  }
  return (
    <>{children}</>
  )
}
