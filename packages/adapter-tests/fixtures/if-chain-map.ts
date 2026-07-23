import { createFixture } from '../src/types'

/**
 * Array `.map(...)` whose callback is a statement-block if-chain of JSX returns.
 *
 * `if (kind==='code') return <pre/>; if (kind==='quote') return <blockquote/>;
 * return <p/>` is lowered to a nested per-item conditional — the same shape a
 * ternary map body produces — so the natural multi-branch form renders per
 * item. Regression coverage for the if-chain→conditional lowering (the subset
 * widening that flipped BF026 from "reject all if-chains" to "reject only what
 * the extractor can't lower"). Matrix cell: BlockStatement if-chain × `.map`.
 */
export const fixture = createFixture({
  id: 'if-chain-map',
  description: '.map callback with an if-chain of JSX returns → per-item conditional',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Block = { kind: string; text: string }
export function IfChainMap() {
  const [blocks] = createSignal<Block[]>([
    { kind: 'code', text: 'x' },
    { kind: 'quote', text: 'y' },
    { kind: 'para', text: 'z' },
  ])
  return (
    <ul>
      {blocks().map((b, i) => {
        if (b.kind === 'code') return <pre key={i}>{b.text}</pre>
        if (b.kind === 'quote') return <blockquote key={i}>{b.text}</blockquote>
        return <p key={i}>{b.text}</p>
      })}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s5">
      <pre bf-c="s3" data-key="0"><!--bf:s4-->x<!--/--></pre>
      <!--bf-cond-start:s3-->
      <blockquote bf-c="s1" data-key="1"><!--bf:s2-->y<!--/--></blockquote>
      <!--bf-cond-end:s3-->
      <!--bf-cond-start:s3-->
      <p bf-c="s1" data-key="2"><!--bf:s0-->z<!--/--></p>
      <!--bf-cond-end:s3-->
    </ul>
  `,
})
