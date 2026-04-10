import { createFixture } from '../src/types'

/**
 * Tests nested loop param wrapping: inner loop param (task)
 * must be wrapped as signal accessor (task().name) in templates.
 */
export const fixture = createFixture({
  id: 'map-nested',
  description: 'Nested loop with inner param expressions',
  source: `
'use client'
import { createSignal } from '@barefootjs/dom'
type Group = { id: string; items: { id: number; name: string }[] }
export function MapNested() {
  const [groups, setGroups] = createSignal<Group[]>([])
  return (
    <div>
      {groups().map(group => (
        <div key={group.id}>
          <h3>{group.id}</h3>
          <ul>
            {group.items.map(item => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3"></div>
  `,
})
