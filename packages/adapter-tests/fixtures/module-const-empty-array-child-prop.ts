import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-array-child-prop`: an empty array passed as a
 * child prop, written in place (`xs={[]}`) or through a module or a
 * component-local const holding `[]`. The child receives an empty array:
 * it maps no row and reads `length` 0. Destinations: an array of objects
 * (through a destructured and a `function C(props)` child) and a string
 * array.
 */
export const fixture = createFixture({
  id: 'module-const-empty-array-child-prop',
  description: 'an empty array passed as a child prop, in place or through a const, reaches the child empty',
  source: `
import { ObjKid, PropsObjKid, StrKid } from './empty-kids'
const NO_ROWS: { id: string }[] = []
const NO_STRS: string[] = []
export function ModuleConstEmptyArrayChildProp() {
  const localRows: { id: string }[] = []
  const localStrs: string[] = []
  return (
    <div>
      <ObjKid xs={[]} />
      <ObjKid xs={NO_ROWS} />
      <ObjKid xs={localRows} />
      <PropsObjKid xs={[]} />
      <PropsObjKid xs={NO_ROWS} />
      <StrKid xs={[]} />
      <StrKid xs={NO_STRS} />
      <StrKid xs={localStrs} />
    </div>
  )
}
`,
  components: {
    './empty-kids.tsx': `
export function ObjKid({ xs }: { xs: { id: string }[] }) {
  return <ul data-n={xs.length}>{xs.map(x => <li key={x.id}>{x.id}</li>)}</ul>
}
export function PropsObjKid(props: { xs: { id: string }[] }) {
  return <ol>{props.xs.map(x => <li key={x.id}>{x.id}</li>)}{props.xs.length}</ol>
}
export function StrKid({ xs }: { xs: string[] }) {
  return (
    <div data-n={xs.length}>
      <p>{xs.join(',')}</p>
      <ul>{xs.map(x => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf-s="test_s0" bf="s1" data-n="0"></ul>
      <ul bf-s="test_s1" bf="s1" data-n="0"></ul>
      <ul bf-s="test_s2" bf="s1" data-n="0"></ul>
      <ol bf-s="test_s3" bf="s2"><!--bf:s1-->0<!--/--></ol>
      <ol bf-s="test_s4" bf="s2"><!--bf:s1-->0<!--/--></ol>
      <div bf-s="test_s5" bf="s4" data-n="0">
        <p bf="s1"><!--bf:s0--><!--/--></p>
        <ul bf="s3"></ul>
      </div>
      <div bf-s="test_s6" bf="s4" data-n="0">
        <p bf="s1"><!--bf:s0--><!--/--></p>
        <ul bf="s3"></ul>
      </div>
      <div bf-s="test_s7" bf="s4" data-n="0">
        <p bf="s1"><!--bf:s0--><!--/--></p>
        <ul bf="s3"></ul>
      </div>
    </div>
  `,
})
