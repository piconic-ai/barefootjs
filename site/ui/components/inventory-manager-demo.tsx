"use client"
/**
 * InventoryManagerDemo
 *
 * CRUD inventory table with inline editing, undo/redo, search/filter,
 * validation, and aggregate stats.
 *
 * Compiler stress targets:
 * - Per-item conditional rendering: view mode vs edit mode per row
 * - Undo/redo via signal history stack (push/pop array mutations)
 * - createMemo chain: filtered → sorted → aggregates
 * - Controlled input: search + inline edit fields
 * - filter().map() with multi-signal (search + category)
 * - Dynamic class: sort direction indicator, validation error
 * - Batch mutations: add, update, delete items
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

// --- Types ---

type InventoryItem = {
  id: number
  name: string
  category: string
  quantity: number
  price: number
}

type SortField = 'name' | 'category' | 'quantity' | 'price'
type SortDir = 'asc' | 'desc'

// --- Helpers ---

let nextId = 100

const categories = ['Electronics', 'Clothing', 'Food', 'Tools', 'Stationery']

const categoryBadge: Record<string, 'default' | 'secondary' | 'outline'> = {
  Electronics: 'default',
  Clothing: 'secondary',
  Food: 'outline',
  Tools: 'default',
  Stationery: 'secondary',
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

// Initial data
const initialItems: InventoryItem[] = [
  { id: 1, name: 'Laptop', category: 'Electronics', quantity: 12, price: 999.99 },
  { id: 2, name: 'T-Shirt', category: 'Clothing', quantity: 150, price: 19.99 },
  { id: 3, name: 'Coffee Beans', category: 'Food', quantity: 80, price: 14.50 },
  { id: 4, name: 'Hammer', category: 'Tools', quantity: 35, price: 24.99 },
  { id: 5, name: 'Notebook', category: 'Stationery', quantity: 200, price: 4.99 },
  { id: 6, name: 'Headphones', category: 'Electronics', quantity: 45, price: 149.99 },
  { id: 7, name: 'Jacket', category: 'Clothing', quantity: 60, price: 89.99 },
  { id: 8, name: 'Olive Oil', category: 'Food', quantity: 40, price: 8.99 },
]

// --- Component ---

export function InventoryManagerDemo() {
  const [items, setItems] = createSignal<InventoryItem[]>(initialItems)
  const [search, setSearch] = createSignal('')
  const [categoryFilter, setCategoryFilter] = createSignal('All')
  const [sortField, setSortField] = createSignal<SortField>('name')
  const [sortDir, setSortDir] = createSignal<SortDir>('asc')
  const [editingId, setEditingId] = createSignal<number | null>(null)
  const [editName, setEditName] = createSignal('')
  const [editQuantity, setEditQuantity] = createSignal('')
  const [editPrice, setEditPrice] = createSignal('')
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // Undo/redo history
  const [history, setHistory] = createSignal<InventoryItem[][]>([])
  const [future, setFuture] = createSignal<InventoryItem[][]>([])

  const canUndo = createMemo(() => history().length > 0)
  const canRedo = createMemo(() => future().length > 0)

  const pushHistory = (current: InventoryItem[]) => {
    setHistory(prev => [...prev, current])
    setFuture([])
  }

  const undo = () => {
    const h = history()
    if (h.length === 0) return
    const prev = h[h.length - 1]
    setHistory(h.slice(0, -1))
    setFuture(f => [...f, items()])
    setItems(prev)
    setEditingId(null)
    showToast('Undone')
  }

  const redo = () => {
    const f = future()
    if (f.length === 0) return
    const next = f[f.length - 1]
    setFuture(f.slice(0, -1))
    setHistory(h => [...h, items()])
    setItems(next)
    showToast('Redone')
  }

  // Memo chain stage 1: filtered
  const filtered = createMemo(() => {
    const q = search().toLowerCase()
    const cat = categoryFilter()
    return items().filter(item => {
      if (cat !== 'All' && item.category !== cat) return false
      if (q && !item.name.toLowerCase().includes(q)) return false
      return true
    })
  })

  // Memo chain stage 2: sorted
  const sorted = createMemo(() => {
    const field = sortField()
    const dir = sortDir()
    return [...filtered()].sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  })

  // Memo chain stage 3: aggregates
  const totalItems = createMemo(() => filtered().reduce((s, i) => s + i.quantity, 0))
  const totalValue = createMemo(() => filtered().reduce((s, i) => s + i.quantity * i.price, 0))
  const itemCount = createMemo(() => filtered().length)

  // Toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastOpen(true)
  }

  // Sort toggle
  const toggleSort = (field: SortField) => {
    if (sortField() === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // CRUD
  const addItem = () => {
    pushHistory(items())
    const id = nextId++
    const newItem: InventoryItem = {
      id,
      name: 'New Item',
      category: 'Stationery',
      quantity: 0,
      price: 0,
    }
    setItems(prev => [...prev, newItem])
    startEdit(newItem, true)
    showToast('Item added')
  }

  const startEdit = (item: InventoryItem, skipHistory?: boolean) => {
    if (!skipHistory) pushHistory(items())
    setEditingId(item.id)
    setEditName(item.name)
    setEditQuantity(String(item.quantity))
    setEditPrice(String(item.price))
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = () => {
    const id = editingId()
    if (id === null) return
    const qty = parseInt(editQuantity(), 10)
    const price = parseFloat(editPrice())
    if (isNaN(qty) || qty < 0 || isNaN(price) || price < 0) return
    pushHistory(items())
    setItems(prev => prev.map(i => i.id === id ? { ...i, name: editName(), quantity: qty, price } : i))
    setEditingId(null)
    showToast('Item updated')
  }

  const deleteItem = (id: number) => {
    pushHistory(items())
    setItems(prev => prev.filter(i => i.id !== id))
    if (editingId() === id) setEditingId(null)
    showToast('Item deleted')
  }

  // Validation
  const qtyError = createMemo(() => {
    const v = editQuantity()
    if (v === '') return ''
    const n = parseInt(v, 10)
    if (isNaN(n)) return 'Must be a number'
    if (n < 0) return 'Cannot be negative'
    return ''
  })

  const priceError = createMemo(() => {
    const v = editPrice()
    if (v === '') return ''
    const n = parseFloat(v)
    if (isNaN(n)) return 'Must be a number'
    if (n < 0) return 'Cannot be negative'
    return ''
  })

  const hasErrors = createMemo(() => qtyError() !== '' || priceError() !== '')

  return (
    <div className="inventory-page w-full max-w-4xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="undo-btn" onClick={undo} disabled={!canUndo()}>
            Undo
          </Button>
          <Button variant="outline" size="sm" className="redo-btn" onClick={redo} disabled={!canRedo()}>
            Redo
          </Button>
          <Button size="sm" className="add-btn" onClick={addItem}>
            Add Item
          </Button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <Input
          placeholder="Search items..."
          value={search()}
          onInput={(e) => setSearch(e.target.value)}
          className="search-input flex-1"
        />
        <div className="category-filter flex gap-1">
          {['All', ...categories].map(cat => (
            <button
              key={cat}
              className={`cat-btn px-2.5 py-1 text-xs rounded-md border transition-colors ${categoryFilter() === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="stats-bar flex gap-4 text-sm text-muted-foreground">
        <span className="item-count">{itemCount()} items</span>
        <span className="total-qty">{totalItems()} units</span>
        <span className="total-value">{formatCurrency(totalValue())} total</span>
      </div>

      {/* Table */}
      <div className="inventory-table rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sort-name text-left p-3 font-medium cursor-pointer select-none" onClick={() => toggleSort('name')}>
                Name {sortField() === 'name' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="sort-category text-left p-3 font-medium cursor-pointer select-none" onClick={() => toggleSort('category')}>
                Category {sortField() === 'category' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="sort-quantity text-right p-3 font-medium cursor-pointer select-none" onClick={() => toggleSort('quantity')}>
                Qty {sortField() === 'quantity' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="sort-price text-right p-3 font-medium cursor-pointer select-none" onClick={() => toggleSort('price')}>
                Price {sortField() === 'price' ? (sortDir() === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted().map(item => (
              <tr key={item.id} className="inventory-row border-b last:border-0 hover:bg-accent/50 transition-colors">
                <td className="p-3">
                  {editingId() === item.id ? (
                    <Input value={editName()} onInput={(e) => setEditName(e.target.value)} className="edit-name h-8" />
                  ) : (
                    <span className="row-name font-medium">{item.name}</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant={categoryBadge[item.category] || 'outline'} className="row-category">{item.category}</Badge>
                </td>
                <td className="p-3 text-right">
                  {editingId() === item.id ? (
                    <div>
                      <Input value={editQuantity()} onInput={(e) => setEditQuantity(e.target.value)} className="edit-qty h-8 w-20 text-right" />
                      <p className="qty-error text-xs text-destructive mt-0.5">{qtyError()}</p>
                    </div>
                  ) : (
                    <span className="row-qty">{item.quantity}</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {editingId() === item.id ? (
                    <div>
                      <Input value={editPrice()} onInput={(e) => setEditPrice(e.target.value)} className="edit-price h-8 w-24 text-right" />
                      <p className="price-error text-xs text-destructive mt-0.5">{priceError()}</p>
                    </div>
                  ) : (
                    <span className="row-price">{formatCurrency(item.price)}</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {editingId() === item.id ? (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" className="save-btn h-7 text-xs" onClick={saveEdit} disabled={hasErrors()}>Save</Button>
                      <Button variant="outline" size="sm" className="cancel-btn h-7 text-xs" onClick={cancelEdit}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex gap-1 justify-end">
                      <Button variant="outline" size="sm" className="edit-btn h-7 text-xs" onClick={() => startEdit(item)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="delete-btn h-7 text-xs text-destructive" onClick={() => deleteItem(item.id)}>Delete</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {sorted().length === 0 ? (
        <div className="empty-state text-center py-8">
          <p className="text-4xl mb-2">📦</p>
          <p className="text-sm text-muted-foreground">No items found</p>
        </div>
      ) : null}

      {/* Toast */}
      <ToastProvider position="bottom-right">
        <Toast variant="default" open={toastOpen()} duration={2000} onOpenChange={setToastOpen}>
          <div className="flex-1">
            <ToastTitle>Inventory</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
