import { createFixture } from '../src/types'

/**
 * String-receiver index methods (#3613): `.indexOf` / `.lastIndexOf`,
 * `.at` (positive, negative and out-of-range index), `.includes`,
 * and `.startsWith` / `.endsWith` with a position argument, read from a
 * string prop and from a signal seeded by it, in text, attribute and
 * condition positions.
 *
 * JS counts positions in UTF-16 code units: `'日本語'.indexOf('本')` is
 * 1 (a byte-based answer would be 3), and `'a😀b'.indexOf('b')` is 3
 * (the emoji is a surrogate pair; a code-point-based answer would be 2).
 * Position arguments use the same unit, so `'a😀b'.startsWith('b', 3)`
 * is true. The array-receiver lowerings share these helpers, so a
 * backend that only handles arrays renders `-1` / empty here.
 *
 * `.at` positions are chosen so none lands on half of a surrogate pair;
 * that case is its own fixture, `string-at-lone-surrogate`. The two-argument
 * `.indexOf(x, fromIndex)` / `.includes(x, position)` forms are refused
 * by the shared parser (BF101), so they are not exercised here.
 */
export const fixture = createFixture({
  id: 'string-index-methods',
  description: 'String .indexOf / .lastIndexOf / .at / .includes / .startsWith / .endsWith count UTF-16 code units (#3613)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function StringIndexMethods(props: { word: string; needle: string }) {
  const [w, setW] = createSignal(props.word)
  return (
    <div data-idx={props.word.indexOf(props.needle)} data-last={props.word.at(-1)} data-sw={w().startsWith(props.needle, 1) ? 'y' : 'n'}>
      <p>{props.word.indexOf(props.needle)}|{props.word.lastIndexOf(props.needle)}|{props.word.at(-1)}|{props.word.at(3)}</p>
      <p>{w().indexOf(props.needle)}|{w().lastIndexOf(props.needle)}|{w().at(-1)}|{w().includes(props.needle) ? 'has' : 'no'}</p>
      <p>{props.word.startsWith(props.needle, 1) ? 'sw1' : '-'}|{props.word.startsWith(props.needle, 3) ? 'sw3' : '-'}|{props.word.endsWith(props.needle, 2) ? 'ew2' : '-'}</p>
      {props.word.indexOf(props.needle) > 1 ? <b>far</b> : <i>near</i>}
      {w().at(-1) === props.needle && <em>tail</em>}
      <button onClick={() => setW(w() + props.needle)}>grow</button>
    </div>
  )
}
`,
  props: { word: 'banana', needle: 'an' },
  dataPoints: [
    { name: 'multibyte', props: { word: '日本語', needle: '本' } },
    { name: 'astral', props: { word: 'a😀b', needle: 'b' } },
    { name: 'missing', props: { word: 'abc', needle: 'z' } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s17" data-idx="1" data-last="a" data-sw="y">
      <p bf="s4"><!--bf:s0-->1<!--/-->|<!--bf:s1-->3<!--/-->|<!--bf:s2-->a<!--/-->|<!--bf:s3-->a<!--/--></p>
      <p bf="s9"><!--bf:s5-->1<!--/-->|<!--bf:s6-->3<!--/-->|<!--bf:s7-->a<!--/-->|<!--bf-cond-start:s8-->has<!--bf-cond-end:s8--></p>
      <p bf="s13"><!--bf-cond-start:s10-->sw1<!--bf-cond-end:s10-->|<!--bf-cond-start:s11-->sw3<!--bf-cond-end:s11-->|<!--bf-cond-start:s12-->-<!--bf-cond-end:s12--></p>
      <i bf-c="s14">near</i>
      <!--bf-cond-start:s15-->
      <!--bf-cond-end:s15-->
      <button bf="s16">grow</button>
    </div>
  `,
})
