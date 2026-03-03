/**
 * Calendar Documentation Page
 */

import {
  CalendarBasicDemo,
  CalendarFormDemo,
  CalendarWithConstraintsDemo,
} from '@/components/calendar-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../components/shared/docs'
import { getNavLinks } from '../components/shared/PageNavigation'

// Table of contents items
const tocItems: TocItem[] = [
  { id: 'installation', title: 'Installation' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'constraints', title: 'Constraints', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

// Code examples - Preview (Basic Demo)
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

// Props definition
const calendarProps: PropDefinition[] = [
  {
    name: 'mode',
    type: "'single'",
    defaultValue: "'single'",
    description: 'The selection mode. Currently only single selection is supported.',
  },
  {
    name: 'selected',
    type: 'Date',
    description: 'The controlled selected date. When provided, the component is in controlled mode.',
  },
  {
    name: 'defaultSelected',
    type: 'Date',
    description: 'The initial selected date for uncontrolled mode.',
  },
  {
    name: 'onSelect',
    type: '(date: Date | undefined) => void',
    description: 'Event handler called when a date is selected or deselected.',
  },
  {
    name: 'defaultMonth',
    type: 'Date',
    description: 'The month to display initially. Defaults to the selected date or today.',
  },
  {
    name: 'showOutsideDays',
    type: 'boolean',
    defaultValue: 'true',
    description: 'Whether to show days from adjacent months.',
  },
  {
    name: 'disabled',
    type: 'boolean | ((date: Date) => boolean)',
    defaultValue: 'false',
    description: 'Disable the entire calendar or specific dates via a predicate function.',
  },
  {
    name: 'fromDate',
    type: 'Date',
    description: 'The earliest selectable date. Days before this are disabled.',
  },
  {
    name: 'toDate',
    type: 'Date',
    description: 'The latest selectable date. Days after this are disabled.',
  },
  {
    name: 'weekStartsOn',
    type: '0 | 1',
    defaultValue: '0',
    description: 'The day the week starts on. 0 = Sunday, 1 = Monday.',
  },
]

export function CalendarPage() {
  return (
    <DocPage slug="calendar" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Calendar"
          description="A date calendar for picking single dates with month navigation."
          {...getNavLinks('calendar')}
        />

        {/* Preview */}
        <Example title="" code={basicCode}>
          <CalendarBasicDemo />
        </Example>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add calendar" />
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
