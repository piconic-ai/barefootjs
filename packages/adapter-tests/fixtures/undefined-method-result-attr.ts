import { createFixture } from '../src/types'

/**
 * A method call that reads `undefined` in attribute position: `.at(i)` out
 * of range, and `.find()` / `.findLast()` with no match. Hono omits an
 * attribute whose value is `undefined`; the template adapters guard it on a
 * nil check instead of rendering `name=""`. Covers a destructured string
 * prop, a signal seeded by it, a memo over the signal, a number array (a
 * present `0` still renders), a ternary branch, a `??` fallback, an `&&`
 * operand and a loop row (an empty row omits both attributes). The
 * `props.word.at(-1)` form is covered by `string-index-methods`.
 */
export const fixture = createFixture({
  id: 'undefined-method-result-attr',
  description: '`.at(i)` out of range or `.find()` with no match in attribute position omits the attribute',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function UndefinedMethodResultAttr({ word, nums, rows }: { word: string; nums: number[]; rows: string[][] }) {
  const [w, setW] = createSignal(word)
  const last = createMemo(() => w().at(-1))
  return (
    <div data-last={word.at(-1)} data-sig={w().at(-1)} data-memo={last()} data-num={nums.at(0)} data-far={nums.at(5)} data-alt={word ? word.at(9) : 'x'} data-fb={word.at(-1) ?? 'none'} data-and={word && word.at(-1)} data-find={nums.find(n => n > 1)} data-miss={nums.findLast(n => n > 9)}>
      <ul>
        {rows.map((row, i) => (
          <li key={i} data-head={row.at(0)} data-tail={row.at(-1)}>{i}</li>
        ))}
      </ul>
      <button onClick={() => setW(w() + 'z')}>grow</button>
    </div>
  )
}
`,
  props: { word: 'ab', nums: [0, 2], rows: [['a', 'b'], []] },
  dataPoints: [
    { name: 'empty', props: { word: '', nums: [], rows: [[]] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s4" data-and="b" data-fb="b" data-find="2" data-last="b" data-memo="b" data-num="0" data-sig="b">
      <ul bf="s2">
        <li bf="s1" data-head="a" data-key="0" data-tail="b"><!--bf:s0-->0<!--/--></li>
        <li bf="s1" data-key="1"><!--bf:s0-->1<!--/--></li>
      </ul>
      <button bf="s3">grow</button>
    </div>
  `,
})
