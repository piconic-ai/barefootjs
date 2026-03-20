"use client"

/**
 * DatePicker and DateRangePicker Components
 *
 * Composable date picker built on Popover + Button + Calendar.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * - DatePicker: Single date selection, auto-closes on select
 * - DateRangePicker: Range selection, stays open until range is complete
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import { Button } from '../button'
import { Popover, PopoverTrigger, PopoverContent } from '../popover'
import { Calendar, type DateRange } from '../calendar'

// Default date formatter using Intl.DateTimeFormat
const defaultFormatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/**
 * Props for DatePicker component.
 */
interface DatePickerProps extends HTMLBaseAttributes {
  /** Currently selected date */
  selected?: Date
  /** Callback when date selection changes */
  onSelect?: (date: Date | undefined) => void
  /** Custom date formatter. Default: Intl.DateTimeFormat */
  formatDate?: (date: Date) => string
  /** Placeholder text when no date is selected */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Function to disable specific dates */
  disabledDates?: (date: Date) => boolean
  /** Alignment of the popover relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Additional classes for the trigger button */
  triggerClassName?: string
}

// Trigger button classes
const triggerBaseClasses = 'w-[240px] justify-start text-left font-normal'
const triggerPlaceholderClasses = 'text-muted-foreground'

/**
 * DatePicker component for single date selection.
 *
 * @param props.selected - Currently selected date
 * @param props.onSelect - Callback when selection changes
 * @param props.formatDate - Custom date formatter
 * @param props.placeholder - Placeholder text
 * @param props.disabled - Whether disabled
 * @param props.disabledDates - Function to disable specific dates
 * @param props.align - Popover alignment
 * @param props.triggerClassName - Additional trigger button classes
 */
function DatePicker(props: DatePickerProps) {
  const [open, setOpen] = createSignal(false)
  // Internal state for uncontrolled mode (when selected prop is not provided)
  const [internalSelected, setInternalSelected] = createSignal<Date | undefined>(undefined)

  const currentSelected = createMemo(() =>
    props.selected !== undefined ? props.selected : internalSelected()
  )

  const displayText = createMemo(() => {
    const date = currentSelected()
    if (date) {
      const fmt = props.formatDate ?? defaultFormatDate
      return fmt(date)
    }
    return props.placeholder ?? 'Pick a date'
  })

  const handleSelect = (date: Date | undefined) => {
    if (props.selected === undefined) setInternalSelected(date)
    props.onSelect?.(date)
    if (date) {
      setOpen(false)
    }
  }

  return (
    <div data-slot="date-picker">
      <Popover open={open()} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`${triggerBaseClasses} ${!currentSelected() ? triggerPlaceholderClasses : ''} ${props.triggerClassName ?? ''}`}
            disabled={props.disabled ?? false}
          >
            <svg className="size-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
            <span>{displayText()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align={props.align ?? 'start'}
        >
          <Calendar
            mode="single"
            selected={currentSelected()}
            onSelect={handleSelect}
            disabled={props.disabledDates}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * Props for DateRangePicker component.
 */
interface DateRangePickerProps extends HTMLBaseAttributes {
  /** Currently selected date range */
  selected?: DateRange
  /** Callback when range selection changes */
  onSelect?: (range: DateRange | undefined) => void
  /** Custom date formatter. Default: Intl.DateTimeFormat */
  formatDate?: (date: Date) => string
  /** Placeholder text when no range is selected */
  placeholder?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Function to disable specific dates */
  disabledDates?: (date: Date) => boolean
  /** Alignment of the popover relative to trigger */
  align?: 'start' | 'center' | 'end'
  /** Number of months to display */
  numberOfMonths?: number
  /** Additional classes for the trigger button */
  triggerClassName?: string
}

/**
 * DateRangePicker component for selecting a date range.
 */
function DateRangePicker(props: DateRangePickerProps) {
  const [open, setOpen] = createSignal(false)

  const displayText = createMemo(() => {
    const range = props.selected
    const fmt = props.formatDate ?? defaultFormatDate
    if (range?.from) {
      if (range.to) {
        return `${fmt(range.from)} - ${fmt(range.to)}`
      }
      return fmt(range.from)
    }
    return props.placeholder ?? 'Pick a date range'
  })

  const handleSelect = (range: DateRange | undefined) => {
    props.onSelect?.(range)
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  return (
    <div data-slot="date-range-picker">
      <Popover open={open()} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`${triggerBaseClasses} w-[300px] ${!props.selected?.from ? triggerPlaceholderClasses : ''} ${props.triggerClassName ?? ''}`}
            disabled={props.disabled ?? false}
          >
            <svg className="size-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
            <span>{displayText()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align={props.align ?? 'start'}
        >
          <Calendar
            mode="range"
            selected={props.selected}
            onSelect={handleSelect}
            disabled={props.disabledDates}
            numberOfMonths={props.numberOfMonths ?? 2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DatePicker, DateRangePicker }
export type { DatePickerProps, DateRangePickerProps }
export type { DateRange } from '../calendar'
