'use client'

/**
 * Search Button (shared)
 *
 * Renders the desktop search bar and mobile search icon.
 * Dispatches Cmd/Ctrl+K on click so the global CommandPalette opens.
 *
 * Self-contained (inline SVG, plain span) so site/core can use it
 * without pulling in @ui/* components.
 */

import { createSignal, createEffect } from '@barefootjs/client'

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function SearchButton() {
  const [shortcutKey, setShortcutKey] = createSignal('⌘')

  createEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    setShortcutKey(isMac ? '⌘' : 'Ctrl')

    const handleClick = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      })
      document.dispatchEvent(event)
    }

    const button = document.querySelector('[data-search-button]')
    const mobileButton = document.querySelector('[data-search-button-mobile]')

    if (button) button.addEventListener('click', handleClick)
    if (mobileButton) mobileButton.addEventListener('click', handleClick)

    return () => {
      if (button) button.removeEventListener('click', handleClick)
      if (mobileButton) mobileButton.removeEventListener('click', handleClick)
    }
  })

  return (
    <>
      {/* Desktop: full search bar */}
      <button
        data-search-button
        type="button"
        className="hidden sm:flex items-center gap-2 h-9 w-64 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <SearchIcon size={16} />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="inline-flex items-center gap-0.5 bg-background px-1.5 py-0.5 font-mono text-[10px] rounded border">
          <span data-shortcut-key>{shortcutKey()}</span>K
        </kbd>
      </button>
      {/* Mobile: icon only */}
      <button
        data-search-button-mobile
        type="button"
        className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-foreground hover:bg-accent transition-colors"
        aria-label="Search"
      >
        <SearchIcon size={20} />
      </button>
    </>
  )
}
