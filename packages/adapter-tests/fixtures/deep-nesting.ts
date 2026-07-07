import { createFixture } from '../src/types'

/**
 * An eight-level-deep static element chain with the only dynamic slot
 * at the leaf. Pins path-based slot addressing through deep static
 * structure — off-by-one child-index math anywhere along the walk
 * surfaces here as a wrong or missing marker.
 */
export const fixture = createFixture({
  id: 'deep-nesting',
  description: 'Dynamic slot at the leaf of an 8-level static element chain',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DeepNesting() {
  const [depth, setDepth] = createSignal(8)
  return (
    <div>
      <section>
        <article>
          <div>
            <ul>
              <li>
                <p>
                  <span>deep {depth()}</span>
                </p>
              </li>
            </ul>
          </div>
        </article>
      </section>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><section><article><div><ul><li><p><span bf="s1">deep <!--bf:s0-->8<!--/--></span></p></li></ul></div></article></section></div>
  `,
})
