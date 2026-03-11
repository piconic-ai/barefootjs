/**
 * Page Navigation — UI site data
 *
 * Component ordering and link generation for UI site page navigation.
 * The PageNavigation component itself is in site/shared/components/page-navigation.tsx.
 */

// Component order for navigation (alphabetical)
export const componentOrder = [
  { slug: 'accordion', title: 'Accordion' },
  { slug: 'alert', title: 'Alert' },
  { slug: 'alert-dialog', title: 'Alert Dialog' },
  { slug: 'aspect-ratio', title: 'Aspect Ratio' },
  { slug: 'avatar', title: 'Avatar' },
  { slug: 'badge', title: 'Badge' },
  { slug: 'breadcrumb', title: 'Breadcrumb' },
  { slug: 'button', title: 'Button' },
  { slug: 'calendar', title: 'Calendar' },
  { slug: 'card', title: 'Card' },
  { slug: 'carousel', title: 'Carousel' },
  { slug: 'checkbox', title: 'Checkbox' },
  { slug: 'collapsible', title: 'Collapsible' },
  { slug: 'command', title: 'Command' },
  { slug: 'combobox', title: 'Combobox' },
  { slug: 'context-menu', title: 'Context Menu' },
  { slug: 'data-table', title: 'Data Table' },
  { slug: 'date-picker', title: 'Date Picker' },
  { slug: 'dialog', title: 'Dialog' },
  { slug: 'drawer', title: 'Drawer' },
  { slug: 'dropdown-menu', title: 'Dropdown Menu' },
  { slug: 'hover-card', title: 'Hover Card' },
  { slug: 'input', title: 'Input' },
  { slug: 'input-otp', title: 'Input OTP' },
  { slug: 'label', title: 'Label' },
  { slug: 'menubar', title: 'Menubar' },
  { slug: 'navigation-menu', title: 'Navigation Menu' },
  { slug: 'pagination', title: 'Pagination' },
  { slug: 'popover', title: 'Popover' },
  { slug: 'portal', title: 'Portal' },
  { slug: 'progress', title: 'Progress' },
  { slug: 'radio-group', title: 'Radio Group' },
  { slug: 'resizable', title: 'Resizable' },
  { slug: 'scroll-area', title: 'Scroll Area' },
  { slug: 'select', title: 'Select' },
  { slug: 'sidebar', title: 'Sidebar' },
  { slug: 'separator', title: 'Separator' },
  { slug: 'skeleton', title: 'Skeleton' },
  { slug: 'sheet', title: 'Sheet' },
  { slug: 'slider', title: 'Slider' },
  { slug: 'spinner', title: 'Spinner' },
  { slug: 'switch', title: 'Switch' },
  { slug: 'table', title: 'Table' },
  { slug: 'tabs', title: 'Tabs' },
  { slug: 'textarea', title: 'Textarea' },
  { slug: 'toast', title: 'Toast' },
  { slug: 'toggle', title: 'Toggle' },
  { slug: 'toggle-group', title: 'Toggle Group' },
  { slug: 'tooltip', title: 'Tooltip' },
]

// Chart order for navigation (alphabetical)
export const chartOrder = [
  { slug: 'bar-chart', title: 'Bar Chart' },
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
    prev: prev ? { href: `/docs/charts/${prev.slug}`, title: prev.title } : undefined,
    next: next ? { href: `/docs/charts/${next.slug}`, title: next.title } : undefined,
  }
}

// Components migrated to /components/ (new reference pages)
const migratedSlugs = new Set([
  'aspect-ratio',
  'avatar',
  'badge',
  'button',
  'calendar',
  'card',
  'carousel',
  'checkbox',
  'combobox',
  'data-table',
  'input',
  'input-otp',
  'label',
  'radio-group',
  'resizable',
  'scroll-area',
  'select',
  'separator',
  'skeleton',
  'slider',
  'switch',
  'table',
  'textarea',
  'toggle',
  'toggle-group',
])

function componentHref(slug: string): string {
  return migratedSlugs.has(slug) ? `/components/${slug}` : `/docs/components/${slug}`
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
    prev: prev ? { href: componentHref(prev.slug), title: prev.title } : undefined,
    next: next ? { href: componentHref(next.slug), title: next.title } : undefined,
  }
}
