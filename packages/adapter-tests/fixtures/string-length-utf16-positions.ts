import { createFixture } from '../src/types'

/**
 * JS `String.prototype.length` counts UTF-16 code units: `'日本語'` is 3
 * (each kanji is one BMP code unit, but 3 UTF-8 bytes) and `'😀😀'` is 4
 * (each astral emoji is a surrogate pair, but one codepoint and 4 UTF-8
 * bytes). A backend that counts bytes or codepoints takes the other branch
 * of the `> 3` / `=== 4` tests (#3609). Covers a string prop, a signal and
 * a memo, each read in a condition, text and an attribute, plus a memo
 * whose own body compares a length and a `&&` guard.
 */
export const fixture = createFixture({
  id: 'string-length-utf16-positions',
  description: 'String .length counts UTF-16 code units for multibyte and astral text in condition, text and attribute positions',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function StringLengthUtf16Positions(props: { word: string; emoji: string }) {
  const [text] = createSignal('日本語')
  const [face] = createSignal('😀😀')
  const both = createMemo(() => text() + face())
  const isLong = createMemo(() => props.word.length > 3)
  return (
    <div>
      <p class="prop-cond">{props.word.length > 3 ? 'long' : 'short'}:{props.emoji.length === 4 ? 'four' : 'other'}</p>
      <p class="prop-text">{props.word.length}:{props.emoji.length}</p>
      <p class="prop-attr" data-w={props.word.length} data-e={props.emoji.length}>attr</p>
      <p class="signal-cond">{text().length > 3 ? 'long' : 'short'}:{face().length === 4 ? 'four' : 'other'}</p>
      <p class="signal-text">{text().length}:{face().length}</p>
      <p class="signal-attr" data-t={text().length} data-f={face().length}>attr</p>
      <p class="memo-cond">{both().length === 7 ? 'seven' : 'other'}:{isLong() ? 'long' : 'short'}</p>
      <p class="memo-text">{both().length}</p>
      <p class="memo-attr" data-n={both().length}>attr</p>
      {props.word.length < 4 && <span class="guard">short</span>}
    </div>
  )
}
`,
  props: {
    word: '日本語',
    emoji: '😀😀',
  },
  expectedHtml: `
    <div bf-s="test" bf="s21">
      <p bf="s2" class="prop-cond"><!--bf-cond-start:s0-->short<!--bf-cond-end:s0-->:<!--bf-cond-start:s1-->four<!--bf-cond-end:s1--></p>
      <p bf="s5" class="prop-text"><!--bf:s3-->3<!--/-->:<!--bf:s4-->4<!--/--></p>
      <p bf="s6" class="prop-attr" data-e="4" data-w="3">attr</p>
      <p bf="s9" class="signal-cond"><!--bf-cond-start:s7-->short<!--bf-cond-end:s7-->:<!--bf-cond-start:s8-->four<!--bf-cond-end:s8--></p>
      <p bf="s12" class="signal-text"><!--bf:s10-->3<!--/-->:<!--bf:s11-->4<!--/--></p>
      <p bf="s13" class="signal-attr" data-f="4" data-t="3">attr</p>
      <p bf="s16" class="memo-cond"><!--bf-cond-start:s14-->seven<!--bf-cond-end:s14-->:<!--bf-cond-start:s15-->short<!--bf-cond-end:s15--></p>
      <p bf="s18" class="memo-text"><!--bf:s17-->7<!--/--></p>
      <p bf="s19" class="memo-attr" data-n="7">attr</p>
      <span bf-c="s20" class="guard">short</span>
    </div>
  `,
})
