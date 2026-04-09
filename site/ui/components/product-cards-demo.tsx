"use client"
/**
 * ProductCardsDemo
 *
 * E-commerce product grid with multi-signal filtering, cart state,
 * view mode toggle, quick-view dialog, and toast notifications.
 *
 * Compiler stress targets:
 * - Derived state from 3 signals (search + category + priceRange)
 * - Dynamic CSS class from signal (viewMode → grid layout)
 * - Per-item cart operations (add/remove/quantity)
 * - Computed total from array signal (cartItems reduce)
 * - Toast notification triggered by action
 * - Dialog with dynamic content (selectedProduct)
 * - Inner loops (tags.map inside products.map)
 * - Badge variants from data (category, "Sale")
 * - Empty state conditional
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { Separator } from '@ui/components/ui/separator'
import { Slider } from '@ui/components/ui/slider'
import { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose } from '@ui/components/ui/toast'

// --- Types ---

type Category = 'electronics' | 'accessories' | 'wearables' | 'home'

type Product = {
  id: number
  name: string
  description: string
  price: number
  originalPrice: number
  category: Category
  rating: number
  reviewCount: number
  tags: string[]
  image: string
  inStock: boolean
}

type CartItem = {
  product: Product
  quantity: number
}

// --- Constants ---

const PRICE_MAX = 300
const FREE_SHIPPING_THRESHOLD = 10000

const categoryBadgeVariant = {
  electronics: 'default',
  accessories: 'secondary',
  wearables: 'outline',
  home: 'secondary',
} as const

// --- Mock Data ---

const allProducts: Product[] = [
  { id: 1, name: 'Wireless Headphones', description: 'Premium noise-cancelling over-ear headphones', price: 19900, originalPrice: 24900, category: 'electronics', rating: 5, reviewCount: 342, tags: ['bluetooth', 'noise-cancelling'], image: '🎧', inStock: true },
  { id: 2, name: 'Smart Watch Pro', description: 'Fitness tracker with heart rate and GPS', price: 29900, originalPrice: 29900, category: 'wearables', rating: 4, reviewCount: 215, tags: ['fitness', 'gps'], image: '⌚', inStock: true },
  { id: 3, name: 'USB-C Hub', description: '7-in-1 multiport adapter for laptops', price: 4900, originalPrice: 5900, category: 'accessories', rating: 4, reviewCount: 178, tags: ['usb-c', 'adapter'], image: '🔌', inStock: true },
  { id: 4, name: 'Mechanical Keyboard', description: 'RGB backlit with Cherry MX switches', price: 12900, originalPrice: 12900, category: 'electronics', rating: 5, reviewCount: 567, tags: ['rgb', 'cherry-mx'], image: '⌨️', inStock: true },
  { id: 5, name: 'Desk Lamp', description: 'LED desk lamp with adjustable color temperature', price: 3900, originalPrice: 4900, category: 'home', rating: 4, reviewCount: 89, tags: ['led', 'adjustable'], image: '💡', inStock: true },
  { id: 6, name: 'Phone Case', description: 'Slim protective case with MagSafe support', price: 2900, originalPrice: 2900, category: 'accessories', rating: 3, reviewCount: 445, tags: ['magsafe', 'slim'], image: '📱', inStock: true },
  { id: 7, name: 'Fitness Band', description: 'Lightweight activity tracker with sleep monitoring', price: 7900, originalPrice: 9900, category: 'wearables', rating: 4, reviewCount: 312, tags: ['fitness', 'sleep'], image: '💪', inStock: false },
  { id: 8, name: 'Wireless Charger', description: 'Fast wireless charging pad for Qi devices', price: 2400, originalPrice: 2400, category: 'electronics', rating: 4, reviewCount: 201, tags: ['wireless', 'fast-charge'], image: '🔋', inStock: true },
  { id: 9, name: 'Standing Desk Mat', description: 'Anti-fatigue mat for standing desks', price: 4500, originalPrice: 5500, category: 'home', rating: 5, reviewCount: 156, tags: ['ergonomic'], image: '🧘', inStock: true },
  { id: 10, name: 'Camera Strap', description: 'Adjustable woven camera neck strap', price: 1900, originalPrice: 1900, category: 'accessories', rating: 4, reviewCount: 67, tags: ['adjustable'], image: '📷', inStock: true },
  { id: 11, name: 'Smart Speaker', description: 'Voice assistant with premium sound', price: 9900, originalPrice: 12900, category: 'electronics', rating: 4, reviewCount: 423, tags: ['voice', 'speaker'], image: '🔊', inStock: true },
  { id: 12, name: 'Yoga Mat', description: 'Non-slip exercise mat with carrying strap', price: 3400, originalPrice: 3400, category: 'home', rating: 5, reviewCount: 289, tags: ['exercise', 'non-slip'], image: '🧘‍♀️', inStock: true },
]

// --- Helpers ---

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

// --- Component ---

export function ProductCardsDemo() {
  // Signals
  const [searchQuery, setSearchQuery] = createSignal('')
  const [categoryFilter, setCategoryFilter] = createSignal('all')
  const [priceRange, setPriceRange] = createSignal(PRICE_MAX)
  const [viewMode, setViewMode] = createSignal<'grid' | 'list'>('grid')
  const [cartItems, setCartItems] = createSignal<CartItem[]>([])
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // 3-signal derived memo
  const filteredProducts = createMemo(() => {
    const query = searchQuery().toLowerCase()
    const category = categoryFilter()
    const maxPrice = priceRange() * 100
    return allProducts.filter(p => {
      if (category !== 'all' && p.category !== category) return false
      if (p.price > maxPrice) return false
      if (query && !p.name.toLowerCase().includes(query) && !p.tags.some(t => t.includes(query))) return false
      return true
    })
  })

  // Cart memos
  const cartTotal = createMemo(() => cartItems().reduce((sum, item) => sum + item.product.price * item.quantity, 0))
  const cartCount = createMemo(() => cartItems().reduce((sum, item) => sum + item.quantity, 0))

  // Cart handlers
  const addToCart = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, { product, quantity: 1 }]
    })
    setToastMessage(`${product.name} added to cart`)
    setToastOpen(true)
  }

  const removeFromCart = (productId: number) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId))
  }

  const updateQuantity = (productId: number, delta: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id !== productId) return item
      const newQty = Math.max(1, item.quantity + delta)
      return { ...item, quantity: newQty }
    }))
  }

  return (
    <div className="w-full min-w-0 space-y-6">

      {/* === FILTER BAR === */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products..."
          className="product-search flex-1 max-w-xs"
        />
        <Select value={categoryFilter()} onValueChange={setCategoryFilter}>
          <SelectTrigger className="category-filter w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="electronics">Electronics</SelectItem>
            <SelectItem value="accessories">Accessories</SelectItem>
            <SelectItem value="wearables">Wearables</SelectItem>
            <SelectItem value="home">Home</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Max: {formatPrice(priceRange() * 100)}</span>
          <Slider
            value={priceRange()}
            min={0}
            max={PRICE_MAX}
            onValueChange={setPriceRange}
            className="price-slider w-32"
          />
        </div>
        <Button
          variant={viewMode() === 'list' ? 'default' : 'outline'}
          size="sm"
          className="view-toggle"
          onClick={() => setViewMode(viewMode() === 'grid' ? 'list' : 'grid')}
        >
          {viewMode() === 'grid' ? '☰ List' : '⊞ Grid'}
        </Button>
      </div>

      {/* Results count */}
      <p className="product-count text-sm text-muted-foreground">{filteredProducts().length} products</p>

      {/* === MAIN CONTENT === */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* --- Product Grid/List --- */}
        <div className="flex-1 min-w-0">
          {/* Dynamic CSS class from signal */}
          <div className={viewMode() === 'grid'
            ? 'product-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
            : 'product-grid grid grid-cols-1 gap-3'}>
            {filteredProducts().map(product => (
              <Card key={product.id} className="product-card">
                <CardHeader className="pb-2">
                  <div className="text-4xl mb-2">{product.image}</div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="product-name text-sm">{product.name}</CardTitle>
                    {product.originalPrice > product.price ? (
                      <Badge variant="destructive" className="sale-badge text-xs">Sale</Badge>
                    ) : null}
                  </div>
                  <CardDescription className="text-xs">{product.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={categoryBadgeVariant[product.category]} className="category-badge text-xs">{product.category}</Badge>
                    {/* Inner loop: tags */}
                    {product.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="tag-badge text-xs">{tag}</Badge>
                    ))}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="product-price font-bold">{formatPrice(product.price)}</span>
                    {product.originalPrice > product.price ? (
                      <span className="text-xs text-muted-foreground line-through">{formatPrice(product.originalPrice)}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="product-rating text-amber-500">{stars(product.rating)}</span>
                    <span className="text-muted-foreground">({product.reviewCount})</span>
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button
                    size="sm"
                    className="add-to-cart-btn"
                    disabled={!product.inStock}
                    onClick={() => addToCart(product)}
                  >
                    {product.inStock ? 'Add to Cart' : 'Out of Stock'}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          {/* Empty state */}
          {filteredProducts().length === 0 ? (
            <div className="product-empty text-center py-12 text-muted-foreground">
              <p className="text-lg">No products match your filters</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : null}
        </div>

        {/* --- Cart Sidebar --- */}
        <div className="w-full lg:w-80 shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Cart</CardTitle>
                <Badge variant="secondary" className="cart-count">{cartCount()} items</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartItems().length === 0 ? (
                <p className="cart-empty text-sm text-muted-foreground text-center py-4">Your cart is empty</p>
              ) : null}

              <div className="cart-items space-y-2">
              {cartItems().map(item => (
                <div key={item.product.id} className="cart-item flex items-center gap-2">
                  <span className="text-xl">{item.product.image}</span>
                  <div className="flex-1 min-w-0">
                    <p className="cart-item-name text-sm font-medium truncate">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPrice(item.product.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-6 w-6 p-0 qty-minus" onClick={() => updateQuantity(item.product.id, -1)}>-</Button>
                    <span className="cart-item-qty text-sm w-6 text-center">{item.quantity}</span>
                    <Button variant="outline" size="sm" className="h-6 w-6 p-0 qty-plus" onClick={() => updateQuantity(item.product.id, 1)}>+</Button>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-xs text-destructive remove-btn" onClick={() => removeFromCart(item.product.id)}>×</Button>
                </div>
              ))}
              </div>
            </CardContent>
            {cartItems().length > 0 ? (
              <div>
                <Separator />
                <CardFooter className="flex-col items-stretch gap-2 pt-4">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Subtotal</span>
                    <span className="cart-total text-sm font-bold">{formatPrice(cartTotal())}</span>
                  </div>
                  {cartTotal() >= FREE_SHIPPING_THRESHOLD ? (
                    <Badge variant="default" className="free-shipping self-start">Free Shipping</Badge>
                  ) : (
                    <p className="shipping-message text-xs text-muted-foreground">
                      Add {formatPrice(FREE_SHIPPING_THRESHOLD - cartTotal())} more for free shipping
                    </p>
                  )}
                </CardFooter>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {/* === TOAST === */}
      <ToastProvider position="bottom-right">
        <Toast open={toastOpen()} onOpenChange={setToastOpen} variant="default" duration={3000}>
          <ToastTitle>Added to Cart</ToastTitle>
          <ToastDescription>{toastMessage()}</ToastDescription>
          <ToastClose />
        </Toast>
      </ToastProvider>
    </div>
  )
}
