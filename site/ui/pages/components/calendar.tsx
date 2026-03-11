/**
 * Calendar Reference Page (/components/calendar)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import {
  CalendarBasicDemo,
  CalendarFormDemo,
  CalendarWithConstraintsDemo,
} from '@/components/calendar-demo'
import { CalendarPlayground } from '@/components/calendar-playground'
import { CalendarUsageDemo } from '@/components/calendar-usage-demo'
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
  { id: 'constraints', title: 'Constraints', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Calendar } from "@/components/ui/calendar"

function CalendarDemo() {
  const [selected, setSelected] = createSignal<Date | undefined>()

  return (
    <div className="space-y-4">
      {/* Single date selection */}
      <Calendar
        mode="single"
        selected={selected()}
        onSelect={setSelected}
      />

      {/* Range selection */}
      <Calendar mode="range" numberOfMonths={2} />

      {/* With constraints (next 30 days only) */}
      <Calendar
        mode="single"
        fromDate={new Date()}
        toDate={new Date(Date.now() + 30 * 86400000)}
      />
    </div>
  )
}`

const basicCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Calendar } from "@/components/ui/calendar"

export function CalendarBasicDemo() {
  const [date, setDate] = createSignal<Date | undefined>(undefined)

  const formattedDate = createMemo(() => {
    const d = date()
    if (!d) return 'No date selected'
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <Calendar selected={date()} onSelect={setDate} />
      <p className="text-sm text-muted-foreground">{formattedDate()}</p>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Calendar } from "@/components/ui/calendar"

export function CalendarFormDemo() {
  const today = new Date()
  const [date, setDate] = createSignal<Date | undefined>(undefined)
  const [name, setName] = createSignal('')

  const canSubmit = createMemo(() => date() !== undefined && name().length > 0)

  const formattedDate = createMemo(() => {
    const d = date()
    if (!d) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })

  return (
    <div className="space-y-4 max-w-sm">
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Book an appointment</h4>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Name</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            placeholder="Your name"
            value={name()}
            onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Date</label>
          <Calendar
            selected={date()}
            onSelect={setDate}
            fromDate={today}
          />
          {date() && (
            <p className="text-sm text-muted-foreground">
              Selected: {formattedDate()}
            </p>
          )}
        </div>
      </div>
      <button
        className="inline-flex ... bg-primary text-primary-foreground disabled:opacity-50"
        disabled={!canSubmit()}
      >
        Book Appointment
      </button>
    </div>
  )
}`

const constraintsCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Calendar } from "@/components/ui/calendar"

export function CalendarWithConstraintsDemo() {
  const today = new Date()
  const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
  const [date, setDate] = createSignal<Date | undefined>(undefined)

  // Disable weekends (Saturday=6, Sunday=0)
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

  const formattedDate = createMemo(() => {
    const d = date()
    if (!d) return 'Select a weekday'
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center space-y-1">
        <h4 className="text-sm font-medium">Schedule a meeting</h4>
        <p className="text-xs text-muted-foreground">Weekdays only, within the next 30 days</p>
      </div>
      <Calendar
        selected={date()}
        onSelect={setDate}
        fromDate={today}
        toDate={maxDate}
        disabled={isWeekend}
      />
      <p className="text-sm text-muted-foreground">{formattedDate()}</p>
    </div>
  )
}`

const calendarProps: PropDefinition[] = [
  {
    name: 'mode',
    type: "'single' | 'range'",
    defaultValue: "'single'",
    description: 'Selection mode: single date or date range.',
  },
  {
    name: 'selected',
    type: 'Date',
    description: 'The currently selected date (controlled, single mode).',
  },
  {
    name: 'onSelect',
    type: '(date: Date | undefined) => void',
    description: 'Callback when a date is selected (single mode).',
  },
  {
    name: 'selectedRange',
    type: '{ from?: Date; to?: Date }',
    description: 'The currently selected range (controlled, range mode).',
  },
  {
    name: 'onRangeSelect',
    type: '(range: { from?: Date; to?: Date }) => void',
    description: 'Callback when a range is selected (range mode).',
  },
  {
    name: 'fromDate',
    type: 'Date',
    description: 'Minimum selectable date.',
  },
  {
    name: 'toDate',
    type: 'Date',
    description: 'Maximum selectable date.',
  },
  {
    name: 'numberOfMonths',
    type: 'number',
    defaultValue: '1',
    description: 'Number of months to display side by side.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

export function CalendarRefPage() {
  return (
    <DocPage slug="calendar" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Calendar"
          description="A date picker component with month navigation and single or range selection."
          {...getNavLinks('calendar')}
        />

        {/* Props Playground */}
        <CalendarPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add calendar" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <CalendarUsageDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <CalendarBasicDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <CalendarFormDemo />
            </Example>

            <Example title="Constraints" code={constraintsCode}>
              <CalendarWithConstraintsDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={calendarProps} />
        </Section>
      </div>
    </DocPage>
  )
}
