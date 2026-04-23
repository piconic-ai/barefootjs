"use client"
/**
 * ShopCheckoutDemo
 *
 * Gallery-specific checkout for /gallery/shop/checkout.
 * 3-step checkout flow: Shipping → Payment → Review & Confirm.
 * Exercises: multi-branch conditional rendering, composite loop inside
 * conditional (#724), controlled RadioGroup/Select, shared signals across
 * branches, derived validation memos, conditional inside loop.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Label } from '@ui/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@ui/components/ui/radio-group'
import { Separator } from '@ui/components/ui/separator'

type OrderItem = {
  id: number
  name: string
  price: number
  quantity: number
}

const formatPrice = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`

const initialItems: OrderItem[] = [
  { id: 1, name: 'Wireless Headphones', price: 7999, quantity: 1 },
  { id: 2, name: 'USB-C Hub Adapter', price: 3499, quantity: 2 },
  { id: 3, name: 'Mechanical Keyboard', price: 12999, quantity: 1 },
]

const SHIPPING_STANDARD = 599
const SHIPPING_EXPRESS = 1499
const FREE_SHIPPING_THRESHOLD = 15000
const TAX_RATE = 0.08

const steps = [
  { id: 1, title: 'Shipping' },
  { id: 2, title: 'Payment' },
  { id: 3, title: 'Confirm' },
]

export function ShopCheckoutDemo() {
  const [step, setStep] = createSignal(1)
  const [orderPlaced, setOrderPlaced] = createSignal(false)

  // Shipping form
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [address, setAddress] = createSignal('')
  const [city, setCity] = createSignal('')
  const [zip, setZip] = createSignal('')
  const [country, setCountry] = createSignal('')
  const [shippingMethod, setShippingMethod] = createSignal('standard')

  // Payment form
  const [paymentMethod, setPaymentMethod] = createSignal('credit-card')
  const [cardNumber, setCardNumber] = createSignal('')
  const [cardExpiry, setCardExpiry] = createSignal('')
  const [cardCvc, setCardCvc] = createSignal('')

  const [items, setItems] = createSignal<OrderItem[]>(initialItems)

  const emailValid = createMemo(() => {
    const v = email()
    return v.length > 0 && v.includes('@') && v.includes('.')
  })

  const shippingValid = createMemo(() =>
    name().length > 0
    && emailValid()
    && address().length > 0
    && city().length > 0
    && zip().length > 0
    && country().length > 0
  )

  const cardValid = createMemo(() =>
    cardNumber().replace(/\s/g, '').length >= 13
    && cardExpiry().length >= 4
    && cardCvc().length >= 3
  )

  const paymentValid = createMemo(() =>
    paymentMethod() === 'paypal' || cardValid()
  )

  const subtotal = createMemo(() =>
    items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  )

  const shippingCost = createMemo(() => {
    if (subtotal() >= FREE_SHIPPING_THRESHOLD) return 0
    return shippingMethod() === 'express' ? SHIPPING_EXPRESS : SHIPPING_STANDARD
  })

  const tax = createMemo(() => Math.round(subtotal() * TAX_RATE))

  const total = createMemo(() => subtotal() + shippingCost() + tax())

  const removeItem = (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const handlePlaceOrder = () => {
    setOrderPlaced(true)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Step indicator */}
      <div className="checkout-steps flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            {i > 0 ? (
              <div className="h-px w-6 bg-border" />
            ) : null}
            <button
              className={`checkout-step flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${step() >= s.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              data-step={s.id}
              data-active={step() >= s.id ? 'true' : 'false'}
              onClick={() => { if (s.id < step()) setStep(s.id) }}
            >
              {s.id}
            </button>
            <span className={`text-sm ${step() === s.id ? 'font-medium' : 'text-muted-foreground'}`}>
              {s.title}
            </span>
          </div>
        ))}
      </div>

      <Separator />

      {/* Step content — multi-branch conditional */}
      {orderPlaced() ? (
        <div className="checkout-success rounded-lg border p-8 text-center space-y-3">
          <p className="text-3xl">🎉</p>
          <p className="checkout-success-msg text-lg font-semibold">Order Placed!</p>
          <p className="text-sm text-muted-foreground">
            Confirmation sent to {email()}
          </p>
          <p className="text-sm font-medium">Total: {formatPrice(total())}</p>
          <Button variant="outline" onClick={() => { setOrderPlaced(false); setStep(1) }}>
            Start New Order
          </Button>
        </div>
      ) : step() === 1 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Shipping Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                placeholder="John Doe"
                value={name()}
                onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                placeholder="john@example.com"
                value={email()}
                onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              placeholder="123 Main St"
              value={address()}
              onInput={(e: Event) => setAddress((e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                placeholder="New York"
                value={city()}
                onInput={(e: Event) => setCity((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ZIP Code</Label>
              <Input
                placeholder="10001"
                value={zip()}
                onInput={(e: Event) => setZip((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={country()}
                onChange={(e: Event) => setCountry((e.target as HTMLSelectElement).value)}
              >
                <option value="">Select...</option>
                <option value="us">United States</option>
                <option value="ca">Canada</option>
                <option value="uk">United Kingdom</option>
                <option value="de">Germany</option>
                <option value="jp">Japan</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Shipping Method</Label>
            <RadioGroup value={shippingMethod()} onValueChange={setShippingMethod}>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="standard" />
                <div>
                  <p className="text-sm font-medium">Standard</p>
                  <p className="text-xs text-muted-foreground">
                    {subtotal() >= FREE_SHIPPING_THRESHOLD ? 'Free' : formatPrice(SHIPPING_STANDARD)} · 5-7 business days
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="express" />
                <div>
                  <p className="text-sm font-medium">Express</p>
                  <p className="text-xs text-muted-foreground">
                    {subtotal() >= FREE_SHIPPING_THRESHOLD ? 'Free' : formatPrice(SHIPPING_EXPRESS)} · 2-3 business days
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-end">
            <Button className="checkout-continue" disabled={!shippingValid()} onClick={() => setStep(2)}>
              Continue to Payment
            </Button>
          </div>
        </div>
      ) : step() === 2 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Payment Method</h3>

          <RadioGroup value={paymentMethod()} onValueChange={setPaymentMethod}>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <RadioGroupItem value="credit-card" />
              <div>
                <p className="text-sm font-medium">Credit Card</p>
                <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <RadioGroupItem value="paypal" />
              <div>
                <p className="text-sm font-medium">PayPal</p>
                <p className="text-xs text-muted-foreground">Pay with your PayPal account</p>
              </div>
            </div>
          </RadioGroup>

          {paymentMethod() === 'credit-card' ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>Card Number</Label>
                <Input
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber()}
                  onInput={(e: Event) => setCardNumber((e.target as HTMLInputElement).value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Expiry</Label>
                  <Input
                    placeholder="MM/YY"
                    value={cardExpiry()}
                    onInput={(e: Event) => setCardExpiry((e.target as HTMLInputElement).value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CVC</Label>
                  <Input
                    placeholder="123"
                    value={cardCvc()}
                    onInput={(e: Event) => setCardCvc((e.target as HTMLInputElement).value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4 text-center">
              <p className="text-sm text-muted-foreground">
                You will be redirected to PayPal after confirmation.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!paymentValid()} onClick={() => setStep(3)}>
              Review Order
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Review Order</h3>

          {items().length > 0 ? (
            <div className="rounded-lg border divide-y">
              {items().map(item => (
                <div key={item.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.quantity > 1 ? (
                      <Badge variant="secondary">×{item.quantity}</Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No items</p>
          )}

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">Ship to</p>
            <p className="text-sm text-muted-foreground">
              {name()}, {address()}, {city()} {zip()}
            </p>
            <p className="text-sm text-muted-foreground">
              {shippingMethod() === 'express' ? 'Express' : 'Standard'} shipping
              {email() ? ` · ${email()}` : ''}
            </p>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">Pay with</p>
            <p className="text-sm text-muted-foreground">
              {paymentMethod() === 'credit-card'
                ? `Card ending in ${cardNumber().slice(-4) || '····'}`
                : 'PayPal'}
            </p>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(subtotal())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>{shippingCost() === 0 ? 'Free' : formatPrice(shippingCost())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatPrice(tax())}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="checkout-total">{formatPrice(total())}</span>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button className="place-order-btn" onClick={handlePlaceOrder}>
              Place Order — {formatPrice(total())}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
