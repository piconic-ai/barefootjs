"use client"
/**
 * CartDemo Component
 *
 * E-commerce shopping cart with inline quantity editing, item removal,
 * and derived state chain (subtotals → total → discount → final price).
 * Exercises: loop with inline state updates, derived state via createMemo,
 * conditional rendering (empty cart, discount threshold), dynamic list
 * updates (remove item → reconciliation).
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Separator } from '@ui/components/ui/separator'

type CartItem = {
  id: number
  name: string
  price: number
  quantity: number
  image: string
}

const formatPrice = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`

const initialItems: CartItem[] = [
  { id: 1, name: 'Wireless Headphones', price: 7999, quantity: 1, image: '🎧' },
  { id: 2, name: 'USB-C Hub Adapter', price: 3499, quantity: 2, image: '🔌' },
  { id: 3, name: 'Mechanical Keyboard', price: 12999, quantity: 1, image: '⌨️' },
  { id: 4, name: 'Laptop Stand', price: 4999, quantity: 1, image: '💻' },
]

const DISCOUNT_THRESHOLD = 20000  // $200 in cents
const DISCOUNT_RATE = 0.1         // 10%
const TAX_RATE = 0.08             // 8%

export function CartDemo() {
  const [items, setItems] = createSignal<CartItem[]>(initialItems)

  // Derived state chain: subtotal → discount → tax → total
  const subtotal = createMemo(() =>
    items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  )

  const discount = createMemo(() =>
    subtotal() >= DISCOUNT_THRESHOLD ? Math.round(subtotal() * DISCOUNT_RATE) : 0
  )

  const taxableAmount = createMemo(() => subtotal() - discount())

  const tax = createMemo(() => Math.round(taxableAmount() * TAX_RATE))

  const total = createMemo(() => taxableAmount() + tax())

  const itemCount = createMemo(() =>
    items().reduce((sum, item) => sum + item.quantity, 0)
  )

  const updateQuantity = (id: number, delta: number) => {
    setItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
        : item
    ))
  }

  const removeItem = (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Shopping Cart</h3>
        <Badge variant="secondary">{itemCount()} items</Badge>
      </div>

      {/* Cart items + summary — both inside conditional */}
      {items().length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-lg border divide-y">
            {items().map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <span className="text-2xl">{item.image}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{formatPrice(item.price)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateQuantity(item.id, -1)}
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateQuantity(item.id, 1)}
                  >
                    +
                  </Button>
                </div>
                <p className="text-sm font-semibold w-16 text-right">
                  {formatPrice(item.price * item.quantity)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(item.id)}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal())}</span>
              </div>
              {discount() > 0 ? (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount (10%)</span>
                  <span>−{formatPrice(discount())}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (8%)</span>
                <span>{formatPrice(tax())}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatPrice(total())}</span>
              </div>
              {discount() === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add {formatPrice(DISCOUNT_THRESHOLD - subtotal())} more for 10% off
                </p>
              ) : null}
            </div>
            <Button className="w-full">Checkout — {formatPrice(total())}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-2xl mb-2">🛒</p>
          <p className="text-sm text-muted-foreground">Your cart is empty</p>
        </div>
      )}
    </div>
  )
}
