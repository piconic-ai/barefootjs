"use client"
/**
 * CalendarDemo Components
 *
 * Interactive demos for Calendar component.
 * Shows practical date selection patterns.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Calendar } from '@ui/components/ui/calendar'

/**
 * Basic calendar with selected date display
 */
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
}

/**
 * Reservation form with past dates disabled
 */
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
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={!canSubmit()}
      >
        Book Appointment
      </button>
    </div>
  )
}

/**
 * Calendar with weekends disabled and 30-day limit
 */
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
}
