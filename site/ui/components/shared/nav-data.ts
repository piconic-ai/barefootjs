/**
 * Site Navigation — single source of truth.
 *
 * Both the desktop sidebar (renderer.tsx) and the mobile bottom-sheet menu
 * (mobile-menu.tsx) read from `navSections`. Add a link in one place and it
 * shows up in both. Without this, mobile drifts behind desktop (issue: Gallery
 * was added to desktop only).
 */

import type { SidebarLink, SidebarGroup } from '../../../shared/components/sidebar-page-nav'
import { categoryOrder, categoryLabels, getComponentsByCategory, blockEntries } from './component-registry'

export interface NavGroup extends SidebarGroup {
  /** Stable identity. Used by the mobile menu as `data-category` and to match auto-open. */
  key: string
  /** When the current path matches, the mobile menu auto-opens this group on load. */
  matchPath?: (path: string) => boolean
}

export type NavEntry = NavGroup | SidebarLink

export interface NavSection {
  /** Optional uppercase header rendered above the entries (e.g. "Components"). */
  heading?: string
  entries: NavEntry[]
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'links' in entry
}

export const navSections: NavSection[] = [
  {
    entries: [
      {
        key: 'docs',
        title: 'Docs',
        defaultOpen: true,
        links: [{ title: 'Introduction', href: '/' }],
        matchPath: (p) => p === '/',
      },
    ],
  },
  {
    heading: 'Components',
    entries: [
      ...categoryOrder.map((category): NavGroup => ({
        key: `components-${category}`,
        title: categoryLabels[category],
        defaultOpen: false,
        links: getComponentsByCategory(category).map((entry) => ({
          title: entry.title,
          href: `/components/${entry.slug}`,
        })),
        matchPath: (p) => getComponentsByCategory(category).some((e) => p === `/components/${e.slug}`),
      })),
      {
        key: 'charts',
        title: 'Charts',
        links: [
          { title: 'Area Chart', href: '/charts/area-chart' },
          { title: 'Bar Chart', href: '/charts/bar-chart' },
          { title: 'Line Chart', href: '/charts/line-chart' },
          { title: 'Pie Chart', href: '/charts/pie-chart' },
          { title: 'Radar Chart', href: '/charts/radar-chart' },
          { title: 'Radial Chart', href: '/charts/radial-chart' },
        ],
        matchPath: (p) => p.startsWith('/charts/'),
      },
    ],
  },
  {
    heading: 'Patterns',
    entries: [
      {
        key: 'forms',
        title: 'Forms',
        links: [
          { title: 'Controlled Input', href: '/docs/forms/controlled-input' },
          { title: 'createForm', href: '/docs/forms/create-form' },
          { title: 'Field Arrays', href: '/docs/forms/field-arrays' },
          { title: 'Submit', href: '/docs/forms/submit' },
          { title: 'Validation', href: '/docs/forms/validation' },
        ],
        matchPath: (p) => p.startsWith('/docs/forms'),
      },
      {
        key: 'blocks',
        title: 'Blocks',
        defaultOpen: false,
        links: blockEntries.map((entry) => ({
          title: entry.title,
          href: `/components/${entry.slug}`,
        })),
        matchPath: (p) => blockEntries.some((e) => p === `/components/${e.slug}`),
      },
    ],
  },
  {
    heading: 'Gallery',
    entries: [
      {
        key: 'gallery-apps',
        title: 'Apps',
        defaultOpen: false,
        links: [
          { title: 'Admin Dashboard', href: '/gallery/admin' },
          { title: 'E-Commerce Shop', href: '/gallery/shop' },
          { title: 'Productivity Suite', href: '/gallery/productivity' },
        ],
        matchPath: (p) => p.startsWith('/gallery/'),
      },
    ],
  },
  {
    heading: 'Tools',
    entries: [
      { title: 'CLI', href: '/docs/cli' },
      { title: 'Studio', href: '/studio' },
    ],
  },
]
