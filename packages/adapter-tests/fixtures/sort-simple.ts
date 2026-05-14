import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'sort-simple',
  description: 'Simple subtraction sort then map',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Product = { name: string; price: number }
export function SortSimple() {
  const [products, setProducts] = createSignal<Product[]>([])
  return <ul>{products().sort((a, b) => a.price - b.price).map((p, i) => <li key={i}>{p.name}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
