"use client"
/**
 * FormBuilderDemo
 *
 * Signal-driven schema determines loop structure.
 * Dynamic field type switching, field reordering, conditional visibility, live preview.
 *
 * Compiler stress targets:
 * - Heterogeneous loop: fields().map() where body varies by field.type
 * - Schema change → loop rebuild: type switch triggers editor reconstruction
 * - Nested field groups: group type renders nested children loop in both builder and preview
 * - Conditional in preview loop: visibleFieldsInPreview memo filters by visibility rules
 * - createMemo chain: fieldCount → requiredCount → visibleFieldsInPreview
 * - Signal access inside loop: previewValues()[field.label] inside visibleFields map
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Input } from '@ui/components/ui/input'
import { Label } from '@ui/components/ui/label'
import { Textarea } from '@ui/components/ui/textarea'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

// --- Types ---

type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'group'

type ChildField = {
  id: number
  type: 'text' | 'checkbox' | 'select'
  label: string
  required: boolean
  options: string
}

type FieldSchema = {
  id: number
  type: FieldType
  label: string
  required: boolean
  placeholder: string
  options: string
  visibleWhen: string
  children: ChildField[]
}

// --- Data ---

let _nextId = 10

function nextFieldId(): number {
  return _nextId++
}

const initialFields: FieldSchema[] = [
  {
    id: 1,
    type: 'text',
    label: 'Full Name',
    required: true,
    placeholder: 'Enter your full name',
    options: '',
    visibleWhen: '',
    children: [],
  },
  {
    id: 2,
    type: 'text',
    label: 'Email',
    required: true,
    placeholder: 'you@example.com',
    options: '',
    visibleWhen: '',
    children: [],
  },
  {
    id: 3,
    type: 'select',
    label: 'Country',
    required: false,
    placeholder: '',
    options: 'USA, Canada, UK, Australia',
    visibleWhen: '',
    children: [],
  },
  {
    id: 4,
    type: 'group',
    label: 'Address',
    required: false,
    placeholder: '',
    options: '',
    visibleWhen: '',
    children: [
      { id: 5, type: 'text', label: 'Street', required: true, options: '' },
      { id: 6, type: 'text', label: 'City', required: true, options: '' },
      { id: 7, type: 'text', label: 'Zip Code', required: false, options: '' },
    ],
  },
  {
    id: 8,
    type: 'textarea',
    label: 'Company',
    required: false,
    placeholder: 'Your company name',
    options: '',
    visibleWhen: 'Full Name',
    children: [],
  },
  {
    id: 9,
    type: 'checkbox',
    label: 'I agree to the terms',
    required: true,
    placeholder: '',
    options: '',
    visibleWhen: '',
    children: [],
  },
]

// --- Component ---

export function FormBuilderDemo() {
  const [fields, setFields] = createSignal<FieldSchema[]>(initialFields)
  const [previewValues, setPreviewValues] = createSignal<Record<string, string>>({})
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // Memo chain
  const fieldCount = createMemo(() => fields().length)
  const requiredCount = createMemo(() => fields().filter(f => f.required).length)
  const visibleFieldsInPreview = createMemo(() => {
    const vals = previewValues()
    return fields().filter(f => {
      if (!f.visibleWhen) return true
      const condVal = vals[f.visibleWhen]
      return condVal !== undefined && condVal.trim().length > 0
    })
  })

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 2500)
  }

  const addField = (type: FieldType) => {
    const defaultLabels: Record<FieldType, string> = {
      text: 'New Text Field',
      textarea: 'New Textarea',
      select: 'New Select',
      checkbox: 'New Checkbox',
      group: 'New Group',
    }
    setFields(prev => [...prev, {
      id: nextFieldId(),
      type,
      label: defaultLabels[type],
      required: false,
      placeholder: '',
      options: type === 'select' ? 'Option 1, Option 2, Option 3' : '',
      visibleWhen: '',
      children: [],
    }])
    showToast(`Added ${defaultLabels[type]}`)
  }

  const removeField = (id: number) => {
    setFields(prev => prev.filter(f => f.id !== id))
    showToast('Field removed')
  }

  const updateField = (id: number, patch: Partial<FieldSchema>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  const moveField = (id: number, dir: 'up' | 'down') => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx === -1) return prev
      const newIdx = dir === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const result = [...prev]
      const [moved] = result.splice(idx, 1)
      result.splice(newIdx, 0, moved)
      return result
    })
  }

  const addChildField = (parentId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id !== parentId) return f
      return {
        ...f,
        children: [...f.children, {
          id: nextFieldId(),
          type: 'text' as const,
          label: 'New Child Field',
          required: false,
          options: '',
        }],
      }
    }))
  }

  const removeChildField = (parentId: number, childId: number) => {
    setFields(prev => prev.map(f => {
      if (f.id !== parentId) return f
      return { ...f, children: f.children.filter(c => c.id !== childId) }
    }))
  }

  const updateChildField = (parentId: number, childId: number, patch: Partial<ChildField>) => {
    setFields(prev => prev.map(f => {
      if (f.id !== parentId) return f
      return { ...f, children: f.children.map(c => c.id === childId ? { ...c, ...patch } : c) }
    }))
  }

  const updatePreviewValue = (label: string, value: string) => {
    setPreviewValues(prev => ({ ...prev, [label]: value }))
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Form Builder</h2>
          <Badge variant="secondary" className="field-count">{fieldCount()} fields</Badge>
          <Badge variant="outline" className="required-count">{requiredCount()} required</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* === Builder Panel === */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Builder</h3>

          {/* Field list — heterogeneous loop: body varies by field.type */}
          <div className="builder-fields space-y-2">
            {fields().map(field => (
              <div key={field.id} className="field-editor rounded-lg border bg-card p-3 space-y-3">

                {/* Row 1: type selector + label + controls */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                    className="w-28 flex-shrink-0 field-type-select h-8 rounded-md border border-input bg-transparent px-3 text-sm appearance-none cursor-pointer"
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Textarea</option>
                    <option value="select">Select</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="group">Group</option>
                  </select>

                  <Input
                    value={field.label}
                    onInput={(e) => updateField(field.id, { label: e.target.value })}
                    className="flex-1 h-8 text-sm field-label-input"
                    placeholder="Field label"
                  />

                  <Button variant="ghost" size="icon-sm" className="move-up shrink-0" onClick={() => moveField(field.id, 'up')}>↑</Button>
                  <Button variant="ghost" size="icon-sm" className="move-down shrink-0" onClick={() => moveField(field.id, 'down')}>↓</Button>
                  <Button variant="ghost" size="icon-sm" className="delete-field shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeField(field.id)}>×</Button>
                </div>

                {/* Type-specific options — heterogeneous body */}
                {field.type === 'text' ? (
                  <Input
                    value={field.placeholder}
                    onInput={(e) => updateField(field.id, { placeholder: e.target.value })}
                    placeholder="Placeholder text (optional)"
                    className="h-8 text-sm placeholder-input"
                  />
                ) : null}

                {field.type === 'textarea' ? (
                  <Input
                    value={field.placeholder}
                    onInput={(e) => updateField(field.id, { placeholder: e.target.value })}
                    placeholder="Placeholder text (optional)"
                    className="h-8 text-sm placeholder-input"
                  />
                ) : null}

                {field.type === 'select' ? (
                  <div className="options-editor space-y-1">
                    <Label className="text-xs text-muted-foreground">Options (comma-separated)</Label>
                    <Input
                      value={field.options}
                      onInput={(e) => updateField(field.id, { options: e.target.value })}
                      placeholder="Option 1, Option 2, Option 3"
                      className="h-8 text-sm options-input"
                    />
                  </div>
                ) : null}

                {field.type === 'group' ? (
                  <div className="group-children space-y-2">
                    <Label className="text-xs text-muted-foreground">Child Fields</Label>
                    {/* Nested loop: group children */}
                    {field.children.map(child => (
                      <div key={child.id} className="child-field flex items-center gap-1.5 pl-3 border-l-2 border-muted">
                        <select
                          value={child.type}
                          onChange={(e) => updateChildField(field.id, child.id, { type: e.target.value as 'text' | 'checkbox' | 'select' })}
                          className="w-24 shrink-0 child-type-select h-8 rounded-md border border-input bg-transparent px-3 text-sm appearance-none cursor-pointer"
                        >
                          <option value="text">Text</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="select">Select</option>
                        </select>
                        <Input
                          value={child.label}
                          onInput={(e) => updateChildField(field.id, child.id, { label: e.target.value })}
                          className="flex-1 h-8 text-sm child-label-input"
                          placeholder="Child label"
                        />
                        <button
                          type="button"
                          className="remove-child shrink-0 text-muted-foreground hover:text-destructive h-7 w-7 rounded-md inline-flex items-center justify-center text-base hover:bg-accent"
                          onClick={() => removeChildField(field.id, child.id)}
                        >×</button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="add-child-btn" onClick={() => addChildField(field.id)}>
                      + Add Child
                    </Button>
                  </div>
                ) : null}

                {/* Row 2: required + visibility condition */}
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(v) => updateField(field.id, { required: v })}
                      className="required-checkbox"
                    />
                    <span className="text-xs text-muted-foreground">Required</span>
                  </label>

                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Show when:</span>
                    <Input
                      value={field.visibleWhen}
                      onInput={(e) => updateField(field.id, { visibleWhen: e.target.value })}
                      placeholder="Field label (leave empty = always)"
                      className="flex-1 h-7 text-xs visible-when-input"
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Add field buttons */}
          <div className="add-field-buttons flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" className="add-text-btn" onClick={() => addField('text')}>+ Text</Button>
            <Button variant="outline" size="sm" className="add-textarea-btn" onClick={() => addField('textarea')}>+ Textarea</Button>
            <Button variant="outline" size="sm" className="add-select-btn" onClick={() => addField('select')}>+ Select</Button>
            <Button variant="outline" size="sm" className="add-checkbox-btn" onClick={() => addField('checkbox')}>+ Checkbox</Button>
            <Button variant="outline" size="sm" className="add-group-btn" onClick={() => addField('group')}>+ Group</Button>
          </div>
        </div>

        {/* === Preview Panel === */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Preview</h3>

          <div className="preview-form rounded-lg border bg-card p-4 space-y-4">
            {/* Heterogeneous loop with conditional visibility */}
            {visibleFieldsInPreview().map(field => (
              <div key={field.id} className={`preview-field preview-field-${field.type}`}>

                {field.type === 'text' ? (
                  <div className="space-y-1">
                    <Label>
                      {field.label}
                      {field.required ? <span className="text-destructive ml-1">*</span> : null}
                    </Label>
                    <Input
                      placeholder={field.placeholder || field.label}
                      value={previewValues()[field.label] || ''}
                      onInput={(e) => updatePreviewValue(field.label, e.target.value)}
                      className="preview-input"
                    />
                  </div>
                ) : null}

                {field.type === 'textarea' ? (
                  <div className="space-y-1">
                    <Label>
                      {field.label}
                      {field.required ? <span className="text-destructive ml-1">*</span> : null}
                    </Label>
                    <Textarea
                      placeholder={field.placeholder || field.label}
                      rows={3}
                      className="preview-textarea"
                    />
                  </div>
                ) : null}

                {field.type === 'select' ? (
                  <div className="space-y-1">
                    <Label>
                      {field.label}
                      {field.required ? <span className="text-destructive ml-1">*</span> : null}
                    </Label>
                    <select
                      value={previewValues()[field.label] || ''}
                      onChange={(e) => updatePreviewValue(field.label, e.target.value)}
                      className="preview-select w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm appearance-none cursor-pointer"
                    >
                      <option value="">Select…</option>
                      {field.options.split(',').map(opt => (
                        <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox className="preview-checkbox" />
                    <span className="text-sm">
                      {field.label}
                      {field.required ? <span className="text-destructive ml-1">*</span> : null}
                    </span>
                  </label>
                ) : null}

                {field.type === 'group' ? (
                  <div className="group-preview space-y-3">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <div className="pl-4 border-l-2 border-muted space-y-3">
                      {/* Nested loop: group children in preview */}
                      {field.children.map(child => (
                        <div key={child.id} className="child-preview">
                          {child.type === 'text' ? (
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {child.label}
                                {child.required ? <span className="text-destructive ml-1">*</span> : null}
                              </Label>
                              <Input placeholder={child.label} className="preview-child-input" />
                            </div>
                          ) : null}
                          {child.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <Checkbox />
                              <span className="text-sm">{child.label}</span>
                            </label>
                          ) : null}
                          {child.type === 'select' ? (
                            <div className="space-y-1">
                              <Label className="text-xs">{child.label}</Label>
                              <select className="preview-child-select w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm appearance-none cursor-pointer">
                                <option value="">Select…</option>
                                {child.options.split(',').map(opt => (
                                  <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

              </div>
            ))}

            {visibleFieldsInPreview().length === 0 ? (
              <p className="no-preview-fields text-sm text-muted-foreground text-center py-8">No visible fields</p>
            ) : null}
          </div>
        </div>

      </div>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Done</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
