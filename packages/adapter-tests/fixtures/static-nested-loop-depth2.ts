import { createFixture } from '../src/types'

/**
 * #2893's recursive design covers arbitrarily deep static nesting, not just
 * one level — `analyzeBakeableStaticElementLoop` recurses into a nested
 * `loop` node through the SAME function, accumulating each level's item
 * binding into one map. This fixture exercises THREE static levels (the
 * two-level `static-nested-loop-plain` fixture only proves depth 1), with
 * the innermost row reading BOTH its own item AND the two outer items'
 * fields — proving the merged-bindings change (`staticLoopBindings()` on
 * the render side folding the whole `staticLoopItemStack`, not just its
 * innermost entry).
 */
export const fixture = createFixture({
  id: 'static-nested-loop-depth2',
  description: 'three levels of static nested .map() bake on the Go template adapter, inner rows reading every enclosing item (#2893)',
  source: `
type Grandchild = { id: number }
type Child = { id: number; grandchildren: Grandchild[] }
type Item = { id: number; children: Child[] }

export function StaticNestedLoopDepth2() {
  const items: Item[] = [
    {
      id: 1,
      children: [
        { id: 11, grandchildren: [{ id: 111 }, { id: 112 }] },
      ],
    },
  ]
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <ul key={child.id}>
              {child.grandchildren.map(gc => (
                <li key={gc.id}>{item.id}-{child.id}-{gc.id}</li>
              ))}
            </ul>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s5"><li bf="s4" data-key="1"><ul bf="s3" data-key-1="11"><li data-key-2="111"><!--bf:s0-->1<!--/-->-<!--bf:s1-->11<!--/-->-<!--bf:s2-->111<!--/--></li><li data-key-2="112"><!--bf:s0-->1<!--/-->-<!--bf:s1-->11<!--/-->-<!--bf:s2-->112<!--/--></li></ul></li></ul>
  `,
})
