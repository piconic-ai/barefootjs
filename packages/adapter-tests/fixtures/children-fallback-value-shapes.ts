import { createFixture } from '../src/types'

/**
 * A fallback read of the children prop whose fallback is a boolean or a
 * number (`props.children ?? false`, `|| false`, `?? 0`, `|| 0`), read
 * directly and through a body const, over `props.children` and a
 * destructured `children`. Present children render as markup; absent
 * children render the fallback as it renders alone (nothing for `false`).
 */
export const fixture = createFixture({
  id: 'children-fallback-value-shapes',
  description: 'A fallback read of the children prop with a boolean or number fallback keeps present children markup',
  source: `
import { Flag, Zero, Kids } from './note'
export function Host() {
  return (
    <div>
      <Flag><i>a</i></Flag>
      <Flag />
      <Zero><i>b</i></Zero>
      <Zero />
      <Kids><i>c</i></Kids>
      <Kids />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
export function Flag(props: { children?: unknown }) {
  const label = props.children ?? false
  return <p>{label}|{props.children ?? false}</p>
}
export function Zero(props: { children?: unknown }) {
  const label = props.children ?? 0
  return <p>{label}|{props.children || 0}</p>
}
export function Kids({ children }: { children?: unknown }) {
  const label = children || false
  return <p>{label}|{children ?? 0}</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0">
        <i>a</i>|<i>a</i>
      </p>
      <p bf-s="test_s1">|</p>
      <p bf-s="test_s2">
        <i>b</i>|<i>b</i>
      </p>
      <p bf-s="test_s3">0|0</p>
      <p bf-s="test_s4">
        <i>c</i>|<i>c</i>
      </p>
      <p bf-s="test_s5">|0</p>
    </div>
  `,
})
