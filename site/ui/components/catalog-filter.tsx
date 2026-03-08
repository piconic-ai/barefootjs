"use client"
/**
 * Catalog Filter Component
 *
 * Client-side tag filtering for the component catalog.
 * Toggles visibility of server-rendered cards via data attributes.
 * Uses direct DOM manipulation for chip active states to avoid
 * compiler reactivity edge cases with className in map callbacks.
 * Ref: #517
 */

import { createSignal, createEffect } from '@barefootjs/dom'

const chipActive = 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer select-none bg-primary text-primary-foreground'
const chipInactive = 'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer select-none bg-secondary text-secondary-foreground hover:bg-secondary/80'

export function CatalogFilter() {
  const [activeTag, setActiveTag] = createSignal<string | null>(null)

  createEffect(() => {
    const tag = activeTag()

    // Update chip styles
    const chips = document.querySelectorAll<HTMLElement>('[data-filter-chip]')
    for (const chip of chips) {
      const chipTag = chip.dataset.filterChip ?? ''
      const isActive = chipTag === (tag ?? 'all')
      chip.className = isActive ? chipActive : chipInactive
    }

    // Update card visibility
    const cards = document.querySelectorAll<HTMLElement>('[data-catalog-card]')
    for (const card of cards) {
      const cardTags = (card.dataset.tags ?? '').split(' ')
      const matchesTag = !tag || cardTags.includes(tag)
      card.style.display = matchesTag ? '' : 'none'
    }
  })

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      <button
        type="button"
        className={chipActive}
        data-filter-chip="all"
        onClick={() => setActiveTag(null)}
      >
        All
      </button>
      <button type="button" className={chipInactive} data-filter-chip="input" onClick={() => setActiveTag(prev => prev === 'input' ? null : 'input')}>Input</button>
      <button type="button" className={chipInactive} data-filter-chip="display" onClick={() => setActiveTag(prev => prev === 'display' ? null : 'display')}>Display</button>
      <button type="button" className={chipInactive} data-filter-chip="feedback" onClick={() => setActiveTag(prev => prev === 'feedback' ? null : 'feedback')}>Feedback</button>
      <button type="button" className={chipInactive} data-filter-chip="navigation" onClick={() => setActiveTag(prev => prev === 'navigation' ? null : 'navigation')}>Navigation</button>
      <button type="button" className={chipInactive} data-filter-chip="layout" onClick={() => setActiveTag(prev => prev === 'layout' ? null : 'layout')}>Layout</button>
    </div>
  )
}
