/**
 * CommandPalette groups for site/core.
 * Combines top-level site pages with the docs navigation tree.
 *
 * Grouping is done here rather than in the CommandPalette component
 * because barefoot's analyzer doesn't follow intermediate locals derived
 * from props, so the loop source must be a direct prop access.
 */

import type { CommandGroup, CommandItem } from '../../shared/components/command-palette'
import { navigation, type NavItem } from './navigation'

function navItemsToCommandItems(items: NavItem[], category: string): CommandItem[] {
  const out: CommandItem[] = []
  for (const item of items) {
    out.push({
      id: `docs-${item.slug}`,
      title: item.title,
      href: `/docs/${item.slug}`,
      category,
    })
    if (item.children) {
      for (const child of item.children) {
        out.push({
          id: `docs-${child.slug}`,
          title: child.title,
          href: `/docs/${child.slug}`,
          category,
        })
      }
    }
  }
  return out
}

export const commandGroups: CommandGroup[] = [
  {
    category: 'Pages',
    items: [
      { id: 'home', title: 'Home', href: '/', category: 'Pages' },
      { id: 'playground', title: 'Playground', href: '/playground', category: 'Pages' },
      { id: 'integrations', title: 'Integrations', href: '/integrations', category: 'Pages' },
    ],
  },
  {
    category: 'Docs',
    items: navItemsToCommandItems(navigation, 'Docs'),
  },
]
