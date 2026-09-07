'use client'

// Test fixture (#2865): a nested `.map()` whose ARRAY does not reference
// the outer loop's item at all — it reads an independent component
// signal shared by every outer row, rather than something derived from
// `row`.
//
// Before the fix, `build-inner-loop.ts` decided "reactive vs static" for
// a nested loop purely by checking whether its array textually referenced
// the OUTER loop's item (`refsParent`). Since `tags()` here never mentions
// `row`, every row's inner loop was classified "static" and emitted as a
// hydration-only `forEach` over the SSR-rendered `<li>`s — it never wired
// a `mapArray`/`createEffect` at all. Appending a tag updated the `tags`
// signal but the DOM never reflected it, in EITHER row.
//
// The fix removes the reactive/static fork entirely: every nested loop
// now gets the full reactive `mapArray` emission regardless of what its
// array depends on. A `mapArray` over a genuinely non-reactive array
// would just subscribe to nothing and run once — here the array IS
// reactive, so both rows' tag lists must grow when "Add tag" is clicked.

import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

export function NestedLoopIndependentSignal() {
  const [rows] = createSignal<Row[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
  ])
  const [tags, setTags] = createSignal<string[]>(['a', 'b'])

  const addTag = () => {
    setTags(prev => [...prev, String.fromCharCode(97 + prev.length)])
  }

  return (
    <div>
      <button type="button" class="add-tag" onClick={addTag}>
        Add tag
      </button>
      <ul class="rows">
        {rows().map(row => (
          <li key={row.id}>
            <span class="label">{row.label}</span>
            <ul class="tags">
              {tags().map(t => (
                <li key={t} class="tag">{t}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
