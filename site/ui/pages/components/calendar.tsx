/**
 * Calendar Reference Page (/components/calendar)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

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

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={calendarProps} />
        </Section>
      </div>
    </DocPage>
  )
}
