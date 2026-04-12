"use client"

/**
 * Accordion Components
 *
 * A vertically stacked set of interactive headings that reveal content.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * AccordionItem manages open state, children consume via context.
 *
 * @example Basic accordion
 * ```tsx
 * const [openItem, setOpenItem] = createSignal<string | null>(null)
 *
 * <Accordion>
 *   <AccordionItem value="item-1" open={openItem() === 'item-1'} onOpenChange={(v) => setOpenItem(v ? 'item-1' : null)}>
 *     <AccordionTrigger>Section 1</AccordionTrigger>
 *     <AccordionContent>Content for section 1</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */

import type { ButtonHTMLAttributes, HTMLBaseAttributes } from '@barefootjs/jsx'
import { createContext, useContext, createMemo, createEffect } from '@barefootjs/client-runtime'
import type { Child } from '../../../types'
import { ChevronDownIcon } from '../icon'

// Context for AccordionItem → children state sharing
interface AccordionItemContextValue {
  open: () => boolean
  onOpenChange: (open: boolean) => void
}

const AccordionItemContext = createContext<AccordionItemContextValue>()

// Accordion container classes
const accordionClasses = 'w-full'

// AccordionItem classes
const accordionItemClasses = 'border-b last:border-b-0'

// AccordionTrigger base classes
const accordionTriggerBaseClasses = 'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline disabled:pointer-events-none disabled:opacity-50'

// AccordionTrigger focus classes
const accordionTriggerFocusClasses = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

// AccordionContent base classes (uses CSS grid animation)
const accordionContentBaseClasses = 'grid transition-[grid-template-rows,visibility] duration-normal ease-out'

// AccordionContent open classes
const accordionContentOpenClasses = 'grid-rows-[1fr] visible'

// AccordionContent closed classes
const accordionContentClosedClasses = 'grid-rows-[0fr] invisible'

// AccordionContent inner classes
const accordionContentInnerClasses = 'overflow-hidden text-sm'

/**
 * Props for Accordion component.
 */
interface AccordionProps extends HTMLBaseAttributes {
  /** AccordionItem components */
  children?: Child
}

/**
 * Accordion container component.
 *
 * @param props.children - AccordionItem components
 */
function Accordion({
  children,
  className = '',
  ...props
}: AccordionProps) {
  return (
    <div data-slot="accordion" className={`${accordionClasses} ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Props for AccordionItem component.
 */
interface AccordionItemProps extends HTMLBaseAttributes {
  /** Unique identifier for this item */
  value: string
  /** Whether this item is open */
  open?: boolean
  /** Whether this item is disabled */
  disabled?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** AccordionTrigger and AccordionContent */
  children?: Child
}

/**
 * Individual accordion item.
 * Provides open state to children via context.
 *
 * @param props.value - Item identifier
 * @param props.open - Whether open
 * @param props.disabled - Whether disabled
 * @param props.onOpenChange - Callback when open state changes
 */
function AccordionItem(props: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={{
      open: () => props.open ?? false,
      onOpenChange: props.onOpenChange ?? (() => {}),
    }}>
      <div
        data-slot="accordion-item"
        id={props.id}
        data-state={props.open ? 'open' : 'closed'}
        data-value={props.value}
        className={`${accordionItemClasses} ${props.className ?? ''}`}
      >
        {props.children}
      </div>
    </AccordionItemContext.Provider>
  )
}

/**
 * Props for AccordionTrigger component.
 */
interface AccordionTriggerProps extends ButtonHTMLAttributes {
  /** Whether disabled */
  disabled?: boolean
  /** Render child element as trigger instead of built-in button */
  asChild?: boolean
  /** Trigger label */
  children?: Child
}

/**
 * Clickable header that toggles accordion content.
 * Reads open state from AccordionItemContext.
 *
 * @param props.disabled - Whether disabled
 * @param props.asChild - Render child as trigger
 */
function AccordionTrigger(props: AccordionTriggerProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AccordionItemContext)

    // Reactive aria-expanded and chevron rotation
    createEffect(() => {
      const isOpen = ctx.open()
      el.setAttribute('aria-expanded', String(isOpen))
      const icon = el.querySelector('svg')
      if (icon) {
        if (isOpen) {
          icon.classList.add('rotate-180')
        } else {
          icon.classList.remove('rotate-180')
        }
      }
    })

    // Click handler with stopPropagation to prevent bubbling to parent scope element
    el.addEventListener('click', (e: Event) => {
      e.stopPropagation()
      ctx.onOpenChange(!ctx.open())
    })

    // Keyboard navigation (attached via addEventListener for display:contents support)
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const accordion = el.closest('[data-slot="accordion"]')
      if (!accordion) return

      const triggers = accordion.querySelectorAll('[data-slot="accordion-trigger"]:not([disabled])')
      const currentIndex = Array.from(triggers).indexOf(el)

      let nextIndex: number | null = null

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          nextIndex = currentIndex < triggers.length - 1 ? currentIndex + 1 : 0
          break
        case 'ArrowUp':
          e.preventDefault()
          nextIndex = currentIndex > 0 ? currentIndex - 1 : triggers.length - 1
          break
        case 'Home':
          e.preventDefault()
          nextIndex = 0
          break
        case 'End':
          e.preventDefault()
          nextIndex = triggers.length - 1
          break
      }

      if (nextIndex !== null && triggers[nextIndex]) {
        const target = triggers[nextIndex] as HTMLElement
        if (target.style?.display === 'contents') {
          const focusable = target.querySelector('button, [tabindex], a, input, select, textarea') as HTMLElement
          focusable?.focus()
        } else {
          target.focus()
        }
      }
    })
  }

  if (props.asChild) {
    return (
      <h3 className="flex">
        <span
          data-slot="accordion-trigger"
          style="display:contents"
          aria-expanded="false"
          ref={handleMount}
        >
          {props.children}
        </span>
      </h3>
    )
  }

  const className = props.className ?? ''
  const classes = `${accordionTriggerBaseClasses} ${accordionTriggerFocusClasses} ${className}`
  const iconClasses = 'text-muted-foreground pointer-events-none shrink-0 translate-y-0.5 transition-transform duration-normal'

  return (
    <h3 className="flex">
      <button
        data-slot="accordion-trigger"
        id={props.id}
        className={classes}
        disabled={props.disabled}
        aria-expanded="false"
        aria-disabled={props.disabled || undefined}
        ref={handleMount}
      >
        {props.children}
        <ChevronDownIcon size="sm" className={iconClasses} />
      </button>
    </h3>
  )
}

/**
 * Props for AccordionContent component.
 */
interface AccordionContentProps extends HTMLBaseAttributes {
  /** Content to display */
  children?: Child
}

/**
 * Collapsible content panel.
 * Reads open state from AccordionItemContext.
 */
function AccordionContent(props: AccordionContentProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AccordionItemContext)

    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = `${accordionContentBaseClasses} ${isOpen ? accordionContentOpenClasses : accordionContentClosedClasses}`
    })
  }

  const className = createMemo(() => props.className ?? '')

  return (
    <div
      data-slot="accordion-content"
      id={props.id}
      role="region"
      data-state="closed"
      className={`${accordionContentBaseClasses} ${accordionContentClosedClasses}`}
      ref={handleMount}
    >
      <div className={accordionContentInnerClasses}>
        <div className={`pt-0 pb-4 ${className()}`}>
          {props.children}
        </div>
      </div>
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
export type { AccordionProps, AccordionItemProps, AccordionTriggerProps, AccordionContentProps }
