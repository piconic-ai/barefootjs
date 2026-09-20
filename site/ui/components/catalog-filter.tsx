"use client"
/**
 * Catalog Filter Component
 *
 * URL-backed category filter for the component catalog (`/components?tag=input`).
 * The active tag is read from the query string via `createSearchParams()`, so
 * the Hono adapter's request-scoped SSR seam renders the correct chip variant
 * with no flash. Each chip is a real link built with `queryHref()` — the
 * active chip's href points back to `/components` (clicking it again toggles
 * the filter off) — rather than a client-side `createSignal` + DOM query
 * toggling `style.display` on cards owned by a different (server) component.
 *
 * `site/ui` doesn't run `@barefootjs/router`, so clicking a chip is a hard
 * navigation ("hard otherwise" — the `createSearchParams` reference). That's
 * fine here: the whole point of this change is a shareable, server-rendered
 * URL, not a soft in-page transition.
 * Ref: #3103 (was #517)
 */

import { createSearchParams, createMemo, queryHref } from '@barefootjs/client'
import { Badge } from '@/components/ui/badge'
import { categoryOrder, categoryLabels, asCatalogTag, type CatalogTag } from './shared/component-registry'

const tagOptions: Array<{ label: string; value: CatalogTag }> = [
  { label: 'All', value: '' },
  ...categoryOrder.map((category) => ({ label: categoryLabels[category], value: category as CatalogTag })),
]

export function CatalogFilter() {
  const [searchParams] = createSearchParams()
  const activeTag = createMemo(() => asCatalogTag(searchParams().get('tag')))

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      {tagOptions.map(opt => (
        <Badge
          key={opt.label}
          asChild
          variant={activeTag() === opt.value ? 'default' : 'secondary'}
        >
          <a
            href={queryHref('/components', { tag: activeTag() === opt.value ? '' : opt.value })}
            className="cursor-pointer"
            aria-current={activeTag() === opt.value ? 'page' : undefined}
          >
            {opt.label}
          </a>
        </Badge>
      ))}
    </div>
  )
}
