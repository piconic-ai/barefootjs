"use client"

import { TriageList } from './index'
import type { TriageItem } from './index'

const items: TriageItem[] = [
  { id: '1', title: 'Fix login redirect loop', status: 'open', priority: 1 },
  { id: '2', title: 'Update billing copy', status: 'done', priority: 4 },
  { id: '3', title: 'Investigate slow query', status: 'open', priority: 2 },
  { id: '4', title: 'Add empty-state illustration', status: 'open', priority: 5 },
  { id: '5', title: 'Migrate logging pipeline', status: 'done', priority: 3 },
  { id: '6', title: 'Refactor toolbar state', status: 'open', priority: 6 },
  { id: '7', title: 'Audit accessibility roles', status: 'open', priority: 7 },
]

/** Default usage: search / filter / sort / select with a coupled toolbar. */
export function Default() {
  return <TriageList items={items} />
}

/** Pre-filtered subset to exercise pagination + selection consistency. */
export function ManyItems() {
  const more: TriageItem[] = Array.from({ length: 23 }, (_, i) => ({
    id: `g${i}`,
    title: `Generated task ${i + 1}`,
    status: i % 3 === 0 ? 'done' : 'open',
    priority: (i % 9) + 1,
  }))
  return <TriageList items={more} />
}
