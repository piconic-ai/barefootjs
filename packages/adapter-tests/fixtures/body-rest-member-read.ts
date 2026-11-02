import { createFixture } from '../src/types'

/**
 * Member reads of a rest a body destructure of the props object binds
 * (`const { label, ...rest } = props`). The rest holds every prop the
 * destructure does not take, so `rest.id` reads the caller's `id` in an
 * attribute, as text, in a condition, in a loop row and as a child prop;
 * an absent key (`rest.title`) reads as absent.
 */
export const fixture = createFixture({
  id: 'body-rest-member-read',
  description: 'Member reads of a props-object body rest read the props it holds',
  source: `
import { Chip } from './chip'
export function BodyRestRead(props: { label: string; id?: string; title?: string; items: string[] }) {
  const { label, ...rest } = props
  return (
    <div data-id={rest.id} title={rest.title}>
      <i>{label}:{rest.id}</i>
      <b>{rest.title ? 'titled' : 'untitled'}</b>
      <Chip tone={rest.id} />
      <ul>{rest.items.map(it => <li key={it}>{it}-{rest.id}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip(props: { tone?: string }) {
  return <span>{props.tone}</span>
}
`,
  },
  props: { label: 'L', id: 'I', items: ['p', 'q'] },
  expectedHtml: `
    <div bf-s="test" bf="s10" data-id="I">
      <i bf="s2"><!--bf:s0-->L<!--/-->:<!--bf:s1-->I<!--/--></i>
      <b bf="s4"><!--bf-cond-start:s3-->untitled<!--bf-cond-end:s3--></b>
      <span bf-s="test_s5" bf="s1"><!--bf:s0-->I<!--/--></span>
      <ul bf="s9">
        <li bf="s8" data-key="p"><!--bf:s6-->p<!--/-->-<!--bf:s7-->I<!--/--></li>
        <li bf="s8" data-key="q"><!--bf:s6-->q<!--/-->-<!--bf:s7-->I<!--/--></li>
      </ul>
    </div>
  `,
})
