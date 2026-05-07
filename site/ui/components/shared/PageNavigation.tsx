/**
 * Page Navigation — UI site data
 *
 * Component ordering and link generation for UI site page navigation.
 * The PageNavigation component itself is in site/shared/components/page-navigation.tsx.
 */

import { componentEntries } from './component-registry'

// Component order for navigation (follows sidebar order: category-based, alphabetical within each)
export const componentOrder = componentEntries.map(e => ({ slug: e.slug, title: e.title }))

// Chart order for navigation (introduction first, then alphabetical)
export const chartOrder = [
  { slug: 'introduction', title: 'Introduction' },
  { slug: 'area-chart', title: 'Area Chart' },
  { slug: 'bar-chart', title: 'Bar Chart' },
  { slug: 'line-chart', title: 'Line Chart' },
  { slug: 'pie-chart', title: 'Pie Chart' },
  { slug: 'radar-chart', title: 'Radar Chart' },
  { slug: 'radial-chart', title: 'Radial Chart' },
]

// Get prev/next links for a chart page
export function getChartNavLinks(currentSlug: string): {
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
} {
  const currentIndex = chartOrder.findIndex(c => c.slug === currentSlug)
  if (currentIndex === -1) return {}

  const prev = currentIndex > 0 ? chartOrder[currentIndex - 1] : undefined
  const next = currentIndex < chartOrder.length - 1 ? chartOrder[currentIndex + 1] : undefined

  return {
    prev: prev ? { href: `/charts/${prev.slug}`, title: prev.title } : undefined,
    next: next ? { href: `/charts/${next.slug}`, title: next.title } : undefined,
  }
}

// Order for the xyflow section. All pages live under /xyflow/.
export const xyflowOrder = [
  { slug: 'introduction', title: 'Introduction', href: '/xyflow/introduction' },
  { slug: 'nodes', title: 'Nodes', href: '/xyflow/nodes' },
  { slug: 'edges', title: 'Edges', href: '/xyflow/edges' },
  { slug: 'components', title: 'Components', href: '/xyflow/components' },
]

// Get prev/next links for a page in the xyflow section.
export function getXyflowNavLinks(currentSlug: string): {
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
} {
  const currentIndex = xyflowOrder.findIndex(c => c.slug === currentSlug)
  if (currentIndex === -1) return {}

  const prev = currentIndex > 0 ? xyflowOrder[currentIndex - 1] : undefined
  const next = currentIndex < xyflowOrder.length - 1 ? xyflowOrder[currentIndex + 1] : undefined

  return {
    prev: prev ? { href: prev.href, title: prev.title } : undefined,
    next: next ? { href: next.href, title: next.title } : undefined,
  }
}

// Get prev/next links for a component
export function getNavLinks(currentSlug: string): {
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
} {
  const currentIndex = componentOrder.findIndex(c => c.slug === currentSlug)
  if (currentIndex === -1) return {}

  const prev = currentIndex > 0 ? componentOrder[currentIndex - 1] : undefined
  const next = currentIndex < componentOrder.length - 1 ? componentOrder[currentIndex + 1] : undefined

  return {
    prev: prev ? { href: `/components/${prev.slug}`, title: prev.title } : undefined,
    next: next ? { href: `/components/${next.slug}`, title: next.title } : undefined,
  }
}
