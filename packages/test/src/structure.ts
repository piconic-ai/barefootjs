/**
 * toStructure — tree display for debugging and snapshot testing.
 *
 * Format:
 *   button [role=checkbox] [aria-checked] (click)
 *   ├── svg.size-3.5.text-current
 *   │   └── path
 *   └── {expression}
 */

import type { TestNode } from './test-node.ts'

export function toStructure(node: TestNode): string {
  const lines: string[] = []
  renderNode(node, '', true, lines)
  return lines.join('\n')
}

function renderNode(
  node: TestNode,
  prefix: string,
  isLast: boolean,
  lines: string[],
  isRoot: boolean = true
): void {
  const label = nodeLabel(node)

  if (isRoot) {
    lines.push(label)
  } else {
    const connector = isLast ? '└── ' : '├── '
    lines.push(prefix + connector + label)
  }

  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ')

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    const childIsLast = i === node.children.length - 1
    renderNode(child, childPrefix, childIsLast, lines, false)
  }
}

function nodeLabel(node: TestNode): string {
  const parts: string[] = []

  // Tag or expression
  if (node.type === 'text') {
    parts.push(JSON.stringify(node.text))
    return parts.join(' ')
  }

  if (node.type === 'expression') {
    parts.push(`{${node.text}}`)
    return parts.join(' ')
  }

  if (node.type === 'conditional') {
    parts.push(`?{${node.text}}`)
  } else if (node.type === 'loop') {
    parts.push(`*{${node.text}}`)
  } else if (node.type === 'component') {
    parts.push(`<${node.componentName}>`)
  } else if (node.type === 'fragment') {
    parts.push('<>')
  } else if (node.tag) {
    // Element: tag with first 3 classes
    const classStr = node.classes.slice(0, 3).map(c => `.${c}`).join('')
    parts.push(node.tag + classStr)
  }

  // Role
  if (node.role) {
    parts.push(`[role=${node.role}]`)
  }

  // Aria attributes
  for (const key of Object.keys(node.aria).sort()) {
    parts.push(`[aria-${key}]`)
  }

  // data-state
  if (node.dataState) {
    parts.push(`[data-state]`)
  }

  // Events
  if (node.events.length > 0) {
    parts.push(`(${node.events.join(', ')})`)
  }

  return parts.join(' ')
}
