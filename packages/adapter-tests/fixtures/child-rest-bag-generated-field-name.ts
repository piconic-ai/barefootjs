import { createFixture } from '../src/types'

/**
 * A rest destructure whose binding capitalizes to a field every generated
 * Go struct already has (`scopeID` → `ScopeID`, `bfMount` → `BfMount`,
 * `scripts` → `Scripts`). The undeclared props still reach the spread, at a
 * plain call site and in a static loop row, and a `rest.key` read sees them.
 */
export const fixture = createFixture({
  id: 'child-rest-bag-generated-field-name',
  description: 'Rest bags named like generated Go struct fields',
  source: `
import { Kid } from './Kid'
import { Mount } from './Mount'
import { Tag } from './Tag'
export function ChildRestBagGeneratedFieldName() {
  return (
    <div>
      <Kid label="x" title="t" />
      <Mount label="y" data-x="1" />
      <Tag label="z" tone="warm" />
      {['p', 'q'].map(k => <Kid key={k} label={k} title={k} />)}
    </div>
  )
}
`,
  components: {
    './Kid': `
export function Kid({ label, ...scopeID }: { label: string; [k: string]: any }) {
  return <b {...scopeID}>{label}</b>
}
`,
    './Mount': `
export function Mount({ label, ...bfMount }: { label: string; [k: string]: any }) {
  return <i {...bfMount}>{label}</i>
}
`,
    './Tag': `
export function Tag({ label, ...scripts }: { label: string; tone?: string; [k: string]: any }) {
  return <u data-tone={scripts.tone}>{label}</u>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <b bf-s="test_s0" bf="s1" title="t"><!--bf:s0-->x<!--/--></b>
      <i bf-s="test_s1" bf="s1" data-x="1"><!--bf:s0-->y<!--/--></i>
      <u bf-s="test_s2" bf="s1" data-tone="warm"><!--bf:s0-->z<!--/--></u>
      <b bf-s="Kid_*" bf="s1" data-key="p" title="p"><!--bf:s0-->p<!--/--></b>
      <b bf-s="Kid_*" bf="s1" data-key="q" title="q"><!--bf:s0-->q<!--/--></b>
    </div>
  `,
})
