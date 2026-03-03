/**
 * Field Arrays Documentation Page
 *
 * Demonstrates dynamic list of form inputs pattern.
 */

import { Input } from '@/components/ui/input'
import {
  BasicFieldArrayDemo,
  DuplicateValidationDemo,
  MinMaxFieldsDemo,
  StaticListDemo,
} from '@/components/field-arrays-demo'
import {
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { TableOfContents } from '@/components/table-of-contents'

// Table of contents items
const tocItems: TocItem[] = [
  { id: 'pattern-overview', title: 'Pattern Overview' },
  { id: 'examples', title: 'Examples' },
  { id: 'static-list', title: 'Static List' },
  { id: 'key-points', title: 'Key Points' },
]

// Code examples
const basicFieldArrayCode = `import { createSignal, createMemo } from '@barefootjs/dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type EmailField = {
  id: number
  value: string
  touched: boolean
}

const [fields, setFields] = createSignal<EmailField[]>([
  { id: 1, value: '', touched: false }
])
const [nextId, setNextId] = createSignal(2)

const validateEmail = (email: string): string => {
  if (email.trim() === '') return 'Email is required'
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return 'Invalid email format'
  return ''
}

const handleAdd = () => {
  setFields([...fields(), { id: nextId(), value: '', touched: false }])
  setNextId(nextId() + 1)
}

const handleRemove = (id: number) => {
  if (fields().length > 1) {
    setFields(fields().filter(f => f.id !== id))
  }
}

const handleChange = (id: number, value: string) => {
  setFields(fields().map(f => f.id === id ? { ...f, value } : f))
}

{fields().map((field, index) => (
  <div key={field.id}>
    <Input
      value={field.value}
      onInput={(e) => handleChange(field.id, e.target.value)}
    />
    <Button onClick={() => handleRemove(field.id)}>Remove</Button>
  </div>
))}
<Button onClick={handleAdd}>+ Add Email</Button>`

const duplicateValidationCode = `import { createSignal, createMemo } from '@barefootjs/dom'

const isDuplicate = (id: number, value: string): boolean => {
  if (value.trim() === '') return false
  return fields().some(f => f.id !== id && f.value.toLowerCase() === value.toLowerCase())
}

const getFieldError = (field: EmailField): string => {
  if (!field.touched) return ''
  const basicError = validateEmail(field.value)
  if (basicError) return basicError
  if (isDuplicate(field.id, field.value)) return 'Duplicate email'
  return ''
}

const duplicateCount = createMemo(() => {
  const values = fields().map(f => f.value.toLowerCase().trim()).filter(v => v !== '')
  const uniqueValues = new Set(values)
  return values.length - uniqueValues.size
})

{duplicateCount() > 0 && (
  <p className="text-amber-400">{duplicateCount()} duplicate(s) detected</p>
)}`

const staticListCode = `"use client"
import { createSignal } from '@barefootjs/dom'

const options = ['Alpha', 'Beta', 'Gamma']
const [selected, setSelected] = createSignal('Alpha')

{options.map(opt => (
  <button onClick={() => setSelected(opt)}>
    {opt}
  </button>
))}
<p>Selected: {selected()}</p>`

const minMaxFieldsCode = `import { createSignal, createMemo } from '@barefootjs/dom'

const MIN_FIELDS = 1
const MAX_FIELDS = 5

const canAdd = createMemo(() => fields().length < MAX_FIELDS)
const canRemove = createMemo(() => fields().length > MIN_FIELDS)

const handleAdd = () => {
  if (canAdd()) {
    setFields([...fields(), { id: nextId(), value: '', touched: false }])
    setNextId(nextId() + 1)
  }
}

const handleRemove = (id: number) => {
  if (canRemove()) {
    setFields(fields().filter(f => f.id !== id))
  }
}

<Button onClick={handleAdd} disabled={!canAdd()}>
  + Add Email
</Button>
<p>{fields().length} / {MAX_FIELDS} emails</p>`

export function FieldArraysPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Field Arrays"
          description="Demonstrates dynamic list of form inputs with add/remove and per-item validation."
        />

        {/* Preview - Static example */}
        <Example title="" code={basicFieldArrayCode}>
          <div className="max-w-md">
            <div className="space-y-2">
              <Input placeholder="Email 1" />
              <Input placeholder="Email 2" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              See interactive examples below.
            </p>
          </div>
        </Example>

        {/* Pattern Overview */}
        <Section id="pattern-overview" title="Pattern Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Field arrays in BarefootJS use a <code className="text-foreground">createSignal</code> containing an array of field objects.
              Each field has a unique ID for proper list reconciliation, and its own value and touched state.
            </p>
            <p className="text-muted-foreground mt-2">
              Key concepts:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li><strong>Field object</strong>: Contains id, value, and touched state</li>
              <li><strong>Unique ID</strong>: Each field has a unique ID for stable key management</li>
              <li><strong>Per-field validation</strong>: Validate each field independently</li>
              <li><strong>Cross-field validation</strong>: Check duplicates or dependencies across fields</li>
              <li><strong>Immutable updates</strong>: Use map/filter to update the array signal</li>
            </ul>
          </div>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic Field Array" code={basicFieldArrayCode}>
              <div className="max-w-md">
                <BasicFieldArrayDemo />
              </div>
            </Example>

            <Example title="Duplicate Detection" code={duplicateValidationCode}>
              <div className="max-w-md">
                <DuplicateValidationDemo />
              </div>
            </Example>

            <Example title="Min/Max Field Constraints" code={minMaxFieldsCode}>
              <div className="max-w-md">
                <MinMaxFieldsDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* Static List */}
        <Section id="static-list" title="Static List">
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Maps over a static (non-signal) array with <code className="text-foreground">onClick</code> on plain elements.
              Verifies event delegation for static arrays.
            </p>
            <Example title="Static Array with onClick" code={staticListCode}>
              <div className="max-w-md">
                <StaticListDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* Key Points */}
        <Section id="key-points" title="Key Points">
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Array State Management</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Store field array in a single signal: <code className="text-foreground">{'createSignal<Field[]>([])'}</code></li>
                <li>Each field object contains: id, value, touched (and any other state)</li>
                <li>Use immutable operations: <code className="text-foreground">map()</code>, <code className="text-foreground">filter()</code>, spread operator</li>
                <li>Maintain a separate counter signal for generating unique IDs</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Key Management</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Always use <code className="text-foreground">key={'{field.id}'}</code> for list items</li>
                <li>Never use array index as key (causes issues on reorder/delete)</li>
                <li>Generate unique IDs with incrementing counter: <code className="text-foreground">nextId()</code></li>
                <li>Unique keys ensure proper DOM reconciliation</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Per-Item Validation</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Create a validation function that takes the field value</li>
                <li>Check touched state before showing errors</li>
                <li>Update touched state on blur: <code className="text-foreground">{'onBlur={() => handleBlur(field.id)}'}</code></li>
                <li>Each field error is computed independently</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Cross-Field Validation</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Access entire array in validation: <code className="text-foreground">fields().some()</code></li>
                <li>Use <code className="text-foreground">createMemo</code> for derived validations (e.g., duplicate count)</li>
                <li>Exclude current field when checking duplicates: <code className="text-foreground">f.id !== id</code></li>
                <li>Show summary warnings for array-level issues</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Add/Remove Operations</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><strong>Add</strong>: Spread existing array and append new field</li>
                <li><strong>Remove</strong>: Filter out field by ID</li>
                <li>Enforce min/max constraints with <code className="text-foreground">createMemo</code> for canAdd/canRemove</li>
                <li>Disable buttons when constraints are reached</li>
              </ul>
            </div>
          </div>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
