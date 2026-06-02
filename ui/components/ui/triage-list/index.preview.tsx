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

const manyItems: TriageItem[] = [
  { id: 'a', title: 'Triage inbound support tickets', status: 'open', priority: 2 },
  { id: 'b', title: 'Roll back failed deploy', status: 'open', priority: 1 },
  { id: 'c', title: 'Write incident postmortem', status: 'done', priority: 8 },
  { id: 'd', title: 'Tune cache eviction policy', status: 'open', priority: 5 },
  { id: 'e', title: 'Deprecate legacy endpoint', status: 'done', priority: 9 },
  { id: 'f', title: 'Add rate limiting to API', status: 'open', priority: 3 },
  { id: 'g', title: 'Localize onboarding flow', status: 'open', priority: 6 },
  { id: 'h', title: 'Fix flaky e2e test', status: 'done', priority: 4 },
  { id: 'i', title: 'Upgrade build toolchain', status: 'open', priority: 7 },
  { id: 'j', title: 'Document signal graph API', status: 'open', priority: 5 },
  { id: 'k', title: 'Reduce bundle size', status: 'open', priority: 2 },
  { id: 'l', title: 'Audit third-party scripts', status: 'done', priority: 9 },
]

/** Larger set to exercise pagination + selection consistency. */
export function ManyItems() {
  return <TriageList items={manyItems} />
}
