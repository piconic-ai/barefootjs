'use client'

/**
 * Mobile Menu Component
 *
 * Bottom sheet menu for mobile devices with drag-to-resize functionality.
 */

import { createSignal, createEffect } from '@barefootjs/client'
import { XIcon, ChevronRightIcon } from '@ui/components/ui/icon'
import { navSections, isNavGroup } from './shared/nav-data'

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

    for (const section of navSections) {
      for (const entry of section.entries) {
        if (isNavGroup(entry) && entry.matchPath?.(currentPath)) {
          openCategory(entry.key)
        }
      }
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
              <XIcon size="md" />
            </button>
          </div>

          <nav className="p-4 overflow-y-auto h-[calc(100%-48px)]">
            <div className="space-y-1">
              {navSections.map((section, sectionIndex) => (
                <>
                  {section.heading && (
                    <div className={sectionIndex === 0 ? '' : 'pt-3 mt-3 border-t'}>
                      <span className="block px-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.heading}</span>
                    </div>
                  )}
                  {section.entries.map((entry) =>
                    isNavGroup(entry) ? (
                      <details data-category={entry.key} className="mb-2 group" open={entry.defaultOpen}>
                        <summary className={summaryClass}>
                          <span>{entry.title}</span>
                          <ChevronRightIcon size="sm" className={chevronClass} />
                        </summary>
                        <div className="pl-2 py-1 space-y-0.5">
                          {entry.links.map((link) => (
                            <a href={link.href} className={menuLinkClass}>{link.title}</a>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <a href={entry.href} className={menuLinkClass}>{entry.title}</a>
                    )
                  )}
                </>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </>
  )
}
