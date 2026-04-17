/**
 * Navigation structure for the documentation sidebar.
 * Mirrors the table of contents in docs/core/README.md.
 */

export interface NavItem {
  title: string
  slug: string
  children?: NavItem[]
}

/**
 * Flatten hierarchical navigation into an ordered list.
 * Parent pages come before their children.
 */
export function flattenNavigation(items: NavItem[]): { slug: string; title: string }[] {
  const result: { slug: string; title: string }[] = []
  for (const item of items) {
    result.push({ slug: item.slug, title: item.title })
    if (item.children) {
      for (const child of item.children) {
        result.push({ slug: child.slug, title: child.title })
      }
    }
  }
  return result
}

/**
 * Get prev/next navigation links for a given docs page slug.
 */
export function getDocsNavLinks(slug: string): {
  prev?: { href: string; title: string }
  next?: { href: string; title: string }
} {
  const flat = flattenNavigation(navigation)
  const index = flat.findIndex(item => item.slug === slug)
  if (index === -1) return {}

  return {
    prev: index > 0 ? { href: `/docs/${flat[index - 1].slug}`, title: flat[index - 1].title } : undefined,
    next: index < flat.length - 1 ? { href: `/docs/${flat[index + 1].slug}`, title: flat[index + 1].title } : undefined,
  }
}

export const navigation: NavItem[] = [
  { title: 'Introduction', slug: 'introduction' },
  {
    title: 'Core Concepts',
    slug: 'core-concepts',
    children: [
      { title: 'Backend Freedom', slug: 'core-concepts/backend-freedom' },
      { title: 'MPA-style Development', slug: 'core-concepts/mpa-style' },
      { title: 'Fine-grained Reactivity', slug: 'core-concepts/reactivity' },
      { title: 'AI-native Development', slug: 'core-concepts/ai-native' },
      { title: 'How It Works', slug: 'core-concepts/how-it-works' },
    ],
  },
  {
    title: 'Reactivity',
    slug: 'reactivity',
    children: [
      { title: 'createSignal', slug: 'reactivity/create-signal' },
      { title: 'createEffect', slug: 'reactivity/create-effect' },
      { title: 'createMemo', slug: 'reactivity/create-memo' },
      { title: 'onMount', slug: 'reactivity/on-mount' },
      { title: 'onCleanup', slug: 'reactivity/on-cleanup' },
      { title: 'untrack', slug: 'reactivity/untrack' },
      { title: 'Props Reactivity', slug: 'reactivity/props-reactivity' },
    ],
  },
  {
    title: 'Templates & Rendering',
    slug: 'rendering',
    children: [
      { title: 'JSX Compatibility', slug: 'rendering/jsx-compatibility' },
      { title: 'Fragment', slug: 'rendering/fragment' },
      { title: 'Client Directive', slug: 'rendering/client-directive' },
    ],
  },
  {
    title: 'Components',
    slug: 'components',
    children: [
      { title: 'Component Authoring', slug: 'components/component-authoring' },
      { title: 'Props & Type Safety', slug: 'components/props-type-safety' },
      { title: 'Children & Slots', slug: 'components/children-slots' },
      { title: 'Context API', slug: 'components/context-api' },
      { title: 'Portals', slug: 'components/portals' },
      { title: 'Style Overrides', slug: 'components/styling' },
    ],
  },
  {
    title: 'Adapters',
    slug: 'adapters',
    children: [
      { title: 'Adapter Architecture', slug: 'adapters/adapter-architecture' },
      { title: 'Hono Adapter', slug: 'adapters/hono-adapter' },
      { title: 'Go Template Adapter', slug: 'adapters/go-template-adapter' },
      { title: 'Custom Adapter', slug: 'adapters/custom-adapter' },
    ],
  },
  {
    title: 'Advanced',
    slug: 'advanced',
    children: [
      { title: 'Compiler Internals', slug: 'advanced/compiler-internals' },
      { title: 'IR Schema', slug: 'advanced/ir-schema' },
      { title: 'Error Codes', slug: 'advanced/error-codes' },
      { title: 'Performance', slug: 'advanced/performance' },
    ],
  },
]
