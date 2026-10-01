import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'number-addition-text-formatting',
  description: 'A large fractional addition in text uses JavaScript number spelling',
  source: `
export function NumericText(props: { value: number }) {
  return <div>{props.value + 0.5}</div>
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->1234567890.5<!--/--></div>
  `,
})
