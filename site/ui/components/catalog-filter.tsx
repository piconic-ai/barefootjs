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
 * The cards stay server-rendered in `ComponentCatalogPage`; this island only
 * exposes the active tag as a reactive `data-filter` attribute on its root,
 * and `styles/globals.css` hides the cards in the following sibling grid that
 * don't carry that tag (`[data-catalog-filter][data-filter="<tag>"] ~ div
 * [data-catalog-card]:not([data-tags~="<tag>"])`). A deep link is therefore
 * filtered by the server HTML at first paint, and a filter change flips one
 * attribute — nothing reaches outside this component's own DOM.
 *
 * Clicking a chip is a soft, same-route navigation: `client/router-entry.ts`
 * boots `@barefootjs/router` on the catalog page, scoped (`shouldIntercept`)
 * to the links inside `[data-catalog-filter]`, so the new `?tag=` is pushed
 * into `searchParams()` with no region swap and no page load. Site-wide
 * router adoption is #3105.
 *
 * The `<a>` is this component's own loop-row element and the `<Badge>` sits
 * INSIDE it (not `<Badge asChild>` wrapping the `<a>`): the link's reactive
 * `href` / `aria-current` must be patched on the client after that soft
 * navigation, and the compiler does not patch reactive attributes on an
 * element handed to a child component as its children (`asChild` slot
 * content) — with `asChild` the SSR output was right but the hydrated chips
 * stayed stale.
 * Ref: #3103 (was #517)
 */

import { createSearchParams, createMemo, queryHref } from '@barefootjs/client'
import { Badge } from '@/components/ui/badge'
import { categoryOrder, categoryLabels, asCatalogTag, type CatalogTag } from './shared/component-registry'

const tagOptions: Array<{ label: string; value: CatalogTag }> = [
  { label: 'All', value: '' },
  ...categoryOrder.map((category) => ({ label: categoryLabels[category], value: category })),
]

export function CatalogFilter() {
  const [searchParams] = createSearchParams()
  const activeTag = createMemo(() => asCatalogTag(searchParams().get('tag')))

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter by category"
      data-catalog-filter
      data-filter={activeTag()}
    >
      {tagOptions.map(opt => (
        <a
          key={opt.label}
          href={queryHref('/components', { tag: activeTag() === opt.value ? '' : opt.value })}
          className="cursor-pointer no-underline"
          aria-current={activeTag() === opt.value ? 'page' : undefined}
        >
          <Badge variant={activeTag() === opt.value ? 'default' : 'secondary'}>{opt.label}</Badge>
        </a>
      ))}
    </div>
  )
}
