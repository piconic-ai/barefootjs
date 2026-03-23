"use client"

/**
 * Carousel Components
 *
 * A carousel with motion and swipe built using Embla Carousel.
 * Uses context pattern (like Dialog) for parent-child communication.
 * Context is ONLY consumed inside ref callbacks (client-side hydration).
 * Orientation is passed via data-orientation attribute for SSR.
 *
 * @example Basic carousel
 * ```tsx
 * <Carousel>
 *   <CarouselContent>
 *     <CarouselItem>Slide 1</CarouselItem>
 *     <CarouselItem>Slide 2</CarouselItem>
 *     <CarouselItem>Slide 3</CarouselItem>
 *   </CarouselContent>
 *   <CarouselPrevious />
 *   <CarouselNext />
 * </Carousel>
 * ```
 */

import { createContext, useContext, createSignal, createEffect, onCleanup } from '@barefootjs/dom'
import type { HTMLBaseAttributes, ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { ChevronLeftIcon, ChevronRightIcon } from '../icon'

// Embla Carousel types (minimal subset)
type EmblaOptionsType = {
  axis?: 'x' | 'y'
  loop?: boolean
  align?: 'start' | 'center' | 'end'
  dragFree?: boolean
  containScroll?: 'trimSnaps' | 'keepSnaps' | false
  [key: string]: any
}

type EmblaCarouselType = {
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: () => boolean
  canScrollNext: () => boolean
  on: (event: any, callback: () => void) => any
  destroy: () => void
}

// Context for Carousel → children state sharing (client-side only)
interface CarouselContextValue {
  orientation: 'horizontal' | 'vertical'
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: () => boolean
  canScrollNext: () => boolean
  setApi: (api: EmblaCarouselType) => void
  setCanScrollPrev: (v: boolean) => void
  setCanScrollNext: (v: boolean) => void
}

const CarouselContext = createContext<CarouselContextValue>()

// CSS classes
const carouselClasses = 'relative'
const carouselItemClasses = 'min-w-0 shrink-0 grow-0 basis-full'

const carouselButtonBaseClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 absolute h-8 w-8 rounded-full'

interface CarouselProps extends HTMLBaseAttributes {
  /** Scroll orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Embla Carousel options */
  opts?: EmblaOptionsType
  /** Carousel content */
  children?: Child
}

function Carousel(props: CarouselProps) {
  const orientation = props.orientation ?? 'horizontal'
  const [canScrollPrev, setCanScrollPrev] = createSignal(false)
  const [canScrollNext, setCanScrollNext] = createSignal(false)
  let emblaApi: EmblaCarouselType | undefined

  const scrollPrev = () => emblaApi?.scrollPrev()
  const scrollNext = () => emblaApi?.scrollNext()

  const handleMount = (el: HTMLElement) => {
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (orientation === 'horizontal') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); scrollPrev() }
        else if (e.key === 'ArrowRight') { e.preventDefault(); scrollNext() }
      } else {
        if (e.key === 'ArrowUp') { e.preventDefault(); scrollPrev() }
        else if (e.key === 'ArrowDown') { e.preventDefault(); scrollNext() }
      }
    })
  }

  return (
    <CarouselContext.Provider value={{
      orientation,
      scrollPrev,
      scrollNext,
      canScrollPrev,
      canScrollNext,
      setApi: (api: EmblaCarouselType) => { emblaApi = api },
      setCanScrollPrev,
      setCanScrollNext,
    }}>
      <div
        data-slot="carousel"
        role="region"
        aria-roledescription="carousel"
        className={`${carouselClasses} ${props.className ?? ''}`}
        tabindex={0}
        ref={handleMount}
        data-orientation={orientation}
        data-opts={props.opts ? JSON.stringify(props.opts) : undefined}
      >
        {props.children}
      </div>
    </CarouselContext.Provider>
  )
}

interface CarouselContentProps extends HTMLBaseAttributes {
  /** Carousel items */
  children?: Child
  /** Orientation override (read from parent via data attribute during SSR) */
  orientation?: 'horizontal' | 'vertical'
}

