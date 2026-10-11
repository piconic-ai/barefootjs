'use client'

// Test fixture: delegated row clicks whose row item is falsy (#3433). The
// keyed loops, the module-level static loop and the nested loop each look
// their row item up; every lookup must accept `0`, `''` and
// `false` as a found row.

import { createSignal } from '@barefootjs/client'

const LEVELS = [0, 1]

export function FalsyRowClicks(props: { nums: number[]; words: string[]; flags: boolean[]; groups: number[][] }) {
  const [last, setLast] = createSignal('none')
  return (
    <div>
      <p className="last">{last()}</p>
      <ul className="nums">
        {props.nums.map(n => (
          <li key={n}><button type="button" className="num" onClick={() => setLast(`num:${n}`)}>{n}</button></li>
        ))}
      </ul>
      <ul className="words">
        {props.words.map(w => (
          <li key={w}><button type="button" className="word" onClick={() => setLast(`word:[${w}]`)}>[{w}]</button></li>
        ))}
      </ul>
      <ul className="levels">
        {LEVELS.map(l => (
          <li key={l}><button type="button" className="level" onClick={() => setLast(`level:${l}`)}>{l}</button></li>
        ))}
      </ul>
      <ul className="flags">
        {props.flags.map(f => (
          <li key={String(f)}><button type="button" className="flag" onClick={() => setLast(`flag:${f}`)}>{String(f)}</button></li>
        ))}
      </ul>
      <ul className="groups">
        {props.groups.map((g, gi) => (
          <li key={gi}>
            {g.map(v => (
              <button type="button" key={v} className="cell" onClick={() => setLast(`cell:${gi}:${v}`)}>{v}</button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
