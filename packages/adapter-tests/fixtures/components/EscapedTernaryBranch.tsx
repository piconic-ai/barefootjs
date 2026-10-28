'use client'

// Root for the `escaped-ternary-branch` fixture. Every string-literal
// ternary branch below carries an escape sequence (`\n`, `\t`, `\'`,
// `\\`, `\"`) whose cooked value is not a valid body for a quoted string
// literal. The compiler keeps the cooked value in the IR, so each
// position that re-prints the branch (attribute ternary, attribute
// template literal, text, `&&`, child prop, loop row, memo body, and the
// client JS init / update / template paths) must re-escape it.
import { createMemo, createSignal } from '@barefootjs/client'
import { EscapedTernaryLabel } from './EscapedTernaryLabel'

export function EscapedTernaryBranch({ on = true, items = [] }: { on?: boolean; items?: string[] }) {
  const [open, setOpen] = createSignal(false)
  const memo = createMemo(() => (open() ? 'm\\n' : 'o\'p'))
  return (
    <div data-a={on ? 'a\nb' : 'c'} data-q={open() ? "it's" : 'back\\slash'}>
      <p data-t={`k ${on ? 'q\'y\tx' : 'tab'}`} data-u={`v ${open() ? 'w\\z' : 'w"z'}`}>
        {on ? 'l\nm' : 'n'}
      </p>
      <span data-slot="text">{open() ? 'o\'n' : 'of\\f'}</span>
      <span data-slot="and">{on && 'quote\'s \\ end'}</span>
      <span data-slot="memo">{memo()}</span>
      <EscapedTernaryLabel on={on} text={open() ? 'p\nq' : "r's"} />
      <ul>
        {items.map(item => (
          <li key={item} data-row={open() ? 'r\'1' : 'r\\2'} data-s={on ? 's\n1' : 's2'}>
            {item}
          </li>
        ))}
      </ul>
      <button onClick={() => setOpen(!open())}>toggle</button>
    </div>
  )
}
