import { createFixture } from '../src/types'

/**
 * A dynamic child of an SVG `<style>` (#3910). Inside `<svg>` the element holds
 * foreign content, not HTML raw text: comments are read there, so the usual
 * `<!--bf:sN-->…<!--/-->` slot markers stay. Only HTML-namespace
 * `style` / `script` / `textarea` / `title` render bare
 * (`raw-text-host-dynamic`). go-template refuses the shape like any
 * dynamic `<style>` text (BF101).
 */
export const fixture = createFixture({
  id: 'raw-text-host-svg-style',
  description: 'A dynamic child of an SVG <style> keeps its slot markers',
  source: `
export function RawTextHostSvgStyle({ label }: { label: string }) {
  return (
    <svg>
      <style>{label}</style>
    </svg>
  )
}
`,
  props: { label: 'tip' },
  expectedHtml: `
    <svg bf-s="test"><style bf="s1"><!--bf:s0-->tip<!--/--></style></svg>
  `,
})
