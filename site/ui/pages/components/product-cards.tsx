/**
 * Product Cards Reference Page (/components/product-cards)
 */

import { ProductCardsDemo } from '@/components/product-cards-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export function ProductCards() {
  const [search, setSearch] = createSignal('')
  const [category, setCategory] = createSignal('all')
  const [cart, setCart] = createSignal([])

  const filtered = createMemo(() => {
    return products.filter(p => {
      if (category() !== 'all' && p.category !== category()) return false
      if (search() && !p.name.toLowerCase().includes(search().toLowerCase())) return false
      return true
    })
  })
  const cartTotal = createMemo(() => cart().reduce((s, i) => s + i.product.price * i.quantity, 0))

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1 }]
    })
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <Input value={search()} onInput={e => setSearch(e.target.value)} placeholder="Search..." />
        <div className="grid grid-cols-3 gap-4">
          {filtered().map(product => (
            <Card key={product.id}>
              <CardHeader><CardTitle>{product.name}</CardTitle></CardHeader>
              <CardContent>
                <Badge variant="outline">{product.category}</Badge>
                <span>{formatPrice(product.price)}</span>
              </CardContent>
              <CardFooter>
                <Button onClick={() => addToCart(product)}>Add to Cart</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
      <div className="w-80">
        <Card>
          <CardHeader><CardTitle>Cart ({cart().length})</CardTitle></CardHeader>
          <CardContent>
            {cart().map(item => (
              <div key={item.product.id}>{item.product.name} × {item.quantity}</div>
            ))}
          </CardContent>
          <CardFooter>Subtotal: {formatPrice(cartTotal())}</CardFooter>
        </Card>
      </div>
    </div>
  )
}`

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
  { id: 'filters', title: 'Multi-Signal Filtering', branch: 'start' },
  { id: 'cart', title: 'Cart Operations', branch: 'child' },
  { id: 'view-mode', title: 'View Mode Toggle', branch: 'end' },
]

export function ProductCardsRefPage() {
  return (
    <DocPage slug="product-cards" toc={tocItems}>
      <PageHeader
        title="Product Cards"
        description="E-commerce product grid with multi-signal filtering, cart management, and view mode toggle."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <ProductCardsDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
          <li>3-signal derived memo (search + category + price range)</li>
          <li>Dynamic CSS class from signal (grid vs list layout)</li>
          <li>Per-item cart operations (add, remove, quantity)</li>
          <li>Computed total from array signal</li>
          <li>Free shipping threshold with reactive badge</li>
          <li>Toast notification on add-to-cart</li>
          <li>Inner tag loops inside product cards</li>
          <li>Sale badge and category badge variants</li>
        </ul>
      </Section>

      <Section id="filters" title="Multi-Signal Filtering">
        <p className="text-sm text-muted-foreground">
          Search, category dropdown, and price slider drive a single <code>filteredProducts</code> memo
          from three independent signals.
        </p>
      </Section>

      <Section id="cart" title="Cart Operations">
        <p className="text-sm text-muted-foreground">
          Cart sidebar with quantity controls. Subtotal computed via <code>cartItems().reduce()</code>.
          Free shipping badge appears when total exceeds threshold.
        </p>
      </Section>

      <Section id="view-mode" title="View Mode Toggle">
        <p className="text-sm text-muted-foreground">
          Toggle between grid and list layouts. CSS class changes reactively based on <code>viewMode()</code> signal.
        </p>
      </Section>
    </DocPage>
  )
}
