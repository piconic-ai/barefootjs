'use client'

/**
 * Command Palette (shared)
 *
 * VS Code-style modal command palette:
 * - Cmd+K / Ctrl+K to open
 * - ESC to close
 * - Arrow keys / Enter to navigate
 * - Substring filter against title + category
 *
 * Items are passed in by the caller. The palette groups them by
 * `category` in stable order of first appearance.
 *
 * Self-contained (inline SVG, no @ui/* deps).
 */

import { createSignal, createEffect } from '@barefootjs/client'

export interface CommandItem {
  id: string
  title: string
  href: string
  category: string
}

export interface CommandGroup {
  category: string
  items: CommandItem[]
}

export interface CommandPaletteProps {
  groups: CommandGroup[]
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function CommandPalette(props: CommandPaletteProps) {
  const [open, setOpen] = createSignal(false)

  createEffect(() => {
    const overlay = document.querySelector('[data-command-overlay]') as HTMLElement
    const palette = document.querySelector('[data-command-palette]') as HTMLElement
    const input = document.querySelector('[data-command-input]') as HTMLInputElement
    const list = document.querySelector('[data-command-list]') as HTMLElement

    if (!overlay || !palette || !input || !list) return

    let selectedIndex = 0

    const getVisibleItems = () => {
      return Array.from(list.querySelectorAll('[data-command-item="true"]:not([hidden])')) as HTMLElement[]
    }

    const updateSelected = () => {
      const items = getVisibleItems()
      items.forEach((item, i) => {
        item.dataset.selected = i === selectedIndex ? 'true' : 'false'
      })
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }

    const filterItems = (query: string) => {
      const q = query.toLowerCase()
      const allItems = list.querySelectorAll('[data-command-item="true"]') as NodeListOf<HTMLElement>
      const categories = list.querySelectorAll('[data-command-category]') as NodeListOf<HTMLElement>

      const visibleCategories = new Set<string>()

      allItems.forEach(item => {
        const title = item.dataset.title?.toLowerCase() || ''
        const category = item.dataset.category || ''
        const visible = !q || title.includes(q) || category.toLowerCase().includes(q)
        item.hidden = !visible
        if (visible) visibleCategories.add(category)
      })

      categories.forEach(cat => {
        const category = cat.dataset.categoryName || ''
        cat.hidden = !visibleCategories.has(category)
      })

      const noResults = list.querySelector('[data-no-results]') as HTMLElement
      if (noResults) {
        noResults.hidden = getVisibleItems().length > 0
      }

      selectedIndex = 0
      updateSelected()
    }

    const openPalette = () => {
      setOpen(true)
      overlay.dataset.open = 'true'
      palette.dataset.open = 'true'
      input.value = ''
      filterItems('')
      selectedIndex = 0
      updateSelected()
      setTimeout(() => input.focus(), 0)
    }

    const closePalette = () => {
      setOpen(false)
      overlay.dataset.open = 'false'
      palette.dataset.open = 'false'
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openPalette()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open()) return

      const items = getVisibleItems()
      const maxIndex = items.length - 1

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          closePalette()
          break
        case 'ArrowDown':
          e.preventDefault()
          selectedIndex = Math.min(selectedIndex + 1, maxIndex)
          updateSelected()
          break
        case 'ArrowUp':
          e.preventDefault()
          selectedIndex = Math.max(selectedIndex - 1, 0)
          updateSelected()
          break
        case 'Enter':
          e.preventDefault()
          const selected = items[selectedIndex]
          if (selected && selected.dataset.href) {
            window.location.href = selected.dataset.href
            closePalette()
          }
          break
      }
    }

    const handleInput = () => {
      filterItems(input.value)
    }

    const handleOverlayClick = (e: Event) => {
      if (e.target === overlay) {
        closePalette()
      }
    }

    const handleItemClick = (e: Event) => {
      const target = e.target as HTMLElement
      const item = target.closest('[data-command-item="true"]') as HTMLElement
      if (item && item.dataset.href) {
        window.location.href = item.dataset.href
        closePalette()
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    palette.addEventListener('keydown', handleKeyDown)
    input.addEventListener('input', handleInput)
    overlay.addEventListener('click', handleOverlayClick)
    list.addEventListener('click', handleItemClick)

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown)
      palette.removeEventListener('keydown', handleKeyDown)
      input.removeEventListener('input', handleInput)
      overlay.removeEventListener('click', handleOverlayClick)
      list.removeEventListener('click', handleItemClick)
    }
  })

  return (
    <div data-command-root>
      {/* Overlay */}
      <div
        data-command-overlay
        data-open="false"
        className="fixed inset-0 z-dialog bg-black/50 transition-opacity duration-150 data-[open=false]:opacity-0 data-[open=false]:pointer-events-none"
      />

      {/* Palette */}
      <div
        data-command-palette
        data-open="false"
        className="fixed left-1/2 top-[15%] z-dialog w-full max-w-lg -translate-x-1/2 transition-all duration-150 data-[open=false]:opacity-0 data-[open=false]:scale-95 data-[open=false]:pointer-events-none"
      >
        <div className="mx-4 sm:mx-0 overflow-hidden rounded-lg border bg-background shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon size={16} />
            <input
              data-command-input
              type="text"
              placeholder="Search pages..."
              className="flex-1 bg-transparent border-none py-3 text-sm outline-none placeholder:text-muted-foreground"
              autocomplete="off"
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] rounded border">
              ESC
            </kbd>
          </div>

          {/* Results list */}
          <div
            data-command-list
            className="max-h-72 overflow-y-auto p-2"
          >
            {props.groups.map(group => (
              <div
                key={group.category}
                data-command-category
                data-category-name={group.category}
                className="mb-2"
              >
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.category}
                </div>
                {group.items.map(item => (
                  <div
                    key={item.id}
                    data-command-item="true"
                    data-href={item.href}
                    data-title={item.title}
                    data-category={item.category}
                    data-selected="false"
                    className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-foreground hover:bg-accent data-[selected=true]:bg-accent"
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            ))}

            {/* No results */}
            <div data-no-results hidden className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
