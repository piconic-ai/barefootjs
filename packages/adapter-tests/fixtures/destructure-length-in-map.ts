import { createFixture } from '../src/types'

/**
 * An object destructure of `length` in a `.map()` callback over string and
 * array rows (`({ length }) => …`). JS reads `length` as an own property of
 * a string (its UTF-16 code-unit count) and of an array (its element
 * count), so `'abc'` destructures to `3` and `['x', 'y']` to `2`. A template
 * adapter that reads a destructure field through a plain own-key lookup sees
 * no `length` key on a string or list row and renders it empty.
 */
export const fixture = createFixture({
  id: 'destructure-length-in-map',
  description: 'Destructured { length } of string and array rows in .map()',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function LengthRows() {
  const [words, setWords] = createSignal<string[]>(['abc', 'd'])
  const [pairs] = createSignal<string[][]>([['x', 'y'], ['z', 'w', 'v']])
  return (
    <div onClick={() => setWords(w => w)}>
      <ul>
        {words().map(({ length }) => (
          <li key={length}>{length}</li>
        ))}
      </ul>
      <ol>
        {pairs().map(({ length }) => (
          <li key={length}>{length}</li>
        ))}
      </ol>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <ul bf="s1">
        <li data-key="3"><!--bf:s0-->3<!--/--></li>
        <li data-key="1"><!--bf:s0-->1<!--/--></li>
      </ul>
      <ol bf="s3">
        <li data-key="2"><!--bf:s2-->2<!--/--></li>
        <li data-key="3"><!--bf:s2-->3<!--/--></li>
      </ol>
    </div>
  `,
})