function CarouselContent(props: CarouselContentProps) {
  const orientation = props.orientation ?? 'horizontal'

  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CarouselContext)
    const carouselEl = el.closest('[data-slot="carousel"]') as HTMLElement
    if (!carouselEl) return

    // Parse options from carousel root
    const optsStr = carouselEl.dataset.opts
    const userOpts: EmblaOptionsType = optsStr ? JSON.parse(optsStr) : {}

    // Dynamic import of embla-carousel
    import('embla-carousel').then((mod) => {
      const EmblaCarousel = mod.default
      const viewportEl = el.parentElement as HTMLElement

      const opts: EmblaOptionsType = {
        axis: ctx.orientation === 'vertical' ? 'y' : 'x',
        ...userOpts,
      }

      const embla = EmblaCarousel(viewportEl, opts)

      const updateButtons = () => {
        ctx.setCanScrollPrev(embla.canScrollPrev())
        ctx.setCanScrollNext(embla.canScrollNext())
      }

      embla.on('select', updateButtons)
      embla.on('reInit', updateButtons)
      updateButtons()

      ctx.setApi(embla)

      onCleanup(() => {
        embla.destroy()
      })
    })
  }

  const directionClasses = orientation === 'vertical' ? 'flex-col -mt-4' : 'flex -ml-4'

  return (
    <div data-slot="carousel-viewport" className="overflow-hidden">
      <div
        data-slot="carousel-content"
        className={`${directionClasses} ${props.className ?? ''}`}
        ref={handleMount}
      >
        {props.children}
      </div>
    </div>
  )
}

interface CarouselItemProps extends HTMLBaseAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Slide content */
  children?: Child
}

function CarouselItem(props: CarouselItemProps) {
  const paddingClass = (props.orientation ?? 'horizontal') === 'vertical' ? 'pt-4' : 'pl-4'

  return (
    <div
      data-slot="carousel-item"
      role="group"
      aria-roledescription="slide"
      className={`${carouselItemClasses} ${paddingClass} ${props.className ?? ''}`}
    >
      {props.children}
    </div>
  )
}

interface CarouselPreviousProps extends ButtonHTMLAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Button content override */
  children?: Child
}

const prevHorizontalClasses = '-left-12 top-1/2 -translate-y-1/2'
const prevVerticalClasses = '-top-12 left-1/2 -translate-x-1/2 rotate-90'

function CarouselPrevious(props: CarouselPreviousProps) {
  const orientation = props.orientation ?? 'horizontal'
  const positionClasses = orientation === 'vertical' ? prevVerticalClasses : prevHorizontalClasses

  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CarouselContext)

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      ctx.scrollPrev()
    })

    createEffect(() => {
      const disabled = !ctx.canScrollPrev()
      ;(el as HTMLButtonElement).disabled = disabled
    })
  }

  return (
    <button
      data-slot="carousel-previous"
      type="button"
      className={`${carouselButtonBaseClasses} ${positionClasses} ${props.className ?? ''}`}
      disabled
      aria-label="Previous slide"
      ref={handleMount}
    >
      <ChevronLeftIcon size="sm" />
      <span className="sr-only">Previous slide</span>
    </button>
  )
}

interface CarouselNextProps extends ButtonHTMLAttributes {
  /** Scroll orientation (must match parent Carousel) */
  orientation?: 'horizontal' | 'vertical'
  /** Button content override */
  children?: Child
}

const nextHorizontalClasses = '-right-12 top-1/2 -translate-y-1/2'
const nextVerticalClasses = '-bottom-12 left-1/2 -translate-x-1/2 rotate-90'

function CarouselNext(props: CarouselNextProps) {
  const orientation = props.orientation ?? 'horizontal'
  const positionClasses = orientation === 'vertical' ? nextVerticalClasses : nextHorizontalClasses

  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CarouselContext)

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      ctx.scrollNext()
    })

    createEffect(() => {
      const disabled = !ctx.canScrollNext()
      ;(el as HTMLButtonElement).disabled = disabled
    })
  }

  return (
    <button
      data-slot="carousel-next"
      type="button"
      className={`${carouselButtonBaseClasses} ${positionClasses} ${props.className ?? ''}`}
      disabled
      aria-label="Next slide"
      ref={handleMount}
    >
      <ChevronRightIcon size="sm" />
      <span className="sr-only">Next slide</span>
    </button>
  )
}

export { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext }
export type { CarouselProps, CarouselContentProps, CarouselItemProps, CarouselPreviousProps, CarouselNextProps }
