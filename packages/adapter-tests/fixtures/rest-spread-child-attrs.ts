import { createFixture } from '../src/types'

/**
 * Parent passes standard HTML attributes (`placeholder`, `value`) to a
 * child whose props type is an open-ended rest-spread
 * (`{ className, type, ...props }` — the `bf add input` registry
 * component's shape). The attributes are NOT declared child params, so
 * call-site codegen must route them into the child's rest bag
 * (Go: `Props map[string]any`) and the spread must surface them in the
 * SSR output.
 *
 * Regression pin for #2131: the Go template adapter emitted these as
 * named struct fields (`Placeholder:`, `Value:`) that the generated
 * `TextInputInput` struct never declares, so the emitted Go did not even
 * compile (`unknown field Placeholder in struct literal`). Here the
 * real-Go conformance render fails on either the compile error or the
 * missing attributes. The `bf build` orchestration half of the bug (the
 * CLI never registered child shapes on the adapter) is pinned by
 * `packages/cli/src/__tests__/build-child-shapes.test.ts`.
 */
export const fixture = createFixture({
  id: 'rest-spread-child-attrs',
  description: 'HTML attrs on a rest-spread child route into the rest bag and render in SSR (#2131)',
  source: `
'use client'
import { TextInput } from './text-input'

export function InputAttrProbe() {
  return (
    <div>
      <TextInput placeholder="type here" value="seed" />
    </div>
  )
}
`,
  components: {
    './text-input.tsx': `
interface TextInputProps {
  className?: string
  type?: string
  [key: string]: unknown
}

export function TextInput({ className = '', type, ...props }: TextInputProps) {
  return <input type={type} className={className} {...props} />
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <input bf-s="test_s0" bf="s0" class="" placeholder="type here" value="seed">
    </div>
  `,
})
