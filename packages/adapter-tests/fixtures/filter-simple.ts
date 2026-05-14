import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'filter-simple',
  description: 'Filter by boolean field then map',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Todo = { text: string; done: boolean }
export function FilterSimple() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  return <ul>{todos().filter(t => t.done).map((t, i) => <li key={i}>{t.text}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
