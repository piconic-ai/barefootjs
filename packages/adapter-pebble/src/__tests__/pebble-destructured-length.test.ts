/**
 * A destructured `{ length }` off a string or array row reads that row's
 * own `length` (#3848 U7 review): every destructure segment reads through
 * the runtime's `bf.get`, which must answer JS's one own non-index property
 * of a string (its UTF-16 code-unit count) and of an array (its element
 * count), not only a canonical index. The expected lists are the Hono
 * reference's render of the same source and props.
 */
import { test, expect } from 'bun:test'
import { PebbleAdapter } from '../adapter/index.ts'
import { renderPebbleComponent, JavaNotAvailableError } from '../test-render.ts'

const SOURCE = `
export function Lengths({ words, pairs }: { words: string[]; pairs: string[][] }) {
  return (
    <div>
      <ul>{words.map(({ length }, i) => <li key={i}>{length}</li>)}</ul>
      <ol>{pairs.map(({ length }, i) => <li key={i}>{length}</li>)}</ol>
    </div>
  )
}
`

test('a destructured { length } reads a string or array row its own length (pebble)', async () => {
  let html: string
  try {
    html = await renderPebbleComponent({
      source: SOURCE,
      adapter: new PebbleAdapter(),
      props: { words: ['abc', 'x'], pairs: [['a', 'b'], ['c', 'd', 'e']] },
    })
  } catch (err) {
    if (err instanceof JavaNotAvailableError) {
      console.log(`Skipping: ${err.message}`)
      return
    }
    throw err
  }
  const flat = html.replace(/>\s+</g, '><')
  expect(flat).toContain(
    '<ul bf="s1"><!--bf-loop:l0--><li data-key="0"><!--bf:s0-->3<!--/--></li><li data-key="1"><!--bf:s0-->1<!--/--></li><!--bf-/loop:l0--></ul>',
  )
  expect(flat).toContain(
    '<ol bf="s3"><!--bf-loop:l1--><li data-key="0"><!--bf:s2-->2<!--/--></li><li data-key="1"><!--bf:s2-->3<!--/--></li><!--bf-/loop:l1--></ol>',
  )
})
