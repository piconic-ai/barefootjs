/** @jsxImportSource hono/jsx */
import { createContext, useContext, createSignal, createMemo, createEffect, onCleanup, provideContextSSR } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { ChevronLeftIcon, ChevronRightIcon } from '../icon'

const CarouselContext = createContext<CarouselContextValue>()

type EmblaOptionsType = {
  axis?: 'x' | 'y'
  loop?: boolean
  align?: 'start' | 'center' | 'end'
  dragFree?: boolean
  containScroll?: 'trimSnaps' | 'keepSnaps' | false
  [key: string]: any
}
interface CarouselProps extends HTMLBaseAttributes {
  /** Scroll orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Embla Carousel options */
  opts?: EmblaOptionsType
  /** Carousel content */
  children?: Child
}
interface CarouselContentProps extends HTMLBaseAttributes {
  /** Carousel items */
  children?: Child
  /** Orientation override (read from parent via data attribute during SSR) */
  orientation?: 'horizontal' | 'vertical'
}
interface CarouselItemProps extends HTMLBaseAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Slide content */
  children?: Child
}
interface CarouselPreviousProps extends ButtonHTMLAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Button content override */
  children?: Child
}
interface CarouselNextProps extends ButtonHTMLAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Button content override */
  children?: Child
}

export type { CarouselProps, CarouselContentProps, CarouselItemProps, CarouselPreviousProps, CarouselNextProps }

export function Carousel(__allProps: CarouselProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Carousel_${Math.random().toString(36).slice(2, 8)}`
  const canScrollPrev = () => false
  const setCanScrollPrev = (..._args: any[]) => {}
  const canScrollNext = () => false
  const setCanScrollNext = (..._args: any[]) => {}
  const orientation = () => props.orientation ?? 'horizontal'
  const carouselClasses = 'relative'
  let emblaApi
  const scrollPrev = () => emblaApi?.scrollPrev()
  const scrollNext = () => emblaApi?.scrollNext()

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.orientation !== 'function' && !(typeof props.orientation === 'object' && props.orientation !== null && 'isEscaped' in props.orientation)) __hydrateProps['orientation'] = props.orientation
  if (typeof props.opts !== 'function' && !(typeof props.opts === 'object' && props.opts !== null && 'isEscaped' in props.opts)) __hydrateProps['opts'] = props.opts
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(CarouselContext, {
      orientation: orientation(),
      scrollPrev,
      scrollNext,
      canScrollPrev,
      canScrollNext,
      setApi: (api) => { emblaApi = api },
      setCanScrollPrev,
      setCanScrollNext,
    }, <><div data-slot="carousel" role="region" aria-roledescription="carousel" className={`${carouselClasses} ${props.className ?? ''}`} tabindex={0} data-orientation={orientation()} data-opts={props.opts ? JSON.stringify(props.opts) : undefined} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div></>)}</>
  )
}

export function CarouselContent(__allProps: CarouselContentProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CarouselContent_${Math.random().toString(36).slice(2, 8)}`
  const orientation = () => props.orientation ?? 'horizontal'
  const directionClasses = () => orientation() === 'vertical' ? 'flex-col -mt-4' : 'flex -ml-4'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.orientation !== 'function' && !(typeof props.orientation === 'object' && props.orientation !== null && 'isEscaped' in props.orientation)) __hydrateProps['orientation'] = props.orientation
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="carousel-viewport" className="overflow-hidden" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><div data-slot="carousel-content" className={`${directionClasses()} ${props.className ?? ''}`} bf="s0">{props.children}</div></div>
  )
}

export function CarouselItem(__allProps: CarouselItemProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CarouselItem_${Math.random().toString(36).slice(2, 8)}`
  const paddingClass = () => (props.orientation ?? 'horizontal') === 'vertical' ? 'pt-4' : 'pl-4'
  const carouselItemClasses = 'min-w-0 shrink-0 grow-0 basis-full'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.orientation !== 'function' && !(typeof props.orientation === 'object' && props.orientation !== null && 'isEscaped' in props.orientation)) __hydrateProps['orientation'] = props.orientation
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <div data-slot="carousel-item" role="group" aria-roledescription="slide" className={`${carouselItemClasses} ${paddingClass()} ${props.className ?? ''}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div>
  )
}

export function CarouselPrevious(__allProps: CarouselPreviousProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CarouselPrevious_${Math.random().toString(36).slice(2, 8)}`
  const orientation = () => props.orientation ?? 'horizontal'
  const positionClasses = () => orientation() === 'vertical' ? prevVerticalClasses : prevHorizontalClasses
  const carouselButtonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 absolute h-8 w-8 rounded-full'
  const prevHorizontalClasses = '-left-12 top-1/2 -translate-y-1/2'
  const prevVerticalClasses = '-top-12 left-1/2 -translate-x-1/2 rotate-90'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.orientation !== 'function' && !(typeof props.orientation === 'object' && props.orientation !== null && 'isEscaped' in props.orientation)) __hydrateProps['orientation'] = props.orientation
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="carousel-previous" type="button" className={`${carouselButtonBaseClasses} ${positionClasses()} ${props.className ?? ''}`} disabled aria-label="Previous slide" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><ChevronLeftIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span className="sr-only">Previous slide</span></button>
  )
}

export function CarouselNext(__allProps: CarouselNextProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CarouselNext_${Math.random().toString(36).slice(2, 8)}`
  const orientation = () => props.orientation ?? 'horizontal'
  const positionClasses = () => orientation() === 'vertical' ? nextVerticalClasses : nextHorizontalClasses
  const carouselButtonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 absolute h-8 w-8 rounded-full'
  const nextHorizontalClasses = '-right-12 top-1/2 -translate-y-1/2'
  const nextVerticalClasses = '-bottom-12 left-1/2 -translate-x-1/2 rotate-90'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.orientation !== 'function' && !(typeof props.orientation === 'object' && props.orientation !== null && 'isEscaped' in props.orientation)) __hydrateProps['orientation'] = props.orientation
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <button data-slot="carousel-next" type="button" className={`${carouselButtonBaseClasses} ${positionClasses()} ${props.className ?? ''}`} disabled aria-label="Next slide" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1"><ChevronRightIcon size="sm" __instanceId={`${__scopeId}_s0`} __bfChild={true} __bfParent={__scopeId} __bfMount={'s0'} /><span className="sr-only">Next slide</span></button>
  )
}
