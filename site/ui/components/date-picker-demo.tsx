"use client"

/**
 * DatePicker Demo Components
 *
 * Interactive demos for DatePicker and DateRangePicker components.
 * Used in date-picker documentation page.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { DatePicker, DateRangePicker, type DateRange } from '@ui/components/ui/date-picker'

/**
 * Preview demo - simple date selection
 */
export function DatePickerPreviewDemo() {
  const [date, setDate] = createSignal<Date | undefined>(undefined)

  return (
    <DatePicker selected={date()} onSelect={setDate} />
  )
}

/**
 * Basic demo - date selection with display of selected value
 */
export function DatePickerBasicDemo() {
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
    <div className="flex flex-col gap-4">
      <DatePicker selected={date()} onSelect={setDate} />
      <p className="text-sm text-muted-foreground" data-testid="selected-date">
        {formattedDate()}
      </p>
    </div>
  )
}

/**
 * Form demo - start date and end date with day count calculation
 */
export function DatePickerFormDemo() {
  const [startDate, setStartDate] = createSignal<Date | undefined>(undefined)
  const [endDate, setEndDate] = createSignal<Date | undefined>(undefined)

  const dayCountText = createMemo(() => {
    const start = startDate()
    const end = endDate()
    if (!start || !end) return null
    const diff = Math.abs(end.getTime() - start.getTime())
    const count = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return `${count} day${count > 1 ? 's' : ''} selected`
  })

  const isEndDateDisabled = (date: Date): boolean => {
    const start = startDate()
    if (!start) return false
    return date.getTime() < start.getTime()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Start Date</label>
          <DatePicker
            selected={startDate()}
            onSelect={setStartDate}
            placeholder="Select start date"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">End Date</label>
          <DatePicker
            selected={endDate()}
            onSelect={setEndDate}
            placeholder="Select end date"
            disabledDates={isEndDateDisabled}
          />
        </div>
      </div>
      {dayCountText() !== null && (
        <p className="text-sm text-muted-foreground" data-testid="day-count">
          {dayCountText()}
        </p>
      )}
    </div>
  )
}

/**
 * Date range demo - DateRangePicker with 2-month view
 */
export function DateRangePickerDemo() {
  const [range, setRange] = createSignal<DateRange | undefined>(undefined)

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const rangeText = createMemo(() => {
    const r = range()
    if (!r?.from) return 'No range selected'
    if (!r.to) return `From: ${formatter.format(r.from)}`
    return `${formatter.format(r.from)} - ${formatter.format(r.to)}`
  })

  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker
        selected={range()}
        onSelect={setRange}
        numberOfMonths={2}
      />
      <p className="text-sm text-muted-foreground" data-testid="range-text">
        {rangeText()}
      </p>
    </div>
  )
}

/**
 * Presets demo - preset buttons + custom formatter
 */
export function DatePickerPresetsDemo() {
  const [date, setDate] = createSignal<Date | undefined>(undefined)

  const addDays = (days: number): Date => {
    const result = new Date()
    result.setDate(result.getDate() + days)
    return result
  }

  const presets = [
    { label: 'Today', value: new Date() },
    { label: 'Tomorrow', value: addDays(1) },
    { label: 'In 3 days', value: addDays(3) },
    { label: 'In a week', value: addDays(7) },
    { label: 'In 2 weeks', value: addDays(14) },
  ]

  const shortFormat = (d: Date): string => {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handlePresetClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest('[data-preset]') as HTMLElement
    if (!btn) return
    const idx = Number(btn.dataset.preset)
    if (presets[idx]) setDate(presets[idx].value)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" onClick={handlePresetClick}>
        {presets.map((preset, i) => (
          <button
            key={i}
            type="button"
            data-preset={String(i)}
            className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <DatePicker
        selected={date()}
        onSelect={setDate}
        formatDate={shortFormat}
        placeholder="Select a date or preset"
      />
    </div>
  )
}
