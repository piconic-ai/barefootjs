/**
 * HTML indentation utility for fixture readability.
 *
 * Converts flat single-line HTML into indented multi-line form.
 * An element is expanded (multi-line) only if it has 2+ direct child elements.
 * Otherwise it stays on one line (inline/leaf).
 */

/** HTML void elements that never have a closing tag */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

interface Token {
  type: 'open' | 'close' | 'void' | 'text' | 'comment'
  raw: string
  tagName?: string
}

/**
 * Tokenize HTML string into tags, text, and comments.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  // Tag names allow interior hyphens (custom elements: `<my-widget>`).
  // Without `-` in the name class the open/close alternatives fail to
  // match a hyphenated tag, the unmatched `<` is silently dropped by the
  // scanner, and the tag body re-tokenizes as TEXT — corrupting the
  // emitted fixture HTML (surfaced by the `custom-element-tag` fixture).
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)>|<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>|[^<]+/g
  let match: RegExpExecArray | null

  while ((match = re.exec(html)) !== null) {
    const raw = match[0]

    if (raw.startsWith('<!--')) {
      tokens.push({ type: 'comment', raw })
    } else if (match[1]) {
      tokens.push({ type: 'close', raw, tagName: match[1] })
    } else if (match[2]) {
      const tagName = match[2]
      if (VOID_ELEMENTS.has(tagName)) {
        tokens.push({ type: 'void', raw, tagName })
      } else {
        tokens.push({ type: 'open', raw, tagName })
      }
    } else {
      tokens.push({ type: 'text', raw })
    }
  }

  return tokens
}

/**
 * Find the index of the matching close tag for an open tag at `start`.
 */
function findMatchingClose(tokens: Token[], start: number): number {
  let depth = 0
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].type === 'open') depth++
    else if (tokens[i].type === 'close') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Count direct child elements (open tags + void tags at depth 1) of an open tag.
 */
function countDirectChildElements(tokens: Token[], openIndex: number): number {
  let count = 0
  let depth = 0
  for (let i = openIndex; i < tokens.length; i++) {
    if (tokens[i].type === 'open') {
      depth++
      if (depth === 2) count++
    } else if (tokens[i].type === 'close') {
      depth--
      if (depth === 0) break
    } else if (tokens[i].type === 'void' && depth === 1) {
      count++
    }
  }
  return count
}

/**
 * Concatenate all token raws from start to end (inclusive).
 */
function concatTokens(tokens: Token[], start: number, end: number): string {
  let result = ''
  for (let i = start; i <= end; i++) {
    result += tokens[i].raw
  }
  return result
}

/**
 * Format flat HTML into indented multi-line form.
 *
 * @param html - Flat, single-line HTML string
 * @param baseIndent - Number of spaces for the base indentation level (default: 4)
 * @param indentSize - Number of spaces per indentation level (default: 2)
 * @returns Indented HTML string (starts with newline, ends with newline + base indent minus one level)
 */
export function indentHTML(html: string, baseIndent = 4, indentSize = 2): string {
  const tokens = tokenize(html)
  if (tokens.length === 0) return html

  const lines: string[] = []
  let depth = 0
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    const indent = ' '.repeat(baseIndent + depth * indentSize)

    if (token.type === 'open') {
      const closeIndex = findMatchingClose(tokens, i)
      if (closeIndex === -1) {
        // Malformed HTML: just output as-is
        lines.push(`${indent}${token.raw}`)
        i++
        continue
      }

      const childCount = countDirectChildElements(tokens, i)
      if (childCount < 2) {
        // Inline/leaf: keep everything on one line
        lines.push(`${indent}${concatTokens(tokens, i, closeIndex)}`)
        i = closeIndex + 1
        continue
      }

      // Expanded: open tag on its own line
      lines.push(`${indent}${token.raw}`)
      depth++
    } else if (token.type === 'close') {
      depth--
      const closeIndent = ' '.repeat(baseIndent + depth * indentSize)
      lines.push(`${closeIndent}${token.raw}`)
    } else if (token.type === 'void') {
      lines.push(`${indent}${token.raw}`)
    } else if (token.type === 'comment') {
      lines.push(`${indent}${token.raw}`)
    } else if (token.type === 'text') {
      lines.push(`${indent}${token.raw}`)
    }

    i++
  }

  const closingIndent = ' '.repeat(baseIndent - indentSize)
  return '\n' + lines.join('\n') + '\n' + closingIndent
}
