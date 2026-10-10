/**
 * Lexical analysis of generated Go template source, for moving a rendered
 * fragment out of the `{{range}}` it was rendered in (#3420).
 *
 * Only the inside of `{{…}}` actions is Go template syntax: HTML text,
 * quoted strings (`"…"`, `` `…` ``, `'…'`) and `{{/* comments *\/}}` are
 * carried over verbatim. A variable's scope follows text/template: a
 * declaration in an `if` / `range` / `with` / `block` header, or anywhere
 * inside such a control, lasts until that control's `{{end}}`.
 */

/** A fragment's free `$name` variables and the fragment with every bare `$` renamed to `root`. */
export interface FreeTemplateVars {
  /** Variables read before (or without) any declaration in the fragment, in first-use order. */
  free: string[]
  /** The fragment with the bare `$` (the define's root) renamed to `$<root>`. */
  body: string
}

const CONTROL_KEYWORDS = new Set(['if', 'range', 'with', 'block', 'define'])

export function freeTemplateVars(fragment: string, root: string): FreeTemplateVars {
  const scopes: Array<Set<string>> = [new Set()]
  const free: string[] = []
  let out = ''
  let i = 0
  while (i < fragment.length) {
    const open = fragment.indexOf('{{', i)
    if (open < 0) {
      out += fragment.slice(i)
      break
    }
    out += fragment.slice(i, open)
    const close = findActionEnd(fragment, open + 2)
    const action = fragment.slice(open, close)
    out += analyzeAction(action, scopes, free, root)
    i = close
  }
  return { free, body: out }
}

/** Index just past the `}}` closing the action whose body starts at `from`, skipping quoted strings. */
function findActionEnd(src: string, from: number): number {
  let i = from
  if (src.startsWith('/*', i) || src.startsWith('- /*', i)) {
    const end = src.indexOf('*/', i)
    const close = src.indexOf('}}', end < 0 ? i : end)
    return close < 0 ? src.length : close + 2
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipQuoted(src, i)
      continue
    }
    if (src.startsWith('}}', i)) return i + 2
    i++
  }
  return src.length
}

/** Index just past the quoted literal starting at `i`. */
function skipQuoted(src: string, i: number): number {
  const quote = src[i]
  let j = i + 1
  while (j < src.length && src[j] !== quote) {
    if (quote !== '`' && src[j] === '\\') j++
    j++
  }
  return j + 1
}

interface VarToken {
  name: string // '' for the bare `$`
  start: number
  end: number
}

function analyzeAction(action: string, scopes: Array<Set<string>>, free: string[], root: string): string {
  if (/^\{\{-?\s*\/\*/.test(action)) return action
  const tokens: VarToken[] = []
  let declareEnd = -1 // index of `:=` in the action, if any
  let i = 2
  while (i < action.length - 2) {
    const c = action[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipQuoted(action, i)
      continue
    }
    if (c === ':' && action[i + 1] === '=' && declareEnd < 0) declareEnd = i
    if (c === '$') {
      let j = i + 1
      while (j < action.length && /[\w]/.test(action[j])) j++
      tokens.push({ name: action.slice(i + 1, j), start: i, end: j })
      i = j
      continue
    }
    i++
  }

  const keyword = /^\{\{-?\s*([a-z]+)\b/.exec(action)?.[1] ?? ''
  const declared = declareEnd < 0 ? [] : tokens.filter(t => t.end <= declareEnd && t.name !== '')
  const isDeclared = (t: VarToken): boolean => declared.includes(t)

  // References resolve against the scopes in force BEFORE this action's own
  // declarations (`{{range $_, $row := $row.Children}}` reads the outer `$row`).
  for (const t of tokens) {
    if (t.name === '' || isDeclared(t)) continue
    if (!scopes.some(s => s.has(t.name)) && !free.includes(t.name)) free.push(t.name)
  }

  if (keyword === 'end') {
    if (scopes.length > 1) scopes.pop()
  } else if (CONTROL_KEYWORDS.has(keyword)) {
    scopes.push(new Set())
  }
  for (const t of declared) scopes[scopes.length - 1].add(t.name)

  let rewritten = ''
  let last = 0
  for (const t of tokens) {
    if (t.name !== '') continue
    rewritten += `${action.slice(last, t.start)}$${root}`
    last = t.end
  }
  return rewritten + action.slice(last)
}
