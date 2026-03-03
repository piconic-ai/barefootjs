"use client"
/**
 * FieldArraysDemo Components
 *
 * Interactive demos for dynamic form field array patterns.
 * Demonstrates add/remove fields, per-item validation, and cross-field validation.
 *
 * Note: Signal-based loops use native HTML elements instead of components
 * to ensure correct client-side rendering. Components cannot be dynamically
 * created from loop templates. See html-template.ts for details.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Button } from '@ui/components/ui/button'

/**
 * Static list demo - static array with onClick on plain elements (#537)
 * Verifies that event delegation works for static (non-signal) arrays.
 */
export function StaticListDemo() {
  const options = ['Alpha', 'Beta', 'Gamma']
  const [selected, setSelected] = createSignal('Alpha')

  return (
    <div>
      <div className="static-list flex gap-2">
        {options.map(opt => (
          <button
            type="button"
            data-slot="button"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all border px-3 h-9 hover:bg-accent"
            onClick={() => setSelected(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="selected-value text-sm text-muted-foreground mt-2">Selected: {selected()}</p>
    </div>
  )
}

type EmailField = {
  id: number
  value: string
  touched: boolean
  error: string
}

// Input styles (matching @ui/components/ui/input)
const inputClasses = 'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'

// Remove button styles (matching @ui/components/ui/button variant=destructive size=icon)
const removeButtonClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive touch-action-manipulation bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 size-9'

/**
 * Validates an email and returns error message
 */
function validateEmail(email: string): string {
  if (email.trim() === '') return 'Email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format'
  return ''
}

/**
 * Creates a field with computed error
 */
function createField(id: number, value: string = '', touched: boolean = false): EmailField {
  return {
    id,
    value,
    touched,
    error: touched ? validateEmail(value) : '',
  }
}

/**
 * Basic field array demo - add/remove email fields with per-field validation
 */
export function BasicFieldArrayDemo() {
  const [fields, setFields] = createSignal<EmailField[]>([
    { id: 1, value: '', touched: false, error: '' }
  ])
  const [nextId, setNextId] = createSignal(2)
  const [submitted, setSubmitted] = createSignal(false)

  const isFormValid = createMemo(() => {
    return fields().every(f => validateEmail(f.value) === '')
  })

  const handleAdd = () => {
    setFields([...fields(), createField(nextId(), '', false)])
    setNextId(nextId() + 1)
  }

  const handleRemove = (id: number) => {
    if (fields().length > 1) {
      setFields(fields().filter(f => f.id !== id))
    }
  }

  const handleChange = (id: number, value: string) => {
    setFields(fields().map(f => {
      if (f.id !== id) return f
      const error = f.touched ? validateEmail(value) : ''
      return { ...f, value, error }
    }))
  }

  const handleBlur = (id: number) => {
    setFields(fields().map(f => {
      if (f.id !== id) return f
      return { ...f, touched: true, error: validateEmail(f.value) }
    }))
  }

  const handleSubmit = () => {
    setFields(fields().map(f => ({
      ...f,
      touched: true,
      error: validateEmail(f.value),
    })))
    if (isFormValid()) {
      setSubmitted(true)
    }
  }

  return (
    <div className="space-y-4">
      {submitted() ? (
        <div className="success-message p-4 bg-success/10 border border-success rounded-lg">
          <p className="text-success font-medium">Emails submitted successfully!</p>
          <p className="text-sm text-muted-foreground mt-2">{fields().map(f => f.value).join(', ')}</p>
        </div>
      ) : null}

      <div className="field-list space-y-3">
        {fields().map((field, index) => (
          <div key={field.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={field.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(field.id, e.target.value)}
                onBlur={() => handleBlur(field.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{field.error}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={fields().length <= 1}
              onClick={() => handleRemove(field.id)}
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
          <Button onClick={handleSubmit}>
            Submit
          </Button>
        </div>
      ) : null}

      {!submitted() ? (
        <p className="field-count text-sm text-muted-foreground">
          {fields().length} email(s) added
        </p>
      ) : null}
    </div>
  )
}

/**
 * Computes error for a field including duplicate check
 */
function computeFieldError(field: EmailField, allFields: EmailField[]): string {
  if (!field.touched) return ''
  const basicError = validateEmail(field.value)
  if (basicError) return basicError
  // Check for duplicates
  if (field.value.trim() !== '') {
    const isDuplicate = allFields.some(
      f => f.id !== field.id && f.value.toLowerCase() === field.value.toLowerCase()
    )
    if (isDuplicate) return 'Duplicate email'
  }
  return ''
}

/**
 * Updates all field errors (needed when duplicates change)
 */
function updateAllErrors(fields: EmailField[]): EmailField[] {
  return fields.map(f => ({
    ...f,
    error: computeFieldError(f, fields),
  }))
}

/**
 * Duplicate validation demo - cross-field validation for duplicates
 */
export function DuplicateValidationDemo() {
  const [fields, setFields] = createSignal<EmailField[]>([
    { id: 1, value: '', touched: false, error: '' },
    { id: 2, value: '', touched: false, error: '' }
  ])
  const [nextId, setNextId] = createSignal(3)

  const duplicateCount = createMemo(() => {
    const values = fields().map(f => f.value.toLowerCase().trim()).filter(v => v !== '')
    const uniqueValues = new Set(values)
    return values.length - uniqueValues.size
  })

  const handleAdd = () => {
    const newFields = [...fields(), createField(nextId(), '', false)]
    setFields(updateAllErrors(newFields))
    setNextId(nextId() + 1)
  }

  const handleRemove = (id: number) => {
    if (fields().length > 1) {
      const newFields = fields().filter(f => f.id !== id)
      setFields(updateAllErrors(newFields))
    }
  }

  const handleChange = (id: number, value: string) => {
    const newFields = fields().map(f => {
      if (f.id !== id) return f
      return { ...f, value }
    })
    // Recompute all errors since duplicates may have changed
    setFields(updateAllErrors(newFields))
  }

  const handleBlur = (id: number) => {
    const newFields = fields().map(f => {
      if (f.id !== id) return f
      return { ...f, touched: true }
    })
    setFields(updateAllErrors(newFields))
  }

  return (
    <div className="space-y-4">
      <div className="field-list space-y-3">
        {fields().map((field, index) => (
          <div key={field.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={field.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(field.id, e.target.value)}
                onBlur={() => handleBlur(field.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{field.error}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={fields().length <= 1}
              onClick={() => handleRemove(field.id)}
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
 * Min/max fields demo - enforce field count constraints
 */
export function MinMaxFieldsDemo() {
  const MIN_FIELDS = 1
  const MAX_FIELDS = 5

  const [fields, setFields] = createSignal<EmailField[]>([
    { id: 1, value: '', touched: false, error: '' }
  ])
  const [nextId, setNextId] = createSignal(2)

  const canAdd = createMemo(() => fields().length < MAX_FIELDS)
  const canRemove = createMemo(() => fields().length > MIN_FIELDS)

  const handleAdd = () => {
    if (canAdd()) {
      setFields([...fields(), createField(nextId(), '', false)])
      setNextId(nextId() + 1)
    }
  }

  const handleRemove = (id: number) => {
    if (canRemove()) {
      setFields(fields().filter(f => f.id !== id))
    }
  }

  const handleChange = (id: number, value: string) => {
    setFields(fields().map(f => {
      if (f.id !== id) return f
      const error = f.touched ? validateEmail(value) : ''
      return { ...f, value, error }
    }))
  }

  const handleBlur = (id: number) => {
    setFields(fields().map(f => {
      if (f.id !== id) return f
      return { ...f, touched: true, error: validateEmail(f.value) }
    }))
  }

  return (
    <div className="space-y-4">
      <div className="field-list space-y-3">
        {fields().map((field, index) => (
          <div key={field.id} className="field-item flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="email"
                data-slot="input"
                className={inputClasses}
                value={field.value}
                placeholder={`Email ${index + 1}`}
                onInput={(e) => handleChange(field.id, e.target.value)}
                onBlur={() => handleBlur(field.id)}
              />
              <p className="field-error text-sm text-destructive min-h-5">{field.error}</p>
            </div>
            <button
              type="button"
              data-slot="button"
              className={removeButtonClasses}
              disabled={!canRemove()}
              onClick={() => handleRemove(field.id)}
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
          {fields().length} / {MAX_FIELDS} emails
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
