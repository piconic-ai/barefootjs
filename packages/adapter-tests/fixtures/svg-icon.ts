import { createFixture } from '../src/types'

/**
 * Inline SVG with camelCase presentation attributes. Unlike HTML
 * attributes, SVG's `viewBox` / `strokeWidth` / `strokeLinecap` map to
 * case-SENSITIVE (`viewBox`) or kebab-case (`stroke-width`,
 * `stroke-linecap`) forms — a lowercasing pass that's correct for HTML
 * (`tabIndex` → `tabindex`) corrupts `viewBox`, and a pass-through
 * leaves `strokeWidth` unrecognized by the SVG renderer.
 */
export const fixture = createFixture({
  id: 'svg-icon',
  description: 'Inline SVG: viewBox casing and camelCase → kebab-case presentation attrs',
  source: `
export function SvgIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <path d="M8 12l3 3 5-6" strokeLinecap="round" />
    </svg>
  )
}
`,
  expectedHtml: `
    <svg bf-s="test" fill="none" height="24" viewBox="0 0 24 24" width="24">
      <circle cx="12" cy="12" r="10" stroke-width="2"></circle>
      <path d="M8 12l3 3 5-6" stroke-linecap="round"></path>
    </svg>
  `,
})
