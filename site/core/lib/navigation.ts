/**
 * Navigation structure for the documentation sidebar.
 * Mirrors the table of contents in docs/core/README.mdx. Chapters follow the
 * reader's journey: start → understand → build → add interactivity → pick a
 * backend → look things up.
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
  { title: 'Quick Start', slug: 'quick-start' },
  { title: 'How It Works', slug: 'how-it-works' },
  {
    title: 'Components',
    slug: 'components',
    children: [
      { title: 'Component Authoring', slug: 'components/component-authoring' },
      { title: 'Children & Slots', slug: 'components/children-slots' },
      { title: 'Context API', slug: 'components/context-api' },
      { title: 'Portals', slug: 'components/portals' },
      { title: 'Style Overrides', slug: 'components/styling' },
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
      { title: 'batch', slug: 'reactivity/batch' },
      { title: 'Props Reactivity', slug: 'reactivity/props-reactivity' },
    ],
  },
  {
    title: 'JSX & Templates',
    slug: 'rendering',
    children: [
      { title: 'JSX Compatibility', slug: 'rendering/jsx-compatibility' },
      { title: 'Client Directive', slug: 'rendering/client-directive' },
    ],
  },
  {
    title: 'Adapters',
    slug: 'adapters',
    children: [
      { title: 'Hono', slug: 'adapters/hono-adapter' },
      { title: 'Go Template', slug: 'adapters/go-template-adapter' },
      { title: 'Perl', slug: 'adapters/perl-adapter' },
      { title: 'Ruby', slug: 'adapters/ruby-adapter' },
      { title: 'Python', slug: 'adapters/python-adapter' },
      { title: 'PHP', slug: 'adapters/php-adapter' },
      { title: 'Rust', slug: 'adapters/rust-adapter' },
      { title: 'Java', slug: 'adapters/java-adapter' },
      { title: 'CSR', slug: 'adapters/csr' },
      { title: 'Writing a Custom Adapter', slug: 'adapters/custom-adapter' },
    ],
  },
  {
    title: 'Tooling & Reference',
    slug: 'advanced',
    children: [
      { title: 'Vite Plugin', slug: 'advanced/vite-plugin' },
      { title: 'Testing & CLI', slug: 'advanced/testing-and-cli' },
      { title: 'API Reference', slug: 'advanced/api-reference' },
      { title: 'Error Codes', slug: 'advanced/error-codes' },
      { title: 'Compatibility Matrix', slug: 'advanced/compatibility-matrix' },
      { title: 'Coming from React or Solid', slug: 'advanced/api-comparison' },
    ],
  },
]

/**
 * Slugs of pages that were merged into another page. The docs app answers
 * them with a 301 so old links (and `bf guide` habits) keep working.
 */
export const redirects: Record<string, string> = {
  'core-concepts': 'introduction',
  'core-concepts/backend-freedom': 'introduction',
  'core-concepts/mpa-style': 'introduction',
  'core-concepts/reactivity': 'reactivity',
  'core-concepts/how-it-works': 'how-it-works',
  'core-concepts/ai-native': 'advanced/testing-and-cli',
  'reactivity/shared-state': 'components/context-api',
  'rendering/fragment': 'rendering/jsx-compatibility',
  'components/props-type-safety': 'components/component-authoring',
  'adapters/adapter-architecture': 'adapters/custom-adapter',
  'advanced/compiler-internals': 'how-it-works',
  'advanced/ir-schema': 'how-it-works',
  'advanced/performance': 'how-it-works',
  'advanced/code-splitting': 'advanced/vite-plugin',
}
