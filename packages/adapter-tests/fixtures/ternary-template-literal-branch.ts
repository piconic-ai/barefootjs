import { createFixture } from '../src/types'

/**
 * A ternary whose CONSEQUENT is a multi-part template literal, in ATTRIBUTE
 * position (#2863). The Go adapter's ternary-branch lowering used to route
 * a template-literal operand through the TEXT-position `templateLiteral()`
 * emitter — mixed literal text plus `{{…}}` action wraps, meant for direct
 * markup embedding — nesting raw `{{`/`}}` delimiters inside `bf_ternary`'s
 * own pipeline argument list. `bf build` succeeded, but the generated
 * template failed `html/template.Parse` at Go application startup
 * ("unexpected \"{\" in operand"). Every other adapter already handled this
 * shape correctly (a native ternary + string concatenation); only Go's
 * markup-language template restriction exposed the gap.
 *
 * A ternary written directly as a JSX TEXT child instead compiles to a
 * text-position `IRConditional` (an `{{if}}…{{else}}…{{end}}` reactive
 * swap) — a different, already-correct code path unaffected by this bug —
 * so attribute position is the shape that actually exercises the fix.
 *
 * `props.a` carries an HTML-special character to pin escaping parity: the
 * template-literal's dynamic parts must still be escaped exactly once (by
 * the enclosing attribute context), not zero or twice.
 */
export const fixture = createFixture({
  id: 'ternary-template-literal-branch',
  description: 'A ternary consequent that is a multi-part template literal, in attribute position (#2863)',
  source: `
export function TernaryTemplateLiteralBranch({ ok, a, b }: { ok: boolean; a: string; b: string }) {
  return <span title={ok ? \`\${a}–\${b}\` : a}>x</span>
}
`,
  props: { ok: true, a: '9<b>&"\'', b: '10' },
  expectedHtml: `
    <span bf-s="test" bf="s0" title="9&lt;b&gt;&amp;&quot;&#39;–10">x</span>
  `,
  dataPoints: [{ name: 'alternate-branch', props: { ok: false, a: '9', b: '10' } }],
})
