"use client"
/**
 * FieldArraysDemo Components
 *
 * Dynamic array fields. createForm targets fixed-shape records, so the array
 * is a raw signal — but the per-item rule reuses the same Zod schema you'd
 * pass to createForm.
 *
 * Note: signal-based loops use native HTML inputs/buttons rather than the
 * `<Input>` / `<Button>` components — components cannot be created from a
 * loop template (see html-template.ts).
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@ui/components/ui/button'
import { z } from 'zod'

// Shared per-item schema — same shape you'd nest inside createForm
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format')

function validateEmail(value: string): string {
  const result = emailSchema.safeParse(value)
  return result.success ? '' : result.error.issues[0]?.message ?? ''
}

type Item = { id: number; value: string; touched: boolean }

let nextItemId = 1
const newItem = (): Item => ({ id: nextItemId++, value: '', touched: false })

const inputClasses = 'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'

const removeButtonClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-action-manipulation bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 size-9'

/**
 * Basic field array — schema-driven per-item validation.
 */
export function BasicFieldArrayDemo() {
  const [items, setItems] = createSignal<Item[]>([newItem()])
  const [submitAttempted, setSubmitAttempted] = createSignal(false)
  const [submitted, setSubmitted] = createSignal<string[] | null>(null)

  const itemError = (item: Item): string => {
    if (!item.touched && !submitAttempted()) return ''
    return validateEmail(item.value)
  }

  const handleAdd = () => {
    setItems([...items(), newItem()])
  }

  const handleRemove = (id: number) => {
    if (items().length > 1) {
      setItems(items().filter((it) => it.id !== id))
    }
  }

  const handleChange = (id: number, value: string) => {
    setItems(items().map((it) => (it.id === id ? { ...it, value } : it)))
  }

  const handleBlur = (id: number) => {
    setItems(items().map((it) => (it.id === id ? { ...it, touched: true } : it)))
  }

  const handleSubmit = () => {
    setSubmitAttempted(true)
    if (items().every((it) => validateEmail(it.value) === '')) {
      setSubmitted(items().map((it) => it.value))
    }
  }

  return (
    <div className="space-y-4">
      {submitted() ? (
        <div className="success-message p-4 bg-success/10 border border-success rounded-lg">
          <p className="text-success font-medium">Emails submitted successfully!</p>
          <p className="text-sm text-muted-foreground mt-2">{submitted()!.join(', ')}</p>
        </div>
      ) : null}

      <div className="field-list space-y-3">
        {items().map((item, index) => (
          <div key={item.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={item.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(item.id, (e.target as HTMLInputElement).value)}
                onBlur={() => handleBlur(item.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{itemError(item)}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={items().length <= 1}
              onClick={() => handleRemove(item.id)}
            >
              X
            </button>
          </div>
        ))}
      </div>

      {!submitted() ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAdd}>
            + Add Email
          </Button>
          <Button onClick={handleSubmit}>Submit</Button>
        </div>
      ) : null}

      {!submitted() ? (
        <p className="field-count text-sm text-muted-foreground">
          {items().length} email(s) added
        </p>
      ) : null}
    </div>
  )
}

/**
 * Duplicate detection — same per-item rule plus a cross-item check.
 */
export function DuplicateValidationDemo() {
  const [items, setItems] = createSignal<Item[]>([
    newItem(),
    newItem(),
  ])

  const duplicateCount = createMemo(() => {
    const values = items().map((it) => it.value.toLowerCase().trim()).filter((v) => v !== '')
    return values.length - new Set(values).size
  })

  const itemError = (item: Item): string => {
    if (!item.touched) return ''
    const basic = validateEmail(item.value)
    if (basic) return basic
    const lower = item.value.toLowerCase()
    const isDup = items().some((other) => other.id !== item.id && other.value.toLowerCase() === lower)
    return isDup ? 'Duplicate email' : ''
  }

  const handleAdd = () => {
    setItems([...items(), newItem()])
  }

  const handleRemove = (id: number) => {
    if (items().length > 1) {
      setItems(items().filter((it) => it.id !== id))
    }
  }

  const handleChange = (id: number, value: string) => {
    setItems(items().map((it) => (it.id === id ? { ...it, value } : it)))
  }

  const handleBlur = (id: number) => {
    setItems(items().map((it) => (it.id === id ? { ...it, touched: true } : it)))
  }

  return (
    <div className="space-y-4">
      <div className="field-list space-y-3">
        {items().map((item, index) => (
          <div key={item.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={item.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(item.id, (e.target as HTMLInputElement).value)}
                onBlur={() => handleBlur(item.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{itemError(item)}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={items().length <= 1}
              onClick={() => handleRemove(item.id)}
            >
              X
            </button>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={handleAdd}>
        + Add Email
      </Button>

      {duplicateCount() > 0 ? (
        <p className="duplicate-warning text-sm text-warning">
          {duplicateCount()} duplicate email(s) detected
        </p>
      ) : null}
    </div>
  )
}

/**
 * Min/max constraints — derived from `items().length`.
 */
export function MinMaxFieldsDemo() {
  const MIN_FIELDS = 1
  const MAX_FIELDS = 5

  const [items, setItems] = createSignal<Item[]>([newItem()])
  const canAdd = createMemo(() => items().length < MAX_FIELDS)
  const canRemove = createMemo(() => items().length > MIN_FIELDS)

  const itemError = (item: Item): string => {
    if (!item.touched) return ''
    return validateEmail(item.value)
  }

  const handleAdd = () => {
    if (canAdd()) {
      setItems([...items(), newItem()])
    }
  }

  const handleRemove = (id: number) => {
    if (canRemove()) {
      setItems(items().filter((it) => it.id !== id))
    }
  }

  const handleChange = (id: number, value: string) => {
    setItems(items().map((it) => (it.id === id ? { ...it, value } : it)))
  }

  const handleBlur = (id: number) => {
    setItems(items().map((it) => (it.id === id ? { ...it, touched: true } : it)))
  }

  return (
    <div className="space-y-4">
      <div className="field-list space-y-3">
        {items().map((item, index) => (
          <div key={item.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={item.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(item.id, (e.target as HTMLInputElement).value)}
                onBlur={() => handleBlur(item.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{itemError(item)}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={!canRemove()}
              onClick={() => handleRemove(item.id)}
            >
              X
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleAdd} disabled={!canAdd()}>
          + Add Email
        </Button>
        <p className="field-count text-sm text-muted-foreground">
          {items().length} / {MAX_FIELDS} emails
        </p>
      </div>

      {!canAdd() ? (
        <p className="max-warning text-sm text-warning">
          Maximum {MAX_FIELDS} emails allowed
        </p>
      ) : null}
    </div>
  )
}
