import { createFixture } from '../../src/types'

/**
 * Value-producing `.map(cb)` with a template-literal projection (#2073).
 *
 * The blog-showcase shape (#1938/#1939): each tag projects to `#${t}` and the
 * results join into a display string. This is the value form of `.map` (the
 * callback returns a string, not JSX — the JSX form is an IRLoop), lowered
 * via the runtime evaluator: `bf->map_eval` (Mojo) / `$bf.map_eval` (Xslate)
 * / `bf_map_eval` (Go).
 */
export const fixture = createFixture({
  id: 'array-map-value-template',
  description: '.map(t => `#${t}`).join(" ") renders the projected string',
  source: `
function TagLine({ tags }: { tags: string[] }) {
  return <p>{tags.map((t) => \`#\${t}\`).join(' ')}</p>
}
export { TagLine }
`,
  props: { tags: ['perl', 'go', 'tsx'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->#perl #go #tsx<!--/--></p>
  `,
})
