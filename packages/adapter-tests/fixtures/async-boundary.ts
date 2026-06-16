import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'async-boundary',
  description: 'Async streaming boundary with synchronous-resolved children',
  source: `
import { Async } from '@barefootjs/client'
export function ProductPage() {
  return (
    <div>
      <Async fallback={<p>Loading...</p>}>
        <span>Resolved</span>
      </Async>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><span>Resolved</span></div>
  `,
})
