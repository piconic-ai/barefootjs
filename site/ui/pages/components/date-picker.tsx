/**
 * DatePicker Reference Page (/components/date-picker)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { DatePickerPlayground } from '@/components/date-picker-playground'
import {
  DatePickerPreviewDemo,
  DatePickerBasicDemo,
  DatePickerFormDemo,
  DateRangePickerDemo,
  DatePickerPresetsDemo,
} from '@/components/date-picker-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'date-range', title: 'Date Range', branch: 'child' },
  { id: 'with-presets', title: 'With Presets', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { DatePicker } from '@/components/ui/date-picker'

function DatePickerDemo() {
  const [date, setDate] = createSignal<Date | undefined>()

  return (
    <div className="flex flex-col gap-4">
      <DatePicker selected={date()} onSelect={setDate} />
      <p className="text-sm text-muted-foreground">
        {date()
          ? date()!.toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric',
              month: 'long', day: 'numeric',
            })
          : 'No date selected'}
      </p>
    </div>
  )
}`

const basicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { DatePicker } from '@/components/ui/date-picker'

function DatePickerDemo() {
  const [date, setDate] = createSignal<Date | undefined>()

  return (
    <div className="flex flex-col gap-4">
      <DatePicker selected={date()} onSelect={setDate} />
      <p className="text-sm text-muted-foreground">
        {date()
          ? date()!.toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric',
              month: 'long', day: 'numeric',
            })
          : 'No date selected'}
      </p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { DatePicker } from '@/components/ui/date-picker'

function DatePickerForm() {
  const [startDate, setStartDate] = createSignal<Date | undefined>()
  const [endDate, setEndDate] = createSignal<Date | undefined>()

  const dayCount = createMemo(() => {
    const start = startDate()
    const end = endDate()
    if (!start || !end) return null
    const diff = Math.abs(end.getTime() - start.getTime())
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Start Date</label>
          <DatePicker
            selected={startDate()}
            onSelect={setStartDate}
            placeholder="Select start date"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">End Date</label>
          <DatePicker
            selected={endDate()}
            onSelect={setEndDate}
            placeholder="Select end date"
            disabledDates={(d) => {
              const start = startDate()
              return start ? d.getTime() < start.getTime() : false
            }}
          />
        </div>
      </div>
      {dayCount() !== null && (
        <p className="text-sm text-muted-foreground">
          {dayCount()} days selected
        </p>
      )}
    </div>
  )
}`

const rangeCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { DateRangePicker, type DateRange } from '@/components/ui/date-picker'

function DateRangeDemo() {
  const [range, setRange] = createSignal<DateRange | undefined>()

  return (
    <DateRangePicker
      selected={range()}
      onSelect={setRange}
      numberOfMonths={2}
    />
  )
}`

const presetsCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import { DatePicker } from '@/components/ui/date-picker'

function DatePickerWithPresets() {
  const [date, setDate] = createSignal<Date | undefined>()

  const addDays = (days: number): Date => {
    const result = new Date()
    result.setDate(result.getDate() + days)
    return result
  }

  const presets = [
    { label: 'Today', value: new Date() },
    { label: 'Tomorrow', value: addDays(1) },
    { label: 'In a week', value: addDays(7) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map(preset => (
          <button
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => setDate(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <DatePicker
        selected={date()}
        onSelect={setDate}
        formatDate={(d) => d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
      />
    </div>
  )
}`

const datePickerProps: PropDefinition[] = [
  {
    name: 'selected',
    type: 'Date | undefined',
    description: 'Currently selected date.',
  },
  {
    name: 'onSelect',
    type: '(date: Date | undefined) => void',
    description: 'Callback when date selection changes.',
  },
  {
    name: 'formatDate',
    type: '(date: Date) => string',
    defaultValue: 'Intl.DateTimeFormat',
    description: 'Custom date formatter function.',
  },
  {
    name: 'placeholder',
    type: 'string',
    defaultValue: '"Pick a date"',
    description: 'Placeholder text when no date is selected.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the picker is disabled.',
  },
  {
    name: 'disabledDates',
    type: '(date: Date) => boolean',
    description: 'Function to disable specific dates in the calendar.',
  },
  {
    name: 'align',
    type: "'start' | 'center' | 'end'",
    defaultValue: "'start'",
    description: 'Alignment of the popover relative to the trigger.',
  },
  {
    name: 'triggerClassName',
    type: 'string',
    description: 'Additional CSS classes for the trigger button.',
  },
]

const dateRangePickerProps: PropDefinition[] = [
  {
    name: 'selected',
    type: 'DateRange | undefined',
    description: 'Currently selected date range ({ from: Date; to?: Date }).',
  },
  {
    name: 'onSelect',
    type: '(range: DateRange | undefined) => void',
    description: 'Callback when range selection changes.',
  },
  {
    name: 'formatDate',
    type: '(date: Date) => string',
    defaultValue: 'Intl.DateTimeFormat',
    description: 'Custom date formatter function.',
  },
  {
    name: 'placeholder',
    type: 'string',
    defaultValue: '"Pick a date range"',
    description: 'Placeholder text when no range is selected.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the picker is disabled.',
  },
  {
    name: 'disabledDates',
    type: '(date: Date) => boolean',
    description: 'Function to disable specific dates in the calendar.',
  },
  {
    name: 'align',
    type: "'start' | 'center' | 'end'",
    defaultValue: "'start'",
    description: 'Alignment of the popover relative to the trigger.',
  },
  {
    name: 'numberOfMonths',
    type: 'number',
    defaultValue: '2',
    description: 'Number of months to display side by side.',
  },
  {
    name: 'triggerClassName',
    type: 'string',
    description: 'Additional CSS classes for the trigger button.',
  },
]

export function DatePickerRefPage() {
  return (
    <DocPage slug="date-picker" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Date Picker"
          description="A date picker component with calendar popup."
          {...getNavLinks('date-picker')}
        />

        {/* Props Playground */}
        <DatePickerPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add date-picker" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <DatePickerPreviewDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <DatePickerBasicDemo />
            </Example>
            <Example title="Form" code={formCode}>
              <DatePickerFormDemo />
            </Example>
            <Example title="Date Range" code={rangeCode}>
              <DateRangePickerDemo />
            </Example>
            <Example title="With Presets" code={presetsCode}>
              <DatePickerPresetsDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DatePicker</h3>
              <PropsTable props={datePickerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">DateRangePicker</h3>
              <PropsTable props={dateRangePickerProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
