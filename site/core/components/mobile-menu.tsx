'use client'

/**
 * Mobile Menu Component for Core Site
 *
 * Bottom sheet menu for mobile devices with drag-to-resize functionality.
 * Adapted from ui site's mobile-menu.tsx with core documentation navigation.
 */

import { createSignal, createEffect } from '@barefootjs/client'

const summaryClass = 'flex w-full items-center justify-between py-2.5 px-4 text-base font-medium text-foreground hover:bg-accent/50 rounded-md transition-colors cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden'
const menuLinkClass = 'block py-2.5 px-4 text-base rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 no-underline'
const activeLinkClass = 'block py-2.5 px-4 text-base rounded-md no-underline bg-accent text-foreground font-medium'

function DotsVerticalIcon() {
  return (
    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function MobileMenu() {
  const [open, setOpen] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)

  createEffect(() => {
    const toggleBtn = document.querySelector('[data-mobile-menu-toggle]')
    const closeBtn = document.querySelector('[data-mobile-menu-close]')
    const overlay = document.querySelector('[data-mobile-menu-overlay]')
    const drawer = document.querySelector('[data-mobile-menu-drawer]') as HTMLElement
    const dragHandle = document.querySelector('[data-drag-handle]') as HTMLElement

    if (!toggleBtn || !overlay || !drawer) return

    const currentPath = window.location.pathname

    const allLinks = drawer.querySelectorAll('nav a[href]') as NodeListOf<HTMLAnchorElement>
    allLinks.forEach(link => {
      if (link.getAttribute('href') === currentPath) {
        link.className = activeLinkClass
      }
    })

    const openCategory = (category: string): void => {
      const details = drawer.querySelector(`[data-category="${category}"]`) as HTMLDetailsElement
      if (details) details.open = true
    }

    if (currentPath.startsWith('/docs/reactivity')) {
      openCategory('reactivity')
    } else if (currentPath.startsWith('/docs/rendering')) {
      openCategory('rendering')
    } else if (currentPath.startsWith('/docs/components')) {
      openCategory('components')
    } else if (currentPath.startsWith('/docs/adapters')) {
      openCategory('adapters')
    } else if (currentPath.startsWith('/docs/advanced')) {
      openCategory('advanced')
    } else {
      openCategory('get-started')
    }

    const openMenu = (): void => {
      setOpen(true)
      setExpanded(false)
      document.body.style.overflow = 'hidden'
    }

    const closeMenu = (): void => {
      setOpen(false)
      setExpanded(false)
      document.body.style.overflow = ''
    }

    let startY = 0
    let startHeight = 0
    let isDragging = false

    const handleDragStart = (clientY: number): void => {
      isDragging = true
      startY = clientY
      startHeight = drawer.offsetHeight
      drawer.style.transition = 'none'
    }

    const handleDragMove = (clientY: number): void => {
      if (!isDragging) return
      const deltaY = startY - clientY
      const minHeight = window.innerHeight * 0.3
      const maxHeight = window.innerHeight * 0.85
      const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight)
      drawer.style.height = `${newHeight}px`
    }

    const handleDragEnd = (): void => {
      if (!isDragging) return
      isDragging = false
      drawer.style.transition = ''
      drawer.style.height = ''

      const currentHeight = drawer.offsetHeight
      if (currentHeight > window.innerHeight * 0.65) {
        setExpanded(true)
      } else if (currentHeight < window.innerHeight * 0.35) {
        closeMenu()
      } else {
        setExpanded(false)
      }
    }

    const handleTouchStart = (e: TouchEvent): void => handleDragStart(e.touches[0].clientY)
    const handleTouchMove = (e: TouchEvent): void => handleDragMove(e.touches[0].clientY)
    const handleMouseDown = (e: MouseEvent): void => {
      e.preventDefault()
      handleDragStart(e.clientY)
    }
    const handleMouseMove = (e: MouseEvent): void => handleDragMove(e.clientY)

    const handleOverlayClick = (e: Event): void => {
      if (e.target === overlay) closeMenu()
    }
    const handleNavClick = (e: Event): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'A') closeMenu()
    }

    toggleBtn.addEventListener('click', openMenu)
    closeBtn?.addEventListener('click', closeMenu)
    overlay.addEventListener('click', handleOverlayClick)
    drawer.addEventListener('click', handleNavClick)
    dragHandle?.addEventListener('touchstart', handleTouchStart)
    dragHandle?.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleDragEnd)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleDragEnd)

    return () => {
      toggleBtn.removeEventListener('click', openMenu)
      closeBtn?.removeEventListener('click', closeMenu)
      overlay.removeEventListener('click', handleOverlayClick)
      drawer.removeEventListener('click', handleNavClick)
      dragHandle?.removeEventListener('touchstart', handleTouchStart)
      dragHandle?.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleDragEnd)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  })

  const chevronClass = 'transition-transform duration-200 group-open:rotate-90'

  return (
    <>
      <button
        data-mobile-menu-toggle
        className="sm:hidden fixed bottom-6 left-4 z-[10000] w-11 h-11 flex items-center justify-center bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors"
        aria-label="Open menu"
      >
        <DotsVerticalIcon />
      </button>

      <div
        data-mobile-menu-overlay
        data-state={open() ? 'open' : 'closed'}
        className="fixed inset-0 z-[10001] bg-black/50 sm:hidden transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
      >
        <div
          data-mobile-menu-drawer
          className="fixed bottom-0 left-0 right-0 z-[10002] bg-background rounded-t-2xl shadow-lg transform transition-all duration-300 ease-out data-[state=closed]:translate-y-full data-[expanded=false]:h-[50vh] data-[expanded=true]:h-[85vh]"
          data-state={open() ? 'open' : 'closed'}
          data-expanded={expanded() ? 'true' : 'false'}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div data-drag-handle className="flex-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full"></div>
            </div>
            <button
              data-mobile-menu-close
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              aria-label="Close menu"
            >
              <XIcon />
            </button>
          </div>

          <nav className="p-4 overflow-y-auto h-[calc(100%-48px)]">
            <div className="space-y-1">
              <details data-category="get-started" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Get Started</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/introduction" className={menuLinkClass}>Introduction</a>
                  <a href="/docs/quick-start" className={menuLinkClass}>Quick Start</a>
                  <a href="/docs/core-concepts" className={menuLinkClass}>Core Concepts</a>
                </div>
              </details>

              <details data-category="reactivity" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Reactivity</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/reactivity" className={menuLinkClass}>Reactivity</a>
                  <a href="/docs/reactivity/create-signal" className={menuLinkClass}>createSignal</a>
                  <a href="/docs/reactivity/create-effect" className={menuLinkClass}>createEffect</a>
                  <a href="/docs/reactivity/create-memo" className={menuLinkClass}>createMemo</a>
                  <a href="/docs/reactivity/on-mount" className={menuLinkClass}>onMount</a>
                  <a href="/docs/reactivity/on-cleanup" className={menuLinkClass}>onCleanup</a>
                  <a href="/docs/reactivity/untrack" className={menuLinkClass}>untrack</a>
                  <a href="/docs/reactivity/props-reactivity" className={menuLinkClass}>Props Reactivity</a>
                </div>
              </details>

              <details data-category="rendering" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Templates & Rendering</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/rendering" className={menuLinkClass}>Templates & Rendering</a>
                  <a href="/docs/rendering/jsx-compatibility" className={menuLinkClass}>JSX Compatibility</a>
                  <a href="/docs/rendering/fragment" className={menuLinkClass}>Fragment</a>
                  <a href="/docs/rendering/client-directive" className={menuLinkClass}>Client Directive</a>
                </div>
              </details>

              <details data-category="components" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Components</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/components" className={menuLinkClass}>Components</a>
                  <a href="/docs/components/component-authoring" className={menuLinkClass}>Component Authoring</a>
                  <a href="/docs/components/props-type-safety" className={menuLinkClass}>Props & Type Safety</a>
                  <a href="/docs/components/children-slots" className={menuLinkClass}>Children & Slots</a>
                  <a href="/docs/components/context-api" className={menuLinkClass}>Context API</a>
                  <a href="/docs/components/portals" className={menuLinkClass}>Portals</a>
                </div>
              </details>

              <details data-category="adapters" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Adapters</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/adapters" className={menuLinkClass}>Adapters</a>
                  <a href="/docs/adapters/adapter-architecture" className={menuLinkClass}>Adapter Architecture</a>
                  <a href="/docs/adapters/hono-adapter" className={menuLinkClass}>Hono Adapter</a>
                  <a href="/docs/adapters/go-template-adapter" className={menuLinkClass}>Go Template Adapter</a>
                  <a href="/docs/adapters/custom-adapter" className={menuLinkClass}>Custom Adapter</a>
                </div>
              </details>

              <details data-category="advanced" className="mb-2 group">
                <summary className={summaryClass}>
                  <span>Advanced</span>
                  <span className={chevronClass}><ChevronRightIcon /></span>
                </summary>
                <div className="pl-2 py-1 space-y-0.5">
                  <a href="/docs/advanced" className={menuLinkClass}>Advanced</a>
                  <a href="/docs/advanced/compiler-internals" className={menuLinkClass}>Compiler Internals</a>
                  <a href="/docs/advanced/ir-schema" className={menuLinkClass}>IR Schema</a>
                  <a href="/docs/advanced/error-codes" className={menuLinkClass}>Error Codes</a>
                  <a href="/docs/advanced/performance" className={menuLinkClass}>Performance</a>
                  <a href="/docs/advanced/compatibility-matrix" className={menuLinkClass}>Compatibility Matrix</a>
                </div>
              </details>
            </div>
          </nav>
        </div>
      </div>
    </>
  )
}
