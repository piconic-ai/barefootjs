"use client"
/**
 * Catalog Filter Component
 *
 * Client-side tag filtering for the component catalog.
 * Uses Badge component for filter chips with reactive variant.
 * Card visibility uses createEffect + DOM queries since cards
 * are rendered by a separate server component.
 * Ref: #517
 */

import { createSignal, createEffect } from '@barefootjs/client'
import { Badge } from '@/components/ui/badge'

const tagOptions = [
  { label: 'All', value: '' },
  { label: 'Input', value: 'input' },
  { label: 'Display', value: 'display' },
  { label: 'Feedback', value: 'feedback' },
  { label: 'Navigation', value: 'navigation' },
  { label: 'Layout', value: 'layout' },
]

export function CatalogFilter() {
  const [activeTag, setActiveTag] = createSignal('')

  // Card visibility — cards are owned by ComponentCatalogPage
  createEffect(() => {
    const tag = activeTag()
    const cards = document.querySelectorAll<HTMLElement>('[data-catalog-card]')
    for (const card of cards) {
      const cardTags = (card.dataset.tags ?? '').split(' ')
      const matchesTag = !tag || cardTags.includes(tag)
      card.style.display = matchesTag ? '' : 'none'
    }
  })

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      {tagOptions.map(opt => (
        <Badge
          key={opt.label}
          variant={activeTag() === opt.value ? 'default' : 'secondary'}
          className="cursor-pointer"
          onClick={() => setActiveTag(prev => prev === opt.value ? '' : opt.value)}
        >
          {opt.label}
        </Badge>
      ))}
    </div>
  )
}
