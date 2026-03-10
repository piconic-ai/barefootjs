// Generate llms.txt files from component metadata and core documentation.
// Output follows the llmstxt.org spec: H1, blockquote, H2 sections with link lists.

import type { MetaIndex } from './types'
import type { CoreDocMeta } from './docs-loader'

/**
 * Capitalize first letter.
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Format a category name for display (e.g., "core-concepts" → "Core Concepts").
 */
function formatCategory(category: string): string {
  return category.split('-').map(capitalize).join(' ')
}

/**
 * Generate core llms.txt from docs/core/ metadata.
 */
export function generateCoreLlmsTxt(docs: CoreDocMeta[], baseUrl: string): string {
  const lines: string[] = [
    '# BarefootJS',
    '',
    '> JSX -> Marked Template + client JS compiler. Signal-based reactivity for any backend.',
    '',
  ]

  // Group by category
  const groups = new Map<string, CoreDocMeta[]>()
  for (const doc of docs) {
    // Skip section index pages (overview category, root-level files)
    if (doc.category === 'overview') continue
    const existing = groups.get(doc.category) ?? []
    existing.push(doc)
    groups.set(doc.category, existing)
  }

  // Desired category order
  const categoryOrder = ['core-concepts', 'reactivity', 'rendering', 'components', 'adapters', 'advanced']

  for (const category of categoryOrder) {
    const entries = groups.get(category)
    if (!entries || entries.length === 0) continue

    lines.push(`## ${formatCategory(category)}`)
    lines.push('')
    for (const doc of entries) {
      const url = `${baseUrl}/${doc.slug}.md`
      const desc = doc.description ? `: ${doc.description}` : ''
      lines.push(`- [${doc.title}](${url})${desc}`)
    }
    lines.push('')
  }

  // Any remaining categories not in the ordered list
  for (const [category, entries] of groups) {
    if (categoryOrder.includes(category)) continue
    lines.push(`## ${formatCategory(category)}`)
    lines.push('')
    for (const doc of entries) {
      const url = `${baseUrl}/${doc.slug}.md`
      const desc = doc.description ? `: ${doc.description}` : ''
      lines.push(`- [${doc.title}](${url})${desc}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate UI llms.txt from component metadata index.
 */
export function generateUiLlmsTxt(index: MetaIndex, baseUrl: string): string {
  const lines: string[] = [
    '# BarefootJS UI',
    '',
    '> Signal-based UI components. shadcn/ui patterns with SolidJS-style reactivity.',
    '',
  ]

  // Group by category
  const groups = new Map<string, typeof index.components>()
  for (const comp of index.components) {
    const existing = groups.get(comp.category) ?? []
    existing.push(comp)
    groups.set(comp.category, existing)
  }

  // Category order
  const categoryOrder = ['input', 'display', 'feedback', 'navigation', 'layout', 'overlay']

  for (const category of categoryOrder) {
    const entries = groups.get(category)
    if (!entries || entries.length === 0) continue

    lines.push(`## ${formatCategory(category)}`)
    lines.push('')
    for (const comp of entries) {
      const url = `${baseUrl}/${comp.name}.md`
      const statefulMark = comp.stateful ? ' (stateful)' : ''
      lines.push(`- [${comp.title}](${url})${statefulMark}: ${comp.description}`)
    }
    lines.push('')
  }

  // Any remaining categories
  for (const [category, entries] of groups) {
    if (categoryOrder.includes(category)) continue
    lines.push(`## ${formatCategory(category)}`)
    lines.push('')
    for (const comp of entries) {
      const url = `${baseUrl}/${comp.name}.md`
      const statefulMark = comp.stateful ? ' (stateful)' : ''
      lines.push(`- [${comp.title}](${url})${statefulMark}: ${comp.description}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
