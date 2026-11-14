/**
 * The text a value renders as a JSX child.
 *
 * JSX renders an array child as its items one after another, with no
 * separator, and renders nothing for a nullish or boolean item
 * (`{['a', null, 'b']}` is `ab`), where `String(array)` joins the items
 * with commas. Every door that turns a child-position value into text
 * (`escapeText` for a template, `textOrNode` / `writeText` and
 * `__bfText` for a reactive write) spells an array through this one
 * function, so the client prints a list of children the way the server
 * rendered it. A list reaches a text slot when a component reads its
 * `children` into state (`<Note>{label}!</Note>` hands `Note` the nodes
 * `[label, '!']`) or holds an array in a signal.
 *
 * A nullish or boolean value is empty text, and any other value keeps its
 * `String()` form.
 */
export function childText(value: unknown): string {
  if (value == null || typeof value === 'boolean') return ''
  if (Array.isArray(value)) return value.map(childText).join('')
  return String(value)
}
