/**
 * Field Arrays Documentation Page
 *
 * Dynamic list of inputs. createForm targets fixed-shape records, so the
 * array is a raw signal — but the per-item rule reuses the same Zod schema.
 */

import { Input } from '@/components/ui/input'
import {
  BasicFieldArrayDemo,
  DuplicateValidationDemo,
  MinMaxFieldsDemo,
} from '@/components/field-arrays-demo'
import {
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'duplicates', title: 'Duplicates', branch: 'child' },
  { id: 'min-max', title: 'Min / Max', branch: 'end' },
]

const basicFieldArrayCode = `import { createSignal } from '@barefootjs/client'
import { z } from 'zod'

// Same per-item schema you'd nest inside createForm
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .regex(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/, 'Invalid email format')

const validateEmail = (v: string) => {
  const r = emailSchema.safeParse(v)
  return r.success ? '' : r.error.issues[0]?.message ?? ''
}

type Item = { value: string; touched: boolean }

const [items, setItems] = createSignal<Item[]>([{ value: '', touched: false }])

const itemError = (item: Item) =>
  item.touched ? validateEmail(item.value) : ''

const update = (i: number, value: string) =>
  setItems(items().map((it, idx) => idx === i ? { ...it, value } : it))

const blur = (i: number) =>
  setItems(items().map((it, idx) => idx === i ? { ...it, touched: true } : it))

const add = () =>
  setItems([...items(), { value: '', touched: false }])

const remove = (i: number) => {
  if (items().length > 1) setItems(items().filter((_, idx) => idx !== i))
}

{items().map((item, i) => (
  <div key={i}>
    <input
      value={item.value}
      onInput={(e) => update(i, e.target.value)}
      onBlur={() => blur(i)}
    />
    <p>{itemError(item)}</p>
    <button onClick={() => remove(i)}>X</button>
  </div>
))}
<button onClick={add}>+ Add Email</button>`

const duplicateValidationCode = `// Reuse the per-item schema, then layer a cross-item rule on top.
const itemError = (item: Item, i: number) => {
  if (!item.touched) return ''
  const basic = validateEmail(item.value)
  if (basic) return basic
  const lower = item.value.toLowerCase()
  const isDup = items().some((o, idx) => idx !== i && o.value.toLowerCase() === lower)
  return isDup ? 'Duplicate email' : ''
}

const duplicateCount = createMemo(() => {
  const values = items().map(it => it.value.toLowerCase().trim()).filter(v => v !== '')
  return values.length - new Set(values).size
})`

const minMaxFieldsCode = `const MIN_FIELDS = 1
const MAX_FIELDS = 5

const canAdd = createMemo(() => items().length < MAX_FIELDS)
const canRemove = createMemo(() => items().length > MIN_FIELDS)

<button onClick={add} disabled={!canAdd()}>+ Add Email</button>
<p>{items().length} / {MAX_FIELDS} emails</p>`

export function FieldArraysPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Field Arrays"
          description="Dynamic list of inputs. The array is a raw signal; the per-item rule is the same Zod schema you'd hand to createForm."
        />

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

        <Section id="overview" title="Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              <a href="/docs/forms/create-form" className="text-foreground underline underline-offset-4"><code>createForm</code></a>{' '}
              targets fixed-shape records, so dynamic arrays don't fit through its field API. Instead, store the array in a{' '}
              <code className="text-foreground">createSignal</code> of <code className="text-foreground">{`{ value, touched }`}</code> objects and reuse the same per-item Zod schema you'd otherwise nest in createForm.
            </p>
          </div>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <div id="basic">
              <Example title="Basic Field Array" code={basicFieldArrayCode}>
                <div className="max-w-md">
                  <BasicFieldArrayDemo />
                </div>
              </Example>
            </div>

            <div id="duplicates">
              <Example title="Duplicate Detection" code={duplicateValidationCode}>
                <div className="max-w-md">
                  <DuplicateValidationDemo />
                </div>
              </Example>
            </div>

            <div id="min-max">
              <Example title="Min / Max Field Constraints" code={minMaxFieldsCode}>
                <div className="max-w-md">
                  <MinMaxFieldsDemo />
                </div>
              </Example>
            </div>
          </div>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
