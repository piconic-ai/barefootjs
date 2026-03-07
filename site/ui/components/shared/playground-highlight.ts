/**
 * Playground JSX Syntax Highlighter
 *
 * Lightweight JSX syntax highlighting using shiki's dual-theme CSS variable
 * pattern for light/dark mode support. Used by playground components to
 * display generated code with syntax coloring.
 *
 * Pure functions only — no "use client" needed.
 */

// Shiki dual-theme CSS variable span generators
export const hlPlain = (s: string) =>
  `<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">${s}</span>`

export const hlTag = (s: string) =>
  `<span style="--shiki-light:#22863A;--shiki-dark:#85E89D">${s}</span>`

export const hlAttr = (s: string) =>
  `<span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">${s}</span>`

export const hlStr = (s: string) =>
  `<span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">${s}</span>`

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface HighlightProp {
  name: string
  value: string
  defaultValue: string
  /** 'string' (default): name="value". 'boolean': presence-only. 'expression': name={value}. */
  kind?: 'string' | 'boolean' | 'expression'
}

/**
 * Generate syntax-highlighted JSX markup for a component with props.
 *
 * Props whose value matches their defaultValue are omitted from output.
 *
 * @example
 * highlightJsx('Badge', [{ name: 'variant', value: 'secondary', defaultValue: 'default' }], 'Hello')
 * // => highlighted: <Badge variant="secondary">Hello</Badge>
 *
 * highlightJsx('Badge', [{ name: 'variant', value: 'default', defaultValue: 'default' }], 'Hello')
 * // => highlighted: <Badge>Hello</Badge>
 */
function renderPlainProp(p: HighlightProp): string {
  const kind = p.kind ?? 'string'
  if (kind === 'boolean') return ` ${p.name}`
  if (kind === 'expression') return ` ${p.name}={${p.value}}`
  return ` ${p.name}="${p.value}"`
}

export function plainJsx(tagName: string, props: HighlightProp[], content: string): string {
  const renderedProps = props.filter(isActive).map(renderPlainProp).join('')
  return `<${tagName}${renderedProps}>${content}</${tagName}>`
}

export function plainJsxSelfClosing(tagName: string, props: HighlightProp[]): string {
  const renderedProps = props.filter(isActive).map(renderPlainProp).join('')
  return `<${tagName}${renderedProps} />`
}

function renderProp(p: HighlightProp): string {
  const kind = p.kind ?? 'string'
  const safeName = escapeHtml(p.name)
  if (kind === 'boolean') return ` ${hlAttr(safeName)}`
  if (kind === 'expression') return ` ${hlAttr(safeName)}${hlPlain('={')}${hlPlain(escapeHtml(p.value))}${hlPlain('}')}`
  return ` ${hlAttr(safeName)}${hlPlain('=')}${hlStr(`&quot;${escapeHtml(p.value)}&quot;`)}`
}

function isActive(p: HighlightProp): boolean {
  return p.value !== p.defaultValue
}

export function highlightJsx(
  tagName: string,
  props: HighlightProp[],
  content: string,
): string {
  const escapedContent = escapeHtml(content)
  const renderedProps = props.filter(isActive).map(renderProp).join('')
  return `${hlPlain('&lt;')}${hlTag(tagName)}${renderedProps}${hlPlain('&gt;')}${escapedContent}${hlPlain('&lt;/')}${hlTag(tagName)}${hlPlain('&gt;')}`
}

/**
 * Generate syntax-highlighted JSX markup for a self-closing component.
 *
 * Props whose value matches their defaultValue are omitted from output.
 *
 * @example
 * highlightJsxSelfClosing('Input', [{ name: 'type', value: 'email', defaultValue: 'text' }])
 * // => highlighted: <Input type="email" />
 */
export function highlightJsxSelfClosing(
  tagName: string,
  props: HighlightProp[],
): string {
  const renderedProps = props.filter(isActive).map(renderProp).join('')
  return `${hlPlain('&lt;')}${hlTag(tagName)}${renderedProps} ${hlPlain('/&gt;')}`
}
