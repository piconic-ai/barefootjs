/**
 * Go identifier / field-name conventions: the single source of truth for
 * capitalisation, initialism handling, and slot/loop-key → Go field-path
 * lowering. Pure helpers — none read adapter instance state.
 */

/** Matches a bare Go identifier (no dots, no brackets). */
export const GO_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Go common initialisms that should be fully uppercased (https://go.dev/wiki/CodeReviewComments#initialisms) */
export const GO_INITIALISMS = new Set([
  'id', 'url', 'http', 'https', 'api', 'json', 'xml', 'html', 'css', 'sql',
  'ip', 'tcp', 'udp', 'dns', 'ssh', 'tls', 'ssl', 'uri', 'uid', 'uuid',
  'ascii', 'utf8', 'eof', 'grpc', 'rpc', 'cpu', 'gpu', 'ram', 'os',
])

/**
 * Go reserved keywords. When hoisting a local var named after a JSX prop, a
 * collision with one of these is resolved by appending `_` until free.
 */
export const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer',
  'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import',
  'interface', 'map', 'package', 'range', 'return', 'select', 'struct',
  'switch', 'type', 'var',
])

/**
 * Capitalise a name for use as a Go template field projection. A whole-word
 * Go initialism uppercases entirely (`id` → `ID`, `url` → `URL`) so the
 * `bf_sort` / `bf_reduce` reflect lookup resolves the generated exported
 * field instead of silently folding a zero value.
 */
export function capitalize(s: string): string {
  if (s.length === 0) return s
  if (GO_INITIALISMS.has(s.toLowerCase())) {
    return s.toUpperCase()
  }
  return s[0].toUpperCase() + s.slice(1)
}

/** Capitalise a JSX prop / field name to its exported Go struct field name. */
export function capitalizeFieldName(name: string): string {
  if (!name) return name
  // Whole-name initialism (e.g. 'id' → 'ID').
  if (GO_INITIALISMS.has(name.toLowerCase())) {
    return name.toUpperCase()
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Resolve ANY source property key — identifier or not (`data-priority`,
 * `aria-label`, a numeric key) — to a valid Go struct field name. Splits on
 * runs of characters that are invalid in a Go identifier (underscores are
 * VALID and preserved, so a snake_case key round-trips to the exact same
 * name `capitalizeFieldName` alone has always produced — `foo_bar` →
 * `Foo_bar`, never `FooBar`; renaming it would break both existing member
 * emission and consumers' hand-written constructors against generated
 * types) and PascalCases each segment through `capitalizeFieldName`, so a
 * hyphenated key gets a real field instead of being silently dropped
 * (`data-priority` → `DataPriority`). A result that would start with a
 * digit (numeric key `0`) is prefixed with `Field` (`Field0`), and a key
 * with no usable characters at all falls back to `Field` — both keep the
 * emitted struct compiling (not expected from real TS property names, but
 * keeps the function total).
 *
 * Single source of truth for the source-key → Go-name mapping: used for
 * struct-field generation (#2087 Phase B — `structFieldsFor`), inline-map
 * baking (`bakeInlineObjectAsGoMap`), and the `member()` dot-access
 * emitter, so the baked side and the accessor side can never disagree
 * (PR #2089 review).
 */
export function goFieldNameForKey(key: string): string {
  const parts = key.split(/[^A-Za-z0-9_]+/).filter(Boolean)
  if (parts.length === 0) return 'Field'
  const name = parts.map(capitalizeFieldName).join('')
  return /^[0-9]/.test(name) ? `Field${name}` : name
}

/**
 * Convert a slot ID (e.g., 's6') to a Go struct field suffix (e.g., 'Slot6').
 * Keeps field names human-readable regardless of the internal slot ID format.
 */
export function slotIdToFieldSuffix(slotId: string): string {
  // Strip the parent-owned prefix (^).
  const cleanId = slotId.startsWith('^') ? slotId.slice(1) : slotId
  const match = cleanId.match(/^s(\d+)$/)
  if (match) {
    return `Slot${match[1]}`
  }
  // Fallback for non-standard IDs.
  return cleanId.replace('slot_', 'Slot')
}

/**
 * Lower a keyed-loop `key` expression to the Go field path on the loop's range
 * variable (always `item` in the generated `for i, item := range …`), e.g.
 * `item.label` → `item.Label`.
 *
 * @returns `null` for a non-simple key (computed expression, whole-element key,
 *   mismatched param) — caller then skips `data-key` rather than emit
 *   something that won't compile.
 */
export function loopKeyToGoFieldPath(key: string | undefined, param: string | undefined): string | null {
  if (!key || !param) return null
  const segs = key.split('.')
  if (segs[0] !== param) return null
  const rest = segs.slice(1)
  if (rest.length === 0) return null
  if (!rest.every(s => /^[A-Za-z_]\w*$/.test(s))) return null
  return 'item.' + rest.map(capitalize).join('.')
}
