'use client'
import { createSignal } from '@barefootjs/client'

/**
 * Text-content HTML-escaping fixture (#1694).
 *
 * The `{label}` text slot carries HTML metacharacters (`< > & " '`). The
 * client-render template must escape them (via `escapeText`) so the
 * client-rendered DOM is byte-identical to the SSR output and the value
 * parses as *text* — not markup — when the template is inserted via
 * `innerHTML`. The reactive `{count()}` slot exercises the dynamic text
 * path; `<Tag>` inside `label` must surface as literal text, never a real
 * element.
 */
export function TextEscape(props: { label: string }) {
  const [count, setCount] = createSignal(0)
  return (
    <div class="text-escape">
      <p class="label">{props.label}</p>
      <button type="button" onClick={() => setCount(count() + 1)}>
        count: {count()}
      </button>
    </div>
  )
}
