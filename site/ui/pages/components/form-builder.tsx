/**
 * Form Builder Reference Page (/components/form-builder)
 *
 * Block-level composition: signal-driven schema determines loop structure.
 * Compiler stress test for heterogeneous loops, schema-driven rebuild,
 * nested field groups, and conditional visibility.
 */

import { FormBuilderDemo } from '@/components/form-builder-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'

type FieldType = 'text' | 'select' | 'checkbox' | 'group'

type FieldSchema = {
  id: number
  type: FieldType
  label: string
  required: boolean
  options: string
  visibleWhen: string
  children: ChildField[]
}

function FormBuilder() {
  const [fields, setFields] = createSignal<FieldSchema[]>(initialFields)
  const [previewValues, setPreviewValues] = createSignal<Record<string, string>>({})

  const visibleFieldsInPreview = createMemo(() => {
    const vals = previewValues()
    return fields().filter(f => {
      if (!f.visibleWhen) return true
      return vals[f.visibleWhen]?.trim().length > 0
    })
  })

  // Heterogeneous loop — key compiler stress test
  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Builder: body varies by field.type */}
      <div>
        {fields().map(field => (
          <div key={field.id}>
            <NativeSelect
              value={field.type}
              onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
            >
              <NativeSelectOption value="text">Text</NativeSelectOption>
              <NativeSelectOption value="select">Select</NativeSelectOption>
              <NativeSelectOption value="checkbox">Checkbox</NativeSelectOption>
              <NativeSelectOption value="group">Group</NativeSelectOption>
            </NativeSelect>
            <Input value={field.label} onInput={(e) => updateField(field.id, { label: e.target.value })} />

            {/* Type-specific options — heterogeneous body */}
            {field.type === 'select' ? (
              <Input value={field.options} onInput={(e) => updateField(field.id, { options: e.target.value })} />
            ) : null}
            {field.type === 'group' ? (
              <div>
                {field.children.map(child => (
                  <Input key={child.id} value={child.label} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Preview: conditional visibility + heterogeneous rendering */}
      <div>
        {visibleFieldsInPreview().map(field => (
          <div key={field.id}>
            {field.type === 'text' ? (
              <Input placeholder={field.label} onInput={(e) => setPreviewValues(p => ({...p, [field.label]: e.target.value}))} />
            ) : null}
            {field.type === 'select' ? (
              <NativeSelect>
                {field.options.split(',').map(opt => (
                  <NativeSelectOption key={opt.trim()} value={opt.trim()}>{opt.trim()}</NativeSelectOption>
                ))}
              </NativeSelect>
            ) : null}
            {field.type === 'checkbox' ? <Checkbox /> : null}
            {field.type === 'group' ? (
              <div>
                {field.children.map(child => (
                  <Input key={child.id} placeholder={child.label} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}`

export function FormBuilderRefPage() {
  return (
    <DocPage slug="form-builder" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Form Builder"
          description="A signal-driven form builder with dynamic field type switching, nested groups, conditional visibility, and live preview."
          {...getNavLinks('form-builder')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <FormBuilderDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Heterogeneous Loop</h3>
              <p className="text-sm text-muted-foreground">
                Both the builder and preview render <code>fields().map()</code> where the JSX body
                varies completely by <code>field.type</code>. This is the primary compiler stress test:
                a loop whose items require structurally different output.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Schema Change → Loop Rebuild</h3>
              <p className="text-sm text-muted-foreground">
                Switching a field&rsquo;s type via the dropdown mutates the schema signal, forcing the
                loop to reconstruct that slot&rsquo;s entire subtree — text options disappear, select
                options appear, group children render.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Nested Field Groups</h3>
              <p className="text-sm text-muted-foreground">
                Group fields contain a <code>children</code> array rendered as a nested loop in both
                the builder (child editors) and the preview (child inputs). Tests nested loop
                rendering with heterogeneous child types.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Conditional Visibility</h3>
              <p className="text-sm text-muted-foreground">
                Each field can declare a <code>visibleWhen</code> condition — the label of another
                field that must be non-empty. The <code>visibleFieldsInPreview</code> memo filters
                the schema reactively, and the preview only renders matching fields.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
