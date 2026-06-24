/**
 * Go identifier / field-name conventions for the Go html/template adapter.
 *
 * Pure helpers extracted from `go-template-adapter.ts` (Phase 1 refactor):
 * none of these read adapter instance state, so they live at module scope
 * as the single source of truth for capitalisation, initialism handling,
 * and slot/loop-key → Go field-path lowering.
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
 * (#1423) Go reserved keywords. When we hoist a local var named after
 * a JSX prop, the prop name could collide with one of these — append
 * `_` until the name is free.
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
  // Check if the entire name is a Go initialism (e.g., 'id' → 'ID')
  if (GO_INITIALISMS.has(name.toLowerCase())) {
    return name.toUpperCase()
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Convert a slot ID (e.g., 's6') to a Go struct field suffix (e.g., 'Slot6').
 * Keeps field names human-readable regardless of the internal slot ID format.
 */
export function slotIdToFieldSuffix(slotId: string): string {
  // Strip parent-owned prefix (^) for Go struct field names
  const cleanId = slotId.startsWith('^') ? slotId.slice(1) : slotId
  const match = cleanId.match(/^s(\d+)$/)
  if (match) {
    return `Slot${match[1]}`
  }
  // Fallback for legacy format or non-standard IDs
  return cleanId.replace('slot_', 'Slot')
}

/**
 * Lower a keyed-loop `key` expression to the Go field path on the loop's range
 * variable (always `item` in the generated `for i, item := range …`), e.g.
 * `item.label` → `item.Label`. Returns null for a non-simple key (computed
 * expression, whole-element key, mismatched param) so the loop-child init just
 * skips `data-key` rather than emitting something that won't compile. (#1297)
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
