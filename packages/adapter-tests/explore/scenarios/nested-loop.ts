/**
 * Scenario: a keyed loop nested inside a keyed loop (#3046, loop nesting
 * depth 2).
 *
 * Inner rows carry `data-key-1`, outer rows `data-key` (`keyAttrName`),
 * so the keyed-identity oracle checks both levels. The actions mix outer
 * edits (add / remove / reverse groups) with an inner edit on the first
 * group, so an inner loop is reconciled both in place and after its
 * outer row has moved.
 */

import type { Scenario } from '../scenario'
import type { Item } from './keyed-loop-inline'

interface Group {
  id: string
  items: Item[]
}

interface State {
  groups: Group[]
  nextId: number
}

type Action = 'addGroup' | 'addItemFirst' | 'removeFirstGroup' | 'reverseGroups' | 'reverseFirstItems'

export const nestedLoop: Scenario<State, Action> = {
  id: 'nested-loop',
  description: 'keyed .map() of groups, each with a keyed .map() of items: outer and inner edits',
  componentName: 'NestedLoop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; label: string }
type Group = { id: string; items: Item[] }
type State = { groups: Group[]; nextId: number }

export function NestedLoop({ initial }: { initial: State }) {
  const [groups, setGroups] = createSignal<Group[]>(initial.groups)
  const [nextId, setNextId] = createSignal(initial.nextId)
  return (
    <div>
      {groups().map(group => (
        <section key={group.id}>
          <h3>{group.id}</h3>
          <ul>
            {group.items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </section>
      ))}
      <button data-action="addGroup" onClick={() => { setGroups([...groups(), { id: 'g' + nextId(), items: [{ id: 'n' + nextId(), label: 'item ' + nextId() }] }]); setNextId(nextId() + 1) }}>addGroup</button>
      <button data-action="addItemFirst" onClick={() => { setGroups(groups().length === 0 ? groups() : [{ ...groups()[0], items: [...groups()[0].items, { id: 'n' + nextId(), label: 'item ' + nextId() }] }, ...groups().slice(1)]); setNextId(nextId() + 1) }}>addItemFirst</button>
      <button data-action="removeFirstGroup" onClick={() => setGroups(groups().slice(1))}>removeFirstGroup</button>
      <button data-action="reverseGroups" onClick={() => setGroups([...groups()].reverse())}>reverseGroups</button>
      <button data-action="reverseFirstItems" onClick={() => setGroups(groups().length === 0 ? groups() : [{ ...groups()[0], items: [...groups()[0].items].reverse() }, ...groups().slice(1)])}>reverseFirstItems</button>
    </div>
  )
}
`,
  initialState: {
    groups: [
      { id: 'g0', items: [{ id: 'n0', label: 'item 0' }, { id: 'n1', label: 'item 1' }] },
      { id: 'g1', items: [{ id: 'n2', label: 'item 2' }] },
    ],
    nextId: 3,
  },
  actions: ['addGroup', 'addItemFirst', 'removeFirstGroup', 'reverseGroups', 'reverseFirstItems'],
  stateSignals: ['groups', 'nextId'],
  reduce(state, action) {
    const { groups, nextId } = state
    const fresh = { id: `n${nextId}`, label: `item ${nextId}` }
    switch (action) {
      case 'addGroup':
        return { groups: [...groups, { id: `g${nextId}`, items: [fresh] }], nextId: nextId + 1 }
      case 'addItemFirst':
        // The handler bumps nextId even with no group to add to; mirror it.
        return {
          groups: groups.length === 0 ? groups : [{ ...groups[0], items: [...groups[0].items, fresh] }, ...groups.slice(1)],
          nextId: nextId + 1,
        }
      case 'removeFirstGroup':
        return { groups: groups.slice(1), nextId }
      case 'reverseGroups':
        return { groups: [...groups].reverse(), nextId }
      case 'reverseFirstItems':
        return {
          groups: groups.length === 0 ? groups : [{ ...groups[0], items: [...groups[0].items].reverse() }, ...groups.slice(1)],
          nextId,
        }
    }
  },
  bounds: { maxDepth: 2 },
}
